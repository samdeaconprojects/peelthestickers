import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Profile.css";
import EventSelectorDetail from "../Detail/EventSelectorDetail";
import { formatTime } from "../TimeList/TimeUtils";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";

function getEventOverallStats(sessionStats, event) {
  const map = sessionStats?.[event];
  if (!map || typeof map !== "object") return null;

  let solveCountTotal = 0;
  let solveCountIncluded = 0;
  let dnfCount = 0;
  let plus2Count = 0;
  let bestSingleMs = null;
  let bestAo5Ms = null;
  let bestAo12Ms = null;
  let sumFinalTimeMs = 0;
  let lastSolveAt = null;

  for (const stats of Object.values(map)) {
    if (!stats || typeof stats !== "object") continue;

    solveCountTotal += Number(stats.SolveCountTotal || 0);
    solveCountIncluded += Number(stats.SolveCountIncluded || 0);
    dnfCount += Number(stats.DNFCount || 0);
    plus2Count += Number(stats.Plus2Count || 0);
    sumFinalTimeMs += Number(stats.SumFinalTimeMs || 0);

    const single = stats.BestSingleMs;
    if (typeof single === "number" && isFinite(single)) {
      if (bestSingleMs == null || single < bestSingleMs) bestSingleMs = single;
    }

    const ao5 = stats.BestAo5Ms;
    if (typeof ao5 === "number" && isFinite(ao5)) {
      if (bestAo5Ms == null || ao5 < bestAo5Ms) bestAo5Ms = ao5;
    }

    const ao12 = stats.BestAo12Ms;
    if (typeof ao12 === "number" && isFinite(ao12)) {
      if (bestAo12Ms == null || ao12 < bestAo12Ms) bestAo12Ms = ao12;
    }

    const last = stats.LastSolveAt;
    if (last && (!lastSolveAt || String(last) > String(lastSolveAt))) {
      lastSolveAt = last;
    }
  }

  const meanMs =
    solveCountIncluded > 0 ? Math.round(sumFinalTimeMs / solveCountIncluded) : null;

  return {
    SolveCountTotal: solveCountTotal,
    SolveCountIncluded: solveCountIncluded,
    DNFCount: dnfCount,
    Plus2Count: plus2Count,
    BestSingleMs: bestSingleMs,
    BestAo5Ms: bestAo5Ms,
    BestAo12Ms: bestAo12Ms,
    MeanMs: meanMs,
    LastSolveAt: lastSolveAt,
  };
}

function displayTime(value) {
  if (value == null || value === "N/A") return "—";
  if (typeof value === "number" && isFinite(value)) return formatTime(value);
  return String(value);
}

function formatDateText(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString();
}

export default function ProfileHeader({ user, sessionStats }) {
  const {
    Name,
    UserID,
    Color,
    WCAID,
    DateFounded,
    ProfileEvent,
    ProfileScramble,
    Friends = [],
  } = user;

  const [selectedEvents, setSelectedEvents] = useState([ProfileEvent || "333"]);
  const [showEventSelector, setShowEventSelector] = useState(false);
  const [openWidget, setOpenWidget] = useState(null);

  const handleCloseSelector = () => setShowEventSelector(false);
  const handleSaveSelectedEvents = (ev) => {
    setSelectedEvents(ev);
    setShowEventSelector(false);
  };

  const cubeTransforms = {
    "222": "translate(15px, 18px) scale(0.7)",
    "333": "scale(0.6)",
    "444": "translate(-1px, -5px) scale(0.55)",
    "555": "translate(-8px, -10px) scale(0.55)",
    "666": "translate(-4px, -7px) scale(0.54)",
    "777": "translate(-4px, -6px) scale(0.54)",
    CLOCK: "translate(-7px, -44px) scale(0.55)",
    SKEWB: "translate(-9px, -12px) scale(0.85)",
    MEGAMINX: "translate(-4px, -16px) scale(0.8)",
    PYRAMINX: "translate(0px, -18px) scale(0.88)",
  };

  const joinedDate = DateFounded ? new Date(DateFounded).toLocaleDateString() : "—";

  const selectedEventStats = useMemo(() => {
    return selectedEvents.map((event) => {
      return {
        event,
        stats: getEventOverallStats(sessionStats, event),
      };
    });
  }, [selectedEvents, sessionStats]);

  const profileEventOverall = useMemo(() => {
    return getEventOverallStats(sessionStats, ProfileEvent);
  }, [sessionStats, ProfileEvent]);

  const totalSolveCountAcrossEvents = useMemo(() => {
    if (sessionStats && typeof sessionStats === "object") {
      let total = 0;
      for (const eventMap of Object.values(sessionStats)) {
        if (!eventMap || typeof eventMap !== "object") continue;
        for (const stats of Object.values(eventMap)) {
          total += Number(stats?.SolveCountTotal || 0);
        }
      }
      if (total > 0) return total;
    }

    return 0;
  }, [sessionStats]);

  const widgets = [
    {
      key: "friends",
      title: "Friends",
      value: Friends.length,
      detail: Friends.length ? (
        <ul className="friendsList">
          {Friends.map((fid) => (
            <li key={fid}>
              <Link to={`/profile/${fid}`}>@{fid}</Link>
            </li>
          ))}
        </ul>
      ) : (
        <div>No friends yet.</div>
      ),
    },

    {
      key: "solves",
      title: "Total Solves",
      value: totalSolveCountAcrossEvents,
      detail: (
        <div>
          <h4>Total Solves</h4>
          <p>{totalSolveCountAcrossEvents}</p>
        </div>
      ),
    },

    ...selectedEventStats.flatMap(({ event, stats }) => [
      {
        key: `${event}-single`,
        title: `${event} PB`,
        value: displayTime(stats?.BestSingleMs),
        detail: (
          <div>
            <h4>{event} Best Single</h4>
            <p>{displayTime(stats?.BestSingleMs)}</p>
            <p>Solves: {stats?.SolveCountTotal ?? "—"}</p>
            <p>Mean: {displayTime(stats?.MeanMs)}</p>
          </div>
        ),
      },
      {
        key: `${event}-ao5`,
        title: `${event} Ao5`,
        value: displayTime(stats?.BestAo5Ms),
        detail: (
          <div>
            <h4>{event} Best Ao5</h4>
            <p>{displayTime(stats?.BestAo5Ms)}</p>
            <p>Best Ao12: {displayTime(stats?.BestAo12Ms)}</p>
            <p>DNFs: {stats?.DNFCount ?? "—"}</p>
          </div>
        ),
      },
    ]),

    {
      key: "profile-event",
      title: `${ProfileEvent} Count`,
      value: profileEventOverall?.SolveCountTotal ?? "—",
      detail: (
        <div>
          <h4>{ProfileEvent} Overall</h4>
          <p>Solves: {profileEventOverall?.SolveCountTotal ?? "—"}</p>
          <p>Counted: {profileEventOverall?.SolveCountIncluded ?? "—"}</p>
          <p>DNFs: {profileEventOverall?.DNFCount ?? "—"}</p>
          <p>+2s: {profileEventOverall?.Plus2Count ?? "—"}</p>
          <p>Mean: {displayTime(profileEventOverall?.MeanMs)}</p>
          <p>Last solve: {formatDateText(profileEventOverall?.LastSolveAt)}</p>
        </div>
      ),
    },

    {
      key: "wca",
      title: "WCA ID",
      value: WCAID || "—",
      detail: (
        <div>
          Your WCA ID is <strong>{WCAID || "—"}</strong>
        </div>
      ),
    },

    {
      key: "joined",
      title: "Joined",
      value: joinedDate,
      detail: (
        <div>
          You joined on <strong>{joinedDate}</strong>
        </div>
      ),
    },
  ];

  return (
    <div className="profileHeader">
      <div className="profileAndName">
        <div className="profilePicture" style={{ border: `2px solid ${Color}` }}>
          <div
            className="profileCube"
            style={{
              transform: cubeTransforms[ProfileEvent] || "scale(0.6)",
            }}
          >
            <PuzzleSVG
              className="profileCube"
              event={ProfileEvent}
              scramble={ProfileScramble}
              isMusicPlayer={false}
              isProfileCube={true}
              isTimerCube={false}
            />
          </div>
        </div>

        <div className="profileNameAndUsername">
          <div className="profileName">{Name || "Guest"}</div>
          <div className="profileUsername">@{UserID || "guest"}</div>

          <button
            type="button"
            className="profileEventButton"
            onClick={() => setShowEventSelector(true)}
            style={{
              marginTop: "8px",
              border: `1px solid ${Color || "#2EC4B6"}`,
              background: "transparent",
              color: "white",
              borderRadius: "8px",
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Select Events
          </button>
        </div>
      </div>

      <div className="widgetBar">
        {widgets.map((w) => (
          <div
            key={w.key}
            className="widget"
            style={{ border: `2px solid ${Color}` }}
            onClick={() => setOpenWidget(openWidget === w.key ? null : w.key)}
          >
            <div className="widgetTitle">{w.title}</div>
            <div className="widgetValue">{w.value}</div>
          </div>
        ))}
      </div>

      {openWidget && (
        <>
          <div className="widgetOverlay" onClick={() => setOpenWidget(null)} />
          <div className="widgetDetail">
            {widgets.find((w) => w.key === openWidget)?.detail}
          </div>
        </>
      )}

      {showEventSelector && (
        <EventSelectorDetail
          events={["222", "333", "444", "555", "666", "777", "333OH", "333BLD", "SKEWB", "PYRAMINX", "MEGAMINX", "CLOCK"]}
          selectedEvents={selectedEvents}
          onClose={handleCloseSelector}
          onSave={handleSaveSelectedEvents}
        />
      )}
    </div>
  );
}
