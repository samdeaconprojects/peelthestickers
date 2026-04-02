import React, { useEffect, useRef } from "react";
import TagBar from "../TagBar/TagBar";

function BulkSolveControls({
  selectionCount,
  clearSelection,

  showBulkTags,
  setShowBulkTags,
  showBulkMove,
  setShowBulkMove,
  showBulkShare,
  setShowBulkShare,

  openBulkTags,
  openBulkMove,
  openBulkShare,

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

  tagConfig,
  cubeModelOptions = [],
  discoveredTagOptions = {},
  tagColors = {},
  onTagColorsChange = null,
  profileColor = "#2EC4B6",

  applyBulkTags,
  applyBulkMove,
  applyBulkDelete,
  applyBulkShare,

  enableShare = true,
}) {
  const bulkUiRef = useRef(null);
  const bulkModalRef = useRef(null);

  const bulkBarStyle = {
    position: "fixed",
    top: "10px",
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 2000,
    display: selectionCount ? "flex" : "none",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "10px",
    flexWrap: "wrap",
    padding: "10px 14px",
    background: "rgba(110, 115, 115, 0.82)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "12px",
    boxSizing: "border-box",
    marginBottom: "10px",
    backdropFilter: "blur(6px)",
    maxWidth: "min(1100px, calc(100vw - 32px))",
    width: "max-content",
  };

  const bulkBtnStyle = {
    height: "34px",
    padding: "0 12px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "transparent",
    color: "white",
    cursor: "pointer",
    opacity: 0.95,
    fontWeight: 700,
    userSelect: "none",
  };

  const bulkPrimaryBtnStyle = {
    ...bulkBtnStyle,
    border: "none",
    background: "#2EC4B6",
    color: "#0E171D",
    fontWeight: 900,
  };

  const modalBackdrop = {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.55)",
    zIndex: 3000,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
  };

  const modalCard = {
    width: "720px",
    maxWidth: "94vw",
    background: "#181F23",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: "14px",
    padding: "16px",
    boxSizing: "border-box",
  };

  const inputStyle = {
    width: "100%",
    height: "34px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.20)",
    color: "white",
    padding: "0 10px",
    outline: "none",
    boxSizing: "border-box",
  };

  const textareaStyle = {
    width: "100%",
    minHeight: "130px",
    borderRadius: "10px",
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(0,0,0,0.20)",
    color: "white",
    padding: "10px",
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    fontSize: "13px",
    lineHeight: 1.35,
    resize: "vertical",
  };

  const selectStyle = {
    ...inputStyle,
    cursor: "pointer",
  };

  const bulkTags = {
    CubeModel: bulkCubeModel || "",
    CrossColor: bulkCrossColor || "",
    TimerInput: bulkTimerInput || "",
    SolveSource: bulkSolveSource || "",
    Custom1: bulkCustom1 || "",
    Custom2: bulkCustom2 || "",
    Custom3: bulkCustom3 || "",
    Custom4: bulkCustom4 || "",
    Custom5: bulkCustom5 || "",
  };

  const clearBulkTagDraft = () => {
    setBulkCubeModel("");
    setBulkCrossColor("");
    setBulkTimerInput("");
    setBulkSolveSource("");
    setBulkCustom1("");
    setBulkCustom2("");
    setBulkCustom3("");
    setBulkCustom4("");
    setBulkCustom5("");
  };

  const dismissBulkTags = () => {
    clearBulkTagDraft();
    setShowBulkTags(false);
  };

  useEffect(() => {
    if (!selectionCount) return undefined;

    const handlePointerDown = (event) => {
      const target = event.target;
      if (!(target instanceof Node)) return;

      if (bulkUiRef.current?.contains(target)) return;
      if (bulkModalRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest("[data-bulk-select-item=\"true\"]")) return;

      clearBulkTagDraft();
      setShowBulkTags(false);
      setShowBulkMove(false);
      setShowBulkShare(false);
      clearSelection();
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [
    selectionCount,
    clearSelection,
    setShowBulkMove,
    setShowBulkShare,
    setShowBulkTags,
  ]);

  return (
    <>
      <div ref={bulkUiRef} style={bulkBarStyle} data-bulk-ui>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ fontWeight: 900, color: "white" }}>{selectionCount} selected</div>
          <div style={{ fontSize: "12px", opacity: 0.85 }}>
            Shift+click = range, Ctrl/Cmd+click = toggle, Esc = clear
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <button type="button" style={bulkBtnStyle} onClick={openBulkTags}>
            Tags
          </button>

          <button type="button" style={bulkBtnStyle} onClick={openBulkMove}>
            Move
          </button>

          {enableShare && (
            <button type="button" style={bulkBtnStyle} onClick={openBulkShare}>
              Share
            </button>
          )}

          <button
            type="button"
            style={{ ...bulkBtnStyle, border: "1px solid rgba(255,80,80,0.45)" }}
            onClick={applyBulkDelete}
          >
            Delete
          </button>

          <button type="button" style={bulkBtnStyle} onClick={clearSelection}>
            Clear
          </button>
        </div>
      </div>

      {showBulkTags && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={dismissBulkTags}>
          <div
            ref={bulkModalRef}
            style={modalCard}
            data-bulk-modal
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Edit Tags ({selectionCount})
            </div>

            <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
              <button
                type="button"
                style={bulkTagMode === "merge" ? bulkPrimaryBtnStyle : bulkBtnStyle}
                onClick={() => setBulkTagMode("merge")}
              >
                Merge
              </button>
              <button
                type="button"
                style={bulkTagMode === "replace" ? bulkPrimaryBtnStyle : bulkBtnStyle}
                onClick={() => setBulkTagMode("replace")}
              >
                Replace
              </button>
            </div>

            <div style={{ marginBottom: "14px" }}>
              <TagBar
                tags={bulkTags}
                onChange={(next) => {
                  setBulkCubeModel(next?.CubeModel || "");
                  setBulkCrossColor(next?.CrossColor || "");
                  setBulkTimerInput(next?.TimerInput || "");
                  setBulkSolveSource(next?.SolveSource || "");
                  setBulkCustom1(next?.Custom1 || "");
                  setBulkCustom2(next?.Custom2 || "");
                  setBulkCustom3(next?.Custom3 || "");
                  setBulkCustom4(next?.Custom4 || "");
                  setBulkCustom5(next?.Custom5 || "");
                }}
                tagConfig={tagConfig}
                cubeModelOptions={cubeModelOptions}
                discoveredOptions={discoveredTagOptions}
                tagColors={tagColors}
                onTagColorsChange={onTagColorsChange}
                profileColor={profileColor}
                variant="stats"
                allowAdditions={true}
                fields={[
                  "CubeModel",
                  "CrossColor",
                  "TimerInput",
                  "SolveSource",
                  "Custom1",
                  "Custom2",
                  "Custom3",
                  "Custom4",
                  "Custom5",
                ]}
              />
            </div>

            <div style={{ fontSize: "12px", opacity: 0.78, marginBottom: "10px" }}>
              Leave a tag empty to skip it. Merge adds onto existing tags, replace overwrites the
              shared tag fields for the selected solves.
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={bulkBtnStyle} onClick={dismissBulkTags}>
                Cancel
              </button>
              <button type="button" style={bulkPrimaryBtnStyle} onClick={applyBulkTags}>
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulkMove && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkMove(false)}>
          <div
            ref={bulkModalRef}
            style={modalCard}
            data-bulk-modal
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Move Solves ({selectionCount})
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "12px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Event
                </div>
                <input
                  style={inputStyle}
                  value={bulkMoveEvent}
                  onChange={(e) => setBulkMoveEvent(e.target.value)}
                  placeholder="333"
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Session
                </div>
                {getSessionsForEvent(bulkMoveEvent).length > 0 ? (
                  <select
                    style={selectStyle}
                    value={bulkMoveSession}
                    onChange={(e) => setBulkMoveSession(e.target.value)}
                  >
                    {getSessionsForEvent(bulkMoveEvent).map((s) => (
                      <option key={`${s.SessionID}-${s.SessionName || ""}`} value={s.SessionID}>
                        {s.SessionName || s.SessionID}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    style={inputStyle}
                    value={bulkMoveSession}
                    onChange={(e) => setBulkMoveSession(e.target.value)}
                    placeholder="main"
                  />
                )}
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={bulkBtnStyle} onClick={() => setShowBulkMove(false)}>
                Cancel
              </button>
              <button type="button" style={bulkPrimaryBtnStyle} onClick={applyBulkMove}>
                Move
              </button>
            </div>
          </div>
        </div>
      )}

      {enableShare && showBulkShare && (
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkShare(false)}>
          <div
            ref={bulkModalRef}
            style={modalCard}
            data-bulk-modal
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div style={{ fontSize: "16px", fontWeight: 900, marginBottom: "6px" }}>
              Share Solves ({selectionCount})
            </div>

            <div style={{ marginBottom: "10px" }}>
              <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                Post note
              </div>
              <textarea
                style={textareaStyle}
                value={bulkShareNote}
                onChange={(e) => setBulkShareNote(e.target.value)}
                placeholder="Optional note..."
              />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={bulkBtnStyle} onClick={() => setShowBulkShare(false)}>
                Cancel
              </button>
              <button type="button" style={bulkPrimaryBtnStyle} onClick={applyBulkShare}>
                Share
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default BulkSolveControls;
