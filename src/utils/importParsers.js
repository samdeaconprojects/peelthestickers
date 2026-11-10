// Pure parsers for the solve import flow: every format the import modal accepts, with no React.

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

export const normalizeEventCode = (value) => {
  const code = String(value ?? "").trim().toUpperCase();
  return EVENT_ALIASES[code] || code;
};

const csTimerScrambleTypeToEvent = (scrType) => {
  const type = String(scrType ?? "").trim().toLowerCase();
  for (const [pattern, eventID] of CSTIMER_SCRAMBLE_EVENTS) {
    if (pattern.test(type)) return eventID;
  }
  return null;
};

// Text pasted or saved by some editors starts with a byte order mark, which JSON.parse rejects.
const parseJsonText = (text) => JSON.parse(String(text ?? "").replace(/^\uFEFF/, ""));

// Splits an upload into chunks small enough for the API's JSON body limit. Scrambles and notes
// are what vary, so a run of long comments gets smaller chunks instead of a rejected request.
export const chunkImportSolves = (solves, { maxCount = 1500, maxChars = 6000000 } = {}) => {
  const chunks = [];
  let chunk = [];
  let chars = 0;
  for (const solve of solves) {
    const size = 300 + String(solve?.scramble ?? "").length + String(solve?.note ?? "").length;
    if (chunk.length > 0 && (chunk.length >= maxCount || chars + size > maxChars)) {
      chunks.push(chunk);
      chunk = [];
      chars = 0;
    }
    chunk.push(solve);
    chars += size;
  }
  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
};

export const detectFormat = (text) => {
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

export const dedupeAndStabilize = (solves, event) => {
  // Dates are read once up front: parsing them inside the comparator costs seconds on a big import.
  const sorted = solves
    .map((solve) => ({ solve, ms: normalizeDate(solve.datetime) ?? 0 }))
    .sort((a, b) => a.ms - b.ms);

  const seen = new Set();
  const lastUsed = new Map();

  const out = [];
  for (const { solve: s, ms } of sorted) {
    const ev = normalizeEventCode(s.event || event);
    const dtMs = ms || Date.now();

    // Solves with no date of their own can't be told apart from a repeat of the same time.
    if (!s._undated) {
      const sig = `${ev}|${dtMs}|${s.time}|${s.scramble || ""}|${s.note || ""}|${s.penalty || ""}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
    }

    // Ensure unique datetimes within a source session (input is date-sorted, so one step past the
    // last is free). Per source, so a solve's stamp doesn't depend on which other sessions came
    // along: the stamp is part of its import identity, and re-imports must map to the same one.
    const stableKey = `${ev}|${s._importSourceKey || s._importSessionID || ""}`;
    const stable = Math.max(dtMs, (lastUsed.get(stableKey) ?? -Infinity) + 1);
    lastUsed.set(stableKey, stable);

    out.push({
      ...s,
      event: ev,
      datetime: new Date(stable).toISOString(),
    });
  }
  return out;
};

export const parseLines = (text) => {
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

export const parseGenericJson = (text, event) => {
  const obj = parseJsonText(text);
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

export const parsePtsExport = (text, event) => {
  const obj = parseJsonText(text);
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
export const parseDelimited = (text, event) => {
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

export const parseCsTimer = (text, event) => {
  const obj = parseJsonText(text);
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
    // Older csTimer exports hold each session as a JSON string rather than an array.
    let sessionArr = obj[sk];
    if (typeof sessionArr === "string") {
      try {
        sessionArr = JSON.parse(sessionArr);
      } catch {
        continue;
      }
    }
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

      if (!Number.isFinite(ms) || ms < 0) continue;

      // date is usually unix seconds in row[3]; very old exports leave it out or store 0.
      const dtMs = normalizeDate(row[3]) || null;
      const datetime = new Date(dtMs ?? Date.now()).toISOString();

      out.push({
        time: ms,
        scramble,
        penalty,
        note,
        datetime,
        ...(dtMs ? {} : { _undated: true }),
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
