import React, { useEffect, useRef } from "react";
import "./SharePostModal.css";

function SharePostModal({
  isOpen,
  title = "Share to Social",
  caption = "",
  onCaptionChange,
  onCancel,
  onConfirm,
  isSubmitting = false,
  error = "",
}) {
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    inputRef.current?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting) onCancel?.();
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter" && !isSubmitting) {
        onConfirm?.();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isSubmitting, onCancel, onConfirm]);

  if (!isOpen) return null;

  return (
    <div
      className="sharePostOverlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel?.();
      }}
    >
      <div className="sharePostModal">
        <div className="sharePostHeader">
          <div className="sharePostTitle">{title}</div>
          <button
            type="button"
            className="sharePostClose"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <label className="sharePostLabel" htmlFor="share-post-caption">
          Caption
        </label>
        <textarea
          id="share-post-caption"
          ref={inputRef}
          className="sharePostInput"
          value={caption}
          onChange={(event) => onCaptionChange?.(event.target.value)}
          placeholder="Say something about this post..."
          rows={5}
          disabled={isSubmitting}
        />

        {error ? <div className="sharePostError">{error}</div> : null}

        <div className="sharePostActions">
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={isSubmitting}>
            {isSubmitting ? "Sharing..." : "Share"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SharePostModal;
