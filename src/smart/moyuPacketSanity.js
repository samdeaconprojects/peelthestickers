// src/smart/moyuPacketSanity.js
//
// Post-decrypt sanity check for MoYu32 notification packets. Used both to probe
// candidate MAC addresses (a wrong key decrypts to noise) and, at runtime, to
// drop garbage packets / detect that decryption is failing entirely.
//
// Ported from poliva/smartcube-web-bluetooth src/smartcube/attachment/packet-sanity.ts.

export function isValidMoyuDecryptedPacket(bytes) {
  if (!bytes || bytes.length < 20) return false;
  try {
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] < 0 || bytes[i] > 255) return false;
    }
    let z = 0;
    let f = 0;
    for (let n = 0; n < Math.min(bytes.length, 20); n++) {
      if (bytes[n] === 0) z++;
      else if (bytes[n] === 255) f++;
    }
    if (z > 14 || f > 14 || new Set(bytes.slice(0, 20)).size > 18) return false;

    let n = "";
    for (let i = 0; i < bytes.length; i++) {
      n += (bytes[i] + 256).toString(2).slice(1);
    }
    const r = parseInt(n.slice(0, 8), 2);
    return validateBitBody(n, r);
  } catch {
    return false;
  }
}

function validateBitBody(e, t) {
  if (!e || e.length < 160) return false;
  try {
    const i = parseInt(e.slice(0, 8), 2);
    if (
      i !== t ||
      ![161, 163, 164, 165, 171].includes(i) ||
      (i === 164 && parseInt(e.slice(8, 16), 2) > 100)
    ) {
      return false;
    }
    if (i === 161) {
      for (let k = 0; k < 8; k++) {
        const v = parseInt(e.slice(8 + 8 * k, 16 + 8 * k), 2);
        if (v !== 0 && (v < 32 || v > 126)) return false;
      }
    }
    if (i === 165) {
      let c = 0;
      for (let j = 0; j < 5; j++) {
        const v = parseInt(e.slice(96 + 5 * j, 101 + 5 * j), 2);
        if (v <= 11) c++;
        else if (v < 31) return false;
      }
      if (c === 0) return false;
      let allZero = true;
      let allMax = true;
      for (let rr = 0; rr < c; rr++) {
        const v = parseInt(e.slice(8 + 16 * rr, 24 + 16 * rr), 2);
        if (v !== 0) allZero = false;
        if (v !== 65535) allMax = false;
      }
      if (allZero || allMax) return false;
    }
    if (i === 163) {
      const body = e.slice(8, 152);
      const zeros = (body.match(/0/g) || []).length;
      const ones = (body.match(/1/g) || []).length;
      if (zeros > 0.9 * body.length || ones > 0.9 * body.length) return false;
    }
    return true;
  } catch {
    return false;
  }
}
