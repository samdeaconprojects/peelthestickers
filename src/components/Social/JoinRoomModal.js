import React, { useEffect, useState } from "react";
import "./CreateGroupModal.css";

function JoinRoomModal({
  isOpen,
  onClose,
  onJoin,
  isSubmitting = false,
  errorMessage = "",
}) {
  const [roomCode, setRoomCode] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setRoomCode("");
  }, [isOpen]);

  if (!isOpen) return null;

  const handleJoin = () => {
    const code = String(roomCode || "").trim();
    if (!code || isSubmitting) return;
    onJoin?.({ roomCode: code });
  };

  return (
    <div className="createGroupOverlay" onClick={onClose}>
      <div className="createGroupModal" onClick={(e) => e.stopPropagation()}>
        <h2>Join Room</h2>
        <input
          className="createGroupNameInput"
          type="text"
          value={roomCode}
          onChange={(e) => setRoomCode(e.target.value)}
          placeholder="Enter room code"
          maxLength={60}
          autoFocus
        />
        <div className="createGroupHelper">
          Join the room, open the shared session card, and you&apos;ll be solving the same scrambles as everyone else.
        </div>
        {errorMessage ? <div className="createGroupError">{errorMessage}</div> : null}

        <div className="createGroupActions">
          <button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleJoin}
            disabled={!roomCode.trim() || isSubmitting}
          >
            {isSubmitting ? "Joining..." : "Join Room"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default JoinRoomModal;
