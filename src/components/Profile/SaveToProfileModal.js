import React, { useEffect, useState } from "react";
import "./SaveToProfileModal.css";
import {
  MAX_STAT_LISTS,
  MAX_STAT_LIST_NAME_LENGTH,
  PROFILE_MAIN_LIST_ID,
  cleanStatListName,
} from "../../utils/profileStatLists";

function SaveToProfileModal({
  isOpen,
  lists = [],
  initialSelectedIDs = [],
  onCancel,
  onConfirm,
  isSubmitting = false,
  error = "",
}) {
  const [selectedIDs, setSelectedIDs] = useState([]);
  const [newLists, setNewLists] = useState([]);
  const [newListName, setNewListName] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIDs(
      initialSelectedIDs.filter(
        (id) => id === PROFILE_MAIN_LIST_ID || lists.some((list) => list.id === id)
      )
    );
    setNewLists([]);
    setNewListName("");
    // Only reset when the modal opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isSubmitting) onCancel?.();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, isSubmitting, onCancel]);

  if (!isOpen) return null;

  const options = [
    { id: PROFILE_MAIN_LIST_ID, name: "Profile page", hint: "Shown first on your profile" },
    ...lists.map((list) => ({
      id: list.id,
      name: list.name,
      hint: `${list.items.length} saved`,
    })),
    ...newLists.map((list) => ({ id: list.id, name: list.name, hint: "New list" })),
  ];

  const toggle = (id) =>
    setSelectedIDs((prev) => (prev.includes(id) ? prev.filter((entry) => entry !== id) : [...prev, id]));

  const trimmedNewName = cleanStatListName(newListName);
  const canAddList = !!trimmedNewName && lists.length + newLists.length < MAX_STAT_LISTS;

  const addList = () => {
    if (!canAddList) return;
    const id = `new-${newLists.length}-${Date.now().toString(36)}`;
    setNewLists((prev) => [...prev, { id, name: trimmedNewName }]);
    setSelectedIDs((prev) => [...prev, id]);
    setNewListName("");
  };

  const confirm = () => {
    if (isSubmitting || !selectedIDs.length) return;
    onConfirm?.({
      listIDs: selectedIDs.filter((id) => !newLists.some((list) => list.id === id)),
      newListNames: newLists.filter((list) => selectedIDs.includes(list.id)).map((list) => list.name),
    });
  };

  return (
    <div
      className="saveToProfileOverlay"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel?.();
      }}
    >
      <div className="saveToProfileModal" role="dialog" aria-modal="true" aria-label="Save to profile">
        <div className="saveToProfileHeader">
          <div className="saveToProfileTitle">Save to Profile</div>
          <button
            type="button"
            className="saveToProfileClose"
            onClick={onCancel}
            disabled={isSubmitting}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="saveToProfileLabel">Save to</div>
        <div className="saveToProfileOptions">
          {options.map((option) => (
            <label
              key={option.id}
              className={`saveToProfileOption ${selectedIDs.includes(option.id) ? "is-active" : ""}`}
            >
              <input
                type="checkbox"
                checked={selectedIDs.includes(option.id)}
                onChange={() => toggle(option.id)}
                disabled={isSubmitting}
              />
              <span className="saveToProfileOptionName">{option.name}</span>
              <span className="saveToProfileOptionHint">{option.hint}</span>
            </label>
          ))}
        </div>

        <div className="saveToProfileLabel">New list</div>
        <div className="saveToProfileNewRow">
          <input
            type="text"
            className="saveToProfileInput"
            value={newListName}
            maxLength={MAX_STAT_LIST_NAME_LENGTH}
            placeholder="List name, e.g. PBs or Comp prep"
            onChange={(event) => setNewListName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addList();
              }
            }}
            disabled={isSubmitting}
          />
          <button type="button" onClick={addList} disabled={isSubmitting || !canAddList}>
            Add
          </button>
        </div>

        {error ? <div className="saveToProfileError">{error}</div> : null}

        <div className="saveToProfileActions">
          <button type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={isSubmitting || !selectedIDs.length}>
            {isSubmitting ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default SaveToProfileModal;
