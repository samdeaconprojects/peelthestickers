import { axisAngle, moveTurn } from "./Cube3D";
import {
  MOVE_GEOMETRY,
  STICKER_GEOMETRY,
  applyMove,
  formatToken,
  stickerIndexAt,
} from "../../smart/recon/cube3";

const apply = (m, v) => m.map((row) => Math.round(row[0] * v[0] + row[1] * v[1] + row[2] * v[2]));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// The 3D turn must carry every sticker exactly where the model's permutation
// does, for every move type and amount, or the replay would disagree with
// the reconstruction.
describe("Cube3D turns match the cube model", () => {
  for (const base of Object.keys(MOVE_GEOMETRY)) {
    for (const amount of [1, 2, 3]) {
      const token = formatToken(base, amount);
      test(`turn ${token}`, () => {
        const turn = moveTurn(token);
        const m = axisAngle(turn.axis, turn.degrees);
        for (let i = 0; i < 54; i++) {
          const { pos, normal } = STICKER_GEOMETRY[i];
          const moving = turn.inLayer(dot(pos, turn.axis));
          const j = moving ? stickerIndexAt(apply(m, pos), apply(m, normal)) : i;
          const marked = Array.from({ length: 54 }, (_, k) => (k === i ? "X" : "."));
          const after = applyMove(marked.join(""), token);
          expect(after.indexOf("X")).toBe(j);
        }
      });
    }
  }
});
