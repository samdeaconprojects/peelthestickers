// src/components/Stats/ImportSolvesModal.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ImportSolvesModal.css";
import { formatTime } from "../TimeList/TimeUtils";
import { DEFAULT_EVENTS, isRelayEventId } from "../../defaultEvents";

// csTimer keeps the puzzle on the session (properties.sessionData[n].opt.scrType), not on each solve.
const CSTIMER_SCRAMBLE_EVENTS = [
  [/^333oh$/, "333OH"],
  [/^333ni$/, "333BLD"],
  [/^333fm$/, "FMC"],
  [/^r3ni$/, "MBLD"],
  [/^444bld$/, "444BLD"],
  [/^555bld$/, "555BLD"],
  [/^333o?$/, "333"],
  [/^222(so|o|3)?$/, "222"],
  [/^444(wca|m|yj)?$/, "444"],
  [/^555(wca)?$/, "555"],
  [/^666(wca|si|p|s)?$/, "666"],
  [/^777(wca|si|p|s)?$/, "777"],
  [/^mgm(p|o|c)$/, "MEGAMINX"],
  [/^pyr(so|o|m)$/, "PYRAMINX"],
  [/^skb(so|o)$/, "SKEWB"],
  [/^(sqrs|sq1[ht])$/, "SQ1"],
  [/^clk(wca|wcab|o|c|e|nf)?$/, "CLOCK"],
];

// Spellings other timers and spreadsheets use for the events PTS knows.
const EVENT_ALIASES = {
  "2X2": "222",
  "2X2X2": "222",
  "3X3": "333",
  "3X3X3": "333",
  "4X4": "444",
  "4X4X4": "444",
  "5X5": "555",
  "5X5X5": "555",
  "6X6": "666",
  "6X6X6": "666",
  "7X7": "777",
  "7X7X7": "777",
  "OH": "333OH",
  "3X3 OH": "333OH",
  "3X3OH": "333OH",
  "3BLD": "333BLD",
  "333BF": "333BLD",
  "3X3 BLD": "333BLD",
  "4BLD": "444BLD",
  "444BF": "444BLD",
  "5BLD": "555BLD",
  "555BF": "555BLD",
  "333MBF": "MBLD",
  "333MBLD": "MBLD",
  "333FM": "FMC",
  "FM": "FMC",
  "MINX": "MEGAMINX",
  "MEGA": "MEGAMINX",
  "PYRAM": "PYRAMINX",
  "PYRA": "PYRAMINX",
  "SKB": "SKEWB",
  "SQ-1": "SQ1",
  "SQUARE-1": "SQ1",
  "SQUARE1": "SQ1",
  "CLK": "CLOCK",
};

const normalizeEventCode = (value) => {
  const code = String(value ?? "").trim().toUpperCase();
  return EVENT_ALIASES[code] || code;
};

// Above this the raw text stays out of the textarea; rendering it there freezes the tab.
const RAW_DISPLAY_LIMIT = 200000;

const csTimerScrambleTypeToEvent = (scrType) => {
  const type = String(scrType ?? "").trim().toLowerCase();
  for (const [pattern, eventID] of CSTIMER_SCRAMBLE_EVENTS) {
    if (pattern.test(type)) return eventID;
  }
  return null;
};

/**
 * ImportSolvesModal
 *
 * Supports:
 *  - Lines:
 *      time | scramble | optional note
 *      9.31 | R U R' ... | PB
 *      1:10.25 | scramble...
 *
 *  - PTS JSON export:
 *      { "format":"pts-export", "data": { "sessions": [{ "session": {...}, "solves": [...] }] } }
 *
 *  - JSON (generic):
 *      [
 *        { "time": 9310, "scramble": "...", "penalty": null, "note": "", "datetime": "..." }
 *      ]
 *    or { solves: [...] }
 *
 *  - csTimer JSON export:
 *      { "session1":[[[0,7963],"scramble","",1759353585,[...],"333"], ...], "properties":{...} }
 *
 *  - CSV/TSV (basic):
 *      time,scramble,note,penalty,event,date
 *      9.31,"R U R' ...","PB",,333,2026-01-01T12:00:00Z
 */
export default function ImportSolvesModal({
  event,
  sessionID,
  onClose,
  onImport,
  busy,
  importProgress,
  sessionsForEvent = [],
  defaultDestination = null,
  eventOptions = [],
}) {
  const [mode, setMode] = useState("auto"); // "auto" | "lines" | "json" | "pts-export" | "cstimer" | "csv"
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState([]);
  const [meta, setMeta] = useState(null); // parsing summary
  const [confirmReady, setConfirmReady] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState("");
  const [selectedFileSize, setSelectedFileSize] = useState(0);
  const [loadingFile, setLoadingFile] = useState(false);
  const [destKind, setDestKind] = useState(
    defaultDestination?.kind === "new" ? "new" : "existing"
  ); // "separate" (csTimer only) | "existing" | "new"
  const [destTouched, setDestTouched] = useState(false);
  const [destSessionID, setDestSessionID] = useState("");
  const [destNewName, setDestNewName] = useState(defaultDestination?.sessionName || "");
  const [sources, setSources] = useState([]); // csTimer sessions found in the pasted export
  const [sourceOverrides, setSourceOverrides] = useState({}); // { [sourceKey]: { skip, event } }
  const parseCacheRef = useRef(null);

  const defaultNewSessionName = useMemo(
    () => `Import ${new Date().toLocaleDateString()}`,
    []
  );

  const existingSessionOptions = useMemo(() => {
    const list = (sessionsForEvent || []).map((s) => ({
      SessionID: String(s?.SessionID || "main"),
      SessionName: String(s?.SessionName || s?.SessionID || "main"),
    }));
    return list.length ? list : [{ SessionID: "main", SessionName: "Main" }];
  }, [sessionsForEvent]);

  // The viewed session can be the "all sessions" pseudo-session, which is not a real target.
  const existingSessionID = useMemo(() => {
    const ids = existingSessionOptions.map((s) => s.SessionID);
    if (ids.includes(destSessionID)) return destSessionID;
    if (ids.includes(String(sessionID))) return String(sessionID);
    return ids.includes("main") ? "main" : ids[0];
  }, [destSessionID, existingSessionOptions, sessionID]);

  const eventChoices = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const ev of [...DEFAULT_EVENTS, ...(eventOptions || []), event]) {
      const id = String(ev || "").trim().toUpperCase();
      if (!id || seen.has(id) || isRelayEventId(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }, [eventOptions, event]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (e.target?.className === "importPopup") onClose?.();
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    setConfirmReady(false);
  }, [raw, mode, destKind, destSessionID, destNewName, sourceOverrides]);

  useEffect(() => {
    setSources([]);
    setSourceOverrides({});
  }, [raw]);

  const selectedFileSummary = useMemo(() => {
    if (!selectedFileName) return "";
    const bytes = Number(selectedFileSize || 0);
    if (!Number.isFinite(bytes) || bytes <= 0) return selectedFileName;
    if (bytes < 1024 * 1024) return `${selectedFileName} (${(bytes / 1024).toFixed(1)} KB)`;
    return `${selectedFileName} (${(bytes / (1024 * 1024)).toFixed(1)} MB)`;
  }, [selectedFileName, selectedFileSize]);

  /* ---------------------------- FORMAT DETECTION ---------------------------- */

  const detectFormat = (text) => {
    const t = String(text || "").trim();
    if (!t) return "empty";

    // Try JSON
    if (t.startsWith("{") || t.startsWith("[")) {
      try {
        const obj = JSON.parse(t);

        // csTimer: has session1/session2 keys
        const hasSessions =
          obj &&
          typeof obj === "object" &&
          Object.keys(obj).some((k) => /^session\d+$/.test(k));

        if (hasSessions) return "cstimer";

        const isPtsExport =
          obj &&
          typeof obj === "object" &&
          String(obj?.format || "").trim().toLowerCase() === "pts-export" &&
          Array.isArray(obj?.data?.sessions);

        if (isPtsExport) return "pts-export";

        // Generic JSON array or {solves:[...]}
        if (Array.isArray(obj)) return "json";
        if (obj && Array.isArray(obj.solves)) return "json";

        return "json_unknown";
      } catch {
        // fall through
      }
    }

    // CSV/TSV heuristics
    if (t.includes("\t")) return "csv"; // treat as delimited
    const firstLine = t.split(/\r?\n/)[0] || "";
    if (/[,;]/.test(firstLine) && /time|scramble|penalty|note|comment|date/i.test(firstLine)) {
      return "csv";
    }
    // headerless export: "12.34";"R U R' ...";"2020-01-01T10:00:00"
    if (/^"?[\d:.]+\+?"?\s*;/.test(firstLine)) return "csv";

    // Lines default
    return "lines";
  };

  /* ------------------------------- TIME PARSE ------------------------------ */

  const parseTimeToMs = (t) => {
    const s0 = String(t ?? "").trim();
    if (!s0) return null;

    // ms already? (only if looks like ms)
    if (/^\d+$/.test(s0)) {
      const n = Number(s0);
      if (Number.isFinite(n) && n >= 0) {
        // if user pasted ms
        if (n > 1000) return n;
        // if small integer seconds
        return n * 1000;
      }
    }

    // mm:ss.xx or h:mm:ss.xx
    if (s0.includes(":")) {
      const parts = s0.split(":").map((part) => (part.trim() === "" ? NaN : Number(part)));
      if (parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return null;
      const totalSeconds = parts.reduce((acc, n) => acc * 60 + n, 0);
      return Math.round(totalSeconds * 1000);
    }

    // seconds.xx
    const sec = Number(s0);
    if (!Number.isFinite(sec) || sec < 0) return null;
    return Math.round(sec * 1000);
  };

  // A written time, as timers print it: "9.31", "11.31+" (penalty included), "DNF", "DNF(9.31)".
  // Returns the time without the penalty.
  const parseTimeCell = (value) => {
    const text = String(value ?? "").trim();
    if (!text) return { ms: null, penalty: null };

    const dnf = text.match(/^DNF\s*(?:\((.*)\))?$/i);
    if (dnf) return { ms: parseTimeToMs(dnf[1]) ?? 0, penalty: "DNF" };

    if (text.endsWith("+")) {
      const withPenalty = parseTimeToMs(text.slice(0, -1));
      if (withPenalty == null) return { ms: null, penalty: null };
      return { ms: Math.max(0, withPenalty - 2000), penalty: "+2" };
    }

    return { ms: parseTimeToMs(text), penalty: null };
  };

  const normalizePenalty = (p) => {
    if (p == null) return null;
    const s = String(p).trim();
    if (!s) return null;
    if (s.toUpperCase() === "DNF") return "DNF";
    if (s === "+2" || s === "2") return "+2";
    if (s.toLowerCase() === "none" || s.toLowerCase() === "ok") return null;
    return s; // keep unknown strings if any
  };

  const normalizeDate = (d) => {
    if (d == null) return null;
    if (typeof d === "number") {
      if (!Number.isFinite(d)) return null;
      // Unix seconds are ~1e9, Unix milliseconds are ~1e12.
      return Math.abs(d) >= 1e11 ? Math.round(d) : Math.round(d * 1000);
    }
    const s = String(d).trim();
    if (!s) return null;
    if (/^-?\d+(\.\d+)?$/.test(s)) return normalizeDate(Number(s));
    const dateOnlyMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
      return Date.UTC(
        Number(dateOnlyMatch[1]),
        Number(dateOnlyMatch[2]) - 1,
        Number(dateOnlyMatch[3]),
        12,
        0,
        0,
        0
      );
    }
    const dt = new Date(s);
    if (Number.isFinite(dt.getTime())) return dt.getTime();
    return null;
  };

  const parseCsTimerComment = (commentRaw) => {
    const raw = String(commentRaw ?? "").trim();
    if (!raw) return { note: "", tags: {} };

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const fromTags = parsed.tags && typeof parsed.tags === "object" ? parsed.tags : null;

        if (fromTags) {
          return {
            note: typeof parsed.note === "string" ? parsed.note : "",
            tags: { ...fromTags },
          };
        }

        const directTags = {};
        if (parsed.CubeModel != null) directTags.CubeModel = String(parsed.CubeModel);
        if (parsed.CrossColor != null) directTags.CrossColor = String(parsed.CrossColor);
        if (parsed.TimerInput != null) directTags.TimerInput = String(parsed.TimerInput);
        if (parsed.InputType != null && !directTags.TimerInput) {
          directTags.TimerInput = String(parsed.InputType);
        }

        if (Object.keys(directTags).length > 0) {
          return {
            note: typeof parsed.note === "string" ? parsed.note : "",
            tags: directTags,
          };
        }
      }
    } catch {
      // Non-JSON comments are treated as plain notes.
    }

    return { note: raw, tags: {} };
  };

  /* ------------------------------ DEDUPE + TS ------------------------------ */

  const dedupeAndStabilize = (solves) => {
    const sorted = [...solves].sort((a, b) => {
      const ta = normalizeDate(a.datetime) ?? 0;
      const tb = normalizeDate(b.datetime) ?? 0;
      return ta - tb;
    });

    const seen = new Set();
    const lastUsed = new Map();

    const out = [];
    for (const s of sorted) {
      const ev = normalizeEventCode(s.event || event);
      const dtMs = normalizeDate(s.datetime) ?? Date.now();

      // Solves with no date of their own can't be told apart from a repeat of the same time.
      if (!s._undated) {
        const sig = `${ev}|${dtMs}|${s.time}|${s.scramble || ""}|${s.note || ""}|${s.penalty || ""}`;
        if (seen.has(sig)) continue;
        seen.add(sig);
      }

      // ensure unique datetime per event (input is date-sorted, so one step past the last is free)
      const stable = Math.max(dtMs, (lastUsed.get(ev) ?? -Infinity) + 1);
      lastUsed.set(ev, stable);

      out.push({
        ...s,
        event: ev,
        datetime: new Date(stable).toISOString(),
      });
    }
    return out;
  };

  /* -------------------------------- PARSERS -------------------------------- */

  const parseLines = (text) => {
    const lines = String(text || "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const out = [];
    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim());
      const timeStr = parts[0];
      const scramble = parts[1] ?? "";
      const note = parts.slice(2).join(" | ").trim(); // allow '|' in notes

      const { ms, penalty } = parseTimeCell(timeStr);
      if (ms == null) continue;

      out.push({
        time: ms,
        originalTime: ms,
        scramble,
        penalty,
        note,
        datetime: new Date().toISOString(),
        _undated: true,
        tags: {},
      });
    }
    return out;
  };

  const parseGenericJson = (text) => {
    const obj = JSON.parse(text);
    const arr = Array.isArray(obj) ? obj : (Array.isArray(obj?.solves) ? obj.solves : null);
    if (!Array.isArray(arr)) throw new Error("JSON must be an array of solves (or { solves: [...] })");

    const timeOf = (s) => s?.time ?? s?.ms ?? s?.Time ?? s?.TimeMs;
    // Numbers are milliseconds unless the file uses decimals, which only seconds would have.
    const numbersAreSeconds = arr.some((s) => {
      const value = timeOf(s);
      return typeof value === "number" && !Number.isInteger(value);
    });
    const readTime = (value) => {
      if (typeof value === "number") {
        if (!Number.isFinite(value) || value < 0) return { ms: null, penalty: null };
        return { ms: numbersAreSeconds ? Math.round(value * 1000) : value, penalty: null };
      }
      return parseTimeCell(value);
    };

    const out = [];
    for (const s of arr) {
      const read = readTime(timeOf(s));
      if (read.ms == null) continue;

      const penalty = read.penalty || normalizePenalty(s?.penalty ?? s?.Penalty ?? null);
      const explicitRaw = readTime(
        s?.originalTime ?? s?.OriginalTime ?? s?.rawTimeMs ?? s?.RawTimeMs ?? null
      ).ms;
      // Without a separate raw time, a +2 solve's time is taken to include the penalty.
      const rawMs =
        explicitRaw ??
        (penalty === "+2" && !read.penalty ? Math.max(0, read.ms - 2000) : read.ms);

      const dtMs = normalizeDate(
        s?.datetime ??
          s?.DateTime ??
          s?.createdAt ??
          s?.CreatedAt ??
          s?.date ??
          s?.Date ??
          s?.timestamp ??
          s?.timestampMs ??
          s?.ts
      );

      out.push({
        time: rawMs,
        originalTime: rawMs,
        scramble: s?.scramble ?? s?.Scramble ?? "",
        penalty,
        note: s?.note ?? s?.Note ?? "",
        datetime: dtMs ? new Date(dtMs).toISOString() : new Date().toISOString(),
        ...(dtMs ? {} : { _undated: true }),
        tags: s?.tags ?? s?.Tags ?? {},
        event: s?.event ?? s?.Event ?? event,
      });
    }
    return out;
  };

  const parsePtsExport = (text) => {
    const obj = JSON.parse(text);
    const sessionBundles = Array.isArray(obj?.data?.sessions) ? obj.data.sessions : null;
    if (!Array.isArray(sessionBundles)) {
      throw new Error("PTS export must include data.sessions.");
    }

    const out = [];
    for (const bundle of sessionBundles) {
      const session = bundle?.session && typeof bundle.session === "object" ? bundle.session : {};
      const sessionEvent = String(session?.Event || session?.event || event || "").toUpperCase();
      const sourceSessionID = String(session?.SessionID || session?.sessionID || "main").trim() || "main";
      const sourceSessionName = String(
        session?.SessionName || session?.sessionName || session?.Name || sourceSessionID
      ).trim() || sourceSessionID;
      const sourceSessionOpts = {
        ...(String(session?.SessionType || "").trim()
          ? { sessionType: String(session.SessionType).trim() }
          : {}),
        ...(Array.isArray(session?.RelayLegs) ? { relayLegs: session.RelayLegs } : {}),
      };

      for (const s of Array.isArray(bundle?.solves) ? bundle.solves : []) {
        const rawTime =
          s?.rawTimeMs ??
          s?.RawTimeMs ??
          s?.originalTime ??
          s?.OriginalTime ??
          s?.time ??
          s?.Time ??
          s?.finalTimeMs ??
          s?.FinalTimeMs ??
          s?.ms;
        // PTS exports store every time in milliseconds.
        const ms = rawTime == null || rawTime === "" ? NaN : Number(rawTime);
        if (!Number.isFinite(ms) || ms < 0) continue;

        const penalty = normalizePenalty(s?.penalty ?? s?.Penalty ?? null);
        const explicitRaw = Number(
          s?.rawTimeMs ?? s?.RawTimeMs ?? s?.originalTime ?? s?.OriginalTime ?? NaN
        );
        const originalTime = Number.isFinite(explicitRaw)
          ? explicitRaw
          : penalty === "+2"
            ? Math.max(0, ms - 2000)
            : ms;

        out.push({
          time: originalTime,
          scramble: s?.scramble ?? s?.Scramble ?? "",
          penalty,
          note: s?.note ?? s?.Note ?? "",
          datetime:
            (() => {
              const dtMs = normalizeDate(
                s?.datetime ??
                  s?.DateTime ??
                  s?.createdAt ??
                  s?.CreatedAt ??
                  s?.date ??
                  s?.Date ??
                  s?.timestamp ??
                  s?.timestampMs ??
                  s?.ts
              );
              return dtMs ? new Date(dtMs).toISOString() : new Date().toISOString();
            })(),
          tags: s?.tags ?? s?.Tags ?? {},
          originalTime,
          event: String(s?.event ?? s?.Event ?? sessionEvent ?? event ?? "").toUpperCase(),
          _importSource: "pts-export",
          _importSessionID: sourceSessionID,
          _importSessionName: sourceSessionName,
          _importSessionOpts: sourceSessionOpts,
        });
      }
    }

    return out;
  };

  // Splits delimited text into rows of cells, honouring quoted cells ("" escapes, embedded newlines).
  const splitDelimitedRows = (text, delimiter) => {
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    const endCell = () => {
      row.push(cell.trim());
      cell = "";
    };
    const endRow = () => {
      endCell();
      if (row.some((value) => value !== "")) rows.push(row);
      row = [];
    };

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"' && text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') inQuotes = false;
        else cell += ch;
      } else if (ch === '"' && cell.trim() === "") {
        cell = "";
        inQuotes = true;
      } else if (ch === delimiter) endCell();
      else if (ch === "\n") endRow();
      else if (ch !== "\r") cell += ch;
    }
    endRow();
    return rows;
  };

  // CSV / TSV / semicolon-separated, with a header row or as bare time;scramble;date columns.
  const parseDelimited = (text) => {
    const body = String(text || "").trim();
    if (!body) return [];

    const firstLine = body.split(/\r?\n/)[0] || "";
    const countOf = (ch) => firstLine.split(ch).length - 1;
    const delimiter = countOf("\t") > 0 ? "\t" : countOf(";") > countOf(",") ? ";" : ",";

    const rows = splitDelimitedRows(body, delimiter);
    if (!rows.length) return [];

    const headers = rows[0].map((h) => h.trim().toLowerCase());
    const idx = (...names) => {
      for (const name of names) {
        const i = headers.indexOf(name);
        if (i >= 0) return i;
      }
      return -1;
    };

    let iTimeMs = idx("timems");
    let iTime = idx("time");
    let iScramble = idx("scramble");
    const iNote = idx("note", "notes", "comment");
    const iPenalty = idx("penalty");
    const iEvent = idx("event", "puzzle");
    let iDate = idx("datetime", "date", "createdat", "created_at", "timestampms", "timestamp", "ts");

    let firstDataRow = 1;
    if (iTimeMs < 0 && iTime < 0) {
      // No header: only usable if the first column already reads as a time.
      if (parseTimeCell(rows[0][0]).ms == null) return [];
      firstDataRow = 0;
      iTime = 0;
      iScramble = 1;
      iDate = 2;
    }

    const out = [];
    for (let r = firstDataRow; r < rows.length; r++) {
      const cols = rows[r];
      const cellAt = (i) => (i >= 0 ? String(cols[i] ?? "").trim() : "");

      let read = { ms: null, penalty: null };
      if (cellAt(iTimeMs) !== "" && Number.isFinite(Number(cellAt(iTimeMs)))) {
        read = { ms: Number(cellAt(iTimeMs)), penalty: null };
      } else {
        read = parseTimeCell(cellAt(iTime));
      }
      if (read.ms == null || read.ms < 0) continue;

      const penalty = read.penalty || normalizePenalty(cellAt(iPenalty) || null);
      // A +2 in the penalty column means the time column already includes it.
      const rawMs = penalty === "+2" && !read.penalty ? Math.max(0, read.ms - 2000) : read.ms;

      const dtMs = normalizeDate(cellAt(iDate) || null);

      out.push({
        time: rawMs,
        originalTime: rawMs,
        scramble: iScramble >= 0 ? String(cols[iScramble] ?? "").trim() : "",
        penalty,
        note: cellAt(iNote),
        datetime: dtMs ? new Date(dtMs).toISOString() : new Date().toISOString(),
        ...(dtMs ? {} : { _undated: true }),
        tags: {},
        event: cellAt(iEvent) || event,
      });
    }
    return out;
  };

  // csTimer parser for the export you posted
  const parseCsTimer = (text) => {
    const obj = JSON.parse(text);
    const sessionKeys = Object.keys(obj).filter((k) => /^session\d+$/.test(k));

    // session names + puzzle types from properties.sessionData (stringified JSON)
    let sessionNameByNumber = {};
    let sessionEventByNumber = {};
    try {
      const sessionDataRaw = obj?.properties?.sessionData;
      const sd = typeof sessionDataRaw === "string" ? JSON.parse(sessionDataRaw) : sessionDataRaw;
      for (const [num, info] of Object.entries(sd && typeof sd === "object" ? sd : {})) {
        const name = info?.name;
        if (name != null) sessionNameByNumber[num] = String(name);
        // A session with no scrType is csTimer's default, 3x3.
        if (info && typeof info === "object") {
          sessionEventByNumber[num] = csTimerScrambleTypeToEvent(info?.opt?.scrType ?? "333");
        }
      }
    } catch {
      // ignore
    }

    const out = [];
    for (const sk of sessionKeys) {
      const sessionArr = obj[sk];
      if (!Array.isArray(sessionArr) || sessionArr.length === 0) continue;

      const sessionNum = sk.replace("session", "");
      const prettySession =
        String(sessionNameByNumber[sessionNum] ?? "").trim() || `Session ${sessionNum}`;
      const sessionEvent = sessionEventByNumber[sessionNum] || null;

      for (const row of sessionArr) {
        if (!Array.isArray(row)) continue;

        // row[0] typically [flag,timeMs]
        const timePart = row[0];
        const scramble = typeof row[1] === "string" ? row[1] : "";
        const commentRaw = typeof row[2] === "string" ? row[2] : "";
        const { note, tags } = parseCsTimerComment(commentRaw);

        let ms = null;
        let penalty = null;

        if (Array.isArray(timePart) && typeof timePart[1] === "number") {
          // timePart is [penaltyMs, timeMs]: 0 = clean, 2000 = +2, -1 = DNF. timeMs excludes the penalty.
          ms = timePart[1];
          const flag = Number(timePart[0]);
          if (flag < 0) penalty = "DNF";
          else if (flag > 0) penalty = "+2";
        }

        if (!Number.isFinite(ms)) continue;

        // date is usually unix seconds in row[3]
        const dtMs = normalizeDate(row[3]) ?? Date.now();
        const datetime = new Date(dtMs).toISOString();

        out.push({
          time: ms,
          scramble,
          penalty,
          note,
          datetime,
          tags,
          originalTime: ms, // keep for your penalty system later if needed
          event: sessionEvent || event || "333",
          _importSource: "cstimer",
          _importSourceKey: sk,
          _importSessionName: prettySession,
          _importEventDetected: !!sessionEvent,
        });
      }
    }

    return out;
  };

  const buildHelpText = useMemo(() => {
    if (mode === "pts-export") {
      return `Paste a PTS export JSON file. Session structure is preserved when imported.`;
    }
    if (mode === "cstimer") {
      return `Paste csTimer JSON export (the full {"session1":..., "properties":...} file).`;
    }
    if (mode === "json") {
      return `Paste JSON array. Example:
[
  { "time": 9310, "scramble": "R U R' ...", "penalty": null, "note": "" },
  { "time": 70250, "scramble": "..." }
]
Or:
{ "solves": [ ... ] }`;
    }
    if (mode === "csv") {
      return `Paste CSV/TSV with a header row. Supported columns:
timeMs OR time, scramble, note (or comment), penalty, event, date OR timestampMs
Comma, semicolon or tab separated. Times may be written 11.31+ or DNF(9.31).

Example:
time,scramble,note,penalty,event,date
9.31,"R U R' ...","PB",,333,2026-01-01T12:00:00Z`;
    }
    if (mode === "lines") {
      return `Paste one solve per line.

Accepted time formats:
  9.31
  0.13
  1:10.25
  9310   (ms)
  11.31+ (+2, penalty included)
  DNF or DNF(9.31)

Line format:
  time | scramble | optional note

Example:
  9.31 | R U R' U' | PB
  1:10.25 | F R U ...`;
    }
    return `Auto-detect tries: csTimer JSON → generic JSON → CSV/TSV → lines. You can override the mode above if detection is wrong.`;
  }, [mode]);

  /* ------------------------------ IMPORT PLAN ------------------------------ */

  const resolveDestKind = (fmt) => {
    if (fmt === "cstimer") return destTouched ? destKind : "separate";
    if (destKind === "separate") return defaultDestination?.kind === "new" ? "new" : "existing";
    return destKind;
  };

  const summarizeSources = (parsed) => {
    const byKey = new Map();
    for (const s of parsed) {
      const key = s._importSourceKey;
      if (!key) continue;
      if (!byKey.has(key)) {
        byKey.set(key, {
          key,
          name: s._importSessionName || key,
          event: s.event,
          detected: !!s._importEventDetected,
          count: 0,
        });
      }
      byKey.get(key).count += 1;
    }
    return Array.from(byKey.values());
  };

  const applySourceOverrides = (parsed) =>
    parsed
      .filter((s) => !sourceOverrides[s._importSourceKey]?.skip)
      .map((s) => {
        const overrideEvent = sourceOverrides[s._importSourceKey]?.event;
        return overrideEvent ? { ...s, event: overrideEvent } : s;
      });

  // Every solve leaves here with either _importSessionID (use that session) or
  // _importSessionName (reuse the session with that name in its event, or create it).
  const assignDestinations = (solves, kind) => {
    const newName = destNewName.trim() || defaultNewSessionName;
    return solves.map((s) => {
      const next = { ...s };
      const sourceName = next._importSessionName;
      delete next._importSessionID;
      delete next._importSessionName;

      if (kind === "separate" && sourceName) next._importSessionName = sourceName;
      else if (kind === "new") next._importSessionName = newName;
      else {
        next._importSessionID =
          String(next.event || event).toUpperCase() === String(event).toUpperCase()
            ? existingSessionID
            : "main";
      }
      return next;
    });
  };

  const summarizePlan = (solves) => {
    const rows = new Map();
    for (const s of solves) {
      const ev = String(s.event || event).toUpperCase();
      const id = s._importSessionID ? String(s._importSessionID) : "";
      const name = String(s._importSessionName || "").trim();
      const key = id ? `${ev}|id|${id}` : `${ev}|name|${name.toLowerCase()}`;
      if (!rows.has(key)) {
        const known =
          ev === String(event).toUpperCase()
            ? existingSessionOptions.find((opt) =>
                id
                  ? opt.SessionID === id
                  : opt.SessionName.trim().toLowerCase() === name.toLowerCase()
              )
            : null;
        rows.set(key, {
          key,
          event: ev,
          label: name || known?.SessionName || (id === "main" ? "Main" : id),
          count: 0,
        });
      }
      rows.get(key).count += 1;
    }
    return Array.from(rows.values());
  };

  const buildPlan = () => {
    // Parsing a big export is the slow part, so Preview / Review / Confirm share one parse.
    let cached = parseCacheRef.current;
    if (!cached || cached.raw !== raw || cached.mode !== mode || cached.event !== event) {
      const detected = mode === "auto" ? detectFormat(raw) : mode;
      if (detected === "empty") throw new Error("Paste something first.");
      if (detected === "json_unknown") {
        throw new Error("JSON detected but not recognized. Use JSON array or csTimer export.");
      }

      let rows = [];
      if (detected === "pts-export") rows = parsePtsExport(raw);
      else if (detected === "cstimer") rows = parseCsTimer(raw);
      else if (detected === "json") rows = parseGenericJson(raw);
      else if (detected === "csv") rows = parseDelimited(raw);
      else rows = parseLines(raw);

      cached = { raw, mode, event, fmt: detected, parsed: rows };
      parseCacheRef.current = cached;
    }
    const { fmt, parsed } = cached;

    if (!parsed.length) throw new Error("No valid solves found. Check formatting.");

    const foundSources = fmt === "cstimer" ? summarizeSources(parsed) : [];
    let solves = fmt === "cstimer" ? applySourceOverrides(parsed) : parsed;
    if (!solves.length) throw new Error("Every session is unchecked - nothing to import.");

    solves = dedupeAndStabilize(solves);
    // PTS exports carry their own session IDs and are restored as exported.
    if (fmt !== "pts-export") solves = assignDestinations(solves, resolveDestKind(fmt));

    const byEvent = {};
    for (const s of solves) byEvent[s.event || event] = (byEvent[s.event || event] || 0) + 1;

    const plan = summarizePlan(solves);

    const knownEvents = new Set(
      [...DEFAULT_EVENTS, ...(eventOptions || []), event].map((ev) => String(ev || "").toUpperCase())
    );
    const unknownEvents =
      fmt === "pts-export" ? [] : Object.keys(byEvent).filter((ev) => !knownEvents.has(ev));
    const undated = solves.reduce((count, s) => count + (s._undated ? 1 : 0), 0);

    return {
      fmt,
      solves,
      sources: foundSources,
      meta: {
        detected: fmt,
        total: solves.length,
        byEvent,
        sessions: plan.length,
        plan,
        unknownEvents,
        undated,
      },
    };
  };

  const showPlan = (built) => {
    setSources(built.sources);
    setMeta(built.meta);
    // Preview only; import uses the FULL plan (see handleImport)
    setPreview(built.solves.slice(0, 200));
  };

  const handleBuildPreview = () => {
    setError("");
    setConfirmReady(false);

    try {
      showPlan(buildPlan());
    } catch (e) {
      setPreview([]);
      setMeta(null);
      setError(e?.message || "Failed to parse input.");
    }
  };

  const handleImport = async () => {
    setError("");
    try {
      const built = buildPlan();

      if (!confirmReady) {
        showPlan(built);
        setConfirmReady(true);
        return;
      }

      // IMPORTANT: send ALL parsed solves, not just preview
      await onImport?.({ parsedSolves: built.solves, detectedFormat: built.fmt });
    } catch (e) {
      setError(e?.message || "Import failed to parse input.");
    }
  };

  const handleClearInput = () => {
    setRaw("");
    setSelectedFileName("");
    setSelectedFileSize(0);
    setError("");
    setMeta(null);
    setPreview([]);
  };

  const rawTooLargeToShow = raw.length > RAW_DISPLAY_LIMIT;

  const chooseDestKind = (kind) => {
    setDestKind(kind);
    setDestTouched(true);
  };

  const updateSourceOverride = (key, patch) => {
    setSourceOverrides((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));
  };

  const planFormat = meta?.detected || (mode === "auto" ? "" : mode);
  const isPtsExportPlan = planFormat === "pts-export";
  const activeDestKind = resolveDestKind(planFormat);

  const handleFileSelected = async (file) => {
    if (!file) return;
    setLoadingFile(true);
    setError("");
    setMeta(null);
    setPreview([]);
    setConfirmReady(false);

    try {
      const text = await file.text();
      setRaw(text);
      setSelectedFileName(String(file.name || "").trim());
      setSelectedFileSize(Number(file.size || 0));
    } catch (e) {
      setError(e?.message || "Failed to read file.");
      setSelectedFileName("");
      setSelectedFileSize(0);
    } finally {
      setLoadingFile(false);
    }
  };

  return (
    <div className="importPopup">
      <div className="importPopupContent">
        <span className="closePopup" onClick={onClose}>x</span>

        <div className="importHeader">
          <div className="importTitle">Import Solves</div>
          <div className="importSub">
            Viewing <b>{event}</b>
          </div>
        </div>

        <div className="importModeRow">
          <button
            type="button"
            className={`importModeBtn ${mode === "auto" ? "active" : ""}`}
            onClick={() => setMode("auto")}
          >
            Auto
          </button>
          <button
            type="button"
            className={`importModeBtn ${mode === "lines" ? "active" : ""}`}
            onClick={() => setMode("lines")}
          >
            Lines
          </button>
          <button
            type="button"
            className={`importModeBtn ${mode === "json" ? "active" : ""}`}
            onClick={() => setMode("json")}
          >
            JSON
          </button>
          <button
            type="button"
            className={`importModeBtn ${mode === "pts-export" ? "active" : ""}`}
            onClick={() => setMode("pts-export")}
          >
            PTS Export
          </button>
          <button
            type="button"
            className={`importModeBtn ${mode === "cstimer" ? "active" : ""}`}
            onClick={() => setMode("cstimer")}
          >
            csTimer
          </button>
          <button
            type="button"
            className={`importModeBtn ${mode === "csv" ? "active" : ""}`}
            onClick={() => setMode("csv")}
          >
            CSV/TSV
          </button>
        </div>

        <div className="importHelp">{buildHelpText}</div>

        <div className="importFileRow">
          <label className="importFileButton">
            <input
              type="file"
              accept=".json,.txt,.csv,.tsv,text/plain,application/json,text/csv"
              onChange={(e) => {
                handleFileSelected(e.target.files?.[0] || null);
                e.target.value = "";
              }}
              disabled={busy || loadingFile}
            />
            {loadingFile ? "Loading file..." : "Choose File"}
          </label>
          {selectedFileSummary ? (
            <div className="importFileMeta">{selectedFileSummary}</div>
          ) : (
            <div className="importFileMeta">Or paste data below</div>
          )}
          {raw ? (
            <button
              type="button"
              className="importClearButton"
              onClick={handleClearInput}
              disabled={busy || loadingFile}
            >
              Clear
            </button>
          ) : null}
        </div>

        {selectedFileSize > 5 * 1024 * 1024 ? (
          <div className="importWarning">
            Large files are supported, but browser-side parsing may still feel heavy before upload begins.
          </div>
        ) : null}

        <textarea
          className="importTextarea"
          value={rawTooLargeToShow ? "" : raw}
          readOnly={rawTooLargeToShow}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={
            rawTooLargeToShow
              ? `${selectedFileName || "Pasted data"} is loaded (${raw.length.toLocaleString()} characters) but is too large to show here. Press Preview to check it, or Clear to start over.`
              : mode === "cstimer"
              ? '{"session1":[[[0,7963],"R U ...","",1759353585,"333"]], "properties":{...}}'
              : mode === "json"
                ? '[{ "time": 9310, "scramble": "..." }]'
                : mode === "pts-export"
                  ? '{ "format": "pts-export", "data": { "sessions": [ ... ] } }'
                : mode === "csv"
                  ? "time,scramble,note,penalty,event,date\n9.31,\"R U R' ...\",\"PB\",,333,2026-01-01T12:00:00Z"
                  : "9.31 | R U R' ... | note"
          }
        />

        {error && <div className="importError">{error}</div>}

        {sources.length > 0 ? (
          <div className="importDestWrap">
            <div className="importDestTitle">csTimer sessions</div>
            <div className="importSourceList">
              {sources.map((source) => {
                const override = sourceOverrides[source.key] || {};
                return (
                  <div key={source.key} className="importSourceRow">
                    <label className="importDestCheckbox">
                      <input
                        type="checkbox"
                        checked={!override.skip}
                        disabled={busy}
                        onChange={(e) => updateSourceOverride(source.key, { skip: !e.target.checked })}
                      />
                      <span className="importSourceName">{source.name}</span>
                    </label>
                    <div className="importDestHint">
                      {source.count} solve{source.count === 1 ? "" : "s"}
                      {source.detected ? "" : " · puzzle not detected"}
                    </div>
                    <select
                      className="importDestSelect"
                      value={override.event || source.event}
                      disabled={busy || !!override.skip}
                      onChange={(e) => updateSourceOverride(source.key, { event: e.target.value })}
                    >
                      {eventChoices.map((ev) => (
                        <option key={ev} value={ev}>{ev}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {isPtsExportPlan ? null : (
          <div className="importDestWrap">
            <div className="importDestTitle">Destination</div>

            {sources.length > 0 ? (
              <div className="importDestRow">
                <label className="importDestLabel">
                  <input
                    type="radio"
                    name="importDestKind"
                    checked={activeDestKind === "separate"}
                    disabled={busy}
                    onChange={() => chooseDestKind("separate")}
                  />
                  Keep csTimer sessions
                </label>
                <div className="importDestHint">One session per csTimer session, under its puzzle.</div>
              </div>
            ) : null}

            <div className="importDestRow">
              <label className="importDestLabel">
                <input
                  type="radio"
                  name="importDestKind"
                  checked={activeDestKind === "existing"}
                  disabled={busy}
                  onChange={() => chooseDestKind("existing")}
                />
                Existing session
              </label>
              <select
                className="importDestSelect"
                value={existingSessionID}
                disabled={busy || activeDestKind !== "existing"}
                onChange={(e) => setDestSessionID(e.target.value)}
              >
                {existingSessionOptions.map((s) => (
                  <option key={s.SessionID} value={s.SessionID}>{s.SessionName}</option>
                ))}
              </select>
            </div>

            <div className="importDestRow">
              <label className="importDestLabel">
                <input
                  type="radio"
                  name="importDestKind"
                  checked={activeDestKind === "new"}
                  disabled={busy}
                  onChange={() => chooseDestKind("new")}
                />
                New session
              </label>
              <input
                type="text"
                className="importDestInput"
                value={destNewName}
                maxLength={60}
                placeholder={defaultNewSessionName}
                disabled={busy || activeDestKind !== "new"}
                onChange={(e) => setDestNewName(e.target.value)}
              />
            </div>

            {activeDestKind === "existing" ? (
              <div className="importDestHint">
                Applies to {event} solves. Solves for other puzzles go to that puzzle's Main session.
              </div>
            ) : null}
          </div>
        )}

        {meta && (
          <div className="importMeta" style={{ marginTop: 10, opacity: 0.9 }}>
            <div><b>Detected:</b> {meta.detected}</div>
            <div><b>Total solves:</b> {meta.total}</div>
            {meta.detected === "pts-export" ? <div><b>Sessions:</b> {meta.sessions}</div> : null}
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(meta.byEvent || {}).map(([ev, n]) => (
                <div key={ev}><b>{ev}</b>: {n}</div>
              ))}
            </div>
            {meta.undated > 0 ? (
              <div className="importWarning">
                {meta.undated} solve{meta.undated === 1 ? " has" : "s have"} no date and will be
                stamped with the time of this import.
              </div>
            ) : null}
            {(meta.unknownEvents || []).length > 0 ? (
              <div className="importWarning">
                Unrecognised puzzle code{meta.unknownEvents.length === 1 ? "" : "s"}:{" "}
                {meta.unknownEvents.join(", ")}. Importing will create {meta.unknownEvents.length === 1 ? "it as a new event" : "them as new events"}.
              </div>
            ) : null}
          </div>
        )}

        {confirmReady && meta ? (
          <div className="importConfirmBox">
            <div className="importConfirmTitle">Confirm Import</div>
            <div className="importConfirmText">
              {meta.detected === "pts-export"
                ? `This will import ${meta.total} solves across ${meta.sessions || 0} sessions and preserve the exported session structure where possible.`
                : `This will import ${meta.total} solves into ${meta.sessions || 0} session${meta.sessions === 1 ? "" : "s"}:`}
            </div>
            <div className="importPlanList">
              {(meta.plan || []).slice(0, 40).map((row) => (
                <div key={row.key} className="importPlanRow">
                  <b>{row.event}</b> / {row.label}
                  <span className="importPlanCount">{row.count}</span>
                </div>
              ))}
              {(meta.plan || []).length > 40 ? (
                <div className="importPlanRow">…and {meta.plan.length - 40} more</div>
              ) : null}
            </div>
            <div className="importConfirmText">
              Existing matching sessions will be reused. Missing sessions will be created.
            </div>
          </div>
        ) : null}

        <div className="importActions">
          <button type="button" onClick={handleBuildPreview} disabled={busy}>
            Preview
          </button>
          {confirmReady ? (
            <button
              type="button"
              onClick={() => setConfirmReady(false)}
              disabled={busy}
            >
              Back
            </button>
          ) : null}
          <button
            type="button"
            className="importPrimary"
            onClick={handleImport}
            disabled={busy || !raw.trim()}
            title={!raw.trim() ? "Paste something first" : "Import all parsed solves"}
          >
            {busy ? "Importing…" : confirmReady ? "Confirm Import" : "Review Import"}
          </button>
        </div>

        {busy && importProgress && (
          <div className="importProgressWrap">
            <div className="importProgressLabel">
              {importProgress.label ||
                `Importing ${importProgress.completed || 0}/${importProgress.total || 0}`}
            </div>
            <div className="importProgressTrack">
              <div
                className="importProgressFill"
                style={{
                  width: `${Math.max(
                    0,
                    Math.min(
                      100,
                      ((Number(importProgress.completed) || 0) /
                        Math.max(1, Number(importProgress.total) || 1)) *
                        100
                    )
                  )}%`,
                }}
              />
            </div>
          </div>
        )}

        <div className="importPreviewWrap">
          <div className="importPreviewTitle">Preview (first {preview.length} / {meta?.total ?? preview.length})</div>

          {preview.length === 0 ? (
            <div className="importPreviewEmpty">No preview yet.</div>
          ) : (
            <div className="importPreviewList">
              {preview.map((s, idx) => (
                <div key={idx} className="importPreviewRow">
                  <div className="importPreviewTime">
                    {formatTime(s.penalty === "+2" ? s.time + 2000 : s.time, false, s.penalty)}
                  </div>
                  <div className="importPreviewScramble">{s.scramble || "(no scramble)"}</div>
                  <div className="importPreviewNote">{s.note || ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
