import React, { useEffect, useRef, useState } from "react";
import NameTag from "../Profile/NameTag";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { PROFILE_CUBE_TRANSFORMS } from "../Profile/ProfileHeader";
import "./OnboardingModal.css";

export const PROFILE_EVENT_OPTIONS = [
  { value: "222", label: "2x2" },
  { value: "333", label: "3x3" },
  { value: "444", label: "4x4" },
  { value: "555", label: "5x5" },
  { value: "666", label: "6x6" },
  { value: "777", label: "7x7" },
  { value: "333OH", label: "3x3 OH" },
  { value: "333BLD", label: "3x3 BLD" },
  { value: "444BLD", label: "4x4 BLD" },
  { value: "555BLD", label: "5x5 BLD" },
  { value: "CLOCK", label: "Clock" },
  { value: "MEGAMINX", label: "Megaminx" },
  { value: "PYRAMINX", label: "Pyraminx" },
  { value: "SKEWB", label: "Skewb" },
  { value: "SQ1", label: "Square-1" },
];

const NAME_MAX_LENGTH = 24;

const cleanName = (value) => String(value || "").slice(0, NAME_MAX_LENGTH);

export function ProfileSetupModal({
  open,
  userID,
  initialValues,
  onGenerateScramble,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState({
    name: "",
    color: "#0E171D",
    profileEvent: "333",
    profileScramble: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Seed the draft once per open; App passes a fresh initialValues object on
  // every render, which would otherwise wipe what the user typed.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    if (seededRef.current) return;
    seededRef.current = true;
    setDraft({
      name: cleanName(initialValues?.name || userID || ""),
      color: initialValues?.color || "#0E171D",
      profileEvent: initialValues?.profileEvent || "333",
      profileScramble: initialValues?.profileScramble || "",
    });
  }, [initialValues, open, userID]);

  if (!open) return null;

  const busy = isSaving || isGenerating;

  const handleGenerate = async () => {
    if (!onGenerateScramble) return;
    setIsGenerating(true);
    try {
      const scramble = await onGenerateScramble(draft.profileEvent || "333");
      setDraft((prev) => ({ ...prev, profileScramble: String(scramble || "").trim() }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave?.({ ...draft, name: draft.name.trim() || userID || "" });
    } finally {
      setIsSaving(false);
    }
  };

  const previewUser = {
    UserID: userID,
    Name: draft.name.trim() || userID || "you",
    Color: draft.color,
    ProfileEvent: draft.profileEvent,
    ProfileScramble: draft.profileScramble,
  };

  return (
    <div className="onboardingModal" onMouseDown={isSaving ? undefined : onClose}>
      <div className="onboardingModalCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="onboardingModalHeader">
          <h2>Set up your profile</h2>
          <p>Pick your username, profile color, event, and scramble.</p>
          <p className="onboardingModalSubtle">This can be changed anytime.</p>
        </div>

        <div className="onboardingPreview" aria-label="Profile preview">
          <div className="onboardingIdentity">
            <div
              className="onboardingIdentityPicture"
              style={{ border: `2px solid ${draft.color}` }}
            >
              <div
                className="profileCube"
                style={{
                  transform: PROFILE_CUBE_TRANSFORMS[draft.profileEvent] || "scale(0.6)",
                }}
              >
                <PuzzleSVG
                  className="profileCube"
                  event={draft.profileEvent}
                  scramble={draft.profileScramble}
                  isMusicPlayer={false}
                  isProfileCube={true}
                  isTimerCube={false}
                />
              </div>
            </div>
            <div className="onboardingIdentityText">
              <div className="onboardingIdentityName">{previewUser.Name}</div>
              <div className="onboardingIdentityHandle">@{userID || "handle"}</div>
            </div>
          </div>
          <div className="onboardingPreviewTag">
            <NameTag isSignedIn={true} user={previewUser} />
          </div>
        </div>

        <div className="onboardingFields">
          <label className="onboardingField">
            <span>Username</span>
            <div className="onboardingHandleInput">
              <input
                type="text"
                value={draft.name}
                maxLength={NAME_MAX_LENGTH}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, name: cleanName(e.target.value) }))
                }
                placeholder={userID || "Username"}
                disabled={busy}
              />
            </div>
          </label>

          <div className="onboardingFieldRow">
            <label className="onboardingField onboardingField--color">
              <span>Color</span>
              <input
                type="color"
                value={draft.color}
                onChange={(e) => setDraft((prev) => ({ ...prev, color: e.target.value }))}
                disabled={busy}
              />
            </label>

            <label className="onboardingField">
              <span>Event</span>
              <select
                value={draft.profileEvent}
                onChange={(e) => {
                  const value = e.target.value;
                  setDraft((prev) => ({
                    ...prev,
                    profileEvent: value,
                    profileScramble: value === prev.profileEvent ? prev.profileScramble : "",
                  }));
                }}
                disabled={busy}
              >
                {PROFILE_EVENT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="onboardingField">
            <span>Scramble</span>
            <textarea
              value={draft.profileScramble}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, profileScramble: e.target.value }))
              }
              rows={3}
              disabled={busy}
              placeholder="Type your own scramble or generate one"
            />
          </label>

          <div>
            <button
              type="button"
              className="onboardingModalButton onboardingModalButtonSecondary"
              onClick={handleGenerate}
              disabled={busy}
            >
              {isGenerating ? "Generating..." : "Generate Scramble"}
            </button>
          </div>
        </div>

        <div className="onboardingModalActions">
          <button
            type="button"
            className="onboardingModalButton onboardingModalButtonSecondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Skip
          </button>
          <button
            type="button"
            className="onboardingModalButton"
            onClick={handleSave}
            disabled={busy}
          >
            {isSaving ? "Saving..." : "Done"}
          </button>
        </div>
      </div>
    </div>
  );
}
