import React from "react";
import "./QuickSetupPanel.css";

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

function QuickSetupPanel({
  color = "#0E171D",
  profileEvent = "333",
  profileScramble = "",
  onColorChange,
  onProfileEventChange,
  onProfileScrambleChange,
  onGenerateScramble,
  disabled = false,
  compact = false,
  helperText = "You can change this any time later in Settings.",
}) {
  const panelClassName = compact
    ? "quickSetupPanel quickSetupPanel--compact"
    : "quickSetupPanel";

  return (
    <div className={panelClassName}>
      <div className="quickSetupHeader">
        <div className="quickSetupEyebrow">Quick Setup</div>
        <h3>Pick your profile look before you start solving.</h3>
        <p>{helperText}</p>
      </div>

      <div className="quickSetupSteps" aria-label="Quick setup steps">
        <div className="quickSetupStep">
          <span className="quickSetupStepIndex">1</span>
          <span>Choose your profile color.</span>
        </div>
        <div className="quickSetupStep">
          <span className="quickSetupStepIndex">2</span>
          <span>Select the cube shown on your profile card.</span>
        </div>
        <div className="quickSetupStep">
          <span className="quickSetupStepIndex">3</span>
          <span>Use a default scramble now, or swap in your own.</span>
        </div>
      </div>

      <div className="quickSetupFields">
        <label className="quickSetupField">
          <span>Profile Color</span>
          <div className="quickSetupColorRow">
            <input
              type="color"
              value={color}
              onChange={(e) => onColorChange?.(e.target.value)}
              disabled={disabled}
            />
            <code>{color}</code>
          </div>
        </label>

        <label className="quickSetupField">
          <span>Profile Cube</span>
          <select
            value={profileEvent}
            onChange={(e) => onProfileEventChange?.(e.target.value)}
            disabled={disabled}
          >
            {PROFILE_EVENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="quickSetupField">
          <span>Profile Scramble</span>
          <textarea
            value={profileScramble}
            onChange={(e) => onProfileScrambleChange?.(e.target.value)}
            rows={compact ? 3 : 4}
            disabled={disabled}
            placeholder="Add your own scramble or generate one"
          />
        </label>

        <div className="quickSetupActions">
          <button
            type="button"
            className="quickSetupAction"
            onClick={() => onGenerateScramble?.(profileEvent)}
            disabled={disabled}
          >
            Generate Scramble
          </button>
        </div>
      </div>
    </div>
  );
}

export default QuickSetupPanel;
