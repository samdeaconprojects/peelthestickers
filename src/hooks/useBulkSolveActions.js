import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { moveSolvesToSession } from "../services/moveSolvesToSession";
import { bulkUpdateSolveTags } from "../services/bulkUpdateSolveTags";
import { normalizeEventCode } from "../components/SolveBulk/solveBulkUtils";
import { currentEventToString } from "../components/scrambleUtils";
import { DEFAULT_EVENTS } from "../defaultEvents";

const BULK_STATUS_MS = 3500;
const BULK_UNDO_STATUS_MS = 7000;

function pluralSolves(n) {
  return `${n} solve${n === 1 ? "" : "s"}`;
}

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
    "TimerInput",
    "SolveSource",
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
  const [bulkTimerInput, setBulkTimerInput] = useState("");
  const [bulkSolveSource, setBulkSolveSource] = useState("");
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

  // Short-lived confirmation shown after a bulk action: { text, kind: "info" | "success" | "error" }.
  const [bulkStatus, setBulkStatus] = useState(null);
  const bulkStatusTimeoutRef = useRef(null);

  const dismissBulkStatus = useCallback(() => {
    if (bulkStatusTimeoutRef.current) clearTimeout(bulkStatusTimeoutRef.current);
    bulkStatusTimeoutRef.current = null;
    setBulkStatus(null);
  }, []);

  const showBulkStatus = useCallback(
    (text, kind = "success", { sticky = false, onUndo = null } = {}) => {
      if (bulkStatusTimeoutRef.current) clearTimeout(bulkStatusTimeoutRef.current);
      bulkStatusTimeoutRef.current = null;
      setBulkStatus({ text, kind, onUndo: typeof onUndo === "function" ? onUndo : null });
      if (!sticky) {
        bulkStatusTimeoutRef.current = setTimeout(() => {
          bulkStatusTimeoutRef.current = null;
          setBulkStatus(null);
        }, onUndo ? BULK_UNDO_STATUS_MS : BULK_STATUS_MS);
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (bulkStatusTimeoutRef.current) clearTimeout(bulkStatusTimeoutRef.current);
    },
    []
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

  const bulkMoveEventOptions = useMemo(() => {
    const ids = [];
    const seen = new Set();
    const add = (ev) => {
      const id = normalizeEventCode(ev);
      if (!id || seen.has(id)) return;
      seen.add(id);
      ids.push(id);
    };
    DEFAULT_EVENTS.forEach(add);
    (sessionsList || []).forEach((s) => add(s?.Event));
    add(currentEvent);
    add(bulkMoveEvent);
    return ids.map((id) => ({ id, name: currentEventToString(id) || id }));
  }, [sessionsList, currentEvent, bulkMoveEvent]);

  const describeMoveTarget = useCallback(
    (ev, sessionID) => {
      const eventName = currentEventToString(ev) || ev;
      const session = getSessionsForEvent(ev).find((s) => String(s.SessionID) === sessionID);
      const sessionName = session?.SessionName || (sessionID === "main" ? "Main" : sessionID);
      return `${eventName} · ${sessionName}`;
    },
    [getSessionsForEvent]
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

  const undoBulkTags = useCallback(
    async ({ originalTagsByRef, practice }) => {
      const restoreLocal = () =>
        setSessions?.((prev) => {
          const next = { ...(prev || {}) };
          const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];
          next[sourceListKey] = arr.map((entry) =>
            originalTagsByRef.has(String(entry?.solveRef))
              ? { ...entry, tags: originalTagsByRef.get(String(entry.solveRef)) }
              : entry
          );
          return next;
        });

      if (practice) {
        restoreLocal();
        showBulkStatus("Tag edit undone");
        return;
      }

      if (!user?.UserID) return;
      showBulkStatus("Undoing tag edit…", "info", { sticky: true });
      try {
        await bulkUpdateSolveTags(
          user.UserID,
          Array.from(originalTagsByRef, ([solveRef, tags]) => ({ solveRef, tags }))
        );
        restoreLocal();
        showBulkStatus("Tag edit undone");
      } catch (err) {
        console.error("Bulk tag undo failed:", err);
        showBulkStatus("Couldn't undo the tag edit.", "error");
      }
    },
    [setSessions, sourceListKey, user, showBulkStatus]
  );

  const applyBulkTags = useCallback(async () => {
    const patch = {};

    if (String(bulkCubeModel || "").trim()) patch.CubeModel = String(bulkCubeModel).trim();
    if (String(bulkCrossColor || "").trim()) patch.CrossColor = String(bulkCrossColor).trim();
    if (String(bulkTimerInput || "").trim()) patch.TimerInput = String(bulkTimerInput).trim();
    if (String(bulkSolveSource || "").trim()) patch.SolveSource = String(bulkSolveSource).trim();
    if (String(bulkCustom1 || "").trim()) patch.Custom1 = String(bulkCustom1).trim();
    if (String(bulkCustom2 || "").trim()) patch.Custom2 = String(bulkCustom2).trim();
    if (String(bulkCustom3 || "").trim()) patch.Custom3 = String(bulkCustom3).trim();
    if (String(bulkCustom4 || "").trim()) patch.Custom4 = String(bulkCustom4).trim();
    if (String(bulkCustom5 || "").trim()) patch.Custom5 = String(bulkCustom5).trim();

    const targets = [...selectedSolvesByIndex]
      .sort((a, b) => b.idx - a.idx)
      .map(({ solve }) => solve)
      .filter(Boolean)
      .filter((s) => s?.solveRef);

    if (!targets.length) {
      setShowBulkTags(false);
      clearSelection();
      return;
    }

    // Snapshot the tags as they were so the toast can put them back.
    const originalTagsByRef = new Map(
      targets.map((s) => [String(s.solveRef), s.tags && typeof s.tags === "object" ? { ...s.tags } : {}])
    );
    const undoTagLabel = `Updated tags on ${pluralSolves(targets.length)}`;

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
      showBulkStatus(undoTagLabel, "success", {
        onUndo: () => undoBulkTags({ originalTagsByRef, practice: true }),
      });
      return;
    }

    if (!user?.UserID) return;

    try {
      const updates = targets.map((solve) => ({
        solveRef: solve.solveRef,
        tags: safeMergeCanonicalTags(solve.tags, patch, bulkTagMode),
      }));
      const response = await bulkUpdateSolveTags(user.UserID, updates);
      const savedByRef = new Map(
        (Array.isArray(response?.items) ? response.items : []).map((item) => [
          String(item?.SK || ""),
          item,
        ])
      );

      setSessions?.((prev) => {
        const next = { ...(prev || {}) };
        const arr = Array.isArray(next[sourceListKey]) ? [...next[sourceListKey]] : [];

        next[sourceListKey] = arr.map((entry) => {
          const saved = savedByRef.get(String(entry?.solveRef || ""));
          if (!saved) return entry;
          return {
            ...entry,
            solveRef: saved?.SK || entry.solveRef,
            createdAt: saved?.CreatedAt || entry.createdAt,
            rawTimeMs:
              Number.isFinite(saved?.RawTimeMs) ? saved.RawTimeMs : entry.rawTimeMs,
            finalTimeMs:
              Number.isFinite(saved?.FinalTimeMs) || saved?.FinalTimeMs === null
                ? saved.FinalTimeMs
                : entry.finalTimeMs,
            time:
              saved?.Penalty === "DNF"
                ? Number.MAX_SAFE_INTEGER
                : Number.isFinite(saved?.FinalTimeMs)
                ? saved.FinalTimeMs
                : entry.time,
            isDNF: saved?.Penalty === "DNF" || saved?.IsDNF === true,
            penalty:
              typeof saved?.Penalty !== "undefined" ? saved.Penalty : entry.penalty,
            tags: saved?.Tags || entry.tags,
            event: saved?.Event || entry.event,
            sessionID: saved?.SessionID || entry.sessionID,
            scramble: saved?.Scramble ?? entry.scramble,
            note: saved?.Note ?? entry.note,
          };
        });

        return next;
      });
      showBulkStatus(undoTagLabel, "success", {
        onUndo: () => undoBulkTags({ originalTagsByRef, practice: false }),
      });
    } catch (err) {
      console.error("Bulk tag update failed:", err);
      showBulkStatus("Tag update failed. Nothing was changed.", "error");
    }

    setShowBulkTags(false);
    clearSelection();
  }, [
    bulkCubeModel,
    bulkCrossColor,
    bulkTimerInput,
    bulkSolveSource,
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
    showBulkStatus,
    undoBulkTags,
  ]);

  // Put moved solves back in their original event/session. `originals` are the solve objects
  // as they were before the move, `movedToEvent` is the list they were moved into.
  const undoBulkMove = useCallback(
    async ({ originals, movedToEvent, practice }) => {
      const refSet = new Set(originals.map((s) => s.solveRef));

      const restoreLocal = () =>
        setSessions?.((prev) => {
          const next = { ...(prev || {}) };
          const targetArr = Array.isArray(next[movedToEvent]) ? next[movedToEvent] : [];
          next[movedToEvent] = targetArr.filter((s) => !refSet.has(s?.solveRef));

          const byEvent = new Map();
          for (const solve of originals) {
            const key = normalizeEventCode(solve.event || sourceListKey);
            if (!byEvent.has(key)) byEvent.set(key, []);
            byEvent.get(key).push(solve);
          }
          byEvent.forEach((items, key) => {
            const arr = (Array.isArray(next[key]) ? next[key] : []).filter(
              (s) => !refSet.has(s?.solveRef)
            );
            next[key] = sortSolvesByCreatedAt([...arr, ...items]);
          });
          return next;
        });

      if (practice) {
        restoreLocal();
        showBulkStatus("Move undone");
        return;
      }

      if (!user?.UserID) return;
      showBulkStatus("Undoing move…", "info", { sticky: true });

      const groups = new Map();
      for (const solve of originals) {
        const ev = normalizeEventCode(solve.event || sourceListKey);
        const sid = String(solve.sessionID || currentSession || "main");
        const key = `${ev}|${sid}`;
        if (!groups.has(key)) groups.set(key, { ev, sid, solves: [] });
        groups.get(key).solves.push(solve);
      }

      try {
        for (const { ev, sid, solves: groupSolves } of groups.values()) {
          await moveSolvesToSession(user.UserID, groupSolves, {
            event: movedToEvent,
            toEvent: ev,
            toSessionID: sid,
          });
        }
        restoreLocal();
        showBulkStatus("Move undone");
      } catch (err) {
        console.error("Bulk move undo failed:", err);
        showBulkStatus("Couldn't undo the move. Refresh to see where your solves are.", "error");
      }
    },
    [setSessions, sourceListKey, user, currentSession, showBulkStatus]
  );

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
      showBulkStatus(
        `Moved ${pluralSolves(movingSolves.length)} to ${describeMoveTarget(targetEvent, targetSession)}`,
        "success",
        {
          onUndo: () =>
            undoBulkMove({ originals: movingSolves, movedToEvent: targetEvent, practice: true }),
        }
      );
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
      const targetLabel = describeMoveTarget(targetEvent, targetSession);
      showBulkStatus(`Moving ${pluralSolves(movingSolves.length)} to ${targetLabel}…`, "info", {
        sticky: true,
      });

      await moveSolvesToSession(user.UserID, movingSolves, {
        event: sourceListKey,
        fromSessionID: currentSession,
        toEvent: targetEvent,
        toSessionID: targetSession,
      });
      showBulkStatus(`Moved ${pluralSolves(movingSolves.length)} to ${targetLabel}`, "success", {
        onUndo: () =>
          undoBulkMove({ originals: movingSolves, movedToEvent: targetEvent, practice: false }),
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
      showBulkStatus("Move failed. Your solves were restored.", "error");
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
    showBulkStatus,
    describeMoveTarget,
    undoBulkMove,
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

    clearSelection();

    const failures = [];
    for (const solve of targets) {
      try {
        await deleteTime(solve.solveRef);
      } catch (error) {
        failures.push({ solveRef: solve.solveRef, error });
      }
    }

    if (failures.length > 0) {
      console.error("Bulk delete failed:", failures);
    }
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
    bulkTimerInput,
    setBulkTimerInput,
    bulkSolveSource,
    setBulkSolveSource,
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
    bulkMoveEventOptions,
    bulkStatus,
    dismissBulkStatus,
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
