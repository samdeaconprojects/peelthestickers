import React, { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import "./Profile.css";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";

function getFavoriteEvent(sessionStats) {
  if (!sessionStats || typeof sessionStats !== "object") return null;

  let best = null;

  Object.entries(sessionStats).forEach(([event, eventMap]) => {
    if (!eventMap || typeof eventMap !== "object") return;
    let total = 0;
    Object.values(eventMap).forEach((stats) => {
      total += Number(stats?.SolveCountTotal || 0);
    });

    if (!best || total > best.total || (total === best.total && String(event).localeCompare(String(best.event)) < 0)) {
      best = { event, total };
    }
  });

  return best;
}

export default function ProfileHeader({ user, sessionStats, isOwn = false, onEditStats }) {
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

  const [openWidget, setOpenWidget] = useState(null);

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

  const favoriteEvent = useMemo(() => getFavoriteEvent(sessionStats), [sessionStats]);
  const widgets = [
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
    {
      key: "favorite-event",
      title: "Most Solved",
      value: favoriteEvent ? `${favoriteEvent.event} · ${favoriteEvent.total}` : "—",
      detail: (
        <div>
          <h4>Most Solved Event</h4>
          <p>{favoriteEvent?.event || "—"}</p>
          <p>Solves: {favoriteEvent?.total ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "wca",
      title: "WCA ID",
      value: WCAID || "—",
      detail: (
        <div>
          <strong>{WCAID || "No WCA ID yet"}</strong>
        </div>
      ),
    },
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
          <div className="profileIdentityRow">
            <div className="profileName">{Name || "Guest"}</div>
            {isOwn && typeof onEditStats === "function" && (
              <div className="profileHeaderActions">
                <button
                  type="button"
                  className="profileHeaderButton"
                  onClick={onEditStats}
                  style={{ borderColor: Color || "#2EC4B6" }}
                >
                  Customize Stats
                </button>
              </div>
            )}
          </div>
          <div className="profileUsername">@{UserID || "guest"}</div>
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
    </div>
  );
}
