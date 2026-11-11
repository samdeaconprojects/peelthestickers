// server/lib/passwordStrength.js
//
// Rejects passwords attackers try first. Length alone doesn't stop
// "password123" or "qwertyuiop", so new passwords are also checked against the
// 10,000 most common passwords (data/common-passwords.txt, from SecLists,
// MIT licence), with any digits/symbols padding the ends stripped, plus
// repeats, sequences, keyboard rows and the user's own name.
//
// Only applied when a password is set (signup, reset, change), so existing
// passwords keep working.

const fs = require("fs");
const path = require("path");

const MIN_LENGTH = 10;
const MAX_LENGTH = 200;

const COMMON = new Set(
  fs
    .readFileSync(path.join(__dirname, "data", "common-passwords.txt"), "utf8")
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length >= 3)
);

const SITE_WORDS = ["peelthestickers", "ptstimer", "speedcube", "rubiks"];
const KEYBOARD_ROWS = ["1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm"];

// "Password123!" -> "password", "!!monkey2024" -> "monkey"
function stripPadding(lower) {
  return lower.replace(/^[^a-z]+/, "").replace(/[^a-z]+$/, "");
}

// "aaaaaaaaaa", "abcabcabcabc", "123123123123"
function isRepeatedUnit(lower) {
  for (let size = 1; size <= Math.floor(lower.length / 2); size += 1) {
    if (lower.length % size) continue;
    const unit = lower.slice(0, size);
    if (unit.repeat(lower.length / size) === lower) return true;
  }
  return false;
}

// "abcdefghijk", "9876543210", "qwertyuiop", "poiuytrewq"
function isRun(lower) {
  if (lower.length < 6) return false;
  let up = true;
  let down = true;
  for (let i = 1; i < lower.length; i += 1) {
    const d = lower.charCodeAt(i) - lower.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  if (up || down) return true;
  const reversed = [...lower].reverse().join("");
  return KEYBOARD_ROWS.some(
    (row) => (row + row).includes(lower) || (row + row).includes(reversed)
  );
}

/**
 * Returns an error message, or null when the password is acceptable.
 * `username` (optional) is rejected as part of the password.
 */
function checkPassword(password, { username = "" } = {}) {
  const pw = typeof password === "string" ? password : "";
  if (pw.length < MIN_LENGTH) return `Password must be at least ${MIN_LENGTH} characters`;
  if (pw.length > MAX_LENGTH) return "Password is too long";

  const lower = pw.toLowerCase();
  const tooCommon =
    "That password is too common. Try a few unrelated words, like \"blue cube orange tuesday\".";

  if (COMMON.has(lower)) return tooCommon;
  const core = stripPadding(lower);
  if (core.length >= 3 && COMMON.has(core)) return tooCommon;
  if (isRepeatedUnit(lower) || isRun(lower) || (core.length >= 6 && isRun(core))) {
    return "That password is too easy to guess. Avoid repeats and sequences like 1234 or qwerty.";
  }

  const name = String(username || "").trim().toLowerCase();
  if (name.length >= 3 && lower.includes(name)) {
    return "Your password can't contain your username.";
  }
  if (SITE_WORDS.some((word) => lower.includes(word))) {
    return "Your password can't contain the site's name.";
  }
  return null;
}

module.exports = { checkPassword, MIN_PASSWORD_LENGTH: MIN_LENGTH, MAX_PASSWORD_LENGTH: MAX_LENGTH };
