import React, { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import "./Profile.css";
import Post from "./Post";
import PostDetail from "./PostDetail";
import StatSharePost from "./StatSharePost";
import ProfileHeader from "./ProfileHeader";
import LineChart from "../Stats/LineChart";
import EventCountPieChart from "../Stats/EventCountPieChart";
import BarChart from "../Stats/BarChart";
import TimeTable from "../Stats/TimeTable";
import PercentBar from "../Stats/PercentBar";
import StatsSummary from "../Stats/StatsSummary";
import { getPosts } from "../../services/getPosts";
import { getUser } from "../../services/getUser";
import { updateUser } from "../../services/updateUser";
import { updatePostComments } from "../../services/updatePostComments";
import { getSessions } from "../../services/getSessions";
import { getLastNSolvesByEvent, getLastNSolvesBySession } from "../../services/getSolvesBySession";

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

function normalizeSolve(item) {
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
    fullIndex: null,
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

const DEFAULT_VISIBLE_STATS = [
  { chart: "lineChart", event: "333", session: "all" },
  { chart: "pieChart" },
];

function getProfileStatItemClass(chart) {
  switch (chart) {
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

function Profile({ user, setUser, deletePost: deletePostProp }) {
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
  const [activeTab, setActiveTab] = useState(0);

  const [visibleStats, setVisibleStats] = useState(DEFAULT_VISIBLE_STATS);
  const [editingStats, setEditingStats] = useState(false);
  const pendingSolveRequestsRef = useRef(new Set());

  const formatPostDate = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (!d || isNaN(d.getTime())) return String(value ?? "");
    return d.toLocaleString();
  };

  useEffect(() => {
    const loadProfile = async () => {
      if (isOwn) {
        setViewedProfile(user);
        setVisibleStats(
          Array.isArray(user?.VisibleStats) && user.VisibleStats.length > 0
            ? user.VisibleStats
            : DEFAULT_VISIBLE_STATS
        );
      } else {
        try {
          const prof = await getUser(viewID);
          setViewedProfile({ ...prof, UserID: viewID });
          setVisibleStats(
            Array.isArray(prof?.VisibleStats) && prof.VisibleStats.length > 0
              ? prof.VisibleStats
              : DEFAULT_VISIBLE_STATS
          );
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
              [cacheKey]: (solves || []).map(normalizeSolve).filter(Boolean),
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
    const updatedComments = [...(selectedPost.Comments || []), comment];
    const updated = { ...selectedPost, Comments: updatedComments };

    setPosts((pl) => pl.map((p) => (p === selectedPost ? updated : p)));
    setSelectedPost(updated);

    const ownerID = viewID;
    try {
      await updatePostComments(ownerID, ts, updatedComments);
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
        await updateUser(user.UserID, { Friends: updatedList });
        setUser((prev) => ({ ...prev, Friends: updatedList }));
      } catch (err) {
        console.error("Failed to add friend:", err);
      }
    }
  };

  const handleSaveStats = async () => {
    try {
      await updateUser(user.UserID, { VisibleStats: visibleStats });
      setUser((prev) => ({ ...prev, VisibleStats: visibleStats }));
      setEditingStats(false);
    } catch (err) {
      console.error("Failed to update visible stats:", err);
    }
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
  const availableEvents = useMemo(
    () => Object.keys(viewedSessionCatalog).sort((a, b) => String(a).localeCompare(String(b))),
    [viewedSessionCatalog]
  );

  if (!viewedProfile) return null;
  if (!viewedProfile.UserID) return <div>Loading profile…</div>;

  const recentPosts = [...posts].reverse();
  return (
    <div className="Page profilePage">
      <ProfileHeader
        user={viewedProfile}
        sessionStats={viewedSessionStats}
        isOwn={isOwn}
        onEditStats={() => setEditingStats(true)}
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
        <div className="statsEditor">
          <h3>Select visible stats</h3>

          {visibleStats.map((item, idx) => (
            <div key={idx} className="statSelector">
              <select
                value={item.chart}
                onChange={(e) => {
                  const newStats = [...visibleStats];
                  newStats[idx] = { ...item, chart: e.target.value };
                  setVisibleStats(newStats);
                }}
              >
                <option value="lineChart">Line Chart</option>
                <option value="statsSummary">Stats Summary</option>
                <option value="percentBar">Distribution</option>
                <option value="pieChart">Event Breakdown</option>
                <option value="barChart">Bar Chart</option>
                <option value="timeTable">Time Table</option>
              </select>

              {item.chart !== "pieChart" && item.scope !== "all-events" && (
                <>
                  <select
                    value={item.event || "333"}
                    onChange={(e) => {
                      const newStats = [...visibleStats];
                      newStats[idx] = { ...item, event: e.target.value };
                      setVisibleStats(newStats);
                    }}
                  >
                    {availableEvents.map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>

                  <select
                    value={item.session || "all"}
                    onChange={(e) => {
                      const newStats = [...visibleStats];
                      newStats[idx] = { ...item, session: e.target.value };
                      setVisibleStats(newStats);
                    }}
                  >
                    <option value="all">All Sessions</option>
                    {(viewedSessionCatalog[item.event] || []).map((sid) => (
                      <option key={sid} value={sid}>
                        {sid}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          ))}

          <button
            onClick={() =>
              setVisibleStats([
                ...visibleStats,
                { chart: "lineChart", event: "333", session: "all" },
              ])
            }
          >
            + Add Chart
          </button>

          <div>
            <button onClick={handleSaveStats}>Save</button>
            <button onClick={() => setEditingStats(false)}>Cancel</button>
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
            <div className="profileStatsPage">
              <div className="profileStatsGrid">
                {visibleStats.map((item, idx) => {
                  const cardClassName = getProfileStatItemClass(item.chart);

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
                          title={item.title || `${item.event} (${item.session || "all"})`}
                          defaultViewMode="last100"
                          allowViewPicker={true}
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
                        onClick={() => setSelectedPost(post)}
                      >
                        <div style={{ border: `2px solid ${withAlpha(viewedProfile.Color, 0.5)}`, borderRadius: 12 }}>
                        <StatSharePost note={post.Note} statShare={statShare} />
                        <div className="statFeedMeta">
                          <div className="postDate">
                            {formatPostDate(post.DateTime ? new Date(post.DateTime) : post.date)}
                          </div>
                          <div className="statFeedAuthor">@{viewedProfile.Name || viewedProfile.name}</div>
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
          onClose={() => setSelectedPost(null)}
          onDelete={() =>
            handleDeletePost(selectedPost.DateTime || selectedPost.date)
          }
          onAddComment={handleAddComment}
        />
      )}
    </div>
  );
}

export default Profile;
