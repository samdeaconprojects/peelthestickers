import {
  createProtocol,
  MOYU_SERVICE_UUID,
  MOYU_READ_CHAR_UUID,
  MOYU_WRITE_CHAR_UUID
} from "./moyuProtocol";

const MOYU_NAME_PREFIX = "WCU_MY32";

function bytesToHex(bytes) {
  return Array.from(bytes || [])
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" ");
}

function safeUint8(v) {
  try {
    if (!v) return null;
    if (v instanceof Uint8Array) return v;
    if (v.buffer) return new Uint8Array(v.buffer);
    return new Uint8Array(v);
  } catch {
    return null;
  }
}

function getMacSuffixFromName(name) {
  const s = String(name || "");
  const match = s.match(/^WCU_MY32_([0-9A-Fa-f]{4})$/);
  if (!match) return null;
  return `${match[1].slice(0, 2)}:${match[1].slice(2, 4)}`.toUpperCase();
}

export class MoyuCubeClient {
  constructor() {
    this.device = null;
    this.server = null;
    this.service = null;
    this.readCharacteristic = null;
    this.writeCharacteristic = null;

    this.protocol = null;
    this.macSuffix = null;
    this.fullMac = null;

    this.handlers = {
      onMove: null,
      onFacelets: null,
      onDisconnect: null,
      onError: null
    };

    this._packetLog = [];
    this._onDisconnected = null;
    this._onReadNotification = null;
    this._bootstrapInterval = null;
  }

  async connect({ onMove, onFacelets, onDisconnect, onError } = {}) {
    this.handlers.onMove = onMove || null;
    this.handlers.onFacelets = onFacelets || null;
    this.handlers.onDisconnect = onDisconnect || null;
    this.handlers.onError = onError || null;

    try {
      if (!navigator?.bluetooth?.requestDevice) {
        throw new Error("Web Bluetooth is not available in this browser.");
      }

      console.log("[PTS][MoYu] requestDevice starting");

      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ namePrefix: MOYU_NAME_PREFIX }],
        optionalServices: [MOYU_SERVICE_UUID]
      });

      if (!this.device) {
        throw new Error("No MoYu cube selected.");
      }

      this.macSuffix = getMacSuffixFromName(this.device.name);

      if (!this.macSuffix) {
        throw new Error("Unsupported MoYu device name format");
      }

      this.protocol = createProtocol(this.macSuffix);

      console.log("[PTS][MoYu] device selected", {
        name: this.device.name,
        macSuffix: this.macSuffix
      });

      this._onDisconnected = () => {
        console.log("[PTS][MoYu] disconnected");
        this.handlers.onDisconnect?.();
      };

      this.device.addEventListener(
        "gattserverdisconnected",
        this._onDisconnected
      );

      this.server = await this.device.gatt.connect();

      console.log("[PTS][MoYu] gatt connected");

      this.service = await this.server.getPrimaryService(MOYU_SERVICE_UUID);

      this.readCharacteristic = await this.service.getCharacteristic(
        MOYU_READ_CHAR_UUID
      );

      this.writeCharacteristic = await this.service.getCharacteristic(
        MOYU_WRITE_CHAR_UUID
      );

      console.log("[PTS][MoYu] characteristics ready");

      this._onReadNotification = (event) => {
        const bytes = safeUint8(event?.target?.value);
        if (!bytes) return;
        this._handleIncomingPacket("read", bytes);
      };

      this.readCharacteristic.addEventListener(
        "characteristicvaluechanged",
        this._onReadNotification
      );

      await this.readCharacteristic.startNotifications();

      console.log("[PTS][MoYu] read notifications started");

      await this._runBootstrapSequence();
      this._startBootstrapPolling();

      console.log("[PTS][MoYu] connect complete");

      return true;
    } catch (err) {
      console.error("[PTS][MoYu] connect failed", err);
      this.handlers.onError?.(err);
      throw err;
    }
  }

  async disconnect() {
    try {
      if (this._bootstrapInterval) {
        clearInterval(this._bootstrapInterval);
        this._bootstrapInterval = null;
      }
    } catch {}

    try {
      if (this.readCharacteristic && this._onReadNotification) {
        this.readCharacteristic.removeEventListener(
          "characteristicvaluechanged",
          this._onReadNotification
        );
      }
    } catch {}

    try {
      await this.readCharacteristic?.stopNotifications?.();
    } catch {}

    if (this.device && this._onDisconnected) {
      try {
        this.device.removeEventListener(
          "gattserverdisconnected",
          this._onDisconnected
        );
      } catch {}
    }

    try {
      this.device?.gatt?.disconnect?.();
    } catch {}

    this.device = null;
    this.server = null;
    this.service = null;
    this.readCharacteristic = null;
    this.writeCharacteristic = null;
    this.protocol = null;
    this.macSuffix = null;
    this.fullMac = null;
  }

  async requestFacelets() {
    if (!this.writeCharacteristic || !this.protocol) return null;

    try {
      await this.writeCharacteristic.writeValue(
        this.protocol.getCubeInfoPacket()
      );
      await this._sleep(80);
    } catch {}

    try {
      await this.writeCharacteristic.writeValue(
        this.protocol.getCubeStatusPacket()
      );
      await this._sleep(80);
    } catch {}

    try {
      await this.writeCharacteristic.writeValue(
        this.protocol.getCubePowerPacket()
      );
      await this._sleep(80);
    } catch {}

    try {
      await this.writeCharacteristic.writeValue(
        this.protocol.getCubeMoveHistoryPacket(0)
      );
      await this._sleep(80);
    } catch {}

    return null;
  }

  getPacketLog() {
    return [...this._packetLog];
  }

  async _runBootstrapSequence() {
    if (!this.writeCharacteristic || !this.protocol) return;

    const probes = this.protocol.getCubeInfoPacketCheckMac(this.macSuffix);

    for (const { mac, packet } of probes) {
      console.log("[PTS][MoYu] sending CubeInfo probe", mac, bytesToHex(packet));
      await this.writeCharacteristic.writeValue(packet);
      await this._sleep(120);
      if (this.fullMac) break;
    }

    await this._sendProtocolPacket(
      "CubeInfo",
      () => this.protocol.getCubeInfoPacket(),
      120
    );

    await this._sendProtocolPacket(
      "CubeStatus",
      () => this.protocol.getCubeStatusPacket(),
      120
    );

    await this._sendProtocolPacket(
      "CubePower",
      () => this.protocol.getCubePowerPacket(),
      120
    );

    await this._sendProtocolPacket(
      "CubeMoveHistory(0)",
      () => this.protocol.getCubeMoveHistoryPacket(0),
      120
    );
  }

  _startBootstrapPolling() {
    let count = 0;

    this._bootstrapInterval = setInterval(async () => {
      try {
        if (!this.writeCharacteristic || !this.protocol) return;

        count += 1;

        if (count > 16) {
          clearInterval(this._bootstrapInterval);
          this._bootstrapInterval = null;
          return;
        }

        console.log("[PTS][MoYu] bootstrap poll tick", count);

        await this.writeCharacteristic.writeValue(
          this.protocol.getCubeStatusPacket()
        );
      } catch {}
    }, 500);
  }

  async _sendProtocolPacket(label, buildPacket, delayMs = 80) {
    try {
      const packet = buildPacket();
      console.log("[PTS][MoYu] sending", label, bytesToHex(packet));
      await this.writeCharacteristic.writeValue(packet);
      await this._sleep(delayMs);
    } catch {}
  }

  _handleIncomingPacket(source, bytes) {
    const entry = {
      source,
      hostTs: Date.now(),
      bytes: Array.from(bytes),
      hex: bytesToHex(bytes)
    };

    this._packetLog.push(entry);
    if (this._packetLog.length > 200) this._packetLog.shift();

    console.log("[PTS][MoYu] packet", entry.hex);

    if (!this.protocol) return;

    try {
      const decoded = this.protocol.handlePacket(bytes);

      console.log("[PTS][MoYu] decoded", decoded);

      if (decoded?.opCode === 165) {
        this.handlers.onMove?.({
          move: decoded,
          hostTs: Date.now()
        });
      }
    } catch (err) {
      console.warn("[PTS][MoYu] decode error", err);
    }
  }

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}