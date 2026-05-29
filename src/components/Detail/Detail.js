import React, { useCallback, useEffect, useState, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import "./Detail.css";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { formatTime } from "../TimeList/TimeUtils";
import { currentEventToString } from "../scrambleUtils";
import { useDbStatus } from "../../contexts/DbStatusContext";
import { updateSolve } from "../../services/updateSolve";
import TagBar from "../TagBar/TagBar";
import {
  getVisibleSharedTagFields,
  normalizeAlgorithmTagValue,
  SHARED_TAG_FIELDS,
} from "../TagBar/tagUtils";

const DETAIL_TAG_AUTOSAVE_DEBOUNCE_MS = 2500;

function Detail({
  solve,
  userID,
  profileColor = "#2EC4B6",
  onClose,
  deleteTime,
  addPost,
  saveToProfile,
  showNavButtons,
  onPrev,
  onNext,
  applyPenalty,
  setSessions,
  sessionsList = [],
  tagConfig,
  cubeModelOptions = [],
  discoveredTagOptions = {},
  tagColors = {},
  onTagColorsChange = null,
  embedded = false,
  showActions = true,
}) {
  const { runDb } = useDbStatus();
  const isArray = Array.isArray(solve);

  const getSolveRef = (s) => s?.solveRef || s?.SK || null;
  const getSolveCreatedAt = (s) =>
    s?.createdAt || s?.CreatedAt || s?.DateTime || s?.datetime || s?.date || null;
  const getSolveTags = (s) => s?.tags || s?.Tags || {};
  const getSolveNote = (s) => s?.note ?? s?.Note ?? "";
  const getSolvePenalty = (s) => s?.penalty ?? s?.Penalty ?? (s?.isDNF || s?.IsDNF ? "DNF" : null);
  const getSolveEvent = (s) => s?.event || s?.Event || "";
  const getSolveSessionID = (s) =>
    s?.sessionID || s?.SessionID || s?.SessionId || s?.sessionId || "";
  const getSolveSessionName = (s) =>
    s?.sessionName || s?.SessionName || s?.session || s?.Session || "";
  const getSolveScramble = (s) => {
    const direct =
      s?.scramble ??
      s?.Scramble ??
      s?.scrambleText ??
      s?.ScrambleText ??
      s?.scramble_text ??
      s?.Scramble_text;

    if (typeof direct === "string" && direct.trim()) return direct;

    const tags = getSolveTags(s);
    const tagScramble =
      tags?.scramble ??
      tags?.Scramble ??
      tags?.scrambleText ??
      tags?.ScrambleText;

    if (typeof tagScramble === "string" && tagScramble.trim()) return tagScramble;

    const relayIndex = Number.isFinite(Number(s?.fullIndex)) ? Number(s.fullIndex) : 0;
    const relayScramble =
      (Array.isArray(s?.relayScrambles) && s.relayScrambles[relayIndex]) ??
      (Array.isArray(tags?.RelayScrambles) && tags.RelayScrambles[relayIndex]) ??
      "";

    return typeof relayScramble === "string" ? relayScramble : "";
  };

  const getSessionDisplayName = (s) => {
    const explicitName = getSolveSessionName(s);
    if (typeof explicitName === "string" && explicitName.trim()) return explicitName;

    const sessionID = String(getSolveSessionID(s) || "").trim();
    if (!sessionID) return "Main";

    const match = (sessionsList || []).find(
      (session) => String(session?.SessionID || session?.sessionID || "").trim() === sessionID
    );

    const matchedName =
      match?.Name || match?.SessionName || match?.name || match?.sessionName || "";
    if (typeof matchedName === "string" && matchedName.trim()) return matchedName;

    return sessionID === "main" ? "Main" : sessionID;
  };

  const getSolveSubline = (s) => {
    const eventLabel = currentEventToString(getSolveEvent(s) || "333");
    const sessionLabel = getSessionDisplayName(s);
    const solveIndex = Number(s?.fullIndex);
    const indexLabel = Number.isFinite(solveIndex) ? ` · Solve #${solveIndex + 1}` : "";
    return `${eventLabel} · ${sessionLabel}${indexLabel}`;
  };
  const hasRealSolveRef = (s) => {
    const ref = getSolveRef(s);
    return typeof ref === "string" && ref.startsWith("SOLVE#");
  };
  const hasMutableSolveRef = (s) => {
    const ref = getSolveRef(s);
    return typeof ref === "string" && (ref.startsWith("SOLVE#") || ref.startsWith("LOCAL#"));
  };
  const isReadOnlySolve = (s) => !!s?.__readOnly || !hasRealSolveRef(s);
  const canDeleteSolve = (s) => !s?.__readOnly && hasMutableSolveRef(s);

  const toFiniteNumber = (value) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  };

  const getSolveRawTimeMs = (s) =>
    toFiniteNumber(s?.rawTimeMs) ??
    toFiniteNumber(s?.RawTimeMs) ??
    toFiniteNumber(s?.originalTime) ??
    toFiniteNumber(s?.OriginalTime) ??
    toFiniteNumber(s?.finalTimeMs) ??
    toFiniteNumber(s?.FinalTimeMs) ??
    toFiniteNumber(s?.time);

  const getSolveFinalTimeMs = (s) => {
    if (s?.penalty === "DNF" || s?.Penalty === "DNF" || s?.isDNF === true || s?.IsDNF === true) {
      return Number.MAX_SAFE_INTEGER;
    }

    const finalMs =
      toFiniteNumber(s?.finalTimeMs) ??
      toFiniteNumber(s?.FinalTimeMs) ??
      toFiniteNumber(s?.time);

    if (finalMs !== null) return finalMs;
    return null;
  };

  const resolveUserID = (s) =>
    userID || s?.PK?.split("USER#")[1] || s?.userID || s?.UserID || null;

  const formatDateTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const getScrambleFontSize = (event) => {
    switch (event) {
      case "222":
        return "24px";
      case "333":
        return "22px";
      case "444":
        return "18px";
      case "555":
        return "15px";
      case "666":
      case "777":
        return "12px";
      default:
        return "16px";
    }
  };

  const [notes, setNotes] = useState(
    isArray ? solve.map((s) => getSolveNote(s)) : getSolveNote(solve)
  );
  const notesRef = useRef(notes);
  const [saveState, setSaveState] = useState(
    isArray
      ? solve.map(() => ({ saving: false, error: "" }))
      : { saving: false, error: "" }
  );
  const autosaveTimeoutsRef = useRef({});
  const lastSavedRef = useRef({});
  const isMountedRef = useRef(true);
  const closingRef = useRef(false);

  const normalizeTagsForSignature = useCallback((tagStateValue) => {
    if (!tagStateValue || typeof tagStateValue !== "object" || Array.isArray(tagStateValue)) {
      return {};
    }

    const looksLikeEditorState =
      "customRows" in tagStateValue ||
      "CubeModel" in tagStateValue ||
      "CrossColor" in tagStateValue ||
      "Method" in tagStateValue ||
      "Alg_OLL" in tagStateValue ||
      "Alg_PLL" in tagStateValue ||
      "Alg_CMLL" in tagStateValue ||
      "Alg_CLL" in tagStateValue ||
      "SolveSource" in tagStateValue ||
      "TimerInput" in tagStateValue ||
      "Custom1" in tagStateValue ||
      "Custom2" in tagStateValue ||
      "Custom3" in tagStateValue ||
      "Custom4" in tagStateValue ||
      "Custom5" in tagStateValue;

    return looksLikeEditorState ? buildTagsPayload(tagStateValue) : tagStateValue;
  }, []);

  const getEditSignature = useCallback((noteValue, tagStateValue) => {
    return JSON.stringify({
      note: String(noteValue ?? ""),
      tags: normalizeTagsForSignature(tagStateValue),
    });
  }, [normalizeTagsForSignature]);

  const initTagState = (s) => {
    const t = getSolveTags(s);
    const customObj =
      t?.Custom && typeof t.Custom === "object" && !Array.isArray(t.Custom)
        ? t.Custom
        : {};

    return {
      CubeModel: t?.CubeModel ? String(t.CubeModel) : "",
      CrossColor: t?.CrossColor ? String(t.CrossColor) : "",
      Method: t?.Method ? String(t.Method) : "",
      Alg_OLL: t?.Alg_OLL ? String(t.Alg_OLL) : "",
      Alg_PLL: t?.Alg_PLL ? String(t.Alg_PLL) : "",
      Alg_CMLL: t?.Alg_CMLL ? String(t.Alg_CMLL) : "",
      Alg_CLL: t?.Alg_CLL ? String(t.Alg_CLL) : "",
      SolveSource: t?.SolveSource ? String(t.SolveSource) : "",
      TimerInput: t?.TimerInput ? String(t.TimerInput) : "",
      Custom1: t?.Custom1 ? String(t.Custom1) : "",
      Custom2: t?.Custom2 ? String(t.Custom2) : "",
      Custom3: t?.Custom3 ? String(t.Custom3) : "",
      Custom4: t?.Custom4 ? String(t.Custom4) : "",
      Custom5: t?.Custom5 ? String(t.Custom5) : "",
      customEditorOpen: false,
      customRows: Object.entries(customObj).map(([k, v]) => ({
        key: String(k),
        value: v == null ? "" : String(v),
      })),
      customKey: "",
      customValue: "",
      saving: false,
      error: "",
    };
  };

  const [tagsState, setTagsState] = useState(
    isArray ? solve.map((s) => initTagState(s)) : initTagState(solve)
  );
  const [actionBusy, setActionBusy] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const tagsStateRef = useRef(tagsState);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    notesRef.current = notes;
  }, [notes]);

  useEffect(() => {
    tagsStateRef.current = tagsState;
  }, [tagsState]);

  useEffect(() => {
    Object.values(autosaveTimeoutsRef.current || {}).forEach((timeoutId) => {
      window.clearTimeout(timeoutId);
    });
    autosaveTimeoutsRef.current = {};

    setNotes(isArray ? solve.map((s) => getSolveNote(s)) : getSolveNote(solve));
    setTagsState(isArray ? solve.map((s) => initTagState(s)) : initTagState(solve));
    setSaveState(
      isArray
        ? solve.map(() => ({ saving: false, error: "" }))
        : { saving: false, error: "" }
    );
    lastSavedRef.current = Object.fromEntries(
      (isArray ? solve : [solve]).map((item, idx) => {
        const currentTags = initTagState(item);
        return [
          String(idx),
          getEditSignature(getSolveNote(item), currentTags),
        ];
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solve, isArray, getEditSignature]);

  useEffect(() => {
    const items = isArray ? solve : [solve];

    items.forEach((item, idx) => {
      if (isReadOnlySolve(item)) return;

      const key = String(idx);
      const tagValue = isArray ? tagsState[idx] : tagsState;
      const persistedNoteValue = getSolveNote(item);
      const nextSignature = getEditSignature(persistedNoteValue, tagValue);

      if (lastSavedRef.current[key] === nextSignature) return;

      if (autosaveTimeoutsRef.current[key]) {
        window.clearTimeout(autosaveTimeoutsRef.current[key]);
      }

      autosaveTimeoutsRef.current[key] = window.setTimeout(() => {
        saveSolveEdits(isArray ? idx : null);
      }, DETAIL_TAG_AUTOSAVE_DEBOUNCE_MS);
    });

    return () => {
      Object.values(autosaveTimeoutsRef.current || {}).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      autosaveTimeoutsRef.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagsState, isArray, solve, getEditSignature]);

  const flushPendingAutosaves = async () => {
    const pendingSaves = Object.entries(autosaveTimeoutsRef.current || {}).map(([key, timeoutId]) => {
      window.clearTimeout(timeoutId);
      const idx = Number(key);
      return saveSolveEdits(isArray ? idx : null, {
        notes: notesRef.current,
        tagsState: tagsStateRef.current,
      });
    });
    autosaveTimeoutsRef.current = {};
    await Promise.all(pendingSaves);
  };

  const flushDirtyNotes = async () => {
    const items = isArray ? solve : [solve];
    const dirtySaves = items
      .map((item, idx) => {
        if (isReadOnlySolve(item)) return null;

        const noteValue = String(isArray ? notesRef.current[idx] : notesRef.current);
        const tagValue = isArray ? tagsStateRef.current[idx] : tagsStateRef.current;
        const nextSignature = getEditSignature(noteValue, tagValue);

        if (lastSavedRef.current[String(idx)] === nextSignature) return null;
        return saveSolveEdits(isArray ? idx : null, {
          notes: notesRef.current,
          tagsState: tagsStateRef.current,
        });
      })
      .filter(Boolean);

    await Promise.all(dirtySaves);
  };

  const handleOverlayClose = async () => {
    if (closingRef.current) return;
    closingRef.current = true;
    onClose();
    try {
      await flushPendingAutosaves();
      await flushDirtyNotes();
    } finally {
      closingRef.current = false;
    }
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      handleOverlayClose();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleOverlayClose]);

  const arrayIsMutable = useMemo(() => {
    if (!isArray) return false;
    return solve.every((s) => hasRealSolveRef(s) && !s?.__readOnly);
  }, [isArray, solve, hasRealSolveRef]);

  const patchLocalSolve = (s, solveRef, patch) => {
    if (typeof setSessions === "function" && hasRealSolveRef(s)) {
      setSessions((prev) => {
        const updated = { ...(prev || {}) };
        const eventKey = getSolveEvent(s);
        const session = Array.isArray(updated?.[eventKey]) ? [...updated[eventKey]] : [];
        const i = session.findIndex((sol) => (sol?.solveRef || sol?.SK || null) === solveRef);

        if (i !== -1) {
          session[i] = { ...session[i], ...patch };
          updated[eventKey] = session;
        }

        return updated;
      });
    }

    Object.assign(s, patch);

    if (patch.tags) Object.assign(s, { Tags: patch.tags });
    if (patch.note !== undefined) Object.assign(s, { Note: patch.note });
    if (patch.createdAt) Object.assign(s, { CreatedAt: patch.createdAt });
    if (patch.solveRef) Object.assign(s, { SK: patch.solveRef });
  };

  const buildTagsPayload = (tState) => {
    const payload = {};

    const cube = String(tState?.CubeModel || "").trim();
    const cross = String(tState?.CrossColor || "").trim();
    const method = String(tState?.Method || "").trim();
    const algOll = normalizeAlgorithmTagValue("Alg_OLL", tState?.Alg_OLL || "");
    const algPll = normalizeAlgorithmTagValue("Alg_PLL", tState?.Alg_PLL || "");
    const algCmll = normalizeAlgorithmTagValue("Alg_CMLL", tState?.Alg_CMLL || "");
    const algCll = normalizeAlgorithmTagValue("Alg_CLL", tState?.Alg_CLL || "");
    const solveSource = String(tState?.SolveSource || "").trim();
    const timerInput = String(tState?.TimerInput || "").trim();

    if (cube) payload.CubeModel = cube;
    if (cross) payload.CrossColor = cross;
    if (method) payload.Method = method;
    if (algOll) payload.Alg_OLL = algOll;
    if (algPll) payload.Alg_PLL = algPll;
    if (algCmll) payload.Alg_CMLL = algCmll;
    if (algCll) payload.Alg_CLL = algCll;
    if (solveSource) payload.SolveSource = solveSource;
    if (timerInput) payload.TimerInput = timerInput;
    if (String(tState?.Custom1 || "").trim()) payload.Custom1 = String(tState.Custom1).trim();
    if (String(tState?.Custom2 || "").trim()) payload.Custom2 = String(tState.Custom2).trim();
    if (String(tState?.Custom3 || "").trim()) payload.Custom3 = String(tState.Custom3).trim();
    if (String(tState?.Custom4 || "").trim()) payload.Custom4 = String(tState.Custom4).trim();
    if (String(tState?.Custom5 || "").trim()) payload.Custom5 = String(tState.Custom5).trim();

    const custom = {};
    for (const row of tState?.customRows || []) {
      const k = String(row.key || "").trim();
      if (!k) continue;
      const v = String(row.value ?? "").trim();
      custom[k] = v || "true";
    }

    if (Object.keys(custom).length) payload.Custom = custom;

    return payload;
  };

  const setSaveStatus = (index, patch) => {
    if (!isMountedRef.current) return;
    if (isArray) {
      setSaveState((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], ...patch };
        return next;
      });
      return;
    }
    setSaveState((prev) => ({ ...prev, ...patch }));
  };

  const saveSolveEdits = async (index = null, overrides = null) => {
    const s = isArray ? solve[index] : solve;
    if (isReadOnlySolve(s)) return;

    const resolved = resolveUserID(s);
    const solveRef = getSolveRef(s);
    const currentNotes = overrides?.notes ?? notesRef.current;
    const currentTagsState = overrides?.tagsState ?? tagsStateRef.current;
    const noteValue = String(isArray ? currentNotes[index] : currentNotes);

    if (!resolved || !solveRef) {
      console.error("Missing userID or solveRef:", { resolved, solveRef, s });
      return;
    }

    const tState = isArray ? currentTagsState[index] : currentTagsState;
    const tagsPayload = buildTagsPayload(tState);
    const nextSignature = getEditSignature(noteValue, tState);

    if (lastSavedRef.current[String(index ?? 0)] === nextSignature) return;

    try {
      setSaveStatus(index, { saving: true, error: "" });
      const res = await runDb(
        "Saving solve details",
        () =>
          updateSolve(resolved, solveRef, {
            Note: noteValue,
            Tags: tagsPayload,
          }, {
            existingItem: s,
          }),
        { minLoadingMs: 500 }
      );

      const savedItem = res?.item;
      const savedSignature = getEditSignature(savedItem?.Note ?? noteValue, savedItem?.Tags ?? tagsPayload);
      patchLocalSolve(s, solveRef, {
        note: savedItem?.Note ?? noteValue,
        tags: savedItem?.Tags ?? tagsPayload,
        solveRef: savedItem?.SK ?? solveRef,
        createdAt: savedItem?.CreatedAt ?? getSolveCreatedAt(s),
      });

      lastSavedRef.current[String(index ?? 0)] = savedSignature;
      setSaveStatus(index, { saving: false, error: "" });
    } catch (err) {
      console.error("Solve update failed:", err);
      setSaveStatus(index, { saving: false, error: "Failed to save changes." });
    }
  };

  const handleNoteBlur = (index = null) => {
    saveSolveEdits(index);
  };

  const updateTagField = (field, value, index = null) => {
    if (isArray) {
      setTagsState((prev) => {
        const next = [...prev];
        next[index] = { ...next[index], [field]: value };
        return next;
      });
    } else {
      setTagsState((prev) => ({ ...prev, [field]: value }));
    }
  };

  const updateCustomRow = (rowIndex, patch, index = null) => {
    if (isArray) {
      setTagsState((prev) => {
        const next = [...prev];
        const rows = [...(next[index].customRows || [])];
        rows[rowIndex] = { ...rows[rowIndex], ...patch };
        next[index] = { ...next[index], customRows: rows };
        return next;
      });
    } else {
      setTagsState((prev) => {
        const rows = [...(prev.customRows || [])];
        rows[rowIndex] = { ...rows[rowIndex], ...patch };
        return { ...prev, customRows: rows };
      });
    }
  };

  const removeCustomRow = (rowIndex, index = null) => {
    if (isArray) {
      setTagsState((prev) => {
        const next = [...prev];
        const rows = [...(next[index].customRows || [])];
        rows.splice(rowIndex, 1);
        next[index] = { ...next[index], customRows: rows };
        return next;
      });
    } else {
      setTagsState((prev) => {
        const rows = [...(prev.customRows || [])];
        rows.splice(rowIndex, 1);
        return { ...prev, customRows: rows };
      });
    }
  };

  const handlePenaltyChange = async (penalty, index = null) => {
    const s = isArray ? solve[index] : solve;
    if (isReadOnlySolve(s) || typeof applyPenalty !== "function") return;

    const currentPenalty = getSolvePenalty(s);
    const nextPenalty = currentPenalty === penalty ? null : penalty;

    const solveRef = getSolveRef(s);
    const rawTimeMs = getSolveRawTimeMs(s);

    if (!solveRef) {
      console.error("Missing solveRef:", { solveRef, s });
      return;
    }

    if (!Number.isFinite(rawTimeMs)) {
      console.error("Missing rawTimeMs for penalty update:", { rawTimeMs, s });
      return;
    }

    const newTime =
      nextPenalty === "+2"
        ? rawTimeMs + 2000
        : nextPenalty === "DNF"
        ? Number.MAX_SAFE_INTEGER
        : rawTimeMs;

    const updatedSolve = {
      ...s,
      penalty: nextPenalty,
      time: newTime,
      rawTimeMs,
      finalTimeMs: nextPenalty === "DNF" ? null : newTime,
      isDNF: nextPenalty === "DNF",
      solveRef,
      createdAt: getSolveCreatedAt(s),
    };

    patchLocalSolve(s, solveRef, updatedSolve);
    applyPenalty(solveRef, nextPenalty, newTime);
  };

  const handleDelete = (index) => {
    if (!isArray) {
      if (canDeleteSolve(solve) && typeof deleteTime === "function") {
        deleteTime();
      }
      onClose();
      return;
    }

    if (typeof deleteTime === "function" && arrayIsMutable) {
      deleteTime(index);
    }
  };

  const handleShare = (index) => {
    const item = isArray ? solve[index] : solve;
    if (typeof addPost !== "function") return;

    addPost({
      note: isArray ? notes[index] : notes,
      event: getSolveEvent(item),
      solveList: [item],
      comments: [],
    });
    onClose();
  };

  const handleSaveToProfile = async (index) => {
    const item = isArray ? solve[index] : solve;
    if (typeof saveToProfile !== "function" || !item) return;

    setActionBusy("profile");
    setActionMessage("");

    try {
      const result = await saveToProfile({
        note: isArray ? notes[index] : notes,
        event: getSolveEvent(item),
        solveList: [item],
        comments: [],
      });
      setActionMessage(result?.status === "exists" ? "Already on your profile." : "Added to your profile.");
    } catch (error) {
      console.error("Failed to add solve to profile:", error);
      setActionMessage("Failed to add to your profile.");
    } finally {
      setActionBusy("");
    }
  };

  const renderTagsEditor = (item, index) => {
    const t = isArray ? tagsState[index] : tagsState;
    const saveMeta = isArray ? saveState[index] : saveState;
    const readOnly = isReadOnlySolve(item);
    const eventKey = String(getSolveEvent(item) || "").toUpperCase();
    const visibleFields = getVisibleSharedTagFields(t || {}, eventKey);

    return (
      <div className="detailTagsBlock">
        <div className="detailTagSelector">
          <TagBar
            tags={Object.fromEntries(
              SHARED_TAG_FIELDS.map((field) => [field, t?.[field] || ""])
            )}
            eventKey={eventKey}
            onChange={(next) => {
              SHARED_TAG_FIELDS.forEach((field) => {
                updateTagField(field, next?.[field] || "", index);
              });
            }}
            tagConfig={tagConfig}
            fields={visibleFields}
            cubeModelOptions={cubeModelOptions}
            discoveredOptions={discoveredTagOptions}
            tagColors={tagColors}
            onTagColorsChange={onTagColorsChange}
            profileColor={profileColor}
            variant="home"
            allowAdditions={!readOnly}
          />
        </div>

        {(t?.customRows || []).length > 0 && (
          <div className="detailCustomWrap">
            {(t.customRows || []).map((row, rIdx) => (
              <div className="detailCustomRow" key={`c-${index ?? "one"}-${rIdx}`}>
                <input
                  className="detailCustomKey"
                  value={row.key}
                  onChange={(e) => updateCustomRow(rIdx, { key: e.target.value }, index)}
                  placeholder="tag name"
                  disabled={readOnly}
                />
                <input
                  className="detailCustomVal"
                  value={row.value}
                  onChange={(e) => updateCustomRow(rIdx, { value: e.target.value }, index)}
                  placeholder="value"
                  disabled={readOnly}
                />
                {!readOnly && (
                  <button
                    type="button"
                    className="detailCustomRemove"
                    onClick={() => removeCustomRow(rIdx, index)}
                    title="Remove"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {saveMeta?.error ? <div className="detailTagsError">{saveMeta.error}</div> : null}
      </div>
    );
  };

  const renderSolveCard = (item, index) => {
    const readOnly = isReadOnlySolve(item);
    const canDelete = canDeleteSolve(item);
    const penalty = getSolvePenalty(item);

    return (
      <div key={index} className="detailSolveCard">
        <div className="detailTopRow">
          <div className="detailTimeWrap">
            <div className="detailTime">
              {formatTime(getSolveFinalTimeMs(item), false, item.penalty)}
            </div>
            <div className="detailMetaLine">{getSolveSubline(item)}</div>
          </div>
          <div
            className="detailScramble"
            style={{ fontSize: getScrambleFontSize(getSolveEvent(item)) }}
          >
            {getSolveScramble(item)}
          </div>
        </div>

        <div className="detailDateRow">{formatDateTime(getSolveCreatedAt(item))}</div>

        <div className="detailBottomRow">
          <div className="detailCube">
            <PuzzleSVG
              event={getSolveEvent(item)}
              scramble={getSolveScramble(item)}
            />
          </div>

          <div className="detailInfoSection">
            <textarea
              className="detailNotes"
              value={notes[index]}
              placeholder="Add a note"
              onChange={(e) => {
                const updatedNotes = [...notes];
                updatedNotes[index] = e.target.value;
                setNotes(updatedNotes);
              }}
              onBlur={() => handleNoteBlur(index)}
              disabled={readOnly}
            />

            {renderTagsEditor(item, index)}
          </div>

          {showActions ? (
            <div className="detailActions">
              {!readOnly && typeof applyPenalty === "function" && (
                <div className="penalty-buttons">
                  <button
                    type="button"
                    className={penalty === "+2" ? "is-active" : ""}
                    onClick={() => handlePenaltyChange("+2", index)}
                  >
                    +2
                  </button>
                  <button
                    type="button"
                    className={penalty === "DNF" ? "is-active" : ""}
                    onClick={() => handlePenaltyChange("DNF", index)}
                  >
                    DNF
                  </button>
                </div>
              )}

              <div className="detailPrimaryActions">
                <button className="share-button" onClick={() => handleShare(index)}>
                  Share
                </button>
                {typeof saveToProfile === "function" ? (
                  <button
                    className="share-button"
                    onClick={() => handleSaveToProfile(index)}
                    disabled={actionBusy === "profile"}
                  >
                    {actionBusy === "profile" ? "Adding..." : "Add to Profile"}
                  </button>
                ) : null}

                {canDelete && typeof deleteTime === "function" && (
                  <button className="delete-button" onClick={() => handleDelete(index)}>
                    Delete
                  </button>
                )}
              </div>
              {actionMessage ? <div className="detailTagsError">{actionMessage}</div> : null}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const singleReadOnly = !isArray && isReadOnlySolve(solve);
  const singleCanDelete = !isArray && canDeleteSolve(solve);
  const singlePenalty = !isArray ? getSolvePenalty(solve) : null;

  const detailBody = !isArray ? (
    <div className="detailFlexCol">
      <div className="detailTopRow">
        <div className="detailTimeWrap">
          <div className="detailTime">
            {formatTime(getSolveFinalTimeMs(solve), false, solve.penalty)}
          </div>
          <div className="detailMetaLine">{getSolveSubline(solve)}</div>
        </div>
        <div
          className="detailScramble"
          style={{ fontSize: getScrambleFontSize(getSolveEvent(solve)) }}
        >
          {getSolveScramble(solve)}
        </div>
      </div>

      <div className="detailDateRow">{formatDateTime(getSolveCreatedAt(solve))}</div>

      <div className="detailBottomRow">
        <div className="detailCube">
          <PuzzleSVG
            event={getSolveEvent(solve)}
            scramble={getSolveScramble(solve)}
          />
        </div>

        <div className="detailInfoSection">
          <textarea
            className="detailNotes"
            value={notes}
            placeholder="Add a note"
            onChange={(e) => setNotes(e.target.value)}
            onBlur={() => handleNoteBlur()}
            disabled={singleReadOnly}
          />

          {renderTagsEditor(solve, null)}
        </div>

        {showActions ? (
          <div className="detailActions">
            {!singleReadOnly && typeof applyPenalty === "function" && (
              <div className="penalty-buttons">
                <button
                  type="button"
                  className={singlePenalty === "+2" ? "is-active" : ""}
                  onClick={() => handlePenaltyChange("+2")}
                >
                  +2
                </button>
                <button
                  type="button"
                  className={singlePenalty === "DNF" ? "is-active" : ""}
                  onClick={() => handlePenaltyChange("DNF")}
                >
                  DNF
                </button>
              </div>
            )}

            <div className="detailPrimaryActions">
              <button className="share-button" onClick={() => handleShare()}>
                Share
              </button>
              {typeof saveToProfile === "function" ? (
                <button
                  className="share-button"
                  onClick={() => handleSaveToProfile()}
                  disabled={actionBusy === "profile"}
                >
                  {actionBusy === "profile" ? "Adding..." : "Add to Profile"}
                </button>
              ) : null}

              {singleCanDelete && typeof deleteTime === "function" && (
                <button className="delete-button" onClick={() => handleDelete()}>
                  Delete
                </button>
              )}
            </div>
            {actionMessage ? <div className="detailTagsError">{actionMessage}</div> : null}
          </div>
        ) : null}
      </div>

      {showNavButtons && (
        <div className="detailNavButtons">
          <button onClick={onPrev}>Previous</button>
          <button onClick={onNext}>Next</button>
        </div>
      )}
    </div>
  ) : (
    <div className="detailFlexCol detailScrollList">
      {solve.map((s, i) => renderSolveCard(s, i))}
    </div>
  );

  if (embedded) {
    return <div className="detailPopupContent detailPopupContent--embedded">{detailBody}</div>;
  }

  const modalContent = (
    <div
      className="detailPopup"
      onClick={(event) => {
        event.stopPropagation();
        if (event.target === event.currentTarget) {
          handleOverlayClose();
        }
      }}
    >
      <div className="detailPopupContent" onClick={(event) => event.stopPropagation()}>
        {detailBody}
      </div>
    </div>
  );

  if (typeof document === "undefined") return modalContent;

  return createPortal(modalContent, document.body);
}

export default Detail;
