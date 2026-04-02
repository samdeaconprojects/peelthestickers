import React, { useEffect } from "react";
import { createPortal } from "react-dom";

function StatFocusModal({
  isOpen,
  title,
  subtitle,
  children,
  actionMessage,
  actionButtons = [],
  optionsContent = null,
  onClose,
  overlayClassName = "",
  modalClassName = "",
  bodyClassName = "",
}) {
  const hasHeading = Boolean(title || subtitle);

  useEffect(() => {
    if (!isOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={`statFocusOverlay ${overlayClassName}`.trim()}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div className={`statFocusModal ${modalClassName}`.trim()}>
        <div className="statFocusHeader">
          {hasHeading ? (
            <div>
              {title ? <div className="statFocusTitle">{title}</div> : null}
              {subtitle ? <div className="statFocusSubtitle">{subtitle}</div> : null}
            </div>
          ) : (
            <div />
          )}

          <button type="button" className="statFocusClose" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        {optionsContent ? <div className="statFocusOptions">{optionsContent}</div> : null}

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

  if (typeof document === "undefined") return modalContent;

  return createPortal(modalContent, document.body);
}

export default StatFocusModal;
