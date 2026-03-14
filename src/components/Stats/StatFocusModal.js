import React, { useEffect } from "react";

function StatFocusModal({
  isOpen,
  title,
  subtitle,
  children,
  actionMessage,
  actionButtons = [],
  onClose,
  overlayClassName = "",
  modalClassName = "",
  bodyClassName = "",
}) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={`statFocusOverlay ${overlayClassName}`.trim()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={`statFocusModal ${modalClassName}`.trim()}>
        <div className="statFocusHeader">
          <div>
            <div className="statFocusTitle">{title}</div>
            {subtitle ? <div className="statFocusSubtitle">{subtitle}</div> : null}
          </div>

          <button type="button" className="statFocusClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className="statFocusActions">
          {actionButtons.map((button) => (
            <button
              key={button.key}
              type="button"
              className={`statFocusActionBtn ${button.tone ? `is-${button.tone}` : ""}`}
              onClick={button.onClick}
              disabled={button.disabled}
            >
              {button.label}
            </button>
          ))}
        </div>

        {actionMessage ? <div className="statFocusMessage">{actionMessage}</div> : null}

        <div className={`statFocusBody ${bodyClassName}`.trim()}>{children}</div>
      </div>
    </div>
  );
}

export default StatFocusModal;
