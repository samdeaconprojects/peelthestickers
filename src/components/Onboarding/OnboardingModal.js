import React, { useEffect, useState } from "react";
import QuickSetupPanel from "../QuickSetup/QuickSetupPanel";
import "./OnboardingModal.css";

export function ProfileSetupModal({
  open,
  initialValues,
  onGenerateScramble,
  onSave,
  onClose,
}) {
  const [draft, setDraft] = useState({
    color: "#0E171D",
    profileEvent: "333",
    profileScramble: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft({
      color: initialValues?.color || "#0E171D",
      profileEvent: initialValues?.profileEvent || "333",
      profileScramble: initialValues?.profileScramble || "",
    });
  }, [initialValues, open]);

  if (!open) return null;

  const handleGenerate = async (eventCode) => {
    if (!onGenerateScramble) return;
    setIsGenerating(true);
    try {
      const scramble = await onGenerateScramble(eventCode || draft.profileEvent || "333");
      setDraft((prev) => ({
        ...prev,
        profileScramble: String(scramble || "").trim(),
      }));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await onSave?.(draft);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="onboardingModal" onMouseDown={isSaving ? undefined : onClose}>
      <div className="onboardingModalCard" onMouseDown={(e) => e.stopPropagation()}>
        <div className="onboardingModalHeader">
          <div className="onboardingModalEyebrow">Welcome</div>
          <h2>Set up your profile</h2>
          <p>Pick your profile color, cube, and scramble before the walkthrough starts.</p>
        </div>

        <QuickSetupPanel
          color={draft.color}
          profileEvent={draft.profileEvent}
          profileScramble={draft.profileScramble}
          onColorChange={(value) => setDraft((prev) => ({ ...prev, color: value }))}
          onProfileEventChange={(value) =>
            setDraft((prev) => ({
              ...prev,
              profileEvent: value,
              profileScramble: value === prev.profileEvent ? prev.profileScramble : "",
            }))
          }
          onProfileScrambleChange={(value) =>
            setDraft((prev) => ({ ...prev, profileScramble: value }))
          }
          onGenerateScramble={handleGenerate}
          disabled={isSaving || isGenerating}
          helperText="This runs right after sign up, and you can still adjust these later in Settings."
        />

        <div className="onboardingModalActions">
          <button
            type="button"
            className="onboardingModalButton onboardingModalButtonSecondary"
            onClick={onClose}
            disabled={isSaving}
          >
            Close
          </button>
          <button
            type="button"
            className="onboardingModalButton"
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? "Saving..." : "Continue to Tutorial"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TutorialModal({ open, onClose }) {
  if (!open) return null;

  return (
    <div className="onboardingModal" onMouseDown={onClose}>
      <div className="onboardingModalCard onboardingModalCard--tutorial" onMouseDown={(e) => e.stopPropagation()}>
        <div className="onboardingModalHeader">
          <div className="onboardingModalEyebrow">Quick Tutorial</div>
          <h2>Here’s the fast rundown</h2>
          <p>These are the main things new users need to know to get moving quickly.</p>
        </div>

        <div className="tutorialSteps">
          <div className="tutorialStep">
            <div className="tutorialStepNumber">1</div>
            <div>
              <strong>Start solving on Home.</strong>
              <div>The timer, scramble, and averages all live there.</div>
            </div>
          </div>
          <div className="tutorialStep">
            <div className="tutorialStepNumber">2</div>
            <div>
              <strong>Use Settings to tune your experience.</strong>
              <div>Theme, timer input, profile details, cube collection, and stats live there.</div>
            </div>
          </div>
          <div className="tutorialStep">
            <div className="tutorialStepNumber">3</div>
            <div>
              <strong>Profile and Stats grow as you solve.</strong>
              <div>Your profile card, sessions, and charts update from the solves you log.</div>
            </div>
          </div>
          <div className="tutorialStep">
            <div className="tutorialStepNumber">4</div>
            <div>
              <strong>Social is there when you want shared solves.</strong>
              <div>You can post, message, and join shared scramble sessions later.</div>
            </div>
          </div>
        </div>

        <div className="onboardingModalActions">
          <button type="button" className="onboardingModalButton" onClick={onClose}>
            Start Solving
          </button>
        </div>
      </div>
    </div>
  );
}
