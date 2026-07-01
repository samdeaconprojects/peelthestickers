import React, { useEffect, useMemo, useState } from 'react';
import './CreateGroupModal.css';

function CreateGroupModal({
  isOpen,
  onClose,
  friends = [],
  onCreate,
  isSubmitting = false,
  errorMessage = '',
}) {
  const [groupName, setGroupName] = useState('');
  const [selectedFriendIDs, setSelectedFriendIDs] = useState([]);
  const [mode, setMode] = useState('group');
  const [roomCode, setRoomCode] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setGroupName('');
    setSelectedFriendIDs([]);
    setMode('group');
    setRoomCode('');
  }, [isOpen]);

  const sortedFriends = useMemo(
    () =>
      [...friends].sort((a, b) =>
        String(a?.name || a?.id || '').localeCompare(String(b?.name || b?.id || ''))
      ),
    [friends]
  );

  if (!isOpen) return null;

  const toggleFriend = (friendID) => {
    setSelectedFriendIDs((prev) =>
      prev.includes(friendID) ? prev.filter((id) => id !== friendID) : [...prev, friendID]
    );
  };

  const handleCreate = () => {
    const name = String(groupName || '').trim();
    const isRoom = mode === 'room';
    if (!name || isSubmitting) return;
    if (!isRoom && !selectedFriendIDs.length) return;
    onCreate?.({
      name,
      memberIDs: isRoom ? [] : selectedFriendIDs,
      isJoinable: isRoom,
      isStreamRoom: isRoom,
      roomCode: String(roomCode || '').trim(),
    });
  };

  return (
    <div className="createGroupOverlay" onClick={onClose}>
      <div className="createGroupModal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'room' ? 'Open Room' : 'Create Group'}</h2>

        <div className="createGroupModeToggle" role="tablist" aria-label="Conversation mode">
          <button
            type="button"
            className={mode === 'group' ? 'isActive' : ''}
            onClick={() => setMode('group')}
          >
            Group
          </button>
          <button
            type="button"
            className={mode === 'room' ? 'isActive' : ''}
            onClick={() => setMode('room')}
          >
            Stream Room
          </button>
        </div>

        <input
          className="createGroupNameInput"
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder={mode === 'room' ? 'Room name' : 'Group name'}
          maxLength={60}
        />

        {mode === 'room' && (
          <>
            <input
              className="createGroupNameInput"
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value)}
              placeholder="Room code (optional)"
              maxLength={60}
            />
            <div className="createGroupHelper">
              Anyone with the code can join later, get the same scrambles, and appear on the shared leaderboard.
            </div>
          </>
        )}

        {mode === 'group' && <div className="createGroupMembersLabel">Add friends</div>}
        {errorMessage ? <div className="createGroupError">{errorMessage}</div> : null}
        {mode === 'group' ? (
          <div className="createGroupMembersList">
            {sortedFriends.length ? (
              sortedFriends.map((friend) => (
                <label key={friend.id} className="createGroupMemberRow">
                  <input
                    type="checkbox"
                    checked={selectedFriendIDs.includes(friend.id)}
                    onChange={() => toggleFriend(friend.id)}
                  />
                  <span>{friend.name || friend.id}</span>
                </label>
              ))
            ) : (
              <div className="createGroupEmpty">No friends available</div>
            )}
          </div>
        ) : (
          <div className="createGroupRoomPreview">
            Rooms start with just you in them, and other people can join from the code whenever you share it.
          </div>
        )}

        <div className="createGroupActions">
          <button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={
              !groupName.trim() || (!selectedFriendIDs.length && mode === 'group') || isSubmitting
            }
          >
            {isSubmitting ? 'Creating...' : mode === 'room' ? 'Open Room' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupModal;
