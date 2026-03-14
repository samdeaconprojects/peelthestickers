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

  useEffect(() => {
    if (!isOpen) return;
    setGroupName('');
    setSelectedFriendIDs([]);
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
    if (!name || !selectedFriendIDs.length || isSubmitting) return;
    onCreate?.({ name, memberIDs: selectedFriendIDs });
  };

  return (
    <div className="createGroupOverlay" onClick={onClose}>
      <div className="createGroupModal" onClick={(e) => e.stopPropagation()}>
        <h2>Create Group</h2>
        <input
          className="createGroupNameInput"
          type="text"
          value={groupName}
          onChange={(e) => setGroupName(e.target.value)}
          placeholder="Group name"
          maxLength={60}
        />

        <div className="createGroupMembersLabel">Add friends</div>
        {errorMessage ? <div className="createGroupError">{errorMessage}</div> : null}
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

        <div className="createGroupActions">
          <button type="button" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={!groupName.trim() || !selectedFriendIDs.length || isSubmitting}
          >
            {isSubmitting ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default CreateGroupModal;
