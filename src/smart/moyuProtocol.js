// src/smart/moyuProtocol.js
//
// MoYu AI / WCU MY32-family smart-cube protocol (BLE service 0783b03e-…).
//
// Wire format: every packet is 20 bytes, encrypted with AES-128 in a two-block
// "ECB + IV whitening" scheme (NOT CBC): the first 16 bytes and, when the packet
// is longer than 16 bytes, the last 16 bytes are each AES-decrypted and then
// XORed with the IV. Key/IV are the fixed base values with the device MAC
// (reversed) added, mod 255, into the first 6 bytes.
//
// Decoded byte 0 is the opcode:
//   161 (0xA1) hardware info      163 (0xA3) facelet state
//   164 (0xA4) battery            165 (0xA5) move batch (up to 5 moves)
//   171 (0xAB) gyro quaternion    172 (0xAC) enable-gyro command
//
// Protocol constants reverse-engineered by the community; see
// poliva/smartcube-web-bluetooth src/smartcube/protocols/moyu32.ts.

import aesjs from "aes-js";

export const MOYU_SERVICE_UUID = "0783b03e-7735-b5a0-1760-a305d2795cb0";
export const MOYU_READ_CHAR_UUID = "0783b03e-7735-b5a0-1760-a305d2795cb1";
export const MOYU_WRITE_CHAR_UUID = "0783b03e-7735-b5a0-1760-a305d2795cb2";

// Company ids a MoYu cube may advertise its manufacturer data (and so its MAC)
// under. A cube bound in the WCU app uses the high bytes of the account id
// (0x0100..0xFF00); an unbound cube uses 0x0000. Web Bluetooth only exposes
// manufacturer data for ids requested up front, so all of them are listed.
// 0x0000 crashes gatt.connect() on Chromium < 130 (crbug.com/356891475).
export function moyuCompanyIds() {
  const ids = [];
  for (let i = 1; i <= 255; i++) ids.push(i << 8);
  const brands = (typeof navigator !== "undefined" && navigator.userAgentData?.brands) || [];
  const oldChromium = brands.some(
    (b) =>
      (b.brand === "Google Chrome" || b.brand === "Chromium") &&
      parseInt(b.version, 10) < 130
  );
  if (!oldChromium) ids.unshift(0x0000);
  return ids;
}

const BASE_KEY = [
  21, 119, 58, 92, 103, 14, 45, 31, 23, 103, 42, 19, 155, 103, 82, 87,
];
const BASE_IV = [
  17, 35, 38, 37, 134, 42, 44, 59, 85, 6, 127, 49, 126, 103, 33, 87,
];

// Opcode 172 + payload that switches on gyro (quaternion) notifications.
const ENABLE_GYRO_PAYLOAD = [
  172, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
];

const GYRO_SCALE = 1073741824; // 2^30

function toByteArray(data) {
  if (data instanceof Uint8Array) return Array.from(data);
  if (ArrayBuffer.isView(data)) return Array.from(new Uint8Array(data.buffer));
  return Array.from(data || []);
}

class Moyu32Crypter {
  constructor(macBytes) {
    this.key = BASE_KEY.slice();
    this.iv = BASE_IV.slice();
    for (let i = 0; i < 6; i++) {
      const s = macBytes[5 - i] | 0;
      this.key[i] = (this.key[i] + s) % 255;
      this.iv[i] = (this.iv[i] + s) % 255;
    }
  }

  _cipher() {
    return new aesjs.ModeOfOperation.ecb(new Uint8Array(this.key));
  }

  decrypt(data) {
    const ret = toByteArray(data);
    const cipher = this._cipher();
    if (ret.length > 16) {
      const offset = ret.length - 16;
      const block = cipher.decrypt(new Uint8Array(ret.slice(offset)));
      for (let i = 0; i < 16; i++) ret[i + offset] = block[i] ^ (~~this.iv[i]);
    }
    const block = cipher.decrypt(new Uint8Array(ret.slice(0, 16)));
    for (let i = 0; i < 16; i++) ret[i] = block[i] ^ (~~this.iv[i]);
    return ret;
  }

  encrypt(data) {
    const ret = toByteArray(data);
    while (ret.length < 20) ret.push(0);
    const cipher = this._cipher();
    for (let i = 0; i < 16; i++) ret[i] ^= ~~this.iv[i];
    const head = cipher.encrypt(new Uint8Array(ret.slice(0, 16)));
    for (let i = 0; i < 16; i++) ret[i] = head[i];
    if (ret.length > 16) {
      const offset = ret.length - 16;
      for (let i = 0; i < 16; i++) ret[i + offset] ^= ~~this.iv[i];
      const tail = cipher.encrypt(new Uint8Array(ret.slice(offset, offset + 16)));
      for (let i = 0; i < 16; i++) ret[i + offset] = tail[i];
    }
    return new Uint8Array(ret);
  }
}

// MoYu facelet packet: 6 faces * 8 stickers * 3 bits, parsed in URFDLB order
// (source face order FBUDLR -> [2,5,0,3,4,1]) with the center re-inserted.
function parseFacelet(faceletBits) {
  const state = [];
  const faces = [2, 5, 0, 3, 4, 1];
  for (let i = 0; i < 6; i++) {
    const face = faceletBits.slice(faces[i] * 24, 24 + faces[i] * 24);
    for (let j = 0; j < 8; j++) {
      state.push("FBUDLR".charAt(parseInt(face.slice(j * 3, 3 + j * 3), 2)));
      if (j === 3) state.push("FBUDLR".charAt(faces[i]));
    }
  }
  return state.join("");
}

function bitsOf(decoded) {
  return decoded
    .map((b) => ((b + 256) & 0xff).toString(2).padStart(8, "0"))
    .join("");
}

/**
 * @param {number[]} macBytes  6 MAC octets in display order (aa:bb:cc:dd:ee:ff).
 */
export function createMoyuProtocol(macBytes) {
  const crypter = new Moyu32Crypter(macBytes || [0, 0, 0, 0, 0, 0]);

  function simplePacket(opcode) {
    const p = new Array(20).fill(0);
    p[0] = opcode;
    return crypter.encrypt(p);
  }

  return {
    /** Encrypt a plaintext 20-byte packet (mainly for tests / replay). */
    encryptPacket: (bytes) => crypter.encrypt(toByteArray(bytes)),

    getCubeInfoPacket: () => simplePacket(161),
    getCubeStatusPacket: () => simplePacket(163),
    getBatteryPacket: () => simplePacket(164),
    getEnableGyroPacket: () => crypter.encrypt(ENABLE_GYRO_PAYLOAD.slice()),

    /** Just the decrypted 20 bytes (for sanity checks / debug hex). */
    decrypt: (raw) => crypter.decrypt(raw),

    /** Decrypt + decode an incoming notification. */
    decode(raw) {
      const decoded = crypter.decrypt(raw);
      const opCode = decoded[0] & 0xff;

      if (opCode === 171) {
        const dv = new DataView(Uint8Array.from(decoded).buffer);
        let w = dv.getInt32(1, true) / GYRO_SCALE;
        let x = dv.getInt32(5, true) / GYRO_SCALE;
        let y = dv.getInt32(9, true) / GYRO_SCALE;
        let z = dv.getInt32(13, true) / GYRO_SCALE;
        const len = Math.hypot(w, x, y, z);
        if (len > 0) {
          w /= len;
          x /= len;
          y /= len;
          z /= len;
        }
        return { opCode, type: "GYRO", quaternion: { x, y, z, w } };
      }

      const bits = bitsOf(decoded);

      if (opCode === 161) {
        let name = "";
        for (let i = 0; i < 8; i++) {
          name += String.fromCharCode(
            parseInt(bits.slice(8 + i * 8, 16 + i * 8), 2)
          );
        }
        return {
          opCode,
          type: "HARDWARE",
          name: name.trim(),
          hardwareVersion: `${parseInt(bits.slice(72, 80), 2)}.${parseInt(
            bits.slice(80, 88),
            2
          )}`,
          softwareVersion: `${parseInt(bits.slice(88, 96), 2)}.${parseInt(
            bits.slice(96, 104),
            2
          )}`,
        };
      }

      if (opCode === 163) {
        return {
          opCode,
          type: "FACELETS",
          facelets: parseFacelet(bits.slice(8, 152)),
          serial: parseInt(bits.slice(152, 160), 2),
        };
      }

      if (opCode === 164) {
        return {
          opCode,
          type: "BATTERY",
          battery: parseInt(bits.slice(8, 16), 2),
        };
      }

      if (opCode === 165) {
        const moveCnt = parseInt(bits.slice(88, 96), 2);
        const moves = [];
        const timeOffsets = [];
        let invalid = false;
        for (let i = 0; i < 5; i++) {
          const m = parseInt(bits.slice(96 + i * 5, 101 + i * 5), 2);
          timeOffsets[i] = parseInt(bits.slice(8 + i * 16, 24 + i * 16), 2);
          if (m >= 12) {
            invalid = true;
            moves[i] = null;
          } else {
            moves[i] = "FBUDLR".charAt(m >> 1) + (m & 1 ? "'" : "");
          }
        }
        return { opCode, type: "MOVE", moveCnt, moves, timeOffsets, invalid };
      }

      return { opCode, type: "UNKNOWN", bytes: decoded };
    },
  };
}

/**
 * MoYu names carry only the last 2 MAC bytes (e.g. WCU_MY32_AB12). Build the
 * full-MAC candidate list from the known MoYu OUI + hardware-revision byte, for
 * the brute-force probe fallback used when BLE advertisement data is
 * unavailable. Mirrors buildMoyu32MacCandidatesFromName in the reference lib.
 */
export function macCandidatesFromName(name) {
  const t = String(name || "").trim();
  const out = [];
  const seen = new Set();
  const push = (mac) => {
    if (!seen.has(mac)) {
      seen.add(mac);
      out.push(mac);
    }
  };

  const my32 = /^WCU_MY32_([0-9A-Fa-f]{4})$/.exec(t);
  if (my32) {
    const a = `${my32[1].slice(0, 2)}:${my32[1].slice(2, 4)}`.toUpperCase();
    for (const mid of ["00", "01", "02"]) push(`CF:30:16:${mid}:${a}`);
  }

  const my33 = /^WCU_MY33_([0-9A-Fa-f]{4})$/.exec(t);
  if (my33) {
    const a = `${my33[1].slice(0, 2)}:${my33[1].slice(2, 4)}`.toUpperCase();
    for (const mid of ["02", "01", "00"]) push(`CF:30:16:${mid}:${a}`);
  }

  // Generic WCU_*_XXXX / *-XXXX fallback: try the known MoYu OUI with a few
  // revision bytes.
  if (!out.length) {
    const generic = /[_-]([0-9A-Fa-f]{4})$/.exec(t);
    if (generic) {
      const a = `${generic[1].slice(0, 2)}:${generic[1].slice(2, 4)}`.toUpperCase();
      for (const oui of ["CF:30:16", "CF:30:17", "CF:30:18"]) {
        for (const mid of ["00", "01", "02"]) push(`${oui}:${mid}:${a}`);
      }
    }
  }

  return out;
}

export function macStringToBytes(mac) {
  return String(mac || "")
    .split(/[:\-\s]+/)
    .map((c) => parseInt(c, 16) & 0xff);
}
