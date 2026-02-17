import React, { useMemo } from "react";
import { calculateAverage, formatTime } from "../TimeList/TimeUtils";
import "./StatsSummary.css";

function solveMsAdjusted(s) {
  if (!s) return null;

  const base =
    typeof s.originalTime === "number" && isFinite(s.originalTime)
      ? s.originalTime
      : typeof s.time === "number" && isFinite(s.time)
      ? s.time
      : null;

  if (base == null) return null;

  if (s.penalty === "+2") return base + 2000;
  if (s.penalty === "DNF") return null;

  return base;
}

function toTimesForWCA(solves) {
  return (Array.isArray(solves) ? solves : []).map((s) => {
    if (!s) return "DNF";

    const base =
      typeof s.originalTime === "number" && isFinite(s.originalTime)
        ? s.originalTime
        : typeof s.time === "number" && isFinite(s.time)
        ? s.time
        : null;

    if (s.penalty === "DNF") return "DNF";
    if (base == null) return "DNF";
    if (s.penalty === "+2") return base + 2000;
    return base;
  });
}

function meanMs(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function medianMs(nums) {
  if (!nums.length) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stdDevMs(nums) {
  if (nums.length < 2) return null;
  const avg = meanMs(nums);
  const variance = nums.reduce((sum, x) => sum + (x - avg) ** 2, 0) / nums.length;
  return Math.sqrt(variance);
}

function mo3FromTimes(times3) {
  if (times3.length < 3) return null;
  if (times3.some((t) => t === "DNF")) return "DNF";
  const nums = times3.filter((t) => typeof t === "number" && isFinite(t));
  if (nums.length !== 3) return null;
  return meanMs(nums);
}

function bestMo3(times) {
  if (times.length < 3) return null;
  let best = Infinity;
  let found = false;
  for (let i = 0; i <= times.length - 3; i++) {
    const v = mo3FromTimes(times.slice(i, i + 3));
    if (typeof v === "number" && isFinite(v)) {
      found = true;
      best = Math.min(best, v);
    }
  }
  return found ? best : null;
}

function bestAoUsingCalculateAverage(times, n) {
  if (times.length < n) return null;
  let best = Infinity;
  let found = false;

  for (let i = 0; i <= times.length - n; i++) {
    const window = times.slice(i, i + n);
    const out = calculateAverage(window, true)?.average;
    if (out === "DNF" || out == null) continue;
    if (typeof out === "number" && isFinite(out)) {
      found = true;
      best = Math.min(best, out);
    }
  }

  return found ? best : null;
}

function currentAoUsingCalculateAverage(times, n) {
  if (times.length < n) return null;
  const window = times.slice(-n);
  const out = calculateAverage(window, true)?.average;
  if (out === "DNF") return "DNF";
  return out ?? null;
}

function bestRollingMean(nums, n) {
  if (nums.length < n) return null;
  let best = Infinity;
  let found = false;

  let sum = 0;
  for (let i = 0; i < nums.length; i++) {
    sum += nums[i];
    if (i >= n) sum -= nums[i - n];
    if (i >= n - 1) {
      const avg = sum / n;
      if (isFinite(avg)) {
        found = true;
        best = Math.min(best, avg);
      }
    }
  }

  return found ? best : null;
}

function displayMaybe(msOrDnf) {
  if (msOrDnf === "DNF") return "DNF";
  if (msOrDnf == null) return "—";
  return formatTime(msOrDnf);
}

function StatsSummary({ solves, overallStats }) {
  const computed = useMemo(() => {
    const input = Array.isArray(solves) ? solves : [];
    if (input.length === 0) return null;

    const numeric = input
      .map(solveMsAdjusted)
      .filter((x) => typeof x === "number" && isFinite(x));

    const timesForWCA = toTimesForWCA(input);

    const bestSingleInView = numeric.length ? Math.min(...numeric) : null;

    const meanInView = meanMs(numeric);
    const medianInView = medianMs(numeric);
    const stdDevInView = stdDevMs(numeric);

    const current = {
      mo3: mo3FromTimes(timesForWCA.slice(-3)),
      ao5: currentAoUsingCalculateAverage(timesForWCA, 5),
      ao12: currentAoUsingCalculateAverage(timesForWCA, 12),
      ao50: numeric.length >= 50 ? meanMs(numeric.slice(-50)) : null,
      ao100: numeric.length >= 100 ? meanMs(numeric.slice(-100)) : null,
    };

    const bestInView = {
      mo3: bestMo3(timesForWCA),
      ao5: bestAoUsingCalculateAverage(timesForWCA, 5),
      ao12: bestAoUsingCalculateAverage(timesForWCA, 12),
      ao50: numeric.length >= 50 ? bestRollingMean(numeric, 50) : null,
      ao100: numeric.length >= 100 ? bestRollingMean(numeric, 100) : null,
    };

    return {
      bestSingleInView,
      meanInView,
      medianInView,
      stdDevInView,
      current,
      bestInView,
    };
  }, [solves]);

  if (!computed) {
    return <div className="statsSummaryEmpty">No solves available</div>;
  }

  // ✅ in-view count (last 100 by default)
  const inViewCount = Array.isArray(solves) ? solves.length : 0;

  // ✅ overall only from cached stats
  const overall = {
    solveCount: overallStats?.solveCount ?? null,
    single: overallStats?.bestSingleMs ?? null,
    mean: overallStats?.overallAvgMs ?? overallStats?.meanMs ?? null,
    ao5: overallStats?.bestAo5Ms ?? overallStats?.bestAo5 ?? null,
    ao12: overallStats?.bestAo12Ms ?? overallStats?.bestAo12 ?? null,
    ao50: overallStats?.bestAo50Ms ?? overallStats?.bestAo50 ?? null,
    ao100: overallStats?.bestAo100Ms ?? overallStats?.bestAo100 ?? null,
  };

  const meanToShow = overall.mean ?? computed.meanInView;
  const bestSingleToShow = overall.single ?? computed.bestSingleInView;

  return (
    <div className="statsSummaryBar">
      <div className="ssCount">
        <div>
          <div className="ssCountValue">{inViewCount}</div>
          <div className="ssCountLabel">solves</div>
        </div>

        <div className="ssBestSingle">
          <div className="ssBestSingleValue">{displayMaybe(bestSingleToShow)}</div>
          <div className="ssBestSingleLabel">BEST SINGLE</div>
        </div>
      </div>

      <div className="ssMainStats">
        <div>
          <div className="ssStatLabel">MEAN</div>
          <div className="ssStatValue">{displayMaybe(meanToShow)}</div>
        </div>
        <div>
          <div className="ssStatLabel">MEDIAN</div>
          <div className="ssStatValue">{displayMaybe(computed.medianInView)}</div>
        </div>
        <div>
          <div className="ssStatLabel">ST. DEV</div>
          <div className="ssStatValue">{displayMaybe(computed.stdDevInView)}</div>
        </div>
      </div>

      <div className="ssPanels">
        <div className="ssPanel ssPanel--current">
          <div className="ssPanelTitle">Current</div>
          <div className="ssPanelGrid">
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.current.mo3)}</div>
              <div className="ssLbl">mo3</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.current.ao5)}</div>
              <div className="ssLbl">ao5</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.current.ao12)}</div>
              <div className="ssLbl">ao12</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.current.ao50)}</div>
              <div className="ssLbl">ao50</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.current.ao100)}</div>
              <div className="ssLbl">ao100</div>
            </div>
          </div>
        </div>

        <div className="ssPanel ssPanel--best">
          <div className="ssPanelTitle">Best in view</div>
          <div className="ssPanelGrid">
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.bestInView.mo3)}</div>
              <div className="ssLbl">mo3</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.bestInView.ao5)}</div>
              <div className="ssLbl">ao5</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.bestInView.ao12)}</div>
              <div className="ssLbl">ao12</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.bestInView.ao50)}</div>
              <div className="ssLbl">ao50</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(computed.bestInView.ao100)}</div>
              <div className="ssLbl">ao100</div>
            </div>
          </div>
        </div>

        <div className="ssPanel ssPanel--overall">
          <div className="ssPanelTitle">Overall</div>
          <div className="ssPanelGrid">
            <div className="ssRow">
              <div className="ssKey">{overall.solveCount ?? "—"}</div>
              <div className="ssLbl">solves</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(overall.single)}</div>
              <div className="ssLbl">single</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(overall.mean)}</div>
              <div className="ssLbl">mean</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(overall.ao5)}</div>
              <div className="ssLbl">ao5</div>
            </div>
            <div className="ssRow">
              <div className="ssKey">{displayMaybe(overall.ao12)}</div>
              <div className="ssLbl">ao12</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(StatsSummary);
