// src/smart/ganCubeClient.js
import { connectGanCube, cubeTimestampLinearFit } from "gan-web-bluetooth";

/**
 * GAN smart cube wrapper (works with iCarry 3).
 * Emits MOVE events with both hostTs and (if provided) cubeTs.
 */
export class GanCubeClient {
  constructor() {
    this.conn = null;
    this.sub = null;
  }

  async connect({ onMove, onFacelets, onDisconnect, onError } = {}) {
    this.conn = await connectGanCube();

    this.sub = this.conn.events$.subscribe({
      next: (ev) => {
        try {
          if (!ev) return;

          if (ev.type === "MOVE") {
            const cubeTsRaw = ev.ts ?? ev.timestamp ?? ev.cubeTs;
            const cubeTs = Number(cubeTsRaw);
            const hostTs = Date.now();

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
   * Compute elapsed ms using cube timestamp fit if cubeTs is present; else host time.
   * samples: [{ cubeTs, hostTs }]
   */
  computeElapsedMs(samples) {
    const clean = (samples || []).filter(
      (s) =>
        Number.isFinite(s?.hostTs) &&
        (s?.cubeTs == null || Number.isFinite(s?.cubeTs))
    );
    if (clean.length < 2) return null;

    const cubePairs = clean.filter((s) => Number.isFinite(s.cubeTs));
    if (cubePairs.length < 2) {
      return Math.max(0, clean[clean.length - 1].hostTs - clean[0].hostTs);
    }

    try {
      const fit = cubeTimestampLinearFit(
        cubePairs.map((p) => p.cubeTs),
        cubePairs.map((p) => p.hostTs)
      );

      const predictHost = (x) => {
        if (typeof fit === "function") return fit(x);
        if (fit && typeof fit.predict === "function") return fit.predict(x);
        return null;
      };

      const firstCube = cubePairs[0].cubeTs;
      const lastCube = cubePairs[cubePairs.length - 1].cubeTs;

      const firstHost = predictHost(firstCube);
      const lastHost = predictHost(lastCube);

      if (!Number.isFinite(firstHost) || !Number.isFinite(lastHost)) {
        return Math.max(0, clean[clean.length - 1].hostTs - clean[0].hostTs);
      }

      return Math.max(0, lastHost - firstHost);
    } catch (_) {
      return Math.max(0, clean[clean.length - 1].hostTs - clean[0].hostTs);
    }
  }
}