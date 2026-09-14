// src/services/connectivity.js
//
// Lightweight pub/sub connectivity tracker.
//
// navigator.onLine only reflects whether the OS thinks it has a network
// interface up - it can read "online" while wifi is connected to a router
// with no real internet, and it can flip "offline" a beat late. To get a
// signal the rest of the app can trust, we combine it with real signal from
// the API layer: every fetch that fails at the network level (not an HTTP
// error response) reports a failure here, and every successful request
// reports a success. Whichever signal changes state most recently wins.
//
// The browser's "online" event is treated as a *hint* only, never a fact -
// it fires the instant the network interface comes up, which can be well
// before DHCP/DNS settle or a captive portal is dealt with. We use it to
// trigger a real probe request rather than trusting it directly, so the
// app doesn't briefly (or indefinitely) claim to be online when it isn't.

const listeners = new Set();

function hasNavigator() {
  return typeof navigator !== "undefined" && typeof navigator.onLine === "boolean";
}

let isOnline = hasNavigator() ? navigator.onLine : true;

// A brief grace period after a single network failure avoids flipping the
// whole app "offline" because of one flaky request; we only need one more
// failure (or the browser's offline event) within the window to confirm it.
let recentFailureAt = 0;
const CONFIRM_WINDOW_MS = 4000;

function setOnline(next) {
  if (isOnline === next) return;
  isOnline = next;
  for (const cb of listeners) {
    try {
      cb(isOnline);
    } catch (err) {
      console.error("connectivity listener error:", err);
    }
  }
  if (next) {
    stopProbing();
  } else {
    startProbing();
  }
}

export function getIsOnline() {
  return isOnline;
}

export function subscribeConnectivity(cb) {
  if (typeof cb !== "function") return () => {};
  listeners.add(cb);
  return () => listeners.delete(cb);
}

// Called by services/api.js when a request fails before getting an HTTP
// response (offline, DNS failure, timeout, etc).
export function reportNetworkFailure() {
  const now = Date.now();
  if (!isOnline) {
    recentFailureAt = now;
    return;
  }
  if (now - recentFailureAt < CONFIRM_WINDOW_MS) {
    setOnline(false);
  }
  recentFailureAt = now;
}

// Called by services/api.js whenever a request completes (even with an HTTP
// error response - reaching the server at all proves we have a connection).
export function reportNetworkSuccess() {
  recentFailureAt = 0;
  setOnline(true);
}

// --- Active probing -------------------------------------------------------
//
// While we believe we're offline, periodically try a tiny real request
// against our own backend. Only a successful response flips us back to
// online - real app traffic (reportNetworkSuccess) will normally beat the
// probe to it, but this covers the case where nothing else happens to be
// in flight (e.g. the user is just sitting on an idle screen).

const PROBE_INTERVAL_MS = 4000;
let probeTimer = null;
let probeInFlight = false;

// Mirrors services/api.js's toApiUrl() for this one fixed path, kept as a
// standalone copy (rather than importing api.js) since api.js imports this
// module - avoids any circular-import fragility.
function probeUrl() {
  const base = (process.env.REACT_APP_API_BASE || "").trim().replace(/\/+$/, "");
  return base ? `${base}/api/health` : "/api/health";
}

function probeOnce() {
  if (probeInFlight || typeof fetch !== "function") return;
  probeInFlight = true;

  fetch(probeUrl(), { cache: "no-store" })
    .then((res) => {
      probeInFlight = false;
      if (res && res.ok) {
        recentFailureAt = 0;
        setOnline(true);
      }
    })
    .catch(() => {
      probeInFlight = false;
    });
}

function startProbing() {
  if (probeTimer || typeof window === "undefined") return;
  probeOnce();
  probeTimer = setInterval(probeOnce, PROBE_INTERVAL_MS);
}

function stopProbing() {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    // The OS says the interface is back, but that's not proof the internet
    // actually works yet - verify with a real request before trusting it.
    startProbing();
  });
  window.addEventListener("offline", () => {
    recentFailureAt = Date.now();
    setOnline(false);
  });

  if (!isOnline) startProbing();
}
