import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "./Profile.css";
import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import NameTag from "./NameTag";
import { getUser } from "../../services/getUser";
import { updateUser } from "../../services/updateUser";
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

export default function ProfileHeader({
  user,
  currentUser = null,
  setCurrentUser = null,
  sessionStats,
  isOwn = false,
  onEditStats,
  onJoinLiveRoom,
  liveRoomBusy = false,
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
  } = user;

  const [liveRoom, setLiveRoom] = useState(null);
  const [openWidget, setOpenWidget] = useState(null);
  const [friendProfiles, setFriendProfiles] = useState([]);
  const [isLoadingFriends, setIsLoadingFriends] = useState(false);
  const [friendActionBusy, setFriendActionBusy] = useState({});
  const navigate = useNavigate();
  const currentUserID = String(currentUser?.UserID || "").trim();
  const canManageFriends = isOwn && currentUserID && currentUserID === String(user?.UserID || "").trim();
  const allowedFriendSet = useMemo(
    () => new Set(Array.isArray(currentUser?.StatsAllowedFriends) ? currentUser.StatsAllowedFriends : []),
    [currentUser?.StatsAllowedFriends]
  );

  useEffect(() => {
    let isCancelled = false;

    if (openWidget !== "friends" || !Friends.length) {
      if (!Friends.length) {
        setFriendProfiles([]);
        setIsLoadingFriends(false);
      }
      return () => {
        isCancelled = true;
      };
    }

    setIsLoadingFriends(true);

    const loadFriendProfiles = async () => {
      const profiles = await Promise.all(
        Friends.map(async (friendID) => {
          try {
            return await getUser(friendID);
          } catch (error) {
            console.warn("Failed to load friend profile", friendID, error);
            return {
              UserID: friendID,
              userID: friendID,
              Name: friendID,
              name: friendID,
            };
          }
        })
      );

      if (!isCancelled) {
        setFriendProfiles(profiles);
        setIsLoadingFriends(false);
      }
    };

    loadFriendProfiles();

    return () => {
      isCancelled = true;
    };
  }, [Friends, openWidget]);

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

  const setFriendBusy = (friendID, key, value) => {
    setFriendActionBusy((prev) => ({
      ...prev,
      [friendID]: {
        ...(prev?.[friendID] || {}),
        [key]: value,
      },
    }));
  };

  const handleToggleFriendStatsAccess = async (friendID, shouldAllow) => {
    if (!canManageFriends || !currentUserID || typeof setCurrentUser !== "function") return;

    setFriendBusy(friendID, "share", true);
    try {
      const currentAllowed = Array.isArray(currentUser?.StatsAllowedFriends)
        ? currentUser.StatsAllowedFriends
        : [];
      const nextAllowed = shouldAllow
        ? Array.from(new Set([...currentAllowed, friendID]))
        : currentAllowed.filter((id) => id !== friendID);

      await updateUser(currentUserID, { StatsAllowedFriends: nextAllowed });
      setCurrentUser((prev) => ({
        ...(prev || {}),
        StatsAllowedFriends: nextAllowed,
      }));
    } catch (error) {
      console.error("Failed to update friend stats access", friendID, error);
    } finally {
      setFriendBusy(friendID, "share", false);
    }
  };

  const handleViewFriendStats = (friendID) => {
    navigate(`/stats?user=${encodeURIComponent(friendID)}`);
    setOpenWidget(null);
  };

  const handleRemoveFriend = async (friendID) => {
    if (!canManageFriends || !currentUserID || typeof setCurrentUser !== "function") return;

    const confirmed = window.confirm(`Remove @${friendID} from your friends list?`);
    if (!confirmed) return;

    setFriendBusy(friendID, "remove", true);
    try {
      const nextFriends = (Array.isArray(currentUser?.Friends) ? currentUser.Friends : []).filter(
        (id) => id !== friendID
      );
      const nextAllowed = (Array.isArray(currentUser?.StatsAllowedFriends)
        ? currentUser.StatsAllowedFriends
        : []
      ).filter((id) => id !== friendID);

      await updateUser(currentUserID, {
        Friends: nextFriends,
        StatsAllowedFriends: nextAllowed,
      });

      setCurrentUser((prev) => ({
        ...(prev || {}),
        Friends: nextFriends,
        StatsAllowedFriends: nextAllowed,
      }));
      setFriendProfiles((prev) =>
        prev.filter((friend) => String(friend?.UserID || friend?.userID || "") !== friendID)
      );
    } catch (error) {
      console.error("Failed to remove friend", friendID, error);
    } finally {
      setFriendBusy(friendID, "remove", false);
    }
  };

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
      title: "Friends",
      value: Friends.length,
      detail: Friends.length ? (
        <div className="friendsList">
          {isLoadingFriends && !friendProfiles.length ? (
            <div className="friendsListStatus">Loading friends...</div>
          ) : (
            friendProfiles.map((friend) => (
              <div
                key={friend?.UserID || friend?.userID}
                className={`friendListRow ${canManageFriends ? "friendListRow--managed" : ""}`}
              >
                <NameTag user={friend} size="xs" />
                {canManageFriends ? (
                  <div className="friendListActions">
                    <label className="friendStatsSwitch">
                      <input
                        type="checkbox"
                        checked={allowedFriendSet.has(String(friend?.UserID || friend?.userID || ""))}
                        disabled={!!friendActionBusy?.[friend?.UserID || friend?.userID]?.share}
                        onChange={(event) =>
                          handleToggleFriendStatsAccess(
                            String(friend?.UserID || friend?.userID || ""),
                            event.target.checked
                          )
                        }
                      />
                      <span className="friendStatsSwitchLabel">Share</span>
                    </label>
                    <button
                      type="button"
                      className="friendStatsButton"
                      disabled={
                        !Array.isArray(friend?.StatsAllowedFriends) ||
                        !friend.StatsAllowedFriends.includes(currentUserID)
                      }
                      onClick={() =>
                        handleViewFriendStats(String(friend?.UserID || friend?.userID || ""))
                      }
                    >
                      Stats
                    </button>
                    <button
                      type="button"
                      className="friendRemoveButton"
                      disabled={!!friendActionBusy?.[friend?.UserID || friend?.userID]?.remove}
                      onClick={() =>
                        handleRemoveFriend(String(friend?.UserID || friend?.userID || ""))
                      }
                    >
                      x
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      ) : (
        <div>No friends yet.</div>
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
