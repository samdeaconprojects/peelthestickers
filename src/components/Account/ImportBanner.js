// src/components/Account/ImportBanner.js
import React, { useCallback, useEffect, useRef, useState } from "react";
import { cancelImportJob, isActiveImportJob, listImportJobs } from "../../services/importJobs";
import "../Offline/OfflineBanner.css";

const DISMISSED_KEY = "pts:importBannerDismissed";
const RECENT_MS = 24 * 60 * 60 * 1000;
const ACTIVE_POLL_MS = 4000;

function readDismissed() {
  try {
    return new Set(JSON.parse(window.localStorage.getItem(DISMISSED_KEY) || "[]"));
  } catch {
    return new Set();
  }
}

function writeDismissed(set) {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set).slice(-20)));
  } catch {
    // fine: a finished import's note just shows again on reload
  }
}

const fmt = (n) => Number(n || 0).toLocaleString();

function formatEta(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 90) return "about a minute left";
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) return `about ${minutes} min left`;
  return `about ${(minutes / 60).toFixed(1)} h left`;
}

/**
 * Background imports run on the server after the upload, so their progress is shown here on
 * every page. Finished or failed imports from the last day are shown once until dismissed.
 */
export default function ImportBanner({ userID, isSignedIn }) {
  const [job, setJob] = useState(null);
  const [dismissed, setDismissed] = useState(readDismissed);
  const [canceling, setCanceling] = useState(false);
  const rateRef = useRef({ jobID: null, samples: [] });
  const [etaSeconds, setEtaSeconds] = useState(null);
  const timerRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!userID || !isSignedIn) return null;
    try {
      const res = await listImportJobs(userID, 5);
      const items = (res?.items || []).filter((j) => j?.mode === "background");
      const active = items.find(isActiveImportJob);
      const recent = items.find(
        (j) =>
          ["COMPLETED", "FAILED"].includes(String(j.status).toUpperCase()) &&
          Date.now() - Date.parse(j.completedAt || j.failedAt || j.updatedAt || 0) < RECENT_MS
      );
      const shown = active || recent || null;
      setJob(shown);

      // Rate from the last minute of samples, for the time-left estimate.
      if (active && String(active.status).toUpperCase() === "RUNNING") {
        const r = rateRef.current;
        if (r.jobID !== active.jobID) Object.assign(r, { jobID: active.jobID, samples: [] });
        r.samples.push({ t: Date.now(), n: Number(active.scannedSolves || 0) });
        r.samples = r.samples.filter((s) => Date.now() - s.t < 60000);
        const first = r.samples[0];
        const last = r.samples[r.samples.length - 1];
        const rate = last.t > first.t ? (last.n - first.n) / ((last.t - first.t) / 1000) : 0;
        const left = Number(active.stagedSolves || active.totalSolves || 0) - last.n;
        setEtaSeconds(rate > 0 ? left / rate : null);
      } else {
        setEtaSeconds(null);
      }
      return active || null;
    } catch {
      return null;
    }
  }, [userID, isSignedIn]);

  // Poll while an import is running; otherwise check once and when one is queued.
  const poll = useCallback(async () => {
    clearTimeout(timerRef.current);
    const active = await refresh();
    if (active) timerRef.current = setTimeout(poll, ACTIVE_POLL_MS);
  }, [refresh]);

  useEffect(() => {
    poll();
    const onQueued = () => poll();
    window.addEventListener("pts:import-queued", onQueued);
    return () => {
      clearTimeout(timerRef.current);
      window.removeEventListener("pts:import-queued", onQueued);
    };
  }, [poll]);

  if (!isSignedIn || !job || dismissed.has(job.jobID)) return null;

  const status = String(job.status || "").toUpperCase();
  const dismiss = () => {
    const next = new Set(dismissed);
    next.add(job.jobID);
    setDismissed(next);
    writeDismissed(next);
  };
  const cancel = async () => {
    if (!window.confirm("Stop this import? Solves already imported are kept.")) return;
    setCanceling(true);
    try {
      await cancelImportJob(userID, job.jobID);
      await poll();
    } catch (err) {
      alert(err?.message || "Could not cancel the import.");
    } finally {
      setCanceling(false);
    }
  };

  const total = Number(job.stagedSolves || job.totalSolves || 0);
  let text;
  let tone = "pending";
  if (status === "QUEUED") {
    text = `Import of ${fmt(total)} solves is starting. You can keep solving or close this page.`;
  } else if (status === "RUNNING") {
    const eta = formatEta(etaSeconds);
    text = `Importing solves: ${fmt(job.scannedSolves)} of ${fmt(total)}${eta ? `, ${eta}` : ""}. You can keep solving or close this page.`;
  } else if (status === "FINALIZING") {
    const r = job.recompute || {};
    const done = Number(r.sessionsCompleted || 0) + Number(r.eventsCompleted || 0);
    const all = Number(r.totalSessions || 0) + Number(r.totalEvents || 0);
    text = `Finishing your import: updating stats${all ? ` (${done}/${all})` : ""}.`;
  } else if (status === "COMPLETED") {
    const added = Number(job.processedSolves || 0);
    text =
      added > 0
        ? `Import finished: ${fmt(added)} solves added.`
        : "Import finished: every solve in it was already here, so nothing new was added.";
  } else {
    tone = "offline";
    text = `Import stopped: ${job.error || "something went wrong"}. Solves imported before that were kept.`;
  }

  const active = ["QUEUED", "RUNNING", "FINALIZING"].includes(status);
  return (
    <div className={`offline-banner offline-banner--${tone}`} role="status">
      <span className="offline-banner__dot" aria-hidden="true" />
      <span className="offline-banner__text">{text}</span>
      {active && status !== "FINALIZING" ? (
        <button type="button" className="offline-banner__action" onClick={cancel} disabled={canceling}>
          {canceling ? "Stopping…" : "Stop import"}
        </button>
      ) : null}
      {!active ? (
        <button type="button" className="offline-banner__action" onClick={dismiss}>
          Dismiss
        </button>
      ) : null}
    </div>
  );
}
