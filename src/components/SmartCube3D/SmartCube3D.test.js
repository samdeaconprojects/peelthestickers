/* eslint-disable testing-library/no-node-access -- reads the drawn sticker colours */
import React, { createRef } from "react";
import { act, render } from "@testing-library/react";
import SmartCube3D from "./SmartCube3D";
import { SOLVED, applyAlg } from "../../smart/recon/cube3";
import { faceHex, getCubeColors } from "../../utils/cubeColors";

// Sticker colours as drawn, in facelet order.
function drawnState(container) {
  const byHex = {};
  for (const f of "URFDLB") byHex[faceHex(getCubeColors(), f).toLowerCase()] = f;
  const toHex = (rgb) => {
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(rgb);
    return m ? "#" + m.slice(1).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : rgb;
  };
  // Stickers are rendered cubie by cubie; map each back to its facelet index
  // via the order Cube3D registers them (tested through the public result).
  return [...container.querySelectorAll(".cube3d__sticker")].map(
    (el) => byHex[toHex(el.style.backgroundColor).toLowerCase()] || "?"
  );
}

beforeEach(() => {
  jest.useFakeTimers();
  global.requestAnimationFrame = (cb) => setTimeout(() => cb(performance.now()), 16);
  global.cancelAnimationFrame = (id) => clearTimeout(id);
});

afterEach(() => {
  jest.useRealTimers();
});

test("live view follows moves, facelet snaps and gyro", () => {
  const ref = createRef();
  const { container } = render(<SmartCube3D ref={ref} />);
  const solvedDrawn = drawnState(container);
  expect(solvedDrawn.includes("?")).toBe(false);

  // Moves animate, then land on the model's state.
  act(() => {
    for (const m of ["R", "U", "R'", "U'"]) ref.current.addMove(m);
  });
  act(() => {
    jest.advanceTimersByTime(3000);
  });
  const afterMoves = drawnState(container);

  const ref2 = createRef();
  const { container: c2 } = render(<SmartCube3D ref={ref2} />);
  act(() => ref2.current.setFacelets(applyAlg(SOLVED, "R U R' U'")));
  expect(drawnState(c2)).toEqual(afterMoves);
  expect(afterMoves).not.toEqual(solvedDrawn);

  // No cubie left mid-turn.
  expect(container.querySelector('.cube3d__cubie[style*="matrix3d"]')).toBeNull();

  // Gyro: home is the first reading; a later reading turns the whole cube.
  act(() => ref.current.setQuaternion({ x: 0, y: 0, z: 0, w: 1 }));
  act(() => ref.current.setQuaternion({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }));
  act(() => {
    jest.advanceTimersByTime(50);
  });
  expect(container.querySelector(".cube3d__cube").style.transform).toContain("matrix3d");

  act(() => ref.current.resetToSolved());
  expect(drawnState(container)).toEqual(solvedDrawn);
});
