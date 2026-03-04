// src/smart/ganTimerClient.js
import { connectGanTimer, GanTimerState } from "gan-web-bluetooth";

export { GanTimerState };

function toNumberOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// recordedTime should be numeric-ish per README, but we keep this robust.
function normalizeRecordedTimeToMs(recordedTime) {
  const n = toNumberOrNull(recordedTime);
  if (n == null) return null;

  // If it's already ms (large), keep it
  if (n > 1000) return Math.round(n);

  // Otherwise treat as seconds
  return Math.round(n * 1000);
}

export class GanTimerClient {
  constructor() {
    this.conn = null;
    this.sub = null;
    this.handlers = {
      onState: null,
      onSolve: null,
      onDisconnect: null,
      onError: null,
    };
  }

  async connect({ onState, onSolve, onDisconnect, onError } = {}) {
    this.handlers.onState = onState || null;
    this.handlers.onSolve = onSolve || null;
    this.handlers.onDisconnect = onDisconnect || null;
    this.handlers.onError = onError || null;

    this.conn = await connectGanTimer();

    this.sub = this.conn.events$.subscribe({
      next: (ev) => {
        this.handlers.onState?.(ev);

        // Per README: STOPPED includes recorded time
        if (ev?.state === GanTimerState.STOPPED) {
          const ms = normalizeRecordedTimeToMs(ev.recordedTime);
          if (ms != null) this.handlers.onSolve?.({ ms, raw: ev, source: "STOPPED.recordedTime" });
        }

        if (ev?.state === GanTimerState.DISCONNECT) {
          this.handlers.onDisconnect?.();
        }
      },
      error: (err) => {
        this.handlers.onError?.(err);
      },
    });

    return true;
  }

  async disconnect() {
    try {
      this.sub?.unsubscribe?.();
    } catch (_) {}
    this.sub = null;

    try {
      await this.conn?.disconnect?.();
    } catch (_) {}

    this.conn = null;
  }

  isConnected() {
    return !!this.conn;
  }

  // ✅ Expose recorded-times read for STOPPED fallback
  async getRecordedTimes() {
    if (!this.conn?.getRecordedTimes) return null;
    return await this.conn.getRecordedTimes();
  }
}