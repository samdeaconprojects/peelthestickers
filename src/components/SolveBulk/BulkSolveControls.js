import React from "react";

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

  applyBulkTags,
  applyBulkMove,
  applyBulkDelete,
  applyBulkShare,

  enableShare = true,
}) {
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
    width: "560px",
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

  return (
    <>
      <div style={bulkBarStyle} data-bulk-ui>
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
        <div style={modalBackdrop} data-bulk-modal onMouseDown={() => setShowBulkTags(false)}>
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
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

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Cube Model
                </div>
                <input
                  style={inputStyle}
                  value={bulkCubeModel}
                  onChange={(e) => setBulkCubeModel(e.target.value)}
                  placeholder="GAN 12"
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Cross Color
                </div>
                <input
                  style={inputStyle}
                  value={bulkCrossColor}
                  onChange={(e) => setBulkCrossColor(e.target.value)}
                  placeholder="White"
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Timer Input
                </div>
                <input
                  style={inputStyle}
                  value={bulkTimerInput}
                  onChange={(e) => setBulkTimerInput(e.target.value)}
                  placeholder="Keyboard"
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Solve Source
                </div>
                <input
                  style={inputStyle}
                  value={bulkSolveSource}
                  onChange={(e) => setBulkSolveSource(e.target.value)}
                  placeholder="Normal"
                />
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Custom1
                </div>
                <input
                  style={inputStyle}
                  value={bulkCustom1}
                  onChange={(e) => setBulkCustom1(e.target.value)}
                  placeholder="Home"
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Custom2
                </div>
                <input
                  style={inputStyle}
                  value={bulkCustom2}
                  onChange={(e) => setBulkCustom2(e.target.value)}
                  placeholder="Comp"
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Custom3
                </div>
                <input
                  style={inputStyle}
                  value={bulkCustom3}
                  onChange={(e) => setBulkCustom3(e.target.value)}
                  placeholder=""
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Custom4
                </div>
                <input
                  style={inputStyle}
                  value={bulkCustom4}
                  onChange={(e) => setBulkCustom4(e.target.value)}
                  placeholder=""
                />
              </div>

              <div>
                <div style={{ fontSize: "12px", opacity: 0.85, marginBottom: "6px" }}>
                  Custom5
                </div>
                <input
                  style={inputStyle}
                  value={bulkCustom5}
                  onChange={(e) => setBulkCustom5(e.target.value)}
                  placeholder=""
                />
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button type="button" style={bulkBtnStyle} onClick={() => setShowBulkTags(false)}>
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
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
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
          <div style={modalCard} data-bulk-modal onMouseDown={(e) => e.stopPropagation()}>
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