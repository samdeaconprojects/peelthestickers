import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Profile.css";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import FollowListPanel from "./FollowListPanel";
import { getProfileEventScramble } from "../../utils/profileEventSolves";
import { getRoomByHost } from "../../services/liveRoom";
import { EVENT_KEYBINDING_LABELS } from "../../utils/keybindings";

function getEventLabel(event) {
  if (!event) return null;
  return EVENT_KEYBINDING_LABELS[String(event).toUpperCase()] || String(event);
}

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

function getMostTimeEvent(sessionStats) {
  if (!sessionStats || typeof sessionStats !== "object") return null;

  let best = null;

  Object.entries(sessionStats).forEach(([event, eventMap]) => {
    if (!eventMap || typeof eventMap !== "object") return;
    let totalMs = 0;
    Object.values(eventMap).forEach((stats) => {
      totalMs += Number(stats?.SumFinalTimeMs || 0);
    });
    if (!(totalMs > 0)) return;

    if (!best || totalMs > best.totalMs || (totalMs === best.totalMs && String(event).localeCompare(String(best.event)) < 0)) {
      best = { event, totalMs };
    }
  });

  return best;
}

function formatTotalDuration(ms) {
  const totalSeconds = Math.max(0, Math.round(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

const FOLLOW_LABELS = {
  none: { idle: "Follow" },
  "follow-back": { idle: "Follow Back" },
  requested: { idle: "Requested", hover: "Cancel Request?" },
  following: { idle: "Following", hover: "Unfollow?" },
  friends: { idle: "Friends", hover: "Unfollow?" },
};

function FollowButton({ state, busy, color, onFollow, onUnfollow }) {
  const labels = FOLLOW_LABELS[state] || FOLLOW_LABELS.none;
  const active = !!labels.hover;
  return (
    <button
      type="button"
      className={`profileHeaderButton${active ? " profileHeaderButton--friend" : " profileHeaderButton--follow"}`}
      onClick={active ? onUnfollow : onFollow}
      disabled={busy || (active && typeof onUnfollow !== "function")}
      style={{ borderColor: color || "#2EC4B6", ...(active ? null : { background: color || "#2EC4B6" }) }}
    >
      {active ? (
        <>
          <span className="profileHeaderButton__idle">{labels.idle}</span>
          <span className="profileHeaderButton__hover">{labels.hover}</span>
        </>
      ) : (
        labels.idle
      )}
    </button>
  );
}

export default function ProfileHeader({
  user,
  currentUser = null,
  setCurrentUser = null,
  sessionStats,
  isOwn = false,
  onEditStats,
  onJoinLiveRoom,
  liveRoomBusy = false,
  followState = null,
  followBusy = false,
  onFollow,
  onUnfollow,
  canViewFullStats = false,
}) {
  const {
    Name,
    UserID,
    Color,
    WCAID,
    DateFounded,
    ProfileEvent,
    ProfileScramble,
    Friends = [],
    Followers = [],
  } = user;

  const [liveRoom, setLiveRoom] = useState(null);
  const [openWidget, setOpenWidget] = useState(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (!UserID || isOwn) {
      setLiveRoom(null);
      return;
    }

    let cancelled = false;
    const tick = async () => {
      try {
        const room = await getRoomByHost(UserID);
        if (!cancelled) setLiveRoom(room);
      } catch (err) {
        // non-fatal: just leave the badge hidden this cycle
      }
    };

    tick();
    const interval = setInterval(tick, 8000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [UserID, isOwn]);

  const cubeTransforms = {
    "222": "translate(15px, 18px) scale(0.7)",
    "333": "scale(0.6)",
    "444": "translate(-4px, -5px) scale(0.55)",
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
  const mostTimeEvent = useMemo(() => getMostTimeEvent(sessionStats), [sessionStats]);
  const resolvedProfileScramble = useMemo(
    () => getProfileEventScramble(user, ProfileEvent, ProfileScramble),
    [ProfileEvent, ProfileScramble, user]
  );

  const followerCount = isOwn ? Followers.length : user?.FollowerCount ?? Followers.length;
  const followingCount = isOwn ? Friends.length : user?.FollowingCount ?? Friends.length;

  const widgets = [
    {
      key: "solves",
      color: "#2EC4B6",
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
      color: "#FF9F1C",
      title: "Most Solves",
      sub: getEventLabel(favoriteEvent?.event),
      value: favoriteEvent ? favoriteEvent.total : "—",
      detail: (
        <div>
          <h4>Most Solves Event</h4>
          <p>{getEventLabel(favoriteEvent?.event) || "—"}</p>
          <p>Solves: {favoriteEvent?.total ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "most-time-event",
      color: "#B388FF",
      title: "Most Time",
      sub: getEventLabel(mostTimeEvent?.event),
      value: mostTimeEvent ? formatTotalDuration(mostTimeEvent.totalMs) : "—",
      detail: (
        <div>
          <h4>Most Time Event</h4>
          <p>{getEventLabel(mostTimeEvent?.event) || "—"}</p>
          <p>Total time: {mostTimeEvent ? formatTotalDuration(mostTimeEvent.totalMs) : "—"}</p>
        </div>
      ),
    },
    {
      key: "wca",
      color: "#FFD166",
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
      color: "#3A86FF",
      title: "Followers",
      sub: `${followingCount} following`,
      value: followerCount,
      detail: (
        <FollowListPanel
          profile={user}
          isOwn={isOwn}
          currentUser={currentUser}
          setCurrentUser={setCurrentUser}
          onNavigate={() => setOpenWidget(null)}
        />
      ),
    },
    {
      key: "joined",
      color: "#8A8F98",
      title: "Joined",
      value: joinedDate,
      detail: (
        <div>
          You joined on <strong>{joinedDate}</strong>
        </div>
      ),
    },
  ];

  // top row: solves, friends, wca — bottom row: most solved, most time, joined
  const widgetOrder = ["solves", "friends", "wca", "favorite-event", "most-time-event", "joined"];
  const orderedWidgets = widgetOrder.map((key) => widgets.find((w) => w.key === key)).filter(Boolean);

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
              scramble={resolvedProfileScramble}
              isMusicPlayer={false}
              isProfileCube={true}
              isTimerCube={false}
            />
          </div>
        </div>

        <div className="profileNameAndUsername">
          <div className="profileIdentityRow">
            <div className="profileName">{Name || "Guest"}</div>
            {!isOwn && liveRoom && typeof onJoinLiveRoom === "function" && (
              <button
                type="button"
                className="profileLiveRoomBadge"
                disabled={liveRoomBusy}
                onClick={() => onJoinLiveRoom(UserID)}
                title={`${liveRoom.memberCount || 0} watching`}
              >
                <span className="profileLiveRoomBadge__dot" />
                Live — Join
              </button>
            )}
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
            {!isOwn && followState && typeof onFollow === "function" && (
              <div className="profileHeaderActions">
                <FollowButton
                  state={followState}
                  busy={followBusy}
                  color={Color}
                  onFollow={onFollow}
                  onUnfollow={onUnfollow}
                />
                {canViewFullStats && (
                  <button
                    type="button"
                    className="profileHeaderButton"
                    onClick={() => navigate(`/stats?user=${encodeURIComponent(UserID)}`)}
                    style={{ borderColor: Color || "#2EC4B6" }}
                  >
                    View Full Stats
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="profileUsername">@{UserID || "guest"}</div>
        </div>
      </div>

      <div className="widgetBar">
        {orderedWidgets.map((w) => (
          <div
            key={w.key}
            className="widget"
            style={{ borderColor: w.color }}
            onClick={() => setOpenWidget(openWidget === w.key ? null : w.key)}
          >
            <div className="widgetLabel">
              <div className="widgetTitle">{w.title}</div>
              {w.sub ? <div className="widgetSub">{w.sub}</div> : null}
            </div>
            <div className="widgetValue">{w.value}</div>
          </div>
        ))}
      </div>

      {openWidget && (
        <>
          <div className="widgetOverlay" onClick={() => setOpenWidget(null)} />
          <div
            className={`widgetDetail ${openWidget === "friends" ? "widgetDetail--friends" : ""}`}
          >
            {widgets.find((w) => w.key === openWidget)?.detail}
          </div>
        </>
      )}
    </div>
  );
}
