import React, { useMemo } from "react";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import "./StatsSummary.css";

const calculateMedianTime = (times) => {
  const sorted = times.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const calculateStandardDeviation = (times) => {
  if (times.length < 2) return null;
  const avg = times.reduce((s, t) => s + t, 0) / times.length;
  const variance = times.reduce((s, t) => s + Math.pow(t - avg, 2), 0) / times.length;
  return Math.sqrt(variance);
};

function bestWindowAverageDNFAware(timesWithDNF, n) {
  // Uses calculateAverage on sliding windows of the provided list
  // (DNF-aware because list can contain "DNF")
  if (!Array.isArray(timesWithDNF) || timesWithDNF.length < n) return null;

  let best = Infinity;
  for (let i = 0; i <= timesWithDNF.length - n; i++) {
    const window = timesWithDNF.slice(i, i + n);
    const out = calculateAverage(window, true);
    const avg = out?.average;
    if (typeof avg === "number" && isFinite(avg) && avg < best) best = avg;
  }
  return isFinite(best) ? best : null;
}

function bestWindowAverageNumericOnly(numericTimes, n) {
  if (!Array.isArray(numericTimes) || numericTimes.length < n) return null;

  let best = Infinity;
  for (let i = 0; i <= numericTimes.length - n; i++) {
    const window = numericTimes.slice(i, i + n);
    const out = calculateAverage(window, true);
    const avg = out?.average;
    if (typeof avg === "number" && isFinite(avg) && avg < best) best = avg;
  }
  return isFinite(best) ? best : null;
}

function safeFmt(msOrNA) {
  if (msOrNA == null) return "—";
  return formatTime(msOrNA);
}

function StatsSummary({ solves, overallStats }) {
  const computed = useMemo(() => {
    const input = Array.isArray(solves) ? solves : [];
    if (input.length === 0) return null;

    // timesWithDNF: DNF -> "DNF", else numeric ms
    const timesWithDNF = input.map((s) => (s?.penalty === "DNF" ? "DNF" : s?.time));

    // numeric-only times for mean/median/stddev and larger bests
    const numericTimes = input
      .filter((s) => s?.penalty !== "DNF" && typeof s?.time === "number" && isFinite(s.time))
      .map((s) => s.time);

    const mean =
      numericTimes.length > 0
        ? numericTimes.reduce((sum, t) => sum + t, 0) / numericTimes.length
        : null;

    const median = numericTimes.length > 0 ? calculateMedianTime(numericTimes) : null;

    const stdDev = numericTimes.length > 1 ? calculateStandardDeviation(numericTimes) : null;

    const bestSingle = numericTimes.length > 0 ? Math.min(...numericTimes) : null;

    // ---------- Right-side mini panels ----------
    // "Current" in Figma: mo3/ao5/ao12/ao50/ao100 (computed from the *visible solves*)
    const current = {
      mo3: timesWithDNF.length >= 3 ? calculateAverage(timesWithDNF.slice(-3), true)?.average ?? null : null,
      ao5: timesWithDNF.length >= 5 ? calculateAverage(timesWithDNF.slice(-5), true)?.average ?? null : null,
      ao12: timesWithDNF.length >= 12 ? calculateAverage(timesWithDNF.slice(-12), true)?.average ?? null : null,
      ao50: numericTimes.length >= 50 ? calculateAverage(numericTimes.slice(-50), true)?.average ?? null : null,
      ao100: numericTimes.length >= 100 ? calculateAverage(numericTimes.slice(-100), true)?.average ?? null : null,
    };

    // "Best in view" (best sliding window inside visible solves)
    const bestInView = {
      mo3: bestWindowAverageDNFAware(timesWithDNF, 3),
      ao5: bestWindowAverageDNFAware(timesWithDNF, 5),
      ao12: bestWindowAverageDNFAware(timesWithDNF, 12),
      ao50: bestWindowAverageNumericOnly(numericTimes, 50),
      ao100: bestWindowAverageNumericOnly(numericTimes, 100),
    };

    // "Overall" (prefer precomputed overallStats when available; fall back to view)
    const overall = {
      single: overallStats?.bestSingleMs ?? bestSingle,
      mean: overallStats?.overallAvgMs ?? mean,
      ao5: overallStats?.bestAo5Ms ?? null,
      ao12: overallStats?.bestAo12Ms ?? null,
      // If you later add these to SESSIONSTATS, they’ll auto-show
      ao50: overallStats?.bestAo50Ms ?? null,
      ao100: overallStats?.bestAo100Ms ?? null,
    };

    return {
      mean,
      median,
      stdDev,
      bestSingle,
      current,
      bestInView,
      overall,
      solveCountView: input.length,
    };
  }, [solves, overallStats]);

  if (!computed) return <div className="statsSummaryEmpty">No solves available</div>;

  const totalSolveCount =
    overallStats && overallStats.solveCount != null ? overallStats.solveCount : computed.solveCountView;

  const meanToDisplay =
    overallStats && overallStats.overallAvgMs != null ? overallStats.overallAvgMs : computed.mean;

  const bestSingleToDisplay =
    overallStats && overallStats.bestSingleMs != null ? overallStats.bestSingleMs : computed.bestSingle;

  return (
    <div className="statsSummaryBar">
      {/* LEFT: count */}
      <div className="ssCount">
        <div className="ssCountValue">{totalSolveCount}</div>
        <div className="ssCountLabel">solves</div>

        <div className="ssBestSingle">
          <div className="ssBestSingleValue">{safeFmt(bestSingleToDisplay)}</div>
          <div className="ssBestSingleLabel">best single</div>
        </div>
      </div>

      {/* MIDDLE: mean/median/stddev */}
      <div className="ssMainStats">
        <div className="ssStat">
          <div className="ssStatLabel">MEAN</div>
          <div className="ssStatValue">{safeFmt(meanToDisplay)}</div>
        </div>

        <div className="ssStat">
          <div className="ssStatLabel">MEDIAN</div>
          <div className="ssStatValue">{safeFmt(computed.median)}</div>
        </div>

        <div className="ssStat">
          <div className="ssStatLabel">ST. DEV</div>
          <div className="ssStatValue">{safeFmt(computed.stdDev)}</div>
        </div>
      </div>

      {/* RIGHT: 3 mini panels (Figma-like) */}
      <div className="ssPanels">
        <div className="ssPanel ssPanel--current">
          <div className="ssPanelTitle">Current</div>
          <div className="ssPanelGrid">
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.current.mo3)}</span><span className="ssLbl">mo3</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.current.ao5)}</span><span className="ssLbl">ao5</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.current.ao12)}</span><span className="ssLbl">ao12</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.current.ao50)}</span><span className="ssLbl">ao50</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.current.ao100)}</span><span className="ssLbl">ao100</span></div>
          </div>
        </div>

        <div className="ssPanel ssPanel--best">
          <div className="ssPanelTitle">Best in view</div>
          <div className="ssPanelGrid">
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.bestInView.mo3)}</span><span className="ssLbl">mo3</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.bestInView.ao5)}</span><span className="ssLbl">ao5</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.bestInView.ao12)}</span><span className="ssLbl">ao12</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.bestInView.ao50)}</span><span className="ssLbl">ao50</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.bestInView.ao100)}</span><span className="ssLbl">ao100</span></div>
          </div>
        </div>

        <div className="ssPanel ssPanel--overall">
          <div className="ssPanelTitle">Overall</div>
          <div className="ssPanelGrid">
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.overall.single)}</span><span className="ssLbl">single</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.overall.mean)}</span><span className="ssLbl">mean</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.overall.ao5)}</span><span className="ssLbl">ao5</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.overall.ao12)}</span><span className="ssLbl">ao12</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.overall.ao50)}</span><span className="ssLbl">ao50</span></div>
            <div className="ssRow"><span className="ssKey">{safeFmt(computed.overall.ao100)}</span><span className="ssLbl">ao100</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(StatsSummary);
