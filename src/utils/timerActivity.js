// Whether the home timer is mid-solve (holding, inspecting or running). Background
// work that would reshuffle the screen — like applying solves synced from another
// device — waits until the timer is idle again.
let busy = false;
const idleListeners = new Set();

export function setTimerBusy(next) {
  const value = !!next;
  if (value === busy) return;
  busy = value;
  if (!busy) {
    for (const listener of Array.from(idleListeners)) {
      try {
        listener();
      } catch (err) {
        console.warn("timer idle listener failed:", err);
      }
    }
  }
}

export function isTimerBusy() {
  return busy;
}

// Calls `listener` each time the timer goes idle. Returns an unsubscribe function.
export function onTimerIdle(listener) {
  idleListeners.add(listener);
  return () => idleListeners.delete(listener);
}
