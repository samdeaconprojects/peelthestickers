const LETTER_CODE_PREFIX = "Key";
const DIGIT_CODE_PREFIX = "Digit";

export const EVENT_KEYBINDING_LABELS = {
  "222": "2x2",
  "333": "3x3",
  "444": "4x4",
  "555": "5x5",
  "666": "6x6",
  "777": "7x7",
  SQ1: "Square-1",
  SKEWB: "Skewb",
  CLOCK: "Clock",
  "333OH": "3x3 OH",
  MEGAMINX: "Megaminx",
  PYRAMINX: "Pyraminx",
  "333BLD": "3x3 BLD",
};

export const defaultEventBindings = {
  "222": "Primary+2",
  "333": "Primary+3",
  "444": "Primary+4",
  "555": "Primary+5",
  "666": "Primary+6",
  "777": "Primary+7",
  SQ1: "Primary+Q",
  SKEWB: "Primary+K",
  CLOCK: "Primary+C",
  "333OH": "Primary+O",
  MEGAMINX: "Primary+M",
  PYRAMINX: "Primary+P",
  "333BLD": "Primary+B",
};

export const PAGE_KEYBINDING_LABELS = {
  profile: "Profile",
  stats: "Stats",
  social: "Social",
};

export const defaultPageBindings = {
  profile: "Primary+U",
  stats: "Primary+Y",
  social: "Primary+G",
};

export const UI_KEYBINDING_LABELS = {
  playerBar: "Toggle Player Bar",
};

export const defaultUiBindings = {
  playerBar: "Primary+J",
};

export const SOLVE_KEYBINDING_LABELS = {
  clearPenalty: "Clear Last Penalty",
  plus2: "Apply +2 To Last Solve",
  dnf: "Apply DNF To Last Solve",
  deleteSolve: "Delete Last Solve",
  undoDelete: "Undo Last Delete",
};

export const defaultSolveBindings = {
  clearPenalty: "Ctrl+Shift+1",
  plus2: "Ctrl+Shift+2",
  dnf: "Ctrl+Shift+3",
  deleteSolve: "Ctrl+Shift+4",
  undoDelete: "Ctrl+Shift+Z",
};

export function isMacLikePlatform() {
  if (typeof navigator === "undefined") return false;

  const platform = String(
    navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || ""
  );

  return /mac|iphone|ipad|ipod/i.test(platform);
}

export function getPrimaryModifierLabel() {
  return isMacLikePlatform() ? "Ctrl" : "Alt";
}

function normalizeShortcutToken(token) {
  return String(token || "").trim();
}

function resolveKeyCode(keyToken) {
  const token = normalizeShortcutToken(keyToken);
  if (!token) return "";

  if (/^[A-Za-z]$/.test(token)) {
    return `${LETTER_CODE_PREFIX}${token.toUpperCase()}`;
  }

  if (/^[0-9]$/.test(token)) {
    return `${DIGIT_CODE_PREFIX}${token}`;
  }

  const specialCodes = {
    COMMA: "Comma",
    PERIOD: "Period",
    SLASH: "Slash",
    SEMICOLON: "Semicolon",
    QUOTE: "Quote",
    MINUS: "Minus",
    EQUAL: "Equal",
    BACKSPACE: "Backspace",
    ESCAPE: "Escape",
    ENTER: "Enter",
    TAB: "Tab",
    SPACE: "Space",
    LEFT: "ArrowLeft",
    RIGHT: "ArrowRight",
    UP: "ArrowUp",
    DOWN: "ArrowDown",
    BRACKETLEFT: "BracketLeft",
    BRACKETRIGHT: "BracketRight",
  };

  return specialCodes[token.toUpperCase()] || token;
}

export function parseShortcutCombo(combo) {
  const parts = String(combo || "")
    .split("+")
    .map((part) => normalizeShortcutToken(part))
    .filter(Boolean);

  const parsed = {
    alt: false,
    ctrl: false,
    meta: false,
    shift: false,
    primary: false,
    code: "",
  };

  parts.forEach((part) => {
    const upper = part.toUpperCase();

    if (upper === "ALT" || upper === "OPTION") {
      parsed.alt = true;
      return;
    }

    if (upper === "CTRL" || upper === "CONTROL") {
      parsed.ctrl = true;
      return;
    }

    if (upper === "CMD" || upper === "COMMAND" || upper === "META") {
      parsed.meta = true;
      return;
    }

    if (upper === "SHIFT") {
      parsed.shift = true;
      return;
    }

    if (upper === "PRIMARY") {
      parsed.primary = true;
      return;
    }

    parsed.code = resolveKeyCode(part);
  });

  return parsed;
}

export function eventMatchesShortcut(event, combo) {
  const parsed = parseShortcutCombo(combo);
  if (!parsed.code || event.code !== parsed.code) return false;

  const requiresCtrl = parsed.ctrl || (parsed.primary && isMacLikePlatform());
  const requiresAlt = parsed.alt || (parsed.primary && !isMacLikePlatform());

  return (
    event.ctrlKey === requiresCtrl &&
    event.altKey === requiresAlt &&
    event.metaKey === parsed.meta &&
    event.shiftKey === parsed.shift
  );
}

export function eventMatchesEventBinding(event, combo) {
  if (eventMatchesShortcut(event, combo)) return true;

  if (!isMacLikePlatform()) return false;

  const parsed = parseShortcutCombo(combo);
  if (!parsed.primary || !parsed.code || parsed.alt || parsed.meta || parsed.shift) {
    return false;
  }

  return (
    event.code === parsed.code &&
    event.altKey === true &&
    event.ctrlKey === false &&
    event.metaKey === false &&
    event.shiftKey === false
  );
}

export function formatShortcutForDisplay(combo) {
  return String(combo || "")
    .replace(/\bPrimary\b/g, getPrimaryModifierLabel())
    .replace(/\bCtrl\b/g, "Ctrl")
    .replace(/\bMeta\b/g, "Cmd");
}

export function isEditableTarget(target) {
  if (!target || typeof target !== "object") return false;
  if (typeof HTMLElement === "undefined") return false;

  if (target instanceof HTMLElement) {
    if (target.isContentEditable) return true;

    const tagName = String(target.tagName || "").toUpperCase();
    if (["INPUT", "TEXTAREA", "SELECT"].includes(tagName)) return true;

    const closestEditable = target.closest(
      'input, textarea, select, [contenteditable=""], [contenteditable="true"]'
    );
    return !!closestEditable;
  }

  return false;
}
