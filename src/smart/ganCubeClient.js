// src/smart/ganCubeClient.js
import { connectGanCube } from "gan-web-bluetooth";
import { fitMoveTimes } from "./recon/solveRecord";

// gan-web-bluetooth stamps events with performance.now() (ms since the page
// loaded), not wall-clock time. Host timestamps here are wall-clock (they date
// the solve), so shift them by the page's time origin. Missed-and-recovered
// moves have no local timestamp: use now.
function toEpochMs(localTs) {
  if (!Number.isFinite(localTs)) return Date.now();
  if (localTs > 1e12) return localTs; // already wall-clock
  const origin =
    typeof performance !== "undefined" && Number.isFinite(performance.timeOrigin)
      ? performance.timeOrigin
      : Date.now() - (typeof performance !== "undefined" ? performance.now() : 0);
  return Math.round(origin + localTs);
}

/**
 * GAN smart cube wrapper (works with iCarry 3).
 * Emits MOVE events with both hostTs and (if provided) cubeTs.
 */
export class GanCubeClient {
  constructor() {
    this.conn = null;
    this.sub = null;
  }

  async connect({ onMove, onFacelets, onGyro, onDisconnect, onError } = {}) {
    this.conn = await connectGanCube();

    this.sub = this.conn.events$.subscribe({
      next: (ev) => {
        try {
          if (!ev) return;

          if (ev.type === "MOVE") {
            // cubeTimestamp is the cube's own clock (null for moves it missed
            // and recovered); localTimestamp is when the host received it.
            // (ev.timestamp is the host clock too, so it must not be used as
            // the cube time.)
            const cubeTs = ev.cubeTimestamp == null ? NaN : Number(ev.cubeTimestamp);
            const localTs = ev.localTimestamp == null ? NaN : Number(ev.localTimestamp);
            const hostTs = toEpochMs(localTs);

            onMove?.({
              move: ev.move,
              cubeTs: Number.isFinite(cubeTs) ? cubeTs : null,
              hostTs,
            });
            return;
          }

          if (ev.type === "FACELETS") {
            onFacelets?.({ facelets: ev.facelets });
            return;
          }

          if (ev.type === "GYRO") {
            onGyro?.({
              quaternion: ev.quaternion,
              velocity: ev.velocity ?? null,
              hostTs: Date.now(),
            });
            return;
          }
        } catch (e) {
          onError?.(e);
        }
      },
      error: (err) => onError?.(err),
      complete: () => onDisconnect?.(),
    });

    if (this.conn?.device?.addEventListener) {
      this.conn.device.addEventListener("gattserverdisconnected", () => {
        onDisconnect?.();
      });
    }

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

  async requestFacelets() {
    try {
      await this.conn?.sendCubeCommand?.({ type: "REQUEST_FACELETS" });
    } catch (_) {}
  }

  /**
   * The cube's idea of its state has drifted (e.g. moves missed while out of
   * range): the user has solved it by hand, so tell the cube it is solved.
   */
  async markSolved() {
    try {
      await this.conn?.sendCubeCommand?.({ type: "REQUEST_RESET" });
    } catch (_) {}
  }

  /** Elapsed ms over [{ cubeTs, hostTs }] samples (cube clock when available). */
  computeElapsedMs(samples) {
    const times = fitMoveTimes(samples);
    return times.length >= 2 ? times[times.length - 1] : null;
  }
}