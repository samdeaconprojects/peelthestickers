import React, { useEffect, useRef } from "react";
import "./SharePostModal.css";

function SharePostModal({
  isOpen,
  title = "Share Post",
  caption = "",
  targetType = "feed",
  onTargetTypeChange,
  availableConversations = [],
  selectedConversationID = "",
  onSelectedConversationChange,
  onCaptionChange,
  onCancel,
  onConfirm,
  isSubmitting = false,
  isLoadingDestinations = false,
  error = "",
}) {
  const inputRef = useRef(null);
  const hasConversations = Array.isArray(availableConversations) && availableConversations.length > 0;

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

        <div className="sharePostTargetSection">
          <div className="sharePostLabel">Share to</div>
          <div className="sharePostTargetOptions" role="radiogroup" aria-label="Share destination">
            <label className={`sharePostTargetOption ${targetType === "feed" ? "is-active" : ""}`}>
              <input
                type="radio"
                name="share-post-target"
                value="feed"
                checked={targetType === "feed"}
                onChange={() => onTargetTypeChange?.("feed")}
                disabled={isSubmitting}
              />
              <span>Social home</span>
            </label>

            <label
              className={`sharePostTargetOption ${targetType === "message" ? "is-active" : ""} ${
                !hasConversations ? "is-disabled" : ""
              }`}
            >
              <input
                type="radio"
                name="share-post-target"
                value="message"
                checked={targetType === "message"}
                onChange={() => onTargetTypeChange?.("message")}
                disabled={isSubmitting || !hasConversations}
              />
              <span>Messages</span>
            </label>
          </div>

          {targetType === "message" ? (
            hasConversations ? (
              <select
                className="sharePostSelect"
                value={selectedConversationID}
                onChange={(event) => onSelectedConversationChange?.(event.target.value)}
                disabled={isSubmitting || isLoadingDestinations}
              >
                <option value="">Choose a conversation</option>
                {availableConversations.map((conversation) => {
                  const conversationID = String(conversation?.conversationID || "").trim();
                  if (!conversationID) return null;
                  return (
                    <option key={conversationID} value={conversationID}>
                      {conversation?.label || conversationID}
                    </option>
                  );
                })}
              </select>
            ) : (
              <div className="sharePostHint">
                {isLoadingDestinations
                  ? "Loading your conversations..."
                  : "Start or join a conversation to share there."}
              </div>
            )
          ) : null}
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
