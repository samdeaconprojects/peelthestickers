// src/components/Cube3D/Cube3D.js
//
// Our own 3D Rubik's cube, drawn with CSS 3D transforms (no WebGL, no
// library). 26 cubies, each a box of six faces; outer faces carry a sticker
// coloured from a 54-char facelet state (Kociemba order, see smart/recon/cube3).
//
// Turning a layer: every cubie in the layer gets the same rotation; when the
// turn completes the caller draws the next state with no rotation, so the
// stickers jump to where the turn took them. Which cubies move, and which way,
// comes from cube3's MOVE_GEOMETRY, so the picture always agrees with the model.
//
// Props
//   state       facelet string (default solved)
//   colors      sticker colours (default: the user's scheme, useCubeColors)
//   size        px, width = height of the box the cube sits in
//   view        { pitch, yaw } resting camera angles in degrees
//   draggable   drag to look around (double-click resets)
//   className
//
// Ref API (for animation; avoids a React render per frame)
//   draw(state, anim?)          anim = { token | base+amount, fraction 0..1 }
//   setOrientation(quat|null)   live gyro, quaternion in cube frame (x R, y U, z F)
//   resetView()

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
} from "react";
import {
  SOLVED,
  MOVE_GEOMETRY,
  parseToken,
  stickerIndexAt,
} from "../../smart/recon/cube3";
import { faceHex, useCubeColors } from "../../utils/cubeColors";
import "./Cube3D.css";

// Six box faces: outward normal (cube frame) and the CSS rotation that turns a
// face lying in the screen plane (normal +z, toward the viewer) to face that way.
// CSS has y pointing down, so cube-frame +y (U) is CSS -y.
const BOX_FACES = [
  { n: [1, 0, 0], css: "rotateY(90deg)" },
  { n: [-1, 0, 0], css: "rotateY(-90deg)" },
  { n: [0, 1, 0], css: "rotateX(90deg)" },
  { n: [0, -1, 0], css: "rotateX(-90deg)" },
  { n: [0, 0, 1], css: "" },
  { n: [0, 0, -1], css: "rotateY(180deg)" },
];

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const CUBIES = (() => {
  const out = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = -1; y <= 1; y++) {
      for (let z = -1; z <= 1; z++) {
        if (!x && !y && !z) continue;
        const pos = [x, y, z];
        const faces = BOX_FACES.map((f) => ({
          css: f.css,
          sticker: dot(pos, f.n) === 1 ? stickerIndexAt(pos, f.n) : -1,
        }));
        out.push({ pos, faces });
      }
    }
  }
  return out;
})();

// Rotation matrix (cube frame, right-handed) about unit `axis` by `deg`.
export function axisAngle(axis, deg) {
  const t = (deg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  const k = 1 - c;
  const [x, y, z] = axis;
  return [
    [c + x * x * k, x * y * k - z * s, x * z * k + y * s],
    [y * x * k + z * s, c + y * y * k, y * z * k - x * s],
    [z * x * k - y * s, z * y * k + x * s, c + z * z * k],
  ];
}

function quatMatrix(q) {
  const len = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  const x = q.x / len;
  const y = q.y / len;
  const z = q.z / len;
  const w = q.w / len;
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

// Cube-frame rotation -> CSS matrix3d (conjugated by the y flip, column-major).
function cssMatrix(m) {
  const f = [1, -1, 1];
  const v = [];
  for (let col = 0; col < 3; col++) {
    for (let row = 0; row < 3; row++) v.push(+(m[row][col] * f[row] * f[col]).toFixed(6));
    v.push(0);
  }
  v.push(0, 0, 0, 1);
  return `matrix3d(${v.join(",")})`;
}

/** { axis, inLayer, degrees } for a move token at full turn, or null. */
export function moveTurn(tokenOrMove) {
  const p = typeof tokenOrMove === "string" ? parseToken(tokenOrMove) : tokenOrMove;
  if (!p || !p.amount) return null;
  const g = MOVE_GEOMETRY[p.base];
  if (!g) return null;
  // A quarter turn is clockwise seen from the axis tip: -90 by the right-hand rule.
  const degrees = p.amount === 1 ? -90 : p.amount === 2 ? -180 : 90;
  return { axis: g.axis, inLayer: g.inLayer, degrees };
}

export const DEFAULT_VIEW = { pitch: -28, yaw: -36 };

const Cube3D = React.memo(forwardRef(function Cube3D(
  {
    state = SOLVED,
    colors: colorsProp = null,
    size = 200,
    view = DEFAULT_VIEW,
    draggable = false,
    className = "",
  },
  ref
) {
  const userColors = useCubeColors();
  const colors = colorsProp || userColors;

  const cubeRef = useRef(null);
  const cubieEls = useRef([]);
  const stickerEls = useRef(new Array(54));

  const drawnState = useRef(null);
  const drawnColors = useRef(null);
  const turning = useRef(new Set());

  const viewRef = useRef({ ...view });
  const orientRef = useRef(null);
  const dragRef = useRef(null);

  const unit = size / 4.6;

  const cubieBase = useCallback(
    (pos) => `translate3d(${pos[0] * unit}px, ${-pos[1] * unit}px, ${pos[2] * unit}px)`,
    [unit]
  );

  const applyView = useCallback(() => {
    const el = cubeRef.current;
    if (!el) return;
    const v = viewRef.current;
    const orient = orientRef.current ? ` ${cssMatrix(quatMatrix(orientRef.current))}` : "";
    el.style.transform = `rotateX(${v.pitch}deg) rotateY(${v.yaw}deg)${orient}`;
  }, []);

  const colorsRef = useRef(colors);
  colorsRef.current = colors;

  const paint = useCallback((s, force = false) => {
    const st = s && s.length === 54 ? s : SOLVED;
    const cols = colorsRef.current;
    if (!force && st === drawnState.current && cols === drawnColors.current) return;
    for (let i = 0; i < 54; i++) {
      const el = stickerEls.current[i];
      if (el) el.style.backgroundColor = faceHex(cols, st[i]);
    }
    drawnState.current = st;
    drawnColors.current = cols;
  }, []);

  const draw = useCallback(
    (s, anim = null) => {
      paint(s);
      const turn = anim ? moveTurn(anim.token || anim) : null;
      const fraction = anim ? Math.max(0, Math.min(1, anim.fraction ?? 0)) : 0;
      const next = new Set();
      if (turn && fraction > 0) {
        const rot = cssMatrix(axisAngle(turn.axis, turn.degrees * fraction));
        CUBIES.forEach((c, i) => {
          if (!turn.inLayer(dot(c.pos, turn.axis))) return;
          next.add(i);
          const el = cubieEls.current[i];
          if (el) el.style.transform = `${rot} ${cubieBase(c.pos)}`;
        });
      }
      for (const i of turning.current) {
        if (next.has(i)) continue;
        const el = cubieEls.current[i];
        if (el) el.style.transform = cubieBase(CUBIES[i].pos);
      }
      turning.current = next;
    },
    [paint, cubieBase]
  );

  // Declarative state / colours. A colour change repaints whatever is drawn
  // now (mid-replay too), not the `state` prop.
  useLayoutEffect(() => {
    draw(state);
  }, [state, draw]);

  useLayoutEffect(() => {
    paint(drawnState.current || state, true);
  }, [colors, paint]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    viewRef.current = { ...view };
    applyView();
  }, [view.pitch, view.yaw, applyView]); // eslint-disable-line react-hooks/exhaustive-deps

  useImperativeHandle(
    ref,
    () => ({
      draw,
      setOrientation(q) {
        orientRef.current = q && Number.isFinite(q.w) ? q : null;
        applyView();
      },
      resetView() {
        viewRef.current = { ...view };
        applyView();
      },
    }),
    [draw, applyView, view]
  );

  // Drag to look around.
  useEffect(() => {
    if (!draggable) return undefined;
    const el = cubeRef.current?.parentElement;
    if (!el) return undefined;
    const down = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      dragRef.current = { x: e.clientX, y: e.clientY, start: { ...viewRef.current } };
      el.setPointerCapture?.(e.pointerId);
    };
    const move = (e) => {
      const d = dragRef.current;
      if (!d) return;
      const pitch = Math.max(-89, Math.min(89, d.start.pitch - (e.clientY - d.y) * 0.5));
      const yaw = d.start.yaw + (e.clientX - d.x) * 0.5;
      viewRef.current = { pitch, yaw };
      applyView();
    };
    const up = () => {
      dragRef.current = null;
    };
    const reset = () => {
      viewRef.current = { ...view };
      applyView();
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("dblclick", reset);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      el.removeEventListener("dblclick", reset);
    };
  }, [draggable, applyView, view]);

  return (
    <div
      className={`cube3d ${draggable ? "cube3d--draggable" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        "--cube3d-unit": `${unit}px`,
        "--cube3d-plastic": colors.plastic || "#111111",
      }}
      aria-hidden="true"
    >
      <div className="cube3d__cube" ref={cubeRef}>
        {CUBIES.map((c, i) => (
          <div
            key={c.pos.join(",")}
            className="cube3d__cubie"
            ref={(el) => {
              cubieEls.current[i] = el;
            }}
            style={{ transform: cubieBase(c.pos) }}
          >
            {c.faces.map((f, k) => (
              <div
                key={k}
                className="cube3d__face"
                style={{ transform: `${f.css} translateZ(${unit / 2}px)` }}
              >
                {f.sticker >= 0 ? (
                  <div
                    className="cube3d__sticker"
                    ref={(el) => {
                      stickerEls.current[f.sticker] = el;
                    }}
                  />
                ) : null}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}));

export default Cube3D;
