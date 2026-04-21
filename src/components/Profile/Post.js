// src/components/Profile/Post.js
import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../PuzzleSVGs/RubiksCubeSVG';
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import NameTag from './NameTag';
import { getScrambledFaces } from '../cubeStructure';
import { currentEventToString } from "../../components/scrambleUtils";
import { calculateAverage, formatTime } from '../TimeList/TimeUtils';
import TimeItem from '../TimeList/TimeItem';
import StatSharePost from './StatSharePost';

/* --- helper: add alpha to hex color --- */
const withAlpha = (hex, alpha = 0.12) => {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  let h = String(hex).replace('#', '').trim();
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// NxN (and 3x3 variants) only
const isNxNEvent = (ev) => {
  const e = String(ev || '').toLowerCase();
  return (
    e === '222' ||
    e === '333' ||
    e === '444' ||
    e === '555' ||
    e === '666' ||
    e === '777' ||
    e === '333oh' ||
    e === '333bld'
  );
};

/* --- Date formatting --- */
const formatPostDateTime = (value) => {
  const d = value instanceof Date ? value : new Date(value);
  if (!d || isNaN(d.getTime())) return String(value ?? '');

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays =
    Math.round((startOfToday - startOfThatDay) / (1000 * 60 * 60 * 24));

  const timeStr = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  if (diffDays === 0) return `Today at ${timeStr}`;
  if (diffDays === 1) return `Yesterday at ${timeStr}`;

  const dateStr = d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  // ⬇️ no "at" here
  return `${dateStr} ${timeStr}`;
};

const getComparableSolveTime = (solve) => {
  if (!solve) return Number.POSITIVE_INFINITY;
  if (String(solve?.penalty || "").toUpperCase() === "DNF") return Number.POSITIVE_INFINITY;

  const time = Number(solve?.time);
  if (!Number.isFinite(time) || time < 0) return Number.POSITIVE_INFINITY;
  return time;
};

const getAverageBestWorst = (solves = []) => {
  const comparable = (Array.isArray(solves) ? solves : []).map((solve, index) => ({
    index,
    time: getComparableSolveTime(solve),
  }));

  const finite = comparable.filter((entry) => Number.isFinite(entry.time));
  const best = new Set();
  const worst = new Set();

  if (finite.length) {
    const minTime = Math.min(...finite.map((entry) => entry.time));
    finite.forEach((entry) => {
      if (entry.time === minTime) best.add(entry.index);
    });
  }

  if (comparable.length) {
    const maxTime = Math.max(...comparable.map((entry) => entry.time));
    comparable.forEach((entry) => {
      if (entry.time === maxTime) worst.add(entry.index);
    });
  }

  return { best, worst };
};

const getFirstMatchingIndex = (set, size) => {
  if (!(set instanceof Set)) return -1;
  for (let index = 0; index < size; index += 1) {
    if (set.has(index)) return index;
  }
  return -1;
};

const DEFAULT_BOLD_PERF_COLORS = {
  fastest: "#00ff00",
  faster: "#00e676",
  "middle-fast": "#ffff00",
  slower: "#ffa500",
  slowest: "#ff0000",
};

const buildRank01Map = (items) => {
  const valid = items
    .filter((it) => typeof it.time === "number" && isFinite(it.time))
    .map((it) => ({ key: it.key, time: it.time }));

  const n = valid.length;
  const out = {};
  if (n <= 1) {
    valid.forEach((v) => {
      out[v.key] = 0;
    });
    return out;
  }

  valid.sort((a, b) => a.time - b.time);

  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && valid[j + 1].time === valid[i].time) j++;

    const avgRank = (i + j) / 2;
    const rank01 = avgRank / (n - 1);

    for (let k = i; k <= j; k++) out[valid[k].key] = rank01;
    i = j + 1;
  }

  return out;
};

const getPerfClassByRank01 = (rank01) => {
  if (!isFinite(rank01)) return "";
  if (rank01 <= 0.2) return "fastest";
  if (rank01 <= 0.4) return "faster";
  if (rank01 <= 0.6) return "middle-fast";
  if (rank01 <= 0.8) return "slower";
  return "slowest";
};

const buildPerfBorderStyle = (perfClass, borderStyle = "solid") => {
  const borderColor = DEFAULT_BOLD_PERF_COLORS[perfClass];
  if (!borderColor) return undefined;
  return {
    border: `2px ${borderStyle} ${borderColor}`,
  };
};

const getPostHeadlineTime = (solves = []) => {
  const items = Array.isArray(solves) ? solves.filter(Boolean) : [];
  if (!items.length) return null;
  if (items.length === 1) return items[0]?.time ?? null;

  const result = calculateAverage(
    items.map((solve) =>
      String(solve?.penalty || "").toUpperCase() === "DNF" ? "DNF" : solve?.time
    ),
    true
  );

  return result?.average ?? null;
};

function Post({
  name,
  picture,
  user,
  date,
  solveList = [],
  postColor,
  onClick,
  note = "",
  postType = "solve",
  statShare = null,
}) {
  const resolvedPostType = statShare ? "stat-share" : postType;
  const primary = solveList[0] || {};
  const { event, scramble } = primary;
  const singleOrAvg = solveList.length > 1 ? `Average of ${solveList.length}` : 'Single';
  const headlineTime = getPostHeadlineTime(solveList);
  const eventStr = currentEventToString(event || '333');
  const showAverageSolveList =
    resolvedPostType !== "stat-share" && solveList.length > 1;
  const averageBestWorst = getAverageBestWorst(solveList);
  const bestAverageIndex = getFirstMatchingIndex(averageBestWorst.best, solveList.length);
  const worstAverageIndex = getFirstMatchingIndex(averageBestWorst.worst, solveList.length);
  const bestAverageSolve = bestAverageIndex >= 0 ? solveList[bestAverageIndex] : null;
  const worstAverageSolve = worstAverageIndex >= 0 ? solveList[worstAverageIndex] : null;
  const averageRankMap = buildRank01Map(
    solveList.map((solve, index) => ({
      key: index,
      time: Number.isFinite(getComparableSolveTime(solve)) ? getComparableSolveTime(solve) : null,
    }))
  );
  const averageFiniteTimes = solveList
    .map((solve) => {
      const value = getComparableSolveTime(solve);
      return Number.isFinite(value) ? value : null;
    })
    .filter((value) => value != null);
  const averageRangeMin = averageFiniteTimes.length ? Math.min(...averageFiniteTimes) : null;
  const averageRangeMax = averageFiniteTimes.length ? Math.max(...averageFiniteTimes) : null;

  // Make sure NameTag always gets something useful
  const safeUser = user || { Name: name, ProfilePic: picture };

  const nxn = isNxNEvent(event);
  const prettyDate = formatPostDateTime(date);
  const trimmedNote = String(note || "").trim();
  const postMeta = (
    <div className="dateAndName">
      <div className="postDate">{prettyDate}</div>
      <div className="postNameAndPicture">
        <NameTag
          name={name}
          picture={picture}
          user={safeUser}
          size="xs"
          variant="profile-corner"
          reverse={true}
        />
      </div>
    </div>
  );

  return (
    <div
      className="post"
      style={{ border: `2px solid ${withAlpha(postColor, 0.5)}` }}
      onClick={onClick}
    >
      {resolvedPostType === "stat-share" ? (
        <>
          <div className="titleAndContent">
            <StatSharePost note={trimmedNote} statShare={statShare} shareColor={postColor} />
          </div>

          {postMeta}
        </>
      ) : (
        <>
          <div className="titleAndContent">
            {trimmedNote ? <div className="postCaption">{trimmedNote}</div> : null}
            <div className="postTitle">
              <div
                className={`postTitleCube ${
                  nxn
                    ? "postTitleCube--nxn"
                    : `postTitleCube--other postTitleCube--${String(event || "333").toLowerCase()}`
                }`}
              >
                {nxn ? (
                  <RubiksCubeSVG
                    className="postCube"
                    n={event || "333"}
                    faces={getScrambledFaces(scramble || "", event || "333")}
                    isMusicPlayer={false}
                    isTimerCube={false}
                  />
                ) : (
                  <PuzzleSVG
                    event={event || "333"}
                    scramble={scramble || ""}
                    isMusicPlayer={false}
                    isTimerCube={false}
                  />
                )}
              </div>

              <div className="titleText">
                <span className="titleTextLabel">
                  {eventStr} {singleOrAvg}
                </span>
                <span className="titleTextSeparator"> - </span>
                <span className="titleTextValue">
                  {headlineTime != null ? formatTime(headlineTime, solveList.length > 1) : '--'}
                </span>
              </div>
            </div>
          </div>

          {showAverageSolveList ? (
            <div className="postAverageSnapshot" aria-label="Average solves">
              {solveList.length <= 12 ? (
                <div
                  className={`postAverageSnapshotGrid ${
                    solveList.length <= 5 ? "postAverageSnapshotGrid--5" : "postAverageSnapshotGrid--12"
                  }`}
                >
                  {solveList.map((solve, index) => {
                    const solveMs = getComparableSolveTime(solve);
                    const isBest = averageBestWorst.best.has(index);
                    const isWorst = averageBestWorst.worst.has(index);
                    const perfClass = getPerfClassByRank01(averageRankMap[index]);

                    return (
                      <div
                        key={`${solve?.datetime || solve?.createdAt || index}-${index}`}
                        className="postAverageSnapshotCell"
                      >
                        <TimeItem
                          ms={Number.isFinite(solveMs) ? solveMs : undefined}
                          time={
                            Number.isFinite(solveMs)
                              ? undefined
                              : solve?.time != null
                                ? formatTime(solve.time, false, solve?.penalty)
                                : "--"
                          }
                          penalty={solve?.penalty}
                          rangeMin={averageRangeMin ?? undefined}
                          rangeMax={averageRangeMax ?? undefined}
                          className={`postAverageSnapshotTime ${isBest ? "row-border-min" : ""} ${
                            isWorst ? "row-border-max" : ""
                          }`}
                          style={buildPerfBorderStyle(perfClass, "solid")}
                          disablePerformanceClass={true}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="postAverageSnapshotSummary">
                  {bestAverageSolve ? (
                    <div className="postAverageSnapshotSummaryItem">
                      <TimeItem
                        ms={Number.isFinite(getComparableSolveTime(bestAverageSolve))
                          ? getComparableSolveTime(bestAverageSolve)
                          : undefined}
                        time={
                          Number.isFinite(getComparableSolveTime(bestAverageSolve))
                            ? undefined
                            : bestAverageSolve?.time != null
                              ? formatTime(bestAverageSolve.time, false, bestAverageSolve?.penalty)
                              : "--"
                        }
                        penalty={bestAverageSolve?.penalty}
                        className="postAverageSnapshotTime row-border-min"
                        style={buildPerfBorderStyle("fastest", "dotted")}
                        disablePerformanceClass={true}
                      />
                    </div>
                  ) : null}

                  {worstAverageSolve ? (
                    <div className="postAverageSnapshotSummaryItem">
                      <TimeItem
                        ms={Number.isFinite(getComparableSolveTime(worstAverageSolve))
                          ? getComparableSolveTime(worstAverageSolve)
                          : undefined}
                        time={
                          Number.isFinite(getComparableSolveTime(worstAverageSolve))
                            ? undefined
                            : worstAverageSolve?.time != null
                              ? formatTime(worstAverageSolve.time, false, worstAverageSolve?.penalty)
                              : "--"
                        }
                        penalty={worstAverageSolve?.penalty}
                        className="postAverageSnapshotTime row-border-max"
                        style={buildPerfBorderStyle("slowest", "dotted")}
                        disablePerformanceClass={true}
                      />
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {postMeta}
        </>
      )}
    </div>
  );
}

export default Post;
