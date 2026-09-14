// src/smart/moyuCubeClient.js
//
// MoYu AI / WCU smart-cube client. Mirrors the surface of GanCubeClient
// (connect/disconnect/requestFacelets/computeElapsedMs) so Timer.js can drive
// either backend through createSmartCubeClient().
//
// Cube state is tracked locally (CubieCube) from the move packets — the MoYu
// batches up to 5 quarter turns per notification, so we replay them against our
// own model and synthesise a FACELETS event after each, rather than polling the
// cube for its state per move.
//
// Debug: set localStorage["pts.moyu.debug"] = "1" for verbose per-packet logs.
// window.__ptsMoyu exposes the live packet log + decode stats.

import { CubieCube, SOLVED_FACELET, moveTokenToIndex } from "./cubieCube";
import {
  MOYU_SERVICE_UUID,
  MOYU_READ_CHAR_UUID,
  MOYU_WRITE_CHAR_UUID,
  createMoyuProtocol,
  macCandidatesFromName,
  macStringToBytes,
} from "./moyuProtocol";
import { isValidMoyuDecryptedPacket } from "./moyuPacketSanity";

const NAME_PREFIXES = ["WCU_", "MY32", "MY33", "MHC"];
const ADVERTISEMENT_TIMEOUT_MS = 5000;
const MAC_RE = /^([0-9A-Fa-f]{2}[:\-\s]){5}[0-9A-Fa-f]{2}$/;

function bytesToHex(bytes) {
  return Array.from(bytes || [])
    .map((b) => (b & 0xff).toString(16).padStart(2, "0"))
    .join(" ");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function debugEnabled() {
  try {
    return !!window.localStorage?.getItem("pts.moyu.debug");
  } catch {
    return false;
  }
}

// Manufacturer-data payload -> "aa:bb:cc:dd:ee:ff". When >= 8 bytes the first two
// are the company id and are skipped; the six address octets are LSB-first.
function macFromManufacturerDataView(dv) {
  if (!dv) return null;
  const n = dv.byteLength;
  if (n < 6) return null;
  const skip = n >= 8 ? 2 : 0;
  if (n < skip + 6) return null;
  const parts = [];
  for (let i = 0; i < 6; i++) {
    parts.push((dv.getUint8(skip + 5 - i) + 0x100).toString(16).slice(1));
  }
  return parts.join(":");
}

function macCacheKey(device) {
  return `pts.moyu.mac.${device?.id || device?.name || "unknown"}`;
}

function readCachedMac(device) {
  try {
    const v = window.localStorage?.getItem(macCacheKey(device));
    return v && MAC_RE.test(v) ? v : null;
  } catch {
    return null;
  }
}

function writeCachedMac(device, mac) {
  try {
    window.localStorage?.setItem(macCacheKey(device), mac);
  } catch {}
}

export class MoyuCubeClient {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.readCharacteristic = null;
    this.writeCharacteristic = null;

    this.protocol = null;
    this.mac = null;
    this.macSource = null;

    this.handlers = {
      onMove: null,
      onFacelets: null,
      onGyro: null,
      onDisconnect: null,
      onError: null,
    };

    this.prevCubie = new CubieCube();
    this.curCubie = new CubieCube();
    this.latestFacelets = SOLVED_FACELET;

    this.moveCnt = -1;
    this.prevMoveCnt = -1;
    this.deviceTime = 0;
    this.deviceTimeOffset = 0;

    this._onDisconnected = null;
    this._onReadNotification = null;
    this._batteryInterval = null;

    this._packetLog = [];
    this._logCount = 0;
    this._goodPackets = 0;
    this._totalPackets = 0;
    this._decryptOk = false;
    this._decryptFailReported = false;

    this._publishDebug();
  }

  async connect({ onMove, onFacelets, onGyro, onDisconnect, onError } = {}) {
    this.handlers.onMove = onMove || null;
    this.handlers.onFacelets = onFacelets || null;
    this.handlers.onGyro = onGyro || null;
    this.handlers.onDisconnect = onDisconnect || null;
    this.handlers.onError = onError || null;

    try {
      if (!navigator?.bluetooth?.requestDevice) {
        throw new Error("Web Bluetooth is not available in this browser.");
      }

      this.device = await navigator.bluetooth.requestDevice({
        filters: NAME_PREFIXES.map((namePrefix) => ({ namePrefix })),
        optionalServices: [MOYU_SERVICE_UUID],
      });
      if (!this.device) throw new Error("No MoYu cube selected.");

      console.log(
        "[PTS][MoYu] device selected:",
        JSON.stringify({ name: this.device.name, id: this.device.id })
      );

      this._onDisconnected = () => {
        console.log("[PTS][MoYu] gattserverdisconnected");
        this._stopBatteryPolling();
        this.handlers.onDisconnect?.();
      };
      this.device.addEventListener(
        "gattserverdisconnected",
        this._onDisconnected
      );

      this.server = await this.device.gatt.connect();
      this.service = await this.server.getPrimaryService(MOYU_SERVICE_UUID);
      this.readCharacteristic = await this.service.getCharacteristic(
        MOYU_READ_CHAR_UUID
      );
      this.writeCharacteristic = await this.service.getCharacteristic(
        MOYU_WRITE_CHAR_UUID
      );

      this.mac = await this._resolveMac();
      if (!this.mac) {
        throw new Error(
          "Couldn't determine this MoYu cube's Bluetooth address. Open the " +
            "MoYu/WCU app, find the cube's MAC/address, and enter it when prompted."
        );
      }
      console.log(
        `[PTS][MoYu] MAC ${this.mac} (via ${this.macSource})`
      );
      this.protocol = createMoyuProtocol(macStringToBytes(this.mac));
      this._publishDebug();

      this._onReadNotification = (event) => {
        const value = event?.target?.value;
        if (value) this._handlePacket(value);
      };
      this.readCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onReadNotification
      );
      await this.readCharacteristic.startNotifications();

      await this._bootstrap();
      console.log("[PTS][MoYu] connect complete — waiting for cube packets");

      // If nothing decodes cleanly shortly after bootstrap, the MAC/key is wrong.
      setTimeout(() => {
        if (this.protocol && !this._decryptOk && !this._decryptFailReported) {
          this._decryptFailReported = true;
          const msg =
            `MoYu cube connected but no packets decoded ` +
            `(${this._goodPackets}/${this._totalPackets} valid). The Bluetooth ` +
            `address ${this.mac} (via ${this.macSource}) is almost certainly ` +
            `wrong — it has been cleared, reconnect to enter it manually from ` +
            `the MoYu/WCU app.`;
          console.error("[PTS][MoYu]", msg);
          try {
            window.localStorage?.removeItem(macCacheKey(this.device));
          } catch (_) {}
          this.handlers.onError?.(new Error(msg));
        }
      }, 4000);

      return true;
    } catch (err) {
      console.error("[PTS][MoYu] connect failed", err);
      this.handlers.onError?.(err);
      throw err;
    }
  }

  async disconnect() {
    this._stopBatteryPolling();

    try {
      if (this.readCharacteristic && this._onReadNotification) {
        this.readCharacteristic.removeEventListener(
          "characteristicvaluechanged",
          this._onReadNotification
        );
      }
    } catch (_) {}
    try {
      await this.readCharacteristic?.stopNotifications?.();
    } catch (_) {}
    try {
      if (this.device && this._onDisconnected) {
        this.device.removeEventListener(
          "gattserverdisconnected",
          this._onDisconnected
        );
      }
    } catch (_) {}
    try {
      this.device?.gatt?.disconnect?.();
    } catch (_) {}

    this.device = null;
    this.server = null;
    this.service = null;
    this.readCharacteristic = null;
    this.writeCharacteristic = null;
    this.protocol = null;
    this.mac = null;
  }

  async requestFacelets() {
    if (!this.writeCharacteristic || !this.protocol) return;
    try {
      await this.writeCharacteristic.writeValue(
        this.protocol.getCubeStatusPacket()
      );
    } catch (_) {}
  }

  getPacketLog() {
    return [...this._packetLog];
  }

  /**
   * Elapsed ms across move samples: prefer the cube's own clock (linear fit of
   * cubeTs -> hostTs), fall back to host wall-clock. Matches GanCubeClient.
   */
  computeElapsedMs(samples) {
    const clean = (samples || []).filter(
      (s) =>
        Number.isFinite(s?.hostTs) &&
        (s?.cubeTs == null || Number.isFinite(s?.cubeTs))
    );
    if (clean.length < 2) return null;

    const pairs = clean.filter((s) => Number.isFinite(s.cubeTs));
    if (pairs.length >= 2) {
      const n = pairs.length;
      let sx = 0;
      let sy = 0;
      let sxx = 0;
      let sxy = 0;
      for (const p of pairs) {
        sx += p.cubeTs;
        sy += p.hostTs;
        sxx += p.cubeTs * p.cubeTs;
        sxy += p.cubeTs * p.hostTs;
      }
      const denom = n * sxx - sx * sx;
      if (denom !== 0) {
        const slope = (n * sxy - sx * sy) / denom;
        const first = pairs[0].cubeTs;
        const last = pairs[pairs.length - 1].cubeTs;
        const ms = slope * (last - first);
        if (Number.isFinite(ms)) return Math.max(0, ms);
      }
    }
    return Math.max(0, clean[clean.length - 1].hostTs - clean[0].hostTs);
  }

  // ---- MAC resolution -----------------------------------------------------

  async _resolveMac() {
    const cached = readCachedMac(this.device);
    if (cached) {
      this.macSource = "cache";
      return cached;
    }

    const advMac = await this._macFromAdvertisements();
    if (advMac) {
      this.macSource = "advertisement";
      writeCachedMac(this.device, advMac);
      return advMac;
    }

    const probed = await this._probeMacCandidates();
    if (probed) {
      this.macSource = "probe";
      writeCachedMac(this.device, probed);
      return probed;
    }

    const entered = this._promptForMac();
    if (entered) {
      this.macSource = "manual";
      writeCachedMac(this.device, entered);
      return entered;
    }

    return null;
  }

  _promptForMac() {
    try {
      const raw = window.prompt(
        `Enter your MoYu cube's Bluetooth MAC address` +
          (this.device?.name ? ` (${this.device.name})` : "") +
          `.\nIt's shown in the MoYu / WCU app, format AA:BB:CC:DD:EE:FF.`
      );
      if (raw && MAC_RE.test(raw.trim())) return raw.trim().toUpperCase();
    } catch (_) {}
    return null;
  }

  async _macFromAdvertisements() {
    if (typeof this.device.watchAdvertisements !== "function") {
      console.log("[PTS][MoYu] watchAdvertisements not supported");
      return null;
    }

    return new Promise((resolve) => {
      let done = false;
      const controller =
        typeof AbortController === "function" ? new AbortController() : null;

      const finish = (mac) => {
        if (done) return;
        done = true;
        try {
          this.device.removeEventListener("advertisementreceived", onAdv);
        } catch (_) {}
        try {
          controller?.abort();
        } catch (_) {}
        if (mac) console.log("[PTS][MoYu] MAC from advertisement:", mac);
        resolve(mac || null);
      };

      const onAdv = (event) => {
        const md = event.manufacturerData;
        if (md && typeof md.forEach === "function") {
          md.forEach((dv) => {
            const mac = macFromManufacturerDataView(dv);
            if (mac && MAC_RE.test(mac)) finish(mac.toUpperCase());
          });
        }
      };

      this.device.addEventListener("advertisementreceived", onAdv);
      Promise.resolve(
        this.device.watchAdvertisements(
          controller ? { signal: controller.signal } : undefined
        )
      ).catch((e) => {
        console.log("[PTS][MoYu] watchAdvertisements failed", e?.message || e);
        finish(null);
      });

      setTimeout(() => finish(null), ADVERTISEMENT_TIMEOUT_MS);
    });
  }

  async _probeMacCandidates() {
    const candidates = macCandidatesFromName(this.device.name);
    if (!candidates.length) {
      console.log(
        "[PTS][MoYu] no MAC candidates from name:",
        this.device.name
      );
      return null;
    }
    console.log("[PTS][MoYu] probing MAC candidates:", candidates.join(", "));

    let read;
    let write;
    try {
      read = this.readCharacteristic;
      write = this.writeCharacteristic;
      if (!read || !write) return null;
      await read.startNotifications();
    } catch (err) {
      console.warn("[PTS][MoYu] probe setup failed", err);
      return null;
    }

    for (const candidate of candidates) {
      const proto = createMoyuProtocol(macStringToBytes(candidate));
      let good = 0;
      let samples = 0;
      const onValue = (event) => {
        try {
          const dec = proto.decrypt(event.target.value);
          samples++;
          if (isValidMoyuDecryptedPacket(dec)) good++;
        } catch (_) {
          samples++;
        }
      };
      read.addEventListener("characteristicvaluechanged", onValue);
      try {
        for (let burst = 0; burst < 2; burst++) {
          await write.writeValue(proto.getCubeInfoPacket());
          await write.writeValue(proto.getCubeStatusPacket());
          await write.writeValue(proto.getBatteryPacket());
        }
        const deadline = Date.now() + 1600;
        while (Date.now() < deadline) {
          if (good >= 3) break;
          if (samples > 8 && good === 0) break;
          await sleep(120);
        }
      } catch (_) {}
      read.removeEventListener("characteristicvaluechanged", onValue);

      console.log(
        `[PTS][MoYu] probe ${candidate}: ${good}/${samples} valid`
      );
      if (good >= 3) {
        try {
          await read.stopNotifications();
        } catch (_) {}
        return candidate;
      }
    }

    try {
      await read.stopNotifications();
    } catch (_) {}
    return null;
  }

  // ---- bootstrap / polling ----------------------------------------------

  async _bootstrap() {
    const p = this.protocol;
    const write = (packet) => this.writeCharacteristic.writeValue(packet);

    for (let round = 0; round < 2; round++) {
      try {
        await write(p.getCubeInfoPacket());
        await sleep(80);
        await write(p.getCubeStatusPacket());
        await sleep(80);
        await write(p.getBatteryPacket());
        await sleep(80);
      } catch (_) {}
    }

    try {
      await write(p.getEnableGyroPacket());
      await sleep(80);
      await write(p.getCubeStatusPacket());
    } catch (_) {}

    this._startBatteryPolling();
  }

  _startBatteryPolling() {
    this._stopBatteryPolling();
    this._batteryInterval = setInterval(() => {
      try {
        this.writeCharacteristic?.writeValue(this.protocol.getBatteryPacket());
      } catch (_) {}
    }, 60000);
  }

  _stopBatteryPolling() {
    if (this._batteryInterval) {
      clearInterval(this._batteryInterval);
      this._batteryInterval = null;
    }
  }

  // ---- incoming packets -------------------------------------------------

  _handlePacket(value) {
    const hostTs = Date.now();
    if (!this.protocol) return;

    let rawDecrypted;
    try {
      rawDecrypted = this.protocol.decrypt(value);
    } catch (err) {
      return;
    }

    const valid = isValidMoyuDecryptedPacket(rawDecrypted);
    this._totalPackets += 1;
    if (valid) this._goodPackets += 1;

    if (this._logCount < 60 || debugEnabled()) {
      this._logCount += 1;
      const entry = {
        t: hostTs,
        hex: bytesToHex(rawDecrypted),
        op: rawDecrypted[0] & 0xff,
        valid,
      };
      this._packetLog.push(entry);
      if (this._packetLog.length > 120) this._packetLog.shift();
      if (debugEnabled()) console.log("[PTS][MoYu] pkt", entry.op, valid ? "ok" : "BAD", entry.hex);
    }
    this._publishDebug();

    // Wrong-key detection: lots of packets, almost none decrypting cleanly.
    if (
      !this._decryptOk &&
      !this._decryptFailReported &&
      this._totalPackets >= 25 &&
      this._goodPackets / this._totalPackets < 0.25
    ) {
      this._decryptFailReported = true;
      const msg =
        `MoYu decryption failed (${this._goodPackets}/${this._totalPackets} ` +
        `packets valid) — the cube's Bluetooth address (${this.mac}, via ` +
        `${this.macSource}) is wrong. Clear it and reconnect to enter it manually.`;
      console.error("[PTS][MoYu]", msg);
      try {
        window.localStorage?.removeItem(macCacheKey(this.device));
      } catch (_) {}
      this.handlers.onError?.(new Error(msg));
      return;
    }

    if (!valid) return;

    let decoded;
    try {
      decoded = this.protocol.decode(value);
    } catch (err) {
      return;
    }

    switch (decoded.type) {
      case "GYRO":
        this.handlers.onGyro?.({ quaternion: decoded.quaternion, hostTs });
        return;

      case "HARDWARE":
        this._decryptOk = true;
        console.log("[PTS][MoYu] hardware:", JSON.stringify(decoded));
        return;

      case "BATTERY":
        this._decryptOk = true;
        return;

      case "FACELETS": {
        this.latestFacelets = decoded.facelets;
        const res = this.prevCubie.fromFacelet(decoded.facelets);
        if (res !== -1) {
          this._decryptOk = true;
          this.moveCnt = decoded.serial;
          this.prevMoveCnt = decoded.serial;
          if (debugEnabled()) {
            console.log("[PTS][MoYu] facelets synced", decoded.facelets);
          }
        } else if (debugEnabled()) {
          console.warn("[PTS][MoYu] facelets invalid perm:", decoded.facelets);
        }
        this.handlers.onFacelets?.({ facelets: decoded.facelets });
        return;
      }

      case "MOVE":
        this._handleMove(decoded, hostTs);
        return;

      default:
        return;
    }
  }

  _handleMove(decoded, hostTs) {
    if (decoded.invalid) return;
    this._decryptOk = true;

    this.moveCnt = decoded.moveCnt;

    // First move batch with no prior facelet sync: adopt the counter as the
    // baseline (skip this batch), and ask the cube for its state.
    if (this.prevMoveCnt === -1) {
      this.prevMoveCnt = this.moveCnt;
      this.requestFacelets();
      return;
    }
    if (this.moveCnt === this.prevMoveCnt) return;

    const rawDelta = (this.moveCnt - this.prevMoveCnt) & 0xff;
    const moveDiff = Math.min(rawDelta, 5);
    if (rawDelta > 5) {
      console.warn("[PTS][MoYu] dropped", rawDelta - 5, "move(s)");
    }
    this.prevMoveCnt = this.moveCnt;

    // packet stores moves newest-first; replay oldest -> newest
    let calcTs = this.deviceTime + this.deviceTimeOffset;
    for (let i = moveDiff - 1; i >= 0; i--) calcTs += decoded.timeOffsets[i];
    if (!this.deviceTime || Math.abs(hostTs - calcTs) > 2000) {
      this.deviceTime += hostTs - calcTs;
    }

    for (let i = moveDiff - 1; i >= 0; i--) {
      const token = decoded.moves[i];
      if (!token) continue;
      const idx = moveTokenToIndex(token);
      if (idx < 0) continue;

      CubieCube.CubeMult(this.prevCubie, CubieCube.moveCube[idx], this.curCubie);
      this.deviceTime += decoded.timeOffsets[i];
      this.latestFacelets = this.curCubie.toFaceCube();

      if (debugEnabled()) console.log("[PTS][MoYu] move", token);

      this.handlers.onMove?.({ move: token, cubeTs: this.deviceTime, hostTs });
      this.handlers.onFacelets?.({ facelets: this.latestFacelets });

      const tmp = this.curCubie;
      this.curCubie = this.prevCubie;
      this.prevCubie = tmp;
    }
    this.deviceTimeOffset = hostTs - this.deviceTime;
  }

  _publishDebug() {
    try {
      window.__ptsMoyu = {
        mac: this.mac,
        macSource: this.macSource,
        deviceName: this.device?.name || null,
        totalPackets: this._totalPackets,
        goodPackets: this._goodPackets,
        decryptOk: this._decryptOk,
        latestFacelets: this.latestFacelets,
        packets: this._packetLog,
      };
    } catch (_) {}
  }
}
