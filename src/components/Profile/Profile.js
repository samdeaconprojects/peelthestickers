import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import "./Profile.css";
import { useDbStatus } from "../../contexts/DbStatusContext";
import Post from "./Post";
import PostDetail from "./PostDetail";
import StatSharePost from "./StatSharePost";
import ProfileHeader from "./ProfileHeader";
import NameTag from "./NameTag";
import LineChart from "../Stats/LineChart";
import EventCountPieChart from "../Stats/EventCountPieChart";
import BarChart from "../Stats/BarChart";
import TimeTable from "../Stats/TimeTable";
import PercentBar from "../Stats/PercentBar";
import StatsSummary from "../Stats/StatsSummary";
import AllEventsTimeMatrix from "../Stats/AllEventsTimeMatrix";
import { calculateAverage } from "../TimeList/TimeUtils";
import { EVENT_KEYBINDING_LABELS } from "../../utils/keybindings";
import { getProfileChartStyle } from "../../utils/profileChartStyle";
import { getPosts } from "../../services/getPosts";
import { getUser } from "../../services/getUser";
import { updateUser } from "../../services/updateUser";
import { updatePostComments } from "../../services/updatePostComments";
import { getSessions } from "../../services/getSessions";
import { getLastNSolvesByEvent, getLastNSolvesBySession, getSolvesBySession } from "../../services/getSolvesBySession";

const PROFILE_SOLVE_QUERY_LIMIT = 200;

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

const isInteractiveFeedTarget = (target) =>
  !!target?.closest?.(
    "button, input, select, textarea, a, .statsToggleBtn, .statsMiniBtn, .chartScaleInput, .lineChartDot, [data-interactive='solve-point'], svg .timeLineSegment, .timeLineSegment"
  );

function formatLineChartEventLabel(eventValue) {
  const eventKey = String(eventValue || "").toUpperCase();
  return EVENT_KEYBINDING_LABELS[eventKey] || String(eventValue || "Stats");
}

function formatLineChartSessionLabel(sessionValue) {
  const normalized = String(sessionValue || "").trim();
  if (!normalized) return "";
  if (normalized.toLowerCase() === "all") return "All Sessions";
  return normalized;
}

function buildLineChartTitle(title, eventValue, sessionValue) {
  if (String(title || "").trim()) return title;
  const eventText = formatLineChartEventLabel(eventValue);
  const sessionText = formatLineChartSessionLabel(sessionValue);
  return sessionText ? `${eventText} · ${sessionText}` : eventText;
}

function normalizeSolve(item, fallbackIndex = null) {
  if (!item) return null;

  const created =
    item.CreatedAt ||
    (typeof item.SK === "string" && item.SK.startsWith("SOLVE#")
      ? item.SK.slice(6)
      : null);

  const isDNF = item?.IsDNF === true || item?.Penalty === "DNF";
  const rawTimeMs = Number.isFinite(item?.RawTimeMs) ? item.RawTimeMs : null;
  const finalTimeMs = isDNF
    ? null
    : Number.isFinite(item?.FinalTimeMs)
      ? item.FinalTimeMs
      : rawTimeMs;

  return {
    solveRef: item?.SK || null,
    fullIndex: Number.isFinite(Number(item?.fullIndex))
      ? Number(item.fullIndex)
      : Number.isFinite(Number(fallbackIndex))
        ? Number(fallbackIndex)
        : null,
    time: isDNF ? Number.MAX_SAFE_INTEGER : finalTimeMs,
    rawTime: rawTimeMs,
    originalTime: rawTimeMs,
    scramble: item?.Scramble || "",
    event: item?.Event || "",
    penalty: item?.Penalty ?? null,
    note: item?.Note || "",
    datetime: created,
    tags: item?.Tags || {},
  };
}

function aggregateProfileStats(statsMap = {}) {
  let solveCountTotal = 0;
  let solveCountIncluded = 0;
  let dnfCount = 0;
  let plus2Count = 0;
  let sumFinalTimeMs = 0;
  let bestSingleMs = null;

  for (const stats of Object.values(statsMap || {})) {
    if (!stats || typeof stats !== "object") continue;
    solveCountTotal += Number(stats.SolveCountTotal || 0);
    solveCountIncluded += Number(stats.SolveCountIncluded || 0);
    dnfCount += Number(stats.DNFCount || 0);
    plus2Count += Number(stats.Plus2Count || 0);
    sumFinalTimeMs += Number(stats.SumFinalTimeMs || 0);

    const single = Number(stats.BestSingleMs);
    if (Number.isFinite(single)) {
      bestSingleMs = bestSingleMs == null ? single : Math.min(bestSingleMs, single);
    }
  }

  return {
    SolveCountTotal: solveCountTotal,
    SolveCountIncluded: solveCountIncluded,
    DNFCount: dnfCount,
    Plus2Count: plus2Count,
    SumFinalTimeMs: sumFinalTimeMs,
    MeanMs: solveCountIncluded > 0 ? Math.round(sumFinalTimeMs / solveCountIncluded) : null,
    BestSingleMs: bestSingleMs,
  };
}

function buildAllEventsBreakdown(statsByEvent = {}) {
  return Object.entries(statsByEvent)
    .map(([event, sessionMap]) => ({
      event,
      stats: aggregateProfileStats(sessionMap || {}),
    }))
    .filter((entry) => Number(entry?.stats?.SolveCountTotal || 0) > 0)
    .sort((a, b) => {
      const aCount = Number(a?.stats?.SolveCountTotal || 0);
      const bCount = Number(b?.stats?.SolveCountTotal || 0);
      return bCount - aCount || String(a.event).localeCompare(String(b.event));
    });
}

function getPostTimestamp(post) {
  const raw =
    post?.DateTime ||
    post?.date ||
    post?.CreatedAt ||
    (typeof post?.SK === "string" && post.SK.startsWith("POST#") ? post.SK.slice(5) : null) ||
    null;
  const ts = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(ts) ? ts : 0;
}

const DEFAULT_VISIBLE_STATS = [
  { chart: "statsSummary", scope: "all-events", viewMode: "standard" },
  { chart: "lineChart", event: "333", session: "all" },
  { chart: "pieChart" },
];

const DEFAULT_STAT_EVENT = "333";
const PROFILE_TIME_MATRIX_ORDER = [
  "222",
  "333",
  "444",
  "555",
  "666",
  "777",
  "333OH",
  "CLOCK",
  "MEGAMINX",
  "PYRAMINX",
  "SKEWB",
  "SQ1",
  "333BLD",
  "444BLD",
  "555BLD",
  "333MULTIBLD",
  "333FEW",
];
const PROFILE_TIME_MATRIX_ORDER_INDEX = new Map(
  PROFILE_TIME_MATRIX_ORDER.map((event, index) => [event, index])
);

function chartNeedsEventSession(item) {
  return item && item.chart !== "pieChart" && item.chart !== "statsSummary" && item.scope !== "all-events";
}

function chartNeedsSummaryEvent(item) {
  return item && item.chart === "statsSummary";
}

function createStatConfig(type, fallbackEvent = DEFAULT_STAT_EVENT) {
  switch (type) {
    case "statsSummary":
      return { chart: "statsSummary", scope: "all-events", event: fallbackEvent, session: "all", viewMode: "standard" };
    case "lineChart":
      return { chart: "lineChart", event: fallbackEvent, session: "all", viewMode: "standard" };
    case "percentBar":
      return { chart: "percentBar", event: fallbackEvent, session: "all" };
    case "pieChart":
      return { chart: "pieChart" };
    case "barChart":
      return { chart: "barChart", event: fallbackEvent, session: "all" };
    case "timeTable":
      return { chart: "timeTable", event: fallbackEvent, session: "all" };
    default:
      return { chart: "lineChart", event: fallbackEvent, session: "all", viewMode: "standard" };
  }
}

function isSavedSolveCard(item) {
  return item?.chart === "solveCard";
}

function isSavedAverageCard(item) {
  return item?.chart === "averageCard";
}

function isSavedProfileCard(item) {
  return isSavedSolveCard(item) || isSavedAverageCard(item);
}

function finiteMetric(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function aggregateProfileMatrixStats(sessionMap = {}, { mainOnly = false } = {}) {
  let solveCount = 0;
  let singleBest = null;
  let singleWorst = null;
  let ao5Best = null;
  let ao5Worst = null;
  let ao12Best = null;
  let ao12Worst = null;
  const refs = {
    singleBest: null,
    singleWorst: null,
    ao5Best: null,
    ao5Worst: null,
    ao12Best: null,
    ao12Worst: null,
  };
  const entries = mainOnly
    ? Object.entries(sessionMap || {}).filter(([sessionID]) => String(sessionID || "main") === "main")
    : Object.entries(sessionMap || {});

  for (const [, stats] of entries) {
    if (!stats || typeof stats !== "object") continue;
    solveCount += Number(stats.SolveCountTotal || 0);

    const nextSingleBest = finiteMetric(stats.BestSingleMs);
    const nextSingleWorst = finiteMetric(stats.WorstSingleMs);
    const nextAo5Best = finiteMetric(stats.BestAo5Ms);
    const nextAo5Worst = finiteMetric(stats.WorstAo5Ms);
    const nextAo12Best = finiteMetric(stats.BestAo12Ms);
    const nextAo12Worst = finiteMetric(stats.WorstAo12Ms);

    if (nextSingleBest != null && (singleBest == null || nextSingleBest < singleBest)) {
      singleBest = nextSingleBest;
      refs.singleBest = stats.BestSingleSolveSK || null;
    }
    if (nextSingleWorst != null && (singleWorst == null || nextSingleWorst > singleWorst)) {
      singleWorst = nextSingleWorst;
      refs.singleWorst = stats.WorstSingleSolveSK || null;
    }
    if (nextAo5Best != null && (ao5Best == null || nextAo5Best < ao5Best)) {
      ao5Best = nextAo5Best;
      refs.ao5Best = stats.BestAo5StartSolveSK || null;
    }
    if (nextAo5Worst != null && (ao5Worst == null || nextAo5Worst > ao5Worst)) {
      ao5Worst = nextAo5Worst;
      refs.ao5Worst = stats.WorstAo5StartSolveSK || null;
    }
    if (nextAo12Best != null && (ao12Best == null || nextAo12Best < ao12Best)) {
      ao12Best = nextAo12Best;
      refs.ao12Best = stats.BestAo12StartSolveSK || null;
    }
    if (nextAo12Worst != null && (ao12Worst == null || nextAo12Worst > ao12Worst)) {
      ao12Worst = nextAo12Worst;
      refs.ao12Worst = stats.WorstAo12StartSolveSK || null;
    }
  }

  return {
    solveCount,
    singleBest,
    singleWorst,
    ao5Best,
    ao5Worst,
    ao12Best,
    ao12Worst,
    refs,
  };
}

function getSolveDisplayMs(solve) {
  if (!solve) return null;
  const penalty = String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
  if (penalty === "DNF") return null;
  const base =
    Number.isFinite(Number(solve?.time)) ? Number(solve.time)
      : Number.isFinite(Number(solve?.finalTimeMs)) ? Number(solve.finalTimeMs)
      : Number.isFinite(Number(solve?.rawTimeMs)) ? Number(solve.rawTimeMs)
      : null;
  if (!Number.isFinite(base)) return null;
  return penalty === "+2" ? base + 2000 : base;
}

function getSolveValueForAverage(solve) {
  const penalty = String(solve?.penalty ?? solve?.Penalty ?? "").toUpperCase();
  if (penalty === "DNF") return "DNF";
  const value = getSolveDisplayMs(solve);
  return Number.isFinite(value) ? value : "DNF";
}

function computeWindowAverage(solves, size) {
  const items = Array.isArray(solves) ? solves : [];
  if (items.length !== size) return null;
  return calculateAverage(items.map(getSolveValueForAverage), true)?.average ?? null;
}

function findWindowByStartRef(solves, startSolveRef, size) {
  if (!startSolveRef) return null;
  const items = Array.isArray(solves) ? solves : [];
  const startIndex = items.findIndex(
    (solve) => String(solve?.solveRef ?? solve?.SK ?? "") === String(startSolveRef)
  );
  if (startIndex < 0) return null;
  const slice = items.slice(startIndex, startIndex + size);
  return slice.length === size ? slice : null;
}

function findWindowForMetric(solves, size, variant) {
  const items = Array.isArray(solves) ? solves : [];
  if (items.length < size) return null;

  let selected = null;
  let selectedValue = null;

  for (let i = 0; i <= items.length - size; i += 1) {
    const slice = items.slice(i, i + size);
    const value = computeWindowAverage(slice, size);
    if (!Number.isFinite(value)) continue;

    if (
      selected == null ||
      (variant === "best" && value < selectedValue) ||
      (variant === "worst" && value > selectedValue)
    ) {
      selected = slice;
      selectedValue = value;
    }
  }

  return selected;
}

function findSingleSolve(solves, variant) {
  const items = Array.isArray(solves) ? solves : [];
  if (!items.length) return null;

  let selected = null;
  let selectedValue = null;

  items.forEach((solve) => {
    const value = getSolveDisplayMs(solve);
    if (!Number.isFinite(value)) return;
    if (
      selected == null ||
      (variant === "best" && value < selectedValue) ||
      (variant === "worst" && value > selectedValue)
    ) {
      selected = solve;
      selectedValue = value;
    }
  });

  return selected;
}

function compareProfileMatrixItems(a, b) {
  const aEvent = String(a?.event || "").trim().toUpperCase();
  const bEvent = String(b?.event || "").trim().toUpperCase();
  const aRank = PROFILE_TIME_MATRIX_ORDER_INDEX.get(aEvent);
  const bRank = PROFILE_TIME_MATRIX_ORDER_INDEX.get(bEvent);

  if (aRank != null && bRank != null) return aRank - bRank;
  if (aRank != null) return -1;
  if (bRank != null) return 1;
  return aEvent.localeCompare(bEvent);
}

const STAT_LIBRARY = [
  {
    type: "statsSummary",
    title: "Overview Summary",
  },
  {
    type: "lineChart",
    title: "Progress Chart",
  },
  {
    type: "percentBar",
    title: "Distribution",
  },
  {
    type: "pieChart",
    title: "Event Breakdown",
  },
  {
    type: "barChart",
    title: "Bar Chart",
  },
  {
    type: "timeTable",
    title: "Time Table",
  },
];

function getStatCardTitle(item) {
  if (!item) return "Stat Card";
  switch (item.chart) {
    case "solveCard":
      return `${item.event || DEFAULT_STAT_EVENT} Solve`;
    case "averageCard":
      return `${item.event || DEFAULT_STAT_EVENT} Average`;
    case "statsSummary":
      return item.scope === "all-events" ? "Overview Summary" : `${item.event || DEFAULT_STAT_EVENT} Summary`;
    case "lineChart":
      return `${item.event || DEFAULT_STAT_EVENT} Progress`;
    case "percentBar":
      return `${item.event || DEFAULT_STAT_EVENT} Distribution`;
    case "pieChart":
      return "Event Breakdown";
    case "barChart":
      return `${item.event || DEFAULT_STAT_EVENT} Bar Chart`;
    case "timeTable":
      return `${item.event || DEFAULT_STAT_EVENT} Time Table`;
    default:
      return "Stat Card";
  }
}

function getProfileStatItemClass(chart) {
  switch (chart) {
    case "solveCard":
      return "profileStatsItem profileStatsItem--savedSolve";
    case "averageCard":
      return "profileStatsItem profileStatsItem--savedAverage";
    case "statsSummary":
      return "profileStatsItem profileStatsItem--summary";
    case "lineChart":
      return "profileStatsItem profileStatsItem--line";
    case "percentBar":
      return "profileStatsItem profileStatsItem--distribution";
    case "barChart":
      return "profileStatsItem profileStatsItem--bar";
    case "timeTable":
      return "profileStatsItem profileStatsItem--table";
    case "pieChart":
      return "profileStatsItem profileStatsItem--pie";
    default:
      return "profileStatsItem";
  }
}

function getProfileStatsChromeStyle(profile) {
  const style = getProfileChartStyle(profile);
  const primary = style?.primary || profile?.Color || profile?.color || "#2EC4B6";
  const accent = style?.accent || primary;
  const stops = Array.isArray(style?.stops) ? style.stops : [primary, accent, primary];

  return {
    "--profile-stats-card-border": withAlpha(primary, 0.82),
    "--profile-stats-card-border-soft": withAlpha(primary, 0.32),
    "--profile-stats-card-shadow": withAlpha(primary, 0.18),
    "--profile-stats-card-glow": withAlpha(accent, 0.18),
    "--profile-stats-card-bg-top": withAlpha(stops[1] || primary, 0.1),
    "--profile-stats-card-bg-bottom": withAlpha(stops[0] || primary, 0.18),
  };
}

function Profile({ user, setUser, deletePost: deletePostProp, showPlayerBar = true }) {
  const { runDb } = useDbStatus();
  const { userID: paramID } = useParams();
  const isOwn = !paramID || paramID === user?.UserID;
  const viewID = isOwn ? user?.UserID : paramID;

  const isFriend = user?.Friends?.includes(viewID);

  const [viewedProfile, setViewedProfile] = useState(null);
  const [viewedSessions, setViewedSessions] = useState({});
  const [viewedSessionCatalog, setViewedSessionCatalog] = useState({});
  const [viewedSessionStats, setViewedSessionStats] = useState({});
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [selectedProfileCard, setSelectedProfileCard] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  const [visibleStats, setVisibleStats] = useState(DEFAULT_VISIBLE_STATS);
  const [draftVisibleStats, setDraftVisibleStats] = useState(DEFAULT_VISIBLE_STATS);
  const [editingStats, setEditingStats] = useState(false);
  const pendingSolveRequestsRef = useRef(new Set());

  const formatPostDate = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (!d || isNaN(d.getTime())) return String(value ?? "");

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfThatDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfToday - startOfThatDay) / (1000 * 60 * 60 * 24));

    const timeStr = d.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    if (diffDays === 0) return `Today at ${timeStr}`;
    if (diffDays === 1) return `Yesterday at ${timeStr}`;

    const dateStr = d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    return `${dateStr} ${timeStr}`;
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (isOwn) {
        setViewedProfile(user);
        const nextVisibleStats =
          Array.isArray(user?.VisibleStats) && user.VisibleStats.length > 0
            ? user.VisibleStats
            : DEFAULT_VISIBLE_STATS;
        setVisibleStats(nextVisibleStats);
        setDraftVisibleStats(nextVisibleStats);
      } else {
        try {
          const prof = await getUser(viewID);
          setViewedProfile({ ...prof, UserID: viewID });
          const nextVisibleStats =
            Array.isArray(prof?.VisibleStats) && prof.VisibleStats.length > 0
              ? prof.VisibleStats
              : DEFAULT_VISIBLE_STATS;
          setVisibleStats(nextVisibleStats);
          setDraftVisibleStats(nextVisibleStats);
        } catch (err) {
          console.error("Error loading profile:", err);
        }
      }
    };
    loadProfile();
  }, [viewID, user, isOwn]);

  useEffect(() => {
    const loadSessions = async () => {
      if (!viewID) return;

      try {
        const sessionItems = await getSessions(viewID);

        const solveCache = {};
        const catalog = {};
        const statsByEvent = {};

        for (const session of sessionItems) {
          const ev = (session.Event || "UNKNOWN").toUpperCase();
          const sid = session.SessionID || "main";

          if (!catalog[ev]) catalog[ev] = [];
          if (!statsByEvent[ev]) statsByEvent[ev] = {};

          if (!catalog[ev].includes(sid)) catalog[ev].push(sid);
          statsByEvent[ev][sid] = session.Stats || null;
        }

        setViewedSessions(solveCache);
        setViewedSessionCatalog(catalog);
        setViewedSessionStats(statsByEvent);
      } catch (err) {
        console.error("Failed to fetch sessions:", err);
      }
    };

    loadSessions();
  }, [viewID]);

  useEffect(() => {
    if (!viewID) return;

    const needsSolves = (item) =>
      item &&
      !isSavedProfileCard(item) &&
      item.chart !== "pieChart" &&
      item.chart !== "statsSummary" &&
      item.scope !== "all-events" &&
      item.event;

    const requests = visibleStats
      .filter(needsSolves)
      .map((item) => ({
        event: String(item.event || "").toUpperCase(),
        session: item.session || "all",
      }))
      .filter(({ event }) => Boolean(event));

    const uniqueRequests = requests.filter(
      (entry, index, arr) =>
        arr.findIndex((item) => item.event === entry.event && item.session === entry.session) === index
    );

    uniqueRequests.forEach(({ event, session }) => {
      const cacheKey = `${event}::${session}`;
      if (Array.isArray(viewedSessions[cacheKey])) return;
      if (pendingSolveRequestsRef.current.has(cacheKey)) return;

      pendingSolveRequestsRef.current.add(cacheKey);

      (async () => {
        try {
          const solves =
            session === "all"
              ? await getLastNSolvesByEvent(viewID, event, PROFILE_SOLVE_QUERY_LIMIT)
              : await getLastNSolvesBySession(viewID, event, session, PROFILE_SOLVE_QUERY_LIMIT);

          setViewedSessions((prev) => {
            if (Array.isArray(prev[cacheKey])) return prev;
            return {
              ...prev,
              [cacheKey]: (solves || [])
                .map((solve, index) => normalizeSolve(solve, index))
                .filter(Boolean),
            };
          });
        } catch (err) {
          console.error("Error fetching profile solves for", event, session, err);
          setViewedSessions((prev) => {
            if (Array.isArray(prev[cacheKey])) return prev;
            return { ...prev, [cacheKey]: [] };
          });
        } finally {
          pendingSolveRequestsRef.current.delete(cacheKey);
        }
      })();
    });
  }, [viewID, viewedSessions, visibleStats]);

  useEffect(() => {
    const loadPosts = async () => {
      try {
        const fresh = await getPosts(viewID);
        setPosts(fresh);
      } catch (err) {
        console.error("Failed to fetch posts:", err);
      }
    };
    if (viewID) loadPosts();
  }, [viewID]);

  const handleDeletePost = async (ts) => {
    try {
      await deletePostProp(ts);
      const fresh = await getPosts(viewID);
      setPosts(fresh);
      setSelectedPost(null);
    } catch (err) {
      console.error("Failed to delete post:", err);
    }
  };

  const handleAddComment = async (comment) => {
    if (!selectedPost) return;
    const ts = selectedPost.DateTime || selectedPost.date;
    const newComment = {
      text: comment,
      author:
        user?.Username ||
        user?.Name ||
        user?.username ||
        user?.name ||
        "You",
      userID: user?.UserID || "",
      color: user?.Color || user?.color || "#FFFFFF",
      profileEvent: user?.ProfileEvent || user?.profileEvent || "333",
      profileScramble: user?.ProfileScramble || user?.profileScramble || "",
      createdAt: new Date().toISOString(),
    };
    const updatedComments = [...(selectedPost.Comments || []), newComment];
    const updated = { ...selectedPost, Comments: updatedComments };

    setPosts((pl) => pl.map((p) => (p === selectedPost ? updated : p)));
    setSelectedPost(updated);

    const ownerID = viewID;
    try {
      await runDb("Updating comments", () =>
        updatePostComments(ownerID, ts, updatedComments)
      );
    } catch (err) {
      console.error("Failed to save comment:", err);
    }
  };

  const handleAddFriend = async () => {
    if (!user || isOwn) return;
    const current = user.Friends || [];
    if (!current.includes(viewID)) {
      const updatedList = [...current, viewID];
      try {
        await runDb("Adding friend", () => updateUser(user.UserID, { Friends: updatedList }));
        setUser((prev) => ({ ...prev, Friends: updatedList }));
      } catch (err) {
        console.error("Failed to add friend:", err);
      }
    }
  };

  const handleSaveStats = async () => {
    try {
      await runDb("Saving profile stats", () =>
        updateUser(user.UserID, { VisibleStats: draftVisibleStats })
      );
      setVisibleStats(draftVisibleStats);
      setUser((prev) => ({ ...prev, VisibleStats: draftVisibleStats }));
      setEditingStats(false);
    } catch (err) {
      console.error("Failed to update visible stats:", err);
    }
  };

  const openStatsEditor = () => {
    setDraftVisibleStats(visibleStats);
    setEditingStats(true);
  };

  const closeStatsEditor = () => {
    setDraftVisibleStats(visibleStats);
    setEditingStats(false);
  };

  const solvesForConfig = useMemo(() => {
    return (item) => {
      if (!item?.event) return [];
      const ev = String(item.event).toUpperCase();
      const sid = item.session || "all";
      return viewedSessions[`${ev}::${sid}`] || [];
    };
  }, [viewedSessions]);

  const allEventsBreakdown = useMemo(
    () => buildAllEventsBreakdown(viewedSessionStats),
    [viewedSessionStats]
  );
  const profileTimeMatrixItems = useMemo(
    () =>
      Object.entries(viewedSessionStats || {})
        .map(([event, sessionMap]) => {
          const aggregate = aggregateProfileMatrixStats(sessionMap || {}, { mainOnly: true });
          return {
            event,
            mainOnly: true,
            solveCount: aggregate.solveCount,
            singleBest: aggregate.singleBest,
            singleWorst: aggregate.singleWorst,
            ao5Best: aggregate.ao5Best,
            ao5Worst: aggregate.ao5Worst,
            ao12Best: aggregate.ao12Best,
            ao12Worst: aggregate.ao12Worst,
            refs: aggregate.refs,
          };
        })
        .filter((item) => Number(item.solveCount || 0) > 0)
        .sort(compareProfileMatrixItems),
    [viewedSessionStats]
  );
  const availableEvents = useMemo(
    () => Object.keys(viewedSessionCatalog).sort((a, b) => String(a).localeCompare(String(b))),
    [viewedSessionCatalog]
  );
  const defaultStatEvent = availableEvents[0] || DEFAULT_STAT_EVENT;

  const updateDraftStat = (index, updater) => {
    setDraftVisibleStats((prev) =>
      prev.map((item, idx) => (idx === index ? updater(item) : item))
    );
  };

  const addDraftStat = (type) => {
    setDraftVisibleStats((prev) => [...prev, createStatConfig(type, defaultStatEvent)]);
  };

  const removeDraftStat = (index) => {
    setDraftVisibleStats((prev) => prev.filter((_, idx) => idx !== index));
  };

  const moveDraftStat = (index, direction) => {
    setDraftVisibleStats((prev) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(targetIndex, 0, moved);
      return next;
    });
  };

  const recentPosts = useMemo(
    () => [...posts].sort((a, b) => getPostTimestamp(b) - getPostTimestamp(a)),
    [posts]
  );
  const openSavedProfileCard = (item) => {
    if (!item) return;
    setSelectedProfileCard(item);
  };

  const handleProfileMatrixStatSelect = async (selection) => {
    if (!selection || !viewID) return;

    const event = String(selection?.event || "").trim().toUpperCase();
    const variant = String(selection?.variant || "").trim().toLowerCase();
    const metricKey = String(selection?.metricKey || "").trim().toLowerCase();
    if (!event || !["best", "worst"].includes(variant)) return;

    const sourceItem =
      profileTimeMatrixItems.find((item) => String(item?.event || "").trim().toUpperCase() === event) || null;
    const refKey = `${metricKey}${variant === "best" ? "Best" : "Worst"}`;
    const startSolveRef = sourceItem?.refs?.[refKey] || null;
    const scopeSessions = ["main"];

    const results = await Promise.all(
      scopeSessions.map(async (scopeSessionID) => {
        const items = await getSolvesBySession(viewID, event, scopeSessionID);
        return (items || []).map((solve, index) => normalizeSolve(solve, index)).filter(Boolean);
      })
    );

    const mergedSolves = results
      .flat()
      .sort((a, b) => new Date(a?.datetime || "").getTime() - new Date(b?.datetime || "").getTime());

    if (!mergedSolves.length) return;

    if (metricKey === "single") {
      const solve =
        (startSolveRef
          ? mergedSolves.find((item) => String(item?.solveRef || "") === String(startSolveRef))
          : null) || findSingleSolve(mergedSolves, variant);

      if (!solve) return;

      setSelectedProfileCard({
        chart: "solveCard",
        solve: { ...solve, __readOnly: true },
        createdAt: solve.datetime || new Date().toISOString(),
        note: "",
      });
      return;
    }

    const windowSize = metricKey === "ao12" ? 12 : metricKey === "ao5" ? 5 : 0;
    if (!windowSize) return;

    const solvesForWindow =
      (startSolveRef ? findWindowByStartRef(mergedSolves, startSolveRef, windowSize) : null) ||
      findWindowForMetric(mergedSolves, windowSize, variant);

    if (!solvesForWindow?.length) return;

    setSelectedProfileCard({
      chart: "averageCard",
      solves: solvesForWindow.map((solve) => ({ ...solve, __readOnly: true })),
      createdAt: solvesForWindow[solvesForWindow.length - 1]?.datetime || new Date().toISOString(),
      note: "",
    });
  };

  if (!viewedProfile) return null;
  if (!viewedProfile.UserID) return <div>Loading profile…</div>;
  const profileStatsChromeStyle = getProfileStatsChromeStyle(viewedProfile);
  return (
    <div className="Page profilePage" style={profileStatsChromeStyle}>
      <ProfileHeader
        user={viewedProfile}
        currentUser={user}
        setCurrentUser={setUser}
        sessionStats={viewedSessionStats}
        isOwn={isOwn}
        onEditStats={openStatsEditor}
      />

      {!isOwn && (
        <button
          className="addFriendButton"
          onClick={handleAddFriend}
          disabled={isFriend}
        >
          {isFriend ? "Friend" : "Add Friend"}
        </button>
      )}

      {editingStats && (
        <div className="statsEditorOverlay" onClick={closeStatsEditor}>
          <div className="statsEditor" onClick={(e) => e.stopPropagation()}>
            <div className="statsEditorHeader">
              <div>
                <h3>Customize stats</h3>
                <p>Add stat cards, then reorder and tune the ones already on the page.</p>
              </div>
              <button type="button" className="statsEditorClose" onClick={closeStatsEditor}>
                Close
              </button>
            </div>

            <div className="statsEditorToolbar">
              <div className="statsEditorToolbarTitle">Add stat</div>
              <div className="statsEditorLibrary">
                {STAT_LIBRARY.map((entry) => (
                  <button
                    key={entry.type}
                    type="button"
                    className="statsLibraryCard"
                    onClick={() => addDraftStat(entry.type)}
                  >
                    + {entry.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="statsEditorList">
              {draftVisibleStats.map((item, idx) => (
                <div key={`${item.chart}-${idx}`} className="statsEditorItem">
                  <div className="statsEditorItemHeader">
                    <div>
                      <div className="statsEditorItemTitle">{getStatCardTitle(item)}</div>
                      <div className="statsEditorItemMeta">Card {idx + 1}</div>
                    </div>
                    <div className="statsEditorItemActions">
                      <button
                        type="button"
                        className="statsEditorSecondary"
                        onClick={() => moveDraftStat(idx, -1)}
                        disabled={idx === 0}
                      >
                        Up
                      </button>
                      <button
                        type="button"
                        className="statsEditorSecondary"
                        onClick={() => moveDraftStat(idx, 1)}
                        disabled={idx === draftVisibleStats.length - 1}
                      >
                        Down
                      </button>
                      <button
                        type="button"
                        className="statsEditorRemove"
                        onClick={() => removeDraftStat(idx)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>

                  <div className="statsEditorControls">
                    {isSavedProfileCard(item) ? (
                      <div className="statsEditorField">
                        <span>Saved item</span>
                        <div className="statsEditorStaticValue">
                          {isSavedSolveCard(item)
                            ? "Saved from solve detail. You can reorder or remove it here."
                            : "Saved from average detail. You can reorder or remove it here."}
                        </div>
                      </div>
                    ) : (
                      <label className="statsEditorField">
                        <span>Chart type</span>
                        <select
                          value={item.chart}
                          onChange={(e) =>
                            updateDraftStat(idx, () => createStatConfig(e.target.value, item.event || defaultStatEvent))
                          }
                        >
                          <option value="lineChart">Line Chart</option>
                          <option value="statsSummary">Stats Summary</option>
                          <option value="percentBar">Distribution</option>
                          <option value="pieChart">Event Breakdown</option>
                          <option value="barChart">Bar Chart</option>
                          <option value="timeTable">Time Table</option>
                        </select>
                      </label>
                    )}

                    {!isSavedProfileCard(item) && chartNeedsSummaryEvent(item) && (
                      <label className="statsEditorField">
                        <span>Event</span>
                        <select
                          value={item.scope === "all-events" ? "__all_events__" : item.event || defaultStatEvent}
                          onChange={(e) =>
                            updateDraftStat(idx, (current) => ({
                              ...current,
                              scope: e.target.value === "__all_events__" ? "all-events" : undefined,
                              event: e.target.value === "__all_events__" ? current.event || defaultStatEvent : e.target.value,
                              session: "all",
                            }))
                          }
                        >
                          <option value="__all_events__">All Events</option>
                          {availableEvents.length > 0 ? (
                            availableEvents.map((ev) => (
                              <option key={ev} value={ev}>
                                {ev}
                              </option>
                            ))
                          ) : (
                            <option value={defaultStatEvent}>{defaultStatEvent}</option>
                          )}
                        </select>
                      </label>
                    )}

                    {!isSavedProfileCard(item) && chartNeedsEventSession(item) && (
                      <>
                        <label className="statsEditorField">
                          <span>Event</span>
                          <select
                            value={item.event || defaultStatEvent}
                            onChange={(e) =>
                              updateDraftStat(idx, (current) => ({
                                ...current,
                                event: e.target.value,
                                session: "all",
                              }))
                            }
                          >
                            {availableEvents.length > 0 ? (
                              availableEvents.map((ev) => (
                                <option key={ev} value={ev}>
                                  {ev}
                                </option>
                              ))
                            ) : (
                              <option value={defaultStatEvent}>{defaultStatEvent}</option>
                            )}
                          </select>
                        </label>

                        <label className="statsEditorField">
                          <span>Session</span>
                          <select
                            value={item.session || "all"}
                            onChange={(e) =>
                              updateDraftStat(idx, (current) => ({
                                ...current,
                                session: e.target.value,
                              }))
                            }
                          >
                            <option value="all">All Sessions</option>
                            {(viewedSessionCatalog[item.event || defaultStatEvent] || []).map((sid) => (
                              <option key={sid} value={sid}>
                                {sid}
                              </option>
                            ))}
                          </select>
                        </label>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="statsEditorActions">
              <button type="button" className="statsEditorPrimary" onClick={handleSaveStats}>
                Save layout
              </button>
              <button type="button" className="statsEditorSecondary" onClick={closeStatsEditor}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="tabContainer">
        <button
          className={`tabButton ${activeTab === 0 ? "active" : ""}`}
          onClick={() => setActiveTab(0)}
        >
          Stats
        </button>
        <button
          className={`tabButton ${activeTab === 1 ? "active" : ""}`}
          onClick={() => setActiveTab(1)}
        >
          Posts
        </button>
      </div>

      <div className="profileContent">
        {activeTab === 0 && (
          <div className="tabPanel">
            <div className={`profileStatsPage ${showPlayerBar ? "profileStatsPage--withPlayerBar" : "profileStatsPage--noPlayerBar"}`}>
              <div className="profileStatsLayout">
                <div className="profileStatsMain">
                  <div className="profileStatsGrid">
                    {visibleStats.map((item, idx) => {
                      const cardClassName = getProfileStatItemClass(item.chart);

                      if (item.chart === "solveCard") {
                        const solve = item.solve ? { ...item.solve, __readOnly: true } : null;
                        if (!solve) return null;

                        return (
                          <div key={idx} className={cardClassName}>
                            <Post
                              user={viewedProfile}
                              name={viewedProfile.Name || viewedProfile.name}
                              date={item.createdAt || solve.datetime || solve.createdAt}
                              solveList={[solve]}
                              postColor={viewedProfile.Color || viewedProfile.color}
                              note={item.note || ""}
                              showMeta={false}
                              onClick={() => openSavedProfileCard(item)}
                            />
                          </div>
                        );
                      }

                      if (item.chart === "averageCard") {
                        const solves = (Array.isArray(item.solves) ? item.solves : [])
                          .map((solve) => ({ ...solve, __readOnly: true }))
                          .filter(Boolean);
                        if (!solves.length) return null;

                        return (
                          <div key={idx} className={cardClassName}>
                            <Post
                              user={viewedProfile}
                              name={viewedProfile.Name || viewedProfile.name}
                              date={item.createdAt || solves[0]?.datetime || solves[0]?.createdAt}
                              solveList={solves}
                              postColor={viewedProfile.Color || viewedProfile.color}
                              note={item.note || ""}
                              showMeta={false}
                              onClick={() => openSavedProfileCard(item)}
                            />
                          </div>
                        );
                      }

                      if (item.chart === "statsSummary") {
                        const solves =
                          item.scope === "all-events"
                            ? []
                            : solvesForConfig(item);
                        const overallStats =
                          item.scope === "all-events"
                            ? null
                            : item.session === "all"
                              ? aggregateProfileStats(viewedSessionStats[item.event] || {})
                              : viewedSessionStats[item.event]?.[item.session] || null;

                        return (
                          <div key={idx} className={cardClassName}>
                            <StatsSummary
                              solves={solves}
                              overallSolves={solves}
                              overallStats={overallStats}
                              allEventsBreakdown={item.scope === "all-events" ? allEventsBreakdown : null}
                              mode={item.scope === "all-events" ? "all-events" : item.session === "all" ? "event-overall" : "session"}
                              selectedEvent={item.event || "All Events"}
                              selectedSession={item.session || "all"}
                              loadedSolveCount={solves.length}
                              showCurrentMetrics={true}
                              viewMode={item.viewMode || "standard"}
                              selectedDay=""
                            />
                          </div>
                        );
                      }

                      if (item.chart === "percentBar") {
                        const solves = solvesForConfig(item);
                        return (
                          <div key={idx} className={cardClassName}>
                            <PercentBar
                              solves={solves.slice(-200)}
                              legendItems={item.legendItems || []}
                              title={item.subtitle || "Solves Distribution by Time"}
                            />
                          </div>
                        );
                      }

                      if (item.chart === "lineChart") {
                        const solves = solvesForConfig(item);
                        return (
                          <div key={idx} className={cardClassName}>
                            <LineChart
                              solves={solves}
                              title={buildLineChartTitle(item.title, item.event, item.session || "all")}
                              defaultViewMode="last100"
                              allowViewPicker={true}
                              initialShowControls={false}
                              seriesStyle={item.seriesStyle || null}
                              legendItems={item.legendItems || []}
                              viewMode={item.viewMode || "standard"}
                            />
                          </div>
                        );
                      }

                      if (item.chart === "pieChart") {
                        return (
                          <div key={idx} className={cardClassName}>
                            <EventCountPieChart
                              sessionStats={viewedSessionStats}
                              profileColor={user?.Color || user?.color || "#2EC4B6"}
                            />
                          </div>
                        );
                      }

                      if (item.chart === "barChart") {
                        const solves = solvesForConfig(item);
                        return (
                          <div key={idx} className={cardClassName}>
                            <BarChart
                              solves={solves.slice(-200)}
                              seriesStyle={item.seriesStyle || null}
                              legendItems={item.legendItems || []}
                            />
                          </div>
                        );
                      }

                      if (item.chart === "timeTable") {
                        const solves = solvesForConfig(item);
                        return (
                          <div key={idx} className={cardClassName}>
                            <TimeTable
                              solves={solves.slice(-200)}
                              seriesStyle={item.seriesStyle || null}
                            />
                          </div>
                        );
                      }

                      return null;
                    })}
                  </div>
                </div>

                <aside className="profileStatsRail">
                  <div className="profileStatsMatrixCard">
                    {profileTimeMatrixItems.length > 0 ? (
                      <AllEventsTimeMatrix
                        items={profileTimeMatrixItems}
                        mainOnly
                        orientation="vertical"
                        showSessionToggle={false}
                        onStatSelect={handleProfileMatrixStatSelect}
                      />
                    ) : (
                      <div className="profileStatsMatrixEmpty">No event stats yet.</div>
                    )}
                  </div>
                </aside>
              </div>
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className="tabPanel postsPanel">
            {recentPosts.length > 0 ? (
              recentPosts.map((post, idx) => (
                (() => {
                  const statShare = post.StatShare || post.statShare || null;
                  const isStatShare = !!statShare;
                  if (isStatShare) {
                    return (
                      <div
                        key={`${post.DateTime || post.date}-${idx}`}
                        className="statFeedPost"
                        onClick={(event) => {
                          if (isInteractiveFeedTarget(event.target)) return;
                          setSelectedPost(post);
                        }}
                      >
                        <div style={{ border: `2px solid ${withAlpha(viewedProfile.Color, 0.5)}`, borderRadius: 12 }}>
                        <StatSharePost
                          note={post.Note}
                          statShare={statShare}
                          shareColor={viewedProfile.Color || viewedProfile.color || ""}
                        />
                        <div className="statFeedMeta">
                          <div className="postDate">
                            {formatPostDate(post.DateTime ? new Date(post.DateTime) : post.date)}
                          </div>
                          <div className="postNameAndPicture">
                            <NameTag
                              user={viewedProfile}
                              size="xs"
                              variant="profile-corner"
                              reverse={true}
                            />
                          </div>
                        </div>
                        </div>
                      </div>
                    );
                  }
                  return (
                <Post
                  key={`${post.DateTime || post.date}-${idx}`}
                  name={viewedProfile.Name || viewedProfile.name}
                  date={
                    post.DateTime
                      ? formatPostDate(new Date(post.DateTime))
                      : post.date
                  }
                  solveList={
                    isStatShare
                      ? []
                      : post.SolveList && post.SolveList.length
                      ? post.SolveList
                      : [
                          {
                            event: post.Event,
                            scramble: post.Scramble,
                            time: post.Time,
                            note: post.Note,
                            comments: post.Comments || [],
                          },
                        ]
                  }
                  postColor={viewedProfile.Color}
                  note={post.Note}
                  postType={post.PostType}
                  statShare={statShare}
                  onClick={() => setSelectedPost(post)}
                />
                  );
                })()
              ))
            ) : (
              <p>No posts yet.</p>
            )}
          </div>
        )}
      </div>

      {selectedPost && (
        <PostDetail
          author={viewedProfile.Name || viewedProfile.name}
          authorUser={viewedProfile}
          date={
            selectedPost.DateTime
              ? formatPostDate(new Date(selectedPost.DateTime))
              : selectedPost.date
          }
          solveList={
            (selectedPost.StatShare || selectedPost.statShare)
              ? []
              : selectedPost.SolveList && selectedPost.SolveList.length
              ? selectedPost.SolveList
              : [
                  {
                    event: selectedPost.Event,
                    scramble: selectedPost.Scramble,
                    time: selectedPost.Time,
                    note: selectedPost.Note,
                    comments: selectedPost.Comments || [],
                  },
                ]
          }
          comments={selectedPost.Comments || []}
          note={selectedPost.Note}
          postType={selectedPost.PostType}
          statShare={selectedPost.StatShare || selectedPost.statShare || null}
          postColor={viewedProfile.Color || viewedProfile.color || ""}
          onClose={() => setSelectedPost(null)}
          onDelete={() =>
            handleDeletePost(selectedPost.DateTime || selectedPost.date)
          }
          onAddComment={handleAddComment}
        />
      )}

      {selectedProfileCard && (
        <PostDetail
          author={viewedProfile.Name || viewedProfile.name}
          authorUser={viewedProfile}
          date={formatPostDate(selectedProfileCard.createdAt || new Date().toISOString())}
          solveList={
            isSavedSolveCard(selectedProfileCard)
              ? selectedProfileCard.solve
                ? [{ ...selectedProfileCard.solve, __readOnly: true }]
                : []
              : (Array.isArray(selectedProfileCard.solves) ? selectedProfileCard.solves : []).map((solve) => ({
                  ...solve,
                  __readOnly: true,
                }))
          }
          comments={[]}
          note={selectedProfileCard.note || ""}
          postType="solve"
          statShare={null}
          postColor={viewedProfile.Color || viewedProfile.color || ""}
          onClose={() => setSelectedProfileCard(null)}
        />
      )}
    </div>
  );
}

export default Profile;
