// src/components/Stats/ImportSolvesModal.js
import React, { useEffect, useMemo, useState } from "react";
import "./ImportSolvesModal.css";
import { formatTime } from "../TimeList/TimeUtils";

/**
 * ImportSolvesModal
 *
 * Supports:
 *  - Lines:
 *      time | scramble | optional note
 *      9.31 | R U R' ... | PB
 *      1:10.25 | scramble...
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
}) {
  const [mode, setMode] = useState("auto"); // "auto" | "lines" | "json" | "cstimer" | "csv"
  const [raw, setRaw] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState([]);
  const [meta, setMeta] = useState(null); // parsing summary

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (e.target?.className === "importPopup") onClose?.();
    };
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, [onClose]);

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
    if (t.includes(",") && /time|scramble|penalty|note|date/i.test(t.split(/\r?\n/)[0] || "")) {
      return "csv";
    }

    // Lines default
    return "lines";
  };

  /* ------------------------------- TIME PARSE ------------------------------ */

  const parseTimeToMs = (t) => {
    const s0 = String(t ?? "").trim();
    if (!s0) return null;

    // treat DNF keywords
    const upper = s0.toUpperCase();
    if (upper === "DNF") return Number.MAX_SAFE_INTEGER;

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

    // mm:ss.xx
    if (s0.includes(":")) {
      const [mStr, rest] = s0.split(":");
      const m = Number(mStr);
      const sec = Number(rest);
      if (!Number.isFinite(m) || !Number.isFinite(sec)) return null;
      return Math.round((m * 60 + sec) * 1000);
    }

    // seconds.xx
    const sec = Number(s0);
    if (!Number.isFinite(sec)) return null;
    return Math.round(sec * 1000);
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
      // seconds vs ms
      return d < 2e12 ? d * 1000 : d;
    }
    const s = String(d).trim();
    if (!s) return null;
    const dt = new Date(s);
    if (Number.isFinite(dt.getTime())) return dt.getTime();
    return null;
  };

  /* ------------------------------ DEDUPE + TS ------------------------------ */

  const dedupeAndStabilize = (solves) => {
    const sorted = [...solves].sort((a, b) => {
      const ta = normalizeDate(a.datetime) ?? 0;
      const tb = normalizeDate(b.datetime) ?? 0;
      return ta - tb;
    });

    const seen = new Set();
    const used = new Set();

    const out = [];
    for (const s of sorted) {
      const dtMs = normalizeDate(s.datetime) ?? Date.now();
      const sig = `${s.event || event}|${dtMs}|${s.time}|${s.scramble || ""}|${s.note || ""}|${s.penalty || ""}`;
      if (seen.has(sig)) continue;
      seen.add(sig);

      // ensure unique datetime per event
      let stable = dtMs;
      while (used.has(`${s.event || event}|${stable}`)) stable += 1;
      used.add(`${s.event || event}|${stable}`);

      out.push({
        ...s,
        event: s.event || event,
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

      const ms = parseTimeToMs(timeStr);
      if (ms == null) continue;

      out.push({
        time: ms,
        scramble,
        penalty: null,
        note,
        datetime: new Date().toISOString(),
        tags: {},
      });
    }
    return out;
  };

  const parseGenericJson = (text) => {
    const obj = JSON.parse(text);
    const arr = Array.isArray(obj) ? obj : (Array.isArray(obj?.solves) ? obj.solves : null);
    if (!Array.isArray(arr)) throw new Error("JSON must be an array of solves (or { solves: [...] })");

    const out = [];
    for (const s of arr) {
      const rawTime = s?.time ?? s?.ms ?? s?.Time ?? s?.TimeMs;
      const ms = parseTimeToMs(rawTime);
      if (ms == null) continue;

      const penalty = normalizePenalty(s?.penalty ?? s?.Penalty ?? null);
      const originalTime = s?.originalTime ?? s?.OriginalTime ?? (penalty ? (Number.isFinite(Number(rawTime)) ? Number(rawTime) : null) : null);

      out.push({
        time: ms,
        scramble: s?.scramble ?? s?.Scramble ?? "",
        penalty,
        note: s?.note ?? s?.Note ?? "",
        datetime: s?.datetime ?? s?.DateTime ?? new Date().toISOString(),
        tags: s?.tags ?? s?.Tags ?? {},
        originalTime: originalTime ?? s?.time ?? null,
        event: s?.event ?? s?.Event ?? event,
      });
    }
    return out;
  };

  // Basic delimiter parser (CSV/TSV). Not a full RFC CSV parser — good enough for most exports.
  const parseDelimited = (text) => {
    const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return [];

    const header = lines[0].includes("\t") ? lines[0].split("\t") : lines[0].split(",");
    const headers = header.map((h) => h.trim().toLowerCase());

    const idx = (name) => headers.indexOf(name);

    const iTimeMs = idx("timems");
    const iTime = idx("time");
    const iScramble = idx("scramble");
    const iNote = idx("note");
    const iPenalty = idx("penalty");
    const iEvent = idx("event");
    const iDate = idx("date");
    const iTimestampMs = idx("timestampms");

    const splitRow = (row) => (row.includes("\t") ? row.split("\t") : row.split(","));

    const out = [];
    for (let r = 1; r < lines.length; r++) {
      const cols = splitRow(lines[r]).map((c) => String(c ?? "").trim().replace(/^"(.*)"$/, "$1"));

      const ms =
        (iTimeMs >= 0 && Number.isFinite(Number(cols[iTimeMs])) ? Number(cols[iTimeMs]) : null) ??
        parseTimeToMs(iTime >= 0 ? cols[iTime] : null);

      if (!Number.isFinite(ms)) continue;

      const penalty = normalizePenalty(iPenalty >= 0 ? cols[iPenalty] : null);
      const ev = (iEvent >= 0 ? (cols[iEvent] || event) : event) || event;

      let dtMs = null;
      if (iTimestampMs >= 0 && Number.isFinite(Number(cols[iTimestampMs]))) dtMs = Number(cols[iTimestampMs]);
      if (!dtMs && iDate >= 0) dtMs = normalizeDate(cols[iDate]);
      const datetime = dtMs ? new Date(dtMs).toISOString() : new Date().toISOString();

      out.push({
        time: ms,
        scramble: iScramble >= 0 ? (cols[iScramble] || "") : "",
        penalty,
        note: iNote >= 0 ? (cols[iNote] || "") : "",
        datetime,
        tags: {},
        event: ev,
      });
    }
    return out;
  };

  // csTimer parser for the export you posted
  const parseCsTimer = (text) => {
    const obj = JSON.parse(text);
    const sessionKeys = Object.keys(obj).filter((k) => /^session\d+$/.test(k));

    // optional: session names from properties.sessionData (stringified JSON)
    let sessionNameByNumber = {};
    try {
      const sessionDataStr = obj?.properties?.sessionData;
      if (typeof sessionDataStr === "string") {
        const sd = JSON.parse(sessionDataStr);
        for (const [num, info] of Object.entries(sd || {})) {
          const name = info?.name;
          if (name != null) sessionNameByNumber[num] = String(name);
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
      const prettySession = sessionNameByNumber[sessionNum] || `Session ${sessionNum}`;

      for (const row of sessionArr) {
        if (!Array.isArray(row)) continue;

        // row[0] typically [flag,timeMs]
        const timePart = row[0];
        const scramble = typeof row[1] === "string" ? row[1] : "";
        const note = typeof row[2] === "string" ? row[2] : "";

        let ms = null;
        let penalty = null;

        if (Array.isArray(timePart) && typeof timePart[1] === "number") {
          ms = timePart[1];
          const flag = timePart[0];
          if (flag === 0) penalty = null;
          else if (flag === 1) penalty = "+2";
          else if (flag === 2 || flag === -1) penalty = "DNF";
        }

        if (!Number.isFinite(ms)) continue;

        // date is usually unix seconds in row[3]
        const dtMs = normalizeDate(row[3]) ?? Date.now();
        const datetime = new Date(dtMs).toISOString();

        // event may be last element (e.g. "333")
        let ev = event || "333";
        for (let i = row.length - 1; i >= 0; i--) {
          if (typeof row[i] === "string" && row[i].length <= 12) {
            const v = row[i].trim();
            // accept common ids
            if (
              /^(222|333|444|555|666|777|333OH|333BLD|SQ1|SKEWB|CLOCK|PYRAMINX|MEGAMINX)$/.test(v)
            ) {
              ev = v;
              break;
            }
          }
        }

        out.push({
          time: ms,
          scramble,
          penalty,
          note,
          datetime,
          tags: {},
          originalTime: ms, // keep for your penalty system later if needed
          event: ev,
          // optional metadata in case you want it later:
          _importSource: "cstimer",
          _importSessionName: prettySession,
        });
      }
    }

    return out;
  };

  const buildHelpText = useMemo(() => {
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
timeMs OR time, scramble, note, penalty, event, date OR timestampMs

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
  DNF    (treated as DNF)

Line format:
  time | scramble | optional note

Example:
  9.31 | R U R' U' | PB
  1:10.25 | F R U ...`;
    }
    return `Auto-detect tries: csTimer JSON → generic JSON → CSV/TSV → lines. You can override the mode above if detection is wrong.`;
  }, [mode]);

  const handleBuildPreview = () => {
    setError("");
    setMeta(null);

    try {
      const fmt = mode === "auto" ? detectFormat(raw) : mode;
      if (fmt === "empty") {
        setPreview([]);
        setError("Paste something first.");
        return;
      }
      if (fmt === "json_unknown") {
        setPreview([]);
        setError("JSON detected but not recognized. Use JSON array or csTimer export.");
        return;
      }

      let parsed = [];
      if (fmt === "cstimer") parsed = parseCsTimer(raw);
      else if (fmt === "json") parsed = parseGenericJson(raw);
      else if (fmt === "csv") parsed = parseDelimited(raw);
      else parsed = parseLines(raw);

      parsed = dedupeAndStabilize(parsed);

      if (!parsed.length) {
        setPreview([]);
        setError("No valid solves found. Check formatting.");
        return;
      }

      // summary
      const byEvent = {};
      for (const s of parsed) byEvent[s.event || event] = (byEvent[s.event || event] || 0) + 1;

      setMeta({
        detected: fmt,
        total: parsed.length,
        byEvent,
      });

      // Preview only; import should use FULL parsed (see handleImport)
      setPreview(parsed.slice(0, 200));
    } catch (e) {
      setPreview([]);
      setMeta(null);
      setError(e?.message || "Failed to parse input.");
    }
  };

  const handleImport = async () => {
    setError("");
    try {
      const fmt = mode === "auto" ? detectFormat(raw) : mode;
      let parsed = [];
      if (fmt === "cstimer") parsed = parseCsTimer(raw);
      else if (fmt === "json") parsed = parseGenericJson(raw);
      else if (fmt === "csv") parsed = parseDelimited(raw);
      else parsed = parseLines(raw);

      parsed = dedupeAndStabilize(parsed);

      if (!parsed.length) {
        setError("Nothing to import — build a preview first.");
        return;
      }

      // IMPORTANT: send ALL parsed solves, not just preview
      await onImport?.({ parsedSolves: parsed, detectedFormat: fmt });
    } catch (e) {
      setError(e?.message || "Import failed to parse input.");
    }
  };

  return (
    <div className="importPopup">
      <div className="importPopupContent">
        <span className="closePopup" onClick={onClose}>x</span>

        <div className="importHeader">
          <div className="importTitle">Import Solves</div>
          <div className="importSub">
            Destination: <b>{event}</b> / <b>{sessionID}</b>
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

        <textarea
          className="importTextarea"
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder={
            mode === "cstimer"
              ? '{"session1":[[[0,7963],"R U ...","",1759353585,"333"]], "properties":{...}}'
              : mode === "json"
                ? '[{ "time": 9310, "scramble": "..." }]'
                : mode === "csv"
                  ? "time,scramble,note,penalty,event,date\n9.31,\"R U R' ...\",\"PB\",,333,2026-01-01T12:00:00Z"
                  : "9.31 | R U R' ... | note"
          }
        />

        {error && <div className="importError">{error}</div>}

        {meta && (
          <div className="importMeta" style={{ marginTop: 10, opacity: 0.9 }}>
            <div><b>Detected:</b> {meta.detected}</div>
            <div><b>Total solves:</b> {meta.total}</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {Object.entries(meta.byEvent || {}).map(([ev, n]) => (
                <div key={ev}><b>{ev}</b>: {n}</div>
              ))}
            </div>
          </div>
        )}

        <div className="importActions">
          <button type="button" onClick={handleBuildPreview} disabled={busy}>
            Preview
          </button>
          <button
            type="button"
            className="importPrimary"
            onClick={handleImport}
            disabled={busy || !raw.trim()}
            title={!raw.trim() ? "Paste something first" : "Import all parsed solves"}
          >
            {busy ? "Importing…" : "Import"}
          </button>
        </div>

        <div className="importPreviewWrap">
          <div className="importPreviewTitle">Preview (first {preview.length} / {meta?.total ?? preview.length})</div>

          {preview.length === 0 ? (
            <div className="importPreviewEmpty">No preview yet.</div>
          ) : (
            <div className="importPreviewList">
              {preview.map((s, idx) => (
                <div key={idx} className="importPreviewRow">
                  <div className="importPreviewTime">
                    {formatTime(s.time, false, s.penalty)}
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
