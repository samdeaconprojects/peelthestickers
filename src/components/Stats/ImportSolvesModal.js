// src/components/Stats/ImportSolvesModal.js
import React, { useEffect, useMemo, useRef, useState } from "react";
import "./ImportSolvesModal.css";
import { formatTime } from "../TimeList/TimeUtils";
import { DEFAULT_EVENTS, isRelayEventId } from "../../defaultEvents";
import {
  dedupeAndStabilize,
  detectFormat,
  parseCsTimer,
  parseDelimited,
  parseGenericJson,
  parseLines,
  parsePtsExport,
} from "../../utils/importParsers";

// Above this the raw text stays out of the textarea; rendering it there freezes the tab.
const RAW_DISPLAY_LIMIT = 200000;

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
      if (detected === "pts-export") rows = parsePtsExport(raw, event);
      else if (detected === "cstimer") rows = parseCsTimer(raw, event);
      else if (detected === "json") rows = parseGenericJson(raw, event);
      else if (detected === "csv") rows = parseDelimited(raw, event);
      else rows = parseLines(raw);

      cached = { raw, mode, event, fmt: detected, parsed: rows };
      parseCacheRef.current = cached;
    }
    const { fmt, parsed } = cached;

    if (!parsed.length) throw new Error("No valid solves found. Check formatting.");

    const foundSources = fmt === "cstimer" ? summarizeSources(parsed) : [];
    let solves = fmt === "cstimer" ? applySourceOverrides(parsed) : parsed;
    if (!solves.length) throw new Error("Every session is unchecked - nothing to import.");

    solves = dedupeAndStabilize(solves, event);
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
      // Past about 512 MB the browser can't hold the file as text, and Chrome gives
      // back an empty string instead of an error.
      if (file.size > 0 && !text) {
        throw new Error(
          "This file is too large for the browser to read (over about 500 MB). Export fewer sessions at a time and import each file."
        );
      }
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
