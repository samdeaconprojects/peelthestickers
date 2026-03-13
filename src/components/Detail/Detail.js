import React, { useEffect, useState, useMemo } from "react";
import "./Detail.css";
import RubiksCubeSVG from "../PuzzleSVGs/RubiksCubeSVG";
import { getScrambledFaces } from "../scrambleUtils";
import { formatTime } from "../TimeList/TimeUtils";
import { updateSolve } from "../../services/updateSolve";

function Detail({
  solve,
  userID,
  onClose,
  deleteTime,
  addPost,
  showNavButtons,
  onPrev,
  onNext,
  applyPenalty,
  setSessions,
}) {
  const isArray = Array.isArray(solve);

  const getSolveRef = (s) => s?.solveRef || s?.SK || null;
  const getSolveCreatedAt = (s) =>
    s?.createdAt || s?.CreatedAt || s?.DateTime || s?.datetime || s?.date || null;
  const getSolveTags = (s) => s?.tags || s?.Tags || {};
  const getSolveNote = (s) => s?.note ?? s?.Note ?? "";
  const getSolveEvent = (s) => s?.event || s?.Event || "";
  const hasRealSolveRef = (s) => {
    const ref = getSolveRef(s);
    return typeof ref === "string" && ref.startsWith("SOLVE#");
  };
  const isReadOnlySolve = (s) => !!s?.__readOnly || !hasRealSolveRef(s);

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
  const [noteSaving, setNoteSaving] = useState(false);

  const initTagState = (s) => {
    const t = getSolveTags(s);
    const customObj =
      t?.Custom && typeof t.Custom === "object" && !Array.isArray(t.Custom)
        ? t.Custom
        : {};

    return {
      CubeModel: t?.CubeModel ? String(t.CubeModel) : "",
      CrossColor: t?.CrossColor ? String(t.CrossColor) : "",
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

  useEffect(() => {
    setNotes(isArray ? solve.map((s) => getSolveNote(s)) : getSolveNote(solve));
    setTagsState(isArray ? solve.map((s) => initTagState(s)) : initTagState(solve));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solve, isArray]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (event.target.className === "detailPopup") {
        onClose();
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  const arrayIsMutable = useMemo(() => {
    if (!isArray) return false;
    return solve.every((s) => hasRealSolveRef(s) && !s?.__readOnly);
  }, [isArray, solve]);

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

  const saveNote = async (index = null) => {
    const s = isArray ? solve[index] : solve;
    if (isReadOnlySolve(s)) return;

    const resolved = resolveUserID(s);
    const solveRef = getSolveRef(s);
    const noteValue = isArray ? notes[index] : notes;

    if (!resolved || !solveRef) {
      console.error("Missing userID or solveRef:", { resolved, solveRef, s });
      return;
    }

    try {
      setNoteSaving(true);
      const res = await updateSolve(resolved, solveRef, { Note: noteValue });

      const savedItem = res?.item;
      const nextPatch = {
        note: savedItem?.Note ?? noteValue,
        solveRef: savedItem?.SK ?? solveRef,
        createdAt: savedItem?.CreatedAt ?? getSolveCreatedAt(s),
      };

      patchLocalSolve(s, solveRef, nextPatch);
    } catch (err) {
      console.error("Note update failed:", err);
    } finally {
      setNoteSaving(false);
    }
  };

  const buildTagsPayload = (tState) => {
    const payload = {};

    const cube = String(tState?.CubeModel || "").trim();
    const cross = String(tState?.CrossColor || "").trim();

    if (cube) payload.CubeModel = cube;
    if (cross) payload.CrossColor = cross;

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

  const saveTags = async (index = null) => {
    const s = isArray ? solve[index] : solve;
    if (isReadOnlySolve(s)) return;

    const resolved = resolveUserID(s);
    const solveRef = getSolveRef(s);

    if (!resolved || !solveRef) {
      console.error("Missing userID or solveRef:", { resolved, solveRef, s });
      return;
    }

    const tState = isArray ? tagsState[index] : tagsState;
    const payload = buildTagsPayload(tState);

    const setSaving = (val, err = "") => {
      if (isArray) {
        setTagsState((prev) => {
          const next = [...prev];
          next[index] = { ...next[index], saving: val, error: err };
          return next;
        });
      } else {
        setTagsState((prev) => ({ ...prev, saving: val, error: err }));
      }
    };

    try {
      setSaving(true, "");
      const res = await updateSolve(resolved, solveRef, { Tags: payload });

      const savedItem = res?.item;
      patchLocalSolve(s, solveRef, {
        tags: savedItem?.Tags ?? payload,
        solveRef: savedItem?.SK ?? solveRef,
        createdAt: savedItem?.CreatedAt ?? getSolveCreatedAt(s),
      });

      setSaving(false, "");
    } catch (err) {
      console.error("Tags update failed:", err);
      setSaving(false, "Failed to save tags.");
    }
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

  const addCustomRow = (index = null) => {
    if (isArray) {
      setTagsState((prev) => {
        const next = [...prev];
        const t = next[index];
        const k = String(t.customKey || "").trim();
        if (!k) return prev;
        const v = String(t.customValue ?? "").trim();
        next[index] = {
          ...t,
          customRows: [...(t.customRows || []), { key: k, value: v }],
          customKey: "",
          customValue: "",
        };
        return next;
      });
    } else {
      setTagsState((prev) => {
        const k = String(prev.customKey || "").trim();
        if (!k) return prev;
        const v = String(prev.customValue ?? "").trim();
        return {
          ...prev,
          customRows: [...(prev.customRows || []), { key: k, value: v }],
          customKey: "",
          customValue: "",
        };
      });
    }
  };

  const handlePenaltyChange = async (penalty, index = null) => {
    const s = isArray ? solve[index] : solve;
    if (isReadOnlySolve(s) || typeof applyPenalty !== "function") return;

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
      penalty === "+2"
        ? rawTimeMs + 2000
        : penalty === "DNF"
        ? Number.MAX_SAFE_INTEGER
        : rawTimeMs;

    const updatedSolve = {
      ...s,
      penalty,
      time: newTime,
      rawTimeMs,
      finalTimeMs: penalty === "DNF" ? null : newTime,
      isDNF: penalty === "DNF",
      solveRef,
      createdAt: getSolveCreatedAt(s),
    };

    patchLocalSolve(s, solveRef, updatedSolve);
    applyPenalty(solveRef, penalty, newTime);
  };

  const handleDelete = (index) => {
    if (!isArray) {
      if (!isReadOnlySolve(solve) && typeof deleteTime === "function") {
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

  const renderTagsEditor = (item, index) => {
    const t = isArray ? tagsState[index] : tagsState;
    const readOnly = isReadOnlySolve(item);

    return (
      <div className="detailTagsBlock">
        <div className="detailTagsHeaderRow">
          <div className="detailTagsLabel">Tags</div>

          {!readOnly && (
            <button
              type="button"
              className="detailSaveTagsBtn"
              onClick={() => saveTags(index)}
              disabled={!!t?.saving}
              title="Save tags to DynamoDB"
            >
              {t?.saving ? "Saving..." : "Save Tags"}
            </button>
          )}
        </div>

        <div className="detailTagRow">
          <div className="detailTagKey">Cube Model</div>
          <input
            className="detailTagInput"
            value={t?.CubeModel || ""}
            onChange={(e) => updateTagField("CubeModel", e.target.value, index)}
            placeholder="Gan 16"
            disabled={readOnly}
          />
        </div>

        <div className="detailTagRow">
          <div className="detailTagKey">Cross Color</div>
          <input
            className="detailTagInput"
            value={t?.CrossColor || ""}
            onChange={(e) => updateTagField("CrossColor", e.target.value, index)}
            placeholder="White"
            disabled={readOnly}
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

        {!readOnly && (
          <div className="detailCustomAddRow">
            <input
              className="detailCustomKey"
              value={t?.customKey || ""}
              onChange={(e) => updateTagField("customKey", e.target.value, index)}
              placeholder="new tag"
            />
            <input
              className="detailCustomVal"
              value={t?.customValue || ""}
              onChange={(e) => updateTagField("customValue", e.target.value, index)}
              placeholder="value"
            />
            <button
              type="button"
              className="detailCustomAddBtn"
              onClick={() => addCustomRow(index)}
              title="Add"
            >
              + Add
            </button>
          </div>
        )}

        {t?.error ? <div className="detailTagsError">{t.error}</div> : null}
      </div>
    );
  };

  const renderSolveCard = (item, index) => {
    const readOnly = isReadOnlySolve(item);

    return (
      <div key={index} className="detailSolveCard">
        <div className="detailTopRow">
          <div className="detailTime">
            {formatTime(getSolveFinalTimeMs(item), false, item.penalty)}
          </div>
          <div
            className="detailScramble"
            style={{ fontSize: getScrambleFontSize(getSolveEvent(item)) }}
          >
            {item.scramble}
          </div>
        </div>

        <div className="detailDateRow">{formatDateTime(getSolveCreatedAt(item))}</div>

        <div className="detailBottomRow">
          <div className="detailCube">
            <RubiksCubeSVG
              n={getSolveEvent(item)}
              faces={getScrambledFaces(item.scramble, getSolveEvent(item))}
              isMusicPlayer={false}
              isTimerCube={false}
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
              disabled={readOnly}
            />

            {!readOnly && (
              <div className="detailNoteButtonsRow">
                <button
                  type="button"
                  className="detailSaveNoteBtn"
                  onClick={() => saveNote(index)}
                  disabled={noteSaving}
                >
                  {noteSaving ? "Saving..." : "Save Note"}
                </button>
              </div>
            )}

            {renderTagsEditor(item, index)}
          </div>

          <div className="detailActions">
            {!readOnly && typeof applyPenalty === "function" && (
              <div className="penalty-buttons">
                <button onClick={() => handlePenaltyChange("+2", index)}>+2</button>
                <button onClick={() => handlePenaltyChange("DNF", index)}>DNF</button>
                <button onClick={() => handlePenaltyChange(null, index)}>Clear</button>
              </div>
            )}

            <button className="share-button" onClick={() => handleShare(index)}>
              Share
            </button>

            {!readOnly && typeof deleteTime === "function" && (
              <button className="delete-button" onClick={() => handleDelete(index)}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const singleReadOnly = !isArray && isReadOnlySolve(solve);

  return (
    <div className="detailPopup">
      <div className="detailPopupContent">
        <span className="closePopup" onClick={onClose}>
          x
        </span>

        {!isArray ? (
          <div className="detailFlexCol">
            <div className="detailTopRow">
              <div className="detailTime">
                {formatTime(getSolveFinalTimeMs(solve), false, solve.penalty)}
              </div>
              <div
                className="detailScramble"
                style={{ fontSize: getScrambleFontSize(getSolveEvent(solve)) }}
              >
                {solve.scramble}
              </div>
            </div>

            <div className="detailDateRow">{formatDateTime(getSolveCreatedAt(solve))}</div>

            <div className="detailBottomRow">
              <div className="detailCube">
                <RubiksCubeSVG
                  n={getSolveEvent(solve)}
                  faces={getScrambledFaces(solve.scramble, getSolveEvent(solve))}
                  isMusicPlayer={false}
                  isTimerCube={false}
                />
              </div>

              <div className="detailInfoSection">
                <textarea
                  className="detailNotes"
                  value={notes}
                  placeholder="Add a note"
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={singleReadOnly}
                />

                {!singleReadOnly && (
                  <div className="detailNoteButtonsRow">
                    <button
                      type="button"
                      className="detailSaveNoteBtn"
                      onClick={() => saveNote()}
                      disabled={noteSaving}
                    >
                      {noteSaving ? "Saving..." : "Save Note"}
                    </button>
                  </div>
                )}

                {renderTagsEditor(solve, null)}
              </div>

              <div className="detailActions">
                {!singleReadOnly && typeof applyPenalty === "function" && (
                  <div className="penalty-buttons">
                    <button onClick={() => handlePenaltyChange("+2")}>+2</button>
                    <button onClick={() => handlePenaltyChange("DNF")}>DNF</button>
                    <button onClick={() => handlePenaltyChange(null)}>Clear</button>
                  </div>
                )}

                <button className="share-button" onClick={() => handleShare()}>
                  Share
                </button>

                {!singleReadOnly && typeof deleteTime === "function" && (
                  <button className="delete-button" onClick={() => handleDelete()}>
                    Delete
                  </button>
                )}
              </div>
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
        )}
      </div>
    </div>
  );
}

export default Detail;
