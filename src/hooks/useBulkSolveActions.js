import { useCallback, useMemo, useState } from "react";
import { updateSolve } from "../services/updateSolve";
import {
  buildGsi1pk,
  normalizeEventCode,
  parseCustomLines,
  safeMergeTags,
} from "../components/SolveBulk/solveBulkUtils";

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
  const [bulkCustomLines, setBulkCustomLines] = useState("");

  const [bulkMoveEvent, setBulkMoveEvent] = useState(() => normalizeEventCode(currentEvent));
  const [bulkMoveSession, setBulkMoveSession] = useState(() => String(currentSession || "main"));

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

    const custom = parseCustomLines(bulkCustomLines);
    if (Object.keys(custom).length) patch.Custom = custom;

    const targets = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.datetime);

    if (!targets.length) {
      setShowBulkTags(false);
      clearSelection();
      return;
    }

    if (practiceMode) {
      const datetimeSet = new Set(targets.map((s) => s.datetime));

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];

        next[sourceListKey] = arr.map((s) =>
          datetimeSet.has(s?.datetime)
            ? { ...s, tags: safeMergeTags(s.tags, patch, bulkTagMode) }
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
        const nextTags = safeMergeTags(s.tags, patch, bulkTagMode);
        await updateSolve(user.UserID, s.datetime, { Tags: nextTags });

        setSessions?.((prev) => {
          const next = { ...(prev || {}) };
          const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
          const idx = arr.findIndex((x) => x?.datetime === s.datetime);
          if (idx >= 0) arr[idx] = { ...arr[idx], tags: nextTags };
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
    bulkCustomLines,
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
      .filter((s) => s?.datetime);

    if (!movingSolves.length) {
      setShowBulkMove(false);
      clearSelection();
      return;
    }

    if (practiceMode) {
      const datetimeSet = new Set(movingSolves.map((s) => s.datetime));

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const sourceArr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];

        const staying = [];
        const moving = [];

        for (const s of sourceArr) {
          if (datetimeSet.has(s?.datetime)) moving.push(s);
          else staying.push(s);
        }

        next[sourceListKey] = staying;

        if (!next[targetEvent]) next[targetEvent] = [];
        if (Array.isArray(next[targetEvent])) {
          next[targetEvent] = [
            ...(next[targetEvent] || []),
            ...moving.map((s) => ({ ...s, event: targetEvent, sessionID: targetSession })),
          ];
        }

        return next;
      });

      setShowBulkMove(false);
      clearSelection();
      return;
    }

    if (!user?.UserID) return;

    try {
      for (const s of movingSolves) {
        const nextGsi1pk = buildGsi1pk(user.UserID, targetEvent, targetSession);

        await updateSolve(user.UserID, s.datetime, {
          Event: targetEvent,
          SessionID: targetSession,
          GSI1PK: nextGsi1pk,
        });
      }

      const datetimeSet = new Set(movingSolves.map((s) => s.datetime));

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
        next[sourceListKey] = arr.filter((s) => !datetimeSet.has(s?.datetime));
        return next;
      });
    } catch (err) {
      console.error("Bulk move failed:", err);
    }

    setShowBulkMove(false);
    clearSelection();
  }, [
    bulkMoveEvent,
    bulkMoveSession,
    selectedSolvesByIndex,
    practiceMode,
    setSessions,
    sourceListKey,
    user,
    clearSelection,
  ]);

  const applyBulkDelete = useCallback(async () => {
    if (!selectionCount) return;

    const ok = window.confirm(`Delete ${selectionCount} selected solve(s)?`);
    if (!ok) return;

    const targets = selectedSolvesByIndex
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.datetime);

    if (!targets.length) {
      clearSelection();
      return;
    }

    if (practiceMode) {
      const datetimeSet = new Set(targets.map((s) => s.datetime));
      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
        next[sourceListKey] = arr.filter((s) => !datetimeSet.has(s?.datetime));
        return next;
      });

      clearSelection();
      return;
    }

    try {
      for (const s of targets) {
        await deleteTime(s?.datetime);
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
    bulkCustomLines,
    setBulkCustomLines,

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