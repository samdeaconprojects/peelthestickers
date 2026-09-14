import {
  createMoyuProtocol,
  macCandidatesFromName,
  macStringToBytes,
} from "./moyuProtocol";

const MAC = "CF:30:16:01:AB:12";

function bitsToBytes(bits) {
  const padded = bits.padEnd(160, "0");
  const out = [];
  for (let i = 0; i < 20; i++) {
    out.push(parseInt(padded.slice(i * 8, i * 8 + 8), 2));
  }
  return out;
}

function buildMovePacket({ moveCnt, moves, timeOffsets }) {
  let bits = (165).toString(2).padStart(8, "0");
  for (let i = 0; i < 5; i++) {
    bits += (timeOffsets[i] || 0).toString(2).padStart(16, "0");
  }
  bits += (moveCnt & 0xff).toString(2).padStart(8, "0");
  for (let i = 0; i < 5; i++) {
    bits += (moves[i] & 0x1f).toString(2).padStart(5, "0");
  }
  return bitsToBytes(bits);
}

describe("moyuProtocol crypto", () => {
  it("round-trips a packet through encrypt/decrypt", () => {
    const proto = createMoyuProtocol(macStringToBytes(MAC));
    const plain = new Array(20).fill(0).map((_, i) => (i * 7 + 3) & 0xff);
    plain[0] = 163;
    const enc = proto.encryptPacket(plain);
    expect(Array.from(enc)).not.toEqual(plain);
    const dec = proto.decode(enc);
    expect(dec.opCode).toBe(163);
  });

  it("decodes command packets it produced", () => {
    const proto = createMoyuProtocol(macStringToBytes(MAC));
    expect(proto.decode(proto.getCubeInfoPacket()).opCode).toBe(161);
    expect(proto.decode(proto.getCubeStatusPacket()).opCode).toBe(163);
    expect(proto.decode(proto.getBatteryPacket()).opCode).toBe(164);
    expect(proto.decode(proto.getEnableGyroPacket()).opCode).toBe(172);
  });
});

describe("moyuProtocol move decoding", () => {
  it("parses face/direction and time offsets from a move packet", () => {
    const proto = createMoyuProtocol(macStringToBytes(MAC));
    const raw = buildMovePacket({
      moveCnt: 200,
      moves: [4, 5, 0, 2, 10], // U U' F B R
      timeOffsets: [10, 20, 30, 40, 50],
    });
    const decoded = proto.decode(proto.encryptPacket(raw));

    expect(decoded.type).toBe("MOVE");
    expect(decoded.moveCnt).toBe(200);
    expect(decoded.invalid).toBe(false);
    expect(decoded.moves).toEqual(["U", "U'", "F", "B", "R"]);
    expect(decoded.timeOffsets).toEqual([10, 20, 30, 40, 50]);
  });

  it("flags invalid moves (value >= 12)", () => {
    const proto = createMoyuProtocol(macStringToBytes(MAC));
    const raw = buildMovePacket({
      moveCnt: 5,
      moves: [31, 31, 31, 31, 31],
      timeOffsets: [0, 0, 0, 0, 0],
    });
    const decoded = proto.decode(proto.encryptPacket(raw));
    expect(decoded.invalid).toBe(true);
  });
});

describe("moyuProtocol gyro decoding", () => {
  it("decodes a normalized quaternion from an opcode-171 packet", () => {
    const proto = createMoyuProtocol(macStringToBytes(MAC));
    const raw = new Array(20).fill(0);
    raw[0] = 171;
    const dv = new DataView(new ArrayBuffer(16));
    dv.setInt32(0, 1073741824, true); // w = 1.0 at 2^30 scale
    for (let i = 0; i < 16; i++) raw[1 + i] = dv.getUint8(i);

    const decoded = proto.decode(proto.encryptPacket(raw));
    expect(decoded.type).toBe("GYRO");
    expect(decoded.quaternion.w).toBeCloseTo(1, 5);
    expect(decoded.quaternion.x).toBeCloseTo(0, 5);
  });
});

describe("macCandidatesFromName", () => {
  it("expands a WCU name suffix into full-MAC candidates", () => {
    const list = macCandidatesFromName("WCU_MY32_AB12");
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((m) => m.endsWith(":AB:12"))).toBe(true);
  });

  it("returns [] for a name without a hex suffix", () => {
    expect(macCandidatesFromName("WCU_MY32")).toEqual([]);
  });
});
