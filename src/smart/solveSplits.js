// src/smart/solveSplits.js
//
// CFOP-ish splits from (move -> facelets) timeline.
// IMPORTANT: This is only as good as your facelets-per-move alignment.
// If facelets arrive late/batched, splits will be noisier.
//
// This version keeps your "facesFromSolvedFacelets" mapping approach,
// but improves reliability by:
//  - Stronger Down-cross check (D edges + their side partners)
//  - Only search for OLL after F2L is detected (reduces early false positives)
//  - Keeps monotonic clamp

function isSolvedCubeByFaces(facelets, faces) {
  if (!facelets || String(facelets).length !== 54) return false;
  const s = String(facelets);
  const keys = ["U", "R", "F", "D", "L", "B"];
  for (const k of keys) {
    const idxs = faces?.[k];
    if (!idxs || idxs.length !== 9) return false;
    const c = s[idxs[4]];
    for (const i of idxs) if (s[i] !== c) return false;
  }
  return true;
}

/**
 * Build face index lists from a solved facelet string (finalFacelets),
 * by grouping indices by the character at that index in the solved state.
 *
 * Works when finalFacelets looks like:
 * "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB"
 */
function facesFromSolvedFacelets(finalFacelets) {
  if (!finalFacelets || String(finalFacelets).length !== 54) return null;
  const s = String(finalFacelets);

  const faces = { U: [], R: [], F: [], D: [], L: [], B: [] };
  for (let i = 0; i < 54; i++) {
    const ch = s[i];
    if (faces[ch]) faces[ch].push(i);
  }

  for (const k of ["U", "R", "F", "D", "L", "B"]) {
    if (faces[k].length !== 9) return null;
  }

  return faces;
}

// assume row-major within each face's 9 indices:
// 0 1 2
// 3 4 5
// 6 7 8
function edgeIndicesOfFace(faceIdxs) {
  if (!Array.isArray(faceIdxs) || faceIdxs.length !== 9) return null;
  return [faceIdxs[1], faceIdxs[3], faceIdxs[5], faceIdxs[7]];
}

function isFaceUniform(facelets, faceIdxs) {
  if (!facelets || String(facelets).length !== 54) return false;
  if (!Array.isArray(faceIdxs) || faceIdxs.length !== 9) return false;

  const s = String(facelets);
  const c = s[faceIdxs[4]];
  for (const i of faceIdxs) if (s[i] !== c) return false;
  return true;
}

/**
 * Stronger DOWN cross:
 * - D edges match D center (D1,D3,D5,D7)
 * - AND the partner stickers on F/R/B/L bottom edges match their centers
 *
 * This assumes row-major face ordering for each face's 9 indices.
 * If edges can't be identified, we fall back to the weaker ">=5 matches on D".
 */
function isDownCrossDone(facelets, faces) {
  if (!faces?.D || !faces?.F || !faces?.R || !faces?.B || !faces?.L) return false;
  const s = String(facelets);
  if (s.length !== 54) return false;

  const d = faces.D;
  const f = faces.F;
  const r = faces.R;
  const b = faces.B;
  const l = faces.L;

  const dc = s[d[4]];

  const dEdges = edgeIndicesOfFace(d);
  const fEdges = edgeIndicesOfFace(f);
  const rEdges = edgeIndicesOfFace(r);
  const bEdges = edgeIndicesOfFace(b);
  const lEdges = edgeIndicesOfFace(l);

  // If any edge mapping missing, fallback
  if (!dEdges || !fEdges || !rEdges || !bEdges || !lEdges) {
    let matches = 0;
    for (const i of d) if (s[i] === dc) matches++;
    return matches >= 5;
  }

  // D edge stickers must match D center
  for (const i of dEdges) if (s[i] !== dc) return false;

  // Partner stickers:
  // D[1] is adjacent to F[7] (bottom mid of F)
  // D[5] adjacent to R[7]
  // D[7] adjacent to B[7]
  // D[3] adjacent to L[7]
  //
  // With row-major, bottom mid = index 7.
  const Fc = s[f[4]];
  const Rc = s[r[4]];
  const Bc = s[b[4]];
  const Lc = s[l[4]];

  if (s[f[7]] !== Fc) return false;
  if (s[r[7]] !== Rc) return false;
  if (s[b[7]] !== Bc) return false;
  if (s[l[7]] !== Lc) return false;

  return true;
}

/**
 * F2L done heuristic:
 * - D face solved
 * - bottom two rows of side faces solved (positions 3-8 match face center)
 *
 * If row-major assumption fails, we fall back to "mostly solved sides" (>=6 matches).
 */
function isF2LDoneHeuristic(facelets, faces) {
  if (!faces) return false;
  const s = String(facelets);
  if (s.length !== 54) return false;

  const d = faces.D;
  if (!isFaceUniform(s, d)) return false;

  const sideKeys = ["F", "R", "B", "L"];

  // strong: bottom two rows indices [3,4,5,6,7,8]
  let strongOk = true;
  for (const k of sideKeys) {
    const idxs = faces[k];
    const c = s[idxs[4]];
    const bottomTwo = [idxs[3], idxs[4], idxs[5], idxs[6], idxs[7], idxs[8]];
    for (const i of bottomTwo) {
      if (s[i] !== c) {
        strongOk = false;
        break;
      }
    }
    if (!strongOk) break;
  }
  if (strongOk) return true;

  // fallback: mostly-solved sides (>=6 of 9 match center)
  for (const k of sideKeys) {
    const idxs = faces[k];
    const c = s[idxs[4]];
    let matches = 0;
    for (const i of idxs) if (s[i] === c) matches++;
    if (matches < 6) return false;
  }

  return true;
}

/**
 * OLL oriented heuristic:
 * - U face uniform
 * - cube not solved (so we don’t collapse into PLL)
 */
function isOLLOrientedNotSolved(facelets, faces) {
  if (!faces) return false;
  if (!isFaceUniform(facelets, faces.U)) return false;
  if (isSolvedCubeByFaces(facelets, faces)) return false;
  return true;
}

function clampMonotonic(msArr) {
  const out = [...msArr];
  for (let i = 0; i < out.length; i++) {
    const a = out[i];
    if (a == null) continue;
    for (let j = i + 1; j < out.length; j++) {
      const b = out[j];
      if (b == null) continue;
      if (a > b) {
        out[i] = null;
        break;
      }
    }
  }
  return out;
}

/**
 * moveLog: [{ move, hostTs, facelets }]
 * opts:
 *  - totalMs: number
 *  - finalFacelets: 54-char state at end (REQUIRED for mapping)
 */
export function computeBasicCFOPSplits(moveLog, opts = {}) {
  const moves = Array.isArray(moveLog) ? moveLog : [];
  if (!moves.length) return null;

  const t0 = moves[0]?.hostTs;
  if (!Number.isFinite(t0)) return null;

  const faces = facesFromSolvedFacelets(opts?.finalFacelets);
  if (!faces) {
    return {
      t0HostTs: t0,
      crossMs: null,
      f2lDoneMs: null,
      ollMs: null,
      pllMs: Number.isFinite(opts?.totalMs) ? opts.totalMs : null,
      meta: { error: "No finalFacelets mapping" },
    };
  }

  let crossAt = null;
  let f2lAt = null;
  let ollAt = null;
  let pllAt = null;

  for (const m of moves) {
    const ft = m?.facelets;
    const ht = m?.hostTs;
    if (!ft || !Number.isFinite(ht) || String(ft).length !== 54) continue;

    if (!crossAt && isDownCrossDone(ft, faces)) crossAt = ht;
    if (!f2lAt && isF2LDoneHeuristic(ft, faces)) f2lAt = ht;

    // Only look for OLL after we have F2L (prevents early false positives)
    if (f2lAt && !ollAt && isOLLOrientedNotSolved(ft, faces)) ollAt = ht;

    if (!pllAt && isSolvedCubeByFaces(ft, faces)) pllAt = ht;
  }

  const toSplit = (t) => (Number.isFinite(t) ? Math.max(0, t - t0) : null);

  let crossMs = toSplit(crossAt);
  let f2lDoneMs = toSplit(f2lAt);
  let ollMs = toSplit(ollAt);
  let pllMs = toSplit(pllAt);

  const totalMs = Number(opts?.totalMs);
  const finalSolved = isSolvedCubeByFaces(opts?.finalFacelets, faces);
  if (pllMs == null && Number.isFinite(totalMs) && totalMs >= 0 && finalSolved) {
    pllMs = totalMs;
  }

  // If OLL only appears at the end, drop it (avoid oll==pll)
  if (ollMs != null && pllMs != null && ollMs === pllMs) {
    ollMs = null;
  }

  const fixed = clampMonotonic([crossMs, f2lDoneMs, ollMs, pllMs]);
  crossMs = fixed[0];
  f2lDoneMs = fixed[1];
  ollMs = fixed[2];
  pllMs = fixed[3];

  return {
    t0HostTs: t0,
    crossMs,
    f2lDoneMs,
    ollMs,
    pllMs,
  };
}