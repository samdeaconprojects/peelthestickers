import { useCallback, useMemo, useState } from "react";
import { updateSolve } from "../services/updateSolve";
import { moveSolvesToSession } from "../services/moveSolvesToSession";
import { normalizeEventCode } from "../components/SolveBulk/solveBulkUtils";

function safeMergeCanonicalTags(existingTags, patch, mode = "merge") {
  const base =
    mode === "replace"
      ? {}
      : existingTags && typeof existingTags === "object"
      ? { ...existingTags }
      : {};

  const next = { ...base };

  const allowed = [
    "CubeModel",
    "CrossColor",
    "Custom1",
    "Custom2",
    "Custom3",
    "Custom4",
    "Custom5",
  ];

  for (const key of allowed) {
    if (!(key in patch)) continue;
    const value = String(patch[key] ?? "").trim();
    if (!value) delete next[key];
    else next[key] = value;
  }

  delete next.Custom;
  delete next.SolveSource;

  return next;
}

function sortSolvesByCreatedAt(items = []) {
  return [...items].sort((a, b) => {
    const ta = new Date(a?.createdAt || a?.datetime || 0).getTime();
    const tb = new Date(b?.createdAt || b?.datetime || 0).getTime();
    return ta - tb;
  });
}

export default function useBulkSolveActions({
  user,
  solves = [],
  selectedIndices,
  clearSelection,
  deleteTime,
  addPost,
  setSessions,
  sessionsList = [],
  currentEvent,
  currentSession,
  eventKey,
  practiceMode = false,
}) {
  const [showBulkTags, setShowBulkTags] = useState(false);
  const [showBulkMove, setShowBulkMove] = useState(false);
  const [showBulkShare, setShowBulkShare] = useState(false);

  const [bulkShareNote, setBulkShareNote] = useState("");

  const [bulkTagMode, setBulkTagMode] = useState("merge");
  const [bulkCubeModel, setBulkCubeModel] = useState("");
  const [bulkCrossColor, setBulkCrossColor] = useState("");
  const [bulkCustom1, setBulkCustom1] = useState("");
  const [bulkCustom2, setBulkCustom2] = useState("");
  const [bulkCustom3, setBulkCustom3] = useState("");
  const [bulkCustom4, setBulkCustom4] = useState("");
  const [bulkCustom5, setBulkCustom5] = useState("");

  const [bulkMoveEvent, setBulkMoveEvent] = useState(() =>
    normalizeEventCode(currentEvent)
  );
  const [bulkMoveSession, setBulkMoveSession] = useState(() =>
    String(currentSession || "main")
  );

  const selectionCount = selectedIndices.size;

  const selectedSolvesByIndex = useMemo(() => {
    if (!selectionCount) return [];
    const out = [];
    selectedIndices.forEach((idx) => {
      if (idx >= 0 && idx < solves.length) out.push({ idx, solve: solves[idx] });
    });
    out.sort((a, b) => a.idx - b.idx);
    return out;
  }, [selectionCount, selectedIndices, solves]);

  const getSessionsForEvent = useCallback(
    (ev) => {
      const E = normalizeEventCode(ev);
      return (sessionsList || []).filter((s) => normalizeEventCode(s.Event) === E);
    },
    [sessionsList]
  );

  const sourceListKey = useMemo(
    () => normalizeEventCode(eventKey || currentEvent || solves?.[0]?.event || ""),
    [eventKey, currentEvent, solves]
  );

  const closeAllBulk = useCallback(() => {
    setShowBulkTags(false);
    setShowBulkMove(false);
    setShowBulkShare(false);
  }, []);

  const openBulkTags = useCallback(() => {
    setShowBulkTags(true);
    setShowBulkMove(false);
    setShowBulkShare(false);
  }, []);

  const openBulkMove = useCallback(() => {
    setShowBulkMove(true);
    setShowBulkTags(false);
    setShowBulkShare(false);
  }, []);

  const openBulkShare = useCallback(() => {
    if (!selectionCount) return;
    setBulkShareNote("");
    setShowBulkShare(true);
    setShowBulkTags(false);
    setShowBulkMove(false);
  }, [selectionCount]);

  const applyBulkTags = useCallback(async () => {
    const patch = {};

    if (String(bulkCubeModel || "").trim()) patch.CubeModel = String(bulkCubeModel).trim();
    if (String(bulkCrossColor || "").trim()) patch.CrossColor = String(bulkCrossColor).trim();
    if (String(bulkCustom1 || "").trim()) patch.Custom1 = String(bulkCustom1).trim();
    if (String(bulkCustom2 || "").trim()) patch.Custom2 = String(bulkCustom2).trim();
    if (String(bulkCustom3 || "").trim()) patch.Custom3 = String(bulkCustom3).trim();
    if (String(bulkCustom4 || "").trim()) patch.Custom4 = String(bulkCustom4).trim();
    if (String(bulkCustom5 || "").trim()) patch.Custom5 = String(bulkCustom5).trim();

    const targets = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.solveRef);

    if (!targets.length) {
      setShowBulkTags(false);
      clearSelection();
      return;
    }

    if (practiceMode) {
      const solveRefSet = new Set(targets.map((s) => s.solveRef));

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];

        next[sourceListKey] = arr.map((s) =>
          solveRefSet.has(s?.solveRef)
            ? {
                ...s,
                tags: safeMergeCanonicalTags(s.tags, patch, bulkTagMode),
              }
            : s
        );

        return next;
      });

      setShowBulkTags(false);
      clearSelection();
      return;
    }

    if (!user?.UserID) return;

    try {
      for (const s of targets) {
        const nextTags = safeMergeCanonicalTags(s.tags, patch, bulkTagMode);
        const saved = await updateSolve(user.UserID, s.solveRef, { Tags: nextTags });

        setSessions?.((prev) => {
          const next = { ...(prev || {}) };
          const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
          const idx = arr.findIndex((x) => x?.solveRef === s.solveRef);

          if (idx >= 0) {
            arr[idx] = saved
              ? {
                  ...arr[idx],
                  solveRef: saved?.SK || arr[idx].solveRef,
                  createdAt: saved?.CreatedAt || arr[idx].createdAt,
                  rawTimeMs:
                    Number.isFinite(saved?.RawTimeMs) ? saved.RawTimeMs : arr[idx].rawTimeMs,
                  finalTimeMs:
                    Number.isFinite(saved?.FinalTimeMs) || saved?.FinalTimeMs === null
                      ? saved.FinalTimeMs
                      : arr[idx].finalTimeMs,
                  time:
                    saved?.Penalty === "DNF"
                      ? Number.MAX_SAFE_INTEGER
                      : Number.isFinite(saved?.FinalTimeMs)
                      ? saved.FinalTimeMs
                      : arr[idx].time,
                  isDNF: saved?.Penalty === "DNF" || saved?.IsDNF === true,
                  penalty:
                    typeof saved?.Penalty !== "undefined" ? saved.Penalty : arr[idx].penalty,
                  tags: saved?.Tags || nextTags,
                  event: saved?.Event || arr[idx].event,
                  sessionID: saved?.SessionID || arr[idx].sessionID,
                  scramble: saved?.Scramble ?? arr[idx].scramble,
                  note: saved?.Note ?? arr[idx].note,
                }
              : { ...arr[idx], tags: nextTags };
          }

          next[sourceListKey] = arr;
          return next;
        });
      }
    } catch (err) {
      console.error("Bulk tag update failed:", err);
    }

    setShowBulkTags(false);
    clearSelection();
  }, [
    bulkCubeModel,
    bulkCrossColor,
    bulkCustom1,
    bulkCustom2,
    bulkCustom3,
    bulkCustom4,
    bulkCustom5,
    bulkTagMode,
    selectedSolvesByIndex,
    practiceMode,
    setSessions,
    sourceListKey,
    user,
    clearSelection,
  ]);

  const applyBulkMove = useCallback(async () => {
    const targetEvent = normalizeEventCode(bulkMoveEvent);
    const targetSession = String(bulkMoveSession || "main").trim() || "main";

    const movingSolves = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.solveRef);

    if (!movingSolves.length) {
      setShowBulkMove(false);
      clearSelection();
      return;
    }

    if (practiceMode) {
      const solveRefSet = new Set(movingSolves.map((s) => s.solveRef));

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const sourceArr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];

        const staying = [];
        const moving = [];

        for (const s of sourceArr) {
          if (solveRefSet.has(s?.solveRef)) moving.push(s);
          else staying.push(s);
        }

        next[sourceListKey] = staying;

        if (!next[targetEvent]) next[targetEvent] = [];
        next[targetEvent] = [
          ...(next[targetEvent] || []),
          ...moving.map((s) => ({
            ...s,
            event: targetEvent,
            sessionID: targetSession,
          })),
        ];

        return next;
      });

      setShowBulkMove(false);
      clearSelection();
      return;
    }

    if (!user?.UserID) return;

    let rollbackSnapshot = null;
    const solveRefSet = new Set(movingSolves.map((s) => s.solveRef));

    try {
      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const sourceArr = Array.isArray(prev?.[sourceListKey]) ? [...prev[sourceListKey]] : [];
        const targetArr =
          sourceListKey === targetEvent
            ? sourceArr
            : Array.isArray(prev?.[targetEvent])
            ? [...prev[targetEvent]]
            : [];

        rollbackSnapshot = {
          sourceKey: sourceListKey,
          sourceArr,
          targetKey: targetEvent,
          targetArr,
        };

        if (sourceListKey === targetEvent) {
          next[sourceListKey] = sortSolvesByCreatedAt(
            sourceArr.map((s) =>
              solveRefSet.has(s?.solveRef)
                ? {
                    ...s,
                    event: targetEvent,
                    sessionID: targetSession,
                  }
                : s
            )
          );
        } else {
          const fromSource = sourceArr.filter((s) => solveRefSet.has(s?.solveRef));
          const staying = sourceArr.filter((s) => !solveRefSet.has(s?.solveRef));
          const movedItems = fromSource.map((s) => ({
            ...s,
            event: targetEvent,
            sessionID: targetSession,
          }));

          next[sourceListKey] = staying;
          next[targetEvent] = sortSolvesByCreatedAt([...targetArr, ...movedItems]);
        }

        return next;
      });

      setShowBulkMove(false);
      clearSelection();

      await moveSolvesToSession(user.UserID, movingSolves, {
        event: sourceListKey,
        fromSessionID: currentSession,
        toEvent: targetEvent,
        toSessionID: targetSession,
      });
    } catch (err) {
      console.error("Bulk move failed:", err);
      if (rollbackSnapshot) {
        setSessions?.((prev) => {
          const next = { ...(prev || {}) };
          next[rollbackSnapshot.sourceKey] = rollbackSnapshot.sourceArr;
          next[rollbackSnapshot.targetKey] = rollbackSnapshot.targetArr;
          return next;
        });
      }
      alert("Bulk move failed. Your solves were restored.");
    }
  }, [
    bulkMoveEvent,
    bulkMoveSession,
    selectedSolvesByIndex,
    practiceMode,
    setSessions,
    sourceListKey,
    user,
    currentSession,
    setShowBulkMove,
    clearSelection,
  ]);

  const applyBulkDelete = useCallback(async () => {
    if (!selectionCount) return;

    const ok = window.confirm(`Delete ${selectionCount} selected solve(s)?`);
    if (!ok) return;

    const targets = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.solveRef);

    if (!targets.length) {
      clearSelection();
      return;
    }

    if (practiceMode) {
      const solveRefSet = new Set(targets.map((s) => s.solveRef));

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
        next[sourceListKey] = arr.filter((s) => !solveRefSet.has(s?.solveRef));
        return next;
      });

      clearSelection();
      return;
    }

    try {
      for (const s of targets) {
        await deleteTime(s.solveRef);
      }
    } catch (e) {
      console.error("Bulk delete failed:", e);
    }

    clearSelection();
  }, [
    selectionCount,
    selectedSolvesByIndex,
    practiceMode,
    setSessions,
    sourceListKey,
    clearSelection,
    deleteTime,
  ]);

  const applyBulkShare = useCallback(async () => {
    const selectedSolves = selectedSolvesByIndex.map(({ solve }) => solve).filter(Boolean);

    if (!selectedSolves.length) {
      setShowBulkShare(false);
      clearSelection();
      return;
    }

    const ev = normalizeEventCode(currentEvent || eventKey || selectedSolves[0]?.event);

    try {
      await addPost?.({
        note: bulkShareNote?.trim() || `Shared ${selectedSolves.length} solves`,
        event: ev,
        solveList: selectedSolves,
        comments: [],
      });
    } catch (e) {
      console.error("Bulk share failed:", e);
    }

    setShowBulkShare(false);
    clearSelection();
  }, [selectedSolvesByIndex, currentEvent, eventKey, addPost, bulkShareNote, clearSelection]);

  return {
    selectionCount,
    selectedSolvesByIndex,

    showBulkTags,
    setShowBulkTags,
    showBulkMove,
    setShowBulkMove,
    showBulkShare,
    setShowBulkShare,

    bulkTagMode,
    setBulkTagMode,
    bulkCubeModel,
    setBulkCubeModel,
    bulkCrossColor,
    setBulkCrossColor,
    bulkCustom1,
    setBulkCustom1,
    bulkCustom2,
    setBulkCustom2,
    bulkCustom3,
    setBulkCustom3,
    bulkCustom4,
    setBulkCustom4,
    bulkCustom5,
    setBulkCustom5,

    bulkMoveEvent,
    setBulkMoveEvent,
    bulkMoveSession,
    setBulkMoveSession,

    bulkShareNote,
    setBulkShareNote,

    getSessionsForEvent,
    openBulkTags,
    openBulkMove,
    openBulkShare,
    closeAllBulk,

    applyBulkTags,
    applyBulkMove,
    applyBulkDelete,
    applyBulkShare,
  };
}
