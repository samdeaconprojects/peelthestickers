import React, { useEffect, useState } from "react";
import "./Detail.css";
import RubiksCubeSVG from "../PuzzleSVGs/RubiksCubeSVG";
import { getScrambledFaces } from "../scrambleUtils";
import { formatTime } from "../TimeList/TimeUtils";
import { updateSolvePenalty } from "../../services/updateSolvePenalty";
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

  const getSolveTS = (s) => s?.datetime || s?.DateTime || s?.CreatedAt || null;
  const getSolveTags = (s) => s?.tags || s?.Tags || {};
  const getSolveNote = (s) => s?.note ?? s?.Note ?? "";

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

  // -------------------------
  // Notes state
  // -------------------------
  const [notes, setNotes] = useState(
    isArray ? solve.map((s) => getSolveNote(s)) : getSolveNote(solve)
  );
  const [noteSaving, setNoteSaving] = useState(false);

  // -------------------------
  // Tags editor state
  // -------------------------
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

  // keep state in sync when solve changes
  useEffect(() => {
    setNotes(isArray ? solve.map((s) => getSolveNote(s)) : getSolveNote(solve));
    setTagsState(isArray ? solve.map((s) => initTagState(s)) : initTagState(solve));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solve, isArray]);

  // -------------------------
  // Click outside to close
  // -------------------------
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (event.target.className === "detailPopup") {
        onClose();
      }
    };

    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  // -------------------------
  // Patch local solve + sessions
  // -------------------------
  const patchLocalSolve = (s, ts, patch) => {
    // patch sessions if provided
    if (typeof setSessions === "function") {
      setSessions((prev) => {
        const updated = { ...prev };
        const session = updated[s.event] || [];
        const i = session.findIndex((sol) => sol.datetime === s.datetime);
        if (i !== -1) {
          session[i] = { ...session[i], ...patch };
          updated[s.event] = [...session];
        }
        return updated;
      });
    }
    // patch in-place for the open popup
    Object.assign(s, patch);

    // also support legacy fields so future normalizers don't "lose" it
    if (patch.tags) Object.assign(s, { Tags: patch.tags });
    if (patch.note !== undefined) Object.assign(s, { Note: patch.note });
    if (patch.datetime) Object.assign(s, { DateTime: patch.datetime });
  };

  // -------------------------
  // Save Note
  // -------------------------
  const saveNote = async (index = null) => {
    const s = isArray ? solve[index] : solve;
    const resolved = resolveUserID(s);
    const ts = getSolveTS(s);
    const noteValue = isArray ? notes[index] : notes;

    if (!resolved || !ts) {
      console.error("❌ Missing userID or timestamp:", { resolved, ts, s });
      return;
    }

    try {
      setNoteSaving(true);
      await updateSolve(resolved, ts, { Note: noteValue });
      patchLocalSolve(s, ts, { note: noteValue });
    } catch (err) {
      console.error("❌ Note update failed:", err);
    } finally {
      setNoteSaving(false);
    }
  };

  // -------------------------
  // Tags helpers
  // -------------------------
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
    const resolved = resolveUserID(s);
    const ts = getSolveTS(s);

    if (!resolved || !ts) {
      console.error("❌ Missing userID or timestamp:", { resolved, ts, s });
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
      await updateSolve(resolved, ts, { Tags: payload });
      patchLocalSolve(s, ts, { tags: payload });
      setSaving(false, "");
    } catch (err) {
      console.error("❌ Tags update failed:", err);
      setSaving(false, "Failed to save tags.");
    }
  };

  // -------------------------
  // Tag UI mutators
  // -------------------------
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

  // -------------------------
  // Penalties (your existing logic)
  // -------------------------
  const handlePenaltyChange = async (penalty, index = null) => {
    const s = isArray ? solve[index] : solve;
    const originalTime = s.originalTime || s.time;
    const ts = getSolveTS(s);
    const resolved = resolveUserID(s);

    if (!resolved || !ts) {
      console.error("❌ Missing userID or timestamp:", { resolved, ts, s });
      return;
    }

    const newTime =
      penalty === "+2"
        ? originalTime + 2000
        : penalty === "DNF"
        ? Number.MAX_SAFE_INTEGER
        : originalTime;

    try {
      await updateSolvePenalty(resolved, ts, originalTime, penalty);

      const updatedSolve = {
        ...s,
        penalty,
        time: newTime,
        originalTime,
      };

      if (typeof setSessions === "function") {
        setSessions((prev) => {
          const updated = { ...prev };
          const session = updated[s.event] || [];
          const i = session.findIndex((sol) => sol.datetime === s.datetime);
          if (i !== -1) session[i] = updatedSolve;
          return updated;
        });
      }

      if (!isArray) Object.assign(s, updatedSolve);

      if (typeof applyPenalty === "function") {
        applyPenalty(ts, penalty, newTime);
      }
    } catch (err) {
      console.error("❌ Penalty update failed:", err);
    }
  };

  const handleDelete = (index) => {
    if (!isArray) {
      deleteTime();
      onClose();
    } else if (typeof deleteTime === "function") {
      deleteTime(index);
    }
  };

  const handleShare = (index) => {
    const item = isArray ? solve[index] : solve;
    addPost({
      note: isArray ? notes[index] : notes,
      event: item.event,
      solveList: [item],
      comments: [],
    });
    onClose();
  };

  // -------------------------
  // Tags UI renderer (NOT a component)
  // ✅ prevents focus loss while typing
  // -------------------------
  const renderTagsEditor = (item, index) => {
    const t = isArray ? tagsState[index] : tagsState;

    return (
      <div className="detailTagsBlock">
        <div className="detailTagsHeaderRow">
          <div className="detailTagsLabel">Tags</div>

          <button
            type="button"
            className="detailSaveTagsBtn"
            onClick={() => saveTags(index)}
            disabled={!!t?.saving}
            title="Save tags to DynamoDB"
          >
            {t?.saving ? "Saving..." : "Save Tags"}
          </button>
        </div>

        <div className="detailTagRow">
          <div className="detailTagKey">Cube Model</div>
          <input
            className="detailTagInput"
            value={t?.CubeModel || ""}
            onChange={(e) => updateTagField("CubeModel", e.target.value, index)}
            placeholder="Gan 16"
          />
        </div>

        <div className="detailTagRow">
          <div className="detailTagKey">Cross Color</div>
          <input
            className="detailTagInput"
            value={t?.CrossColor || ""}
            onChange={(e) => updateTagField("CrossColor", e.target.value, index)}
            placeholder="White"
          />
        </div>

        {(t?.customRows || []).length > 0 && (
          <div className="detailCustomWrap">
            {(t.customRows || []).map((row, rIdx) => (
              <div className="detailCustomRow" key={`c-${index ?? "one"}-${rIdx}`}>
                <input
                  className="detailCustomKey"
                  value={row.key}
                  onChange={(e) =>
                    updateCustomRow(rIdx, { key: e.target.value }, index)
                  }
                  placeholder="tag name"
                />
                <input
                  className="detailCustomVal"
                  value={row.value}
                  onChange={(e) =>
                    updateCustomRow(rIdx, { value: e.target.value }, index)
                  }
                  placeholder="value"
                />
                <button
                  type="button"
                  className="detailCustomRemove"
                  onClick={() => removeCustomRow(rIdx, index)}
                  title="Remove"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

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

        {t?.error ? <div className="detailTagsError">{t.error}</div> : null}
      </div>
    );
  };

  const renderSolveCard = (item, index) => (
    <div key={index} className="detailSolveCard">
      <div className="detailTopRow">
        <div className="detailTime">
          {formatTime(item.time, false, item.penalty)}
        </div>
        <div
          className="detailScramble"
          style={{ fontSize: getScrambleFontSize(item.event) }}
        >
          {item.scramble}
        </div>
      </div>

      <div className="detailDateRow">{formatDateTime(getSolveTS(item))}</div>

      <div className="detailBottomRow">
        <div className="detailCube">
          <RubiksCubeSVG
            n={item.event}
            faces={getScrambledFaces(item.scramble, item.event)}
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
          />

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

          {renderTagsEditor(item, index)}
        </div>

        <div className="detailActions">
          <div className="penalty-buttons">
            <button onClick={() => handlePenaltyChange("+2", index)}>+2</button>
            <button onClick={() => handlePenaltyChange("DNF", index)}>DNF</button>
            <button onClick={() => handlePenaltyChange(null, index)}>Clear</button>
          </div>
          <button className="share-button" onClick={() => handleShare(index)}>
            Share
          </button>
          <button className="delete-button" onClick={() => handleDelete(index)}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );

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
                {formatTime(solve.time, false, solve.penalty)}
              </div>
              <div
                className="detailScramble"
                style={{ fontSize: getScrambleFontSize(solve.event) }}
              >
                {solve.scramble}
              </div>
            </div>

            <div className="detailDateRow">{formatDateTime(getSolveTS(solve))}</div>

            <div className="detailBottomRow">
              <div className="detailCube">
                <RubiksCubeSVG
                  n={solve.event}
                  faces={getScrambledFaces(solve.scramble, solve.event)}
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
                />

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

                {renderTagsEditor(solve, null)}
              </div>

              <div className="detailActions">
                <div className="penalty-buttons">
                  <button onClick={() => handlePenaltyChange("+2")}>+2</button>
                  <button onClick={() => handlePenaltyChange("DNF")}>DNF</button>
                  <button onClick={() => handlePenaltyChange(null)}>Clear</button>
                </div>
                <button className="share-button" onClick={() => handleShare()}>
                  Share
                </button>
                <button className="delete-button" onClick={() => handleDelete()}>
                  Delete
                </button>
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