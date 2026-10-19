// Followers / Following / Requests lists shown from the profile header.
// On your own profile the rows carry actions (follow back, remove, share
// stats, unfollow, accept/decline); on someone else's they are read-only.
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import NameTag from "./NameTag";
import { getUser } from "../../services/getUser";
import { updateUser } from "../../services/updateUser";
import {
  followUser,
  unfollowUser,
  removeFollower,
  respondToFollowRequest,
} from "../../services/follow";

const idOf = (p) => String(p?.UserID || p?.userID || "").trim();
const cleanList = (list) =>
  Array.isArray(list) ? list.map((id) => String(id || "").trim()).filter(Boolean) : [];

export default function FollowListPanel({
  profile,
  isOwn,
  currentUser,
  setCurrentUser,
  initialTab = "followers",
  onNavigate,
}) {
  const navigate = useNavigate();
  const ownerID = idOf(profile);
  const following = cleanList(profile?.Friends);
  const followers = cleanList(profile?.Followers);
  const requests = isOwn ? cleanList(profile?.FollowRequests) : [];
  const listsHidden = !isOwn && profile?.Viewer?.canView?.friendsList !== true;
  const showRequestsTab = isOwn && (profile?.PrivateAccount === true || requests.length > 0);

  const [tab, setTab] = useState(initialTab);
  const [profilesByID, setProfilesByID] = useState({});
  const [busy, setBusy] = useState({});

  const followingSet = useMemo(() => new Set(following), [following]);
  const followerSet = useMemo(() => new Set(followers), [followers]);
  const myFollowing = useMemo(() => new Set(cleanList(currentUser?.Friends)), [currentUser?.Friends]);
  const sharedWith = useMemo(
    () => new Set(cleanList(currentUser?.StatsAllowedFriends)),
    [currentUser?.StatsAllowedFriends]
  );

  const ids = tab === "following" ? following : tab === "requests" ? requests : followers;
  const idsKey = ids.join(",");

  // Own follow lists change while the app is open; refresh them on open.
  useEffect(() => {
    if (!isOwn || !ownerID || typeof setCurrentUser !== "function") return;
    let cancelled = false;
    getUser(ownerID)
      .then((fresh) => {
        if (cancelled || !fresh) return;
        setCurrentUser((prev) => ({
          ...(prev || {}),
          Friends: fresh.Friends || [],
          Followers: fresh.Followers || [],
          FollowRequests: fresh.FollowRequests || [],
        }));
      })
      .catch((err) => console.warn("Failed to refresh follow lists", err));
    return () => {
      cancelled = true;
    };
  }, [isOwn, ownerID, setCurrentUser]);

  useEffect(() => {
    const missing = ids.filter((id) => !profilesByID[id]);
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(
      missing.map((id) =>
        getUser(id).catch(() => ({ UserID: id, userID: id, Name: id, name: id }))
      )
    ).then((loaded) => {
      if (cancelled) return;
      setProfilesByID((prev) => {
        const next = { ...prev };
        loaded.forEach((p, i) => {
          next[missing[i]] = { ...p, UserID: missing[i] };
        });
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const run = async (id, key, fn) => {
    setBusy((prev) => ({ ...prev, [`${id}:${key}`]: true }));
    try {
      const result = await fn();
      const updated = result?.user;
      if (updated && typeof setCurrentUser === "function") {
        setCurrentUser((prev) => ({
          ...(prev || {}),
          Friends: updated.Friends || [],
          Followers: updated.Followers || [],
          FollowRequests: updated.FollowRequests || [],
          StatsAllowedFriends: updated.StatsAllowedFriends || [],
        }));
      }
    } catch (err) {
      console.error(`Follow action ${key} failed for`, id, err);
    } finally {
      setBusy((prev) => ({ ...prev, [`${id}:${key}`]: false }));
    }
  };

  const toggleShare = (id, allow) =>
    run(id, "share", async () => {
      const current = cleanList(currentUser?.StatsAllowedFriends);
      const next = allow ? Array.from(new Set([...current, id])) : current.filter((x) => x !== id);
      await updateUser(ownerID, { StatsAllowedFriends: next });
      setCurrentUser((prev) => ({ ...(prev || {}), StatsAllowedFriends: next }));
    });

  const isBusy = (id, key) => !!busy[`${id}:${key}`];

  const renderActions = (id, p) => {
    if (!isOwn) return null;

    if (tab === "requests") {
      return (
        <div className="friendListActions">
          <button
            type="button"
            className="friendStatsButton"
            disabled={isBusy(id, "respond")}
            onClick={() => run(id, "respond", () => respondToFollowRequest(ownerID, id, true))}
          >
            Accept
          </button>
          <button
            type="button"
            className="friendRemoveButton"
            title="Decline"
            disabled={isBusy(id, "respond")}
            onClick={() => run(id, "respond", () => respondToFollowRequest(ownerID, id, false))}
          >
            x
          </button>
        </div>
      );
    }

    if (tab === "followers") {
      return (
        <div className="friendListActions">
          {!myFollowing.has(id) && (
            <button
              type="button"
              className="friendStatsButton"
              disabled={isBusy(id, "follow")}
              onClick={() => run(id, "follow", () => followUser(id))}
            >
              Follow back
            </button>
          )}
          <button
            type="button"
            className="friendRemoveButton"
            title="Remove follower"
            disabled={isBusy(id, "remove")}
            onClick={() => {
              if (!window.confirm(`Remove @${id} from your followers?`)) return;
              run(id, "remove", () => removeFollower(ownerID, id));
            }}
          >
            x
          </button>
        </div>
      );
    }

    return (
      <div className="friendListActions">
        <label className="friendStatsSwitch" title="Let them see your full stats">
          <input
            type="checkbox"
            checked={sharedWith.has(id)}
            disabled={isBusy(id, "share")}
            onChange={(e) => toggleShare(id, e.target.checked)}
          />
          <span className="friendStatsSwitchLabel">Share</span>
        </label>
        <button
          type="button"
          className="friendStatsButton"
          disabled={p?.Viewer?.canView?.fullStats !== true}
          onClick={() => {
            navigate(`/stats?user=${encodeURIComponent(id)}`);
            if (typeof onNavigate === "function") onNavigate();
          }}
        >
          Stats
        </button>
        <button
          type="button"
          className="friendRemoveButton"
          title="Unfollow"
          disabled={isBusy(id, "unfollow")}
          onClick={() => {
            if (!window.confirm(`Unfollow @${id}?`)) return;
            run(id, "unfollow", () => unfollowUser(id));
          }}
        >
          x
        </button>
      </div>
    );
  };

  const tabs = [
    { key: "followers", label: "Followers", count: followers.length || profile?.FollowerCount || 0 },
    { key: "following", label: "Following", count: following.length || profile?.FollowingCount || 0 },
    ...(showRequestsTab ? [{ key: "requests", label: "Requests", count: requests.length }] : []),
  ];

  const emptyText = {
    followers: "No followers yet.",
    following: isOwn ? "You're not following anyone yet." : "Not following anyone yet.",
    requests: "No pending requests.",
  }[tab];

  return (
    <div className="followPanel">
      <div className="followPanelTabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={`followPanelTab ${tab === t.key ? "is-active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label} <span className="followPanelTabCount">{t.count}</span>
          </button>
        ))}
      </div>

      {listsHidden ? (
        <div className="friendsListStatus">@{ownerID} keeps these lists private.</div>
      ) : ids.length === 0 ? (
        <div className="friendsListStatus">{emptyText}</div>
      ) : (
        <div className="friendsList">
          {ids.map((id) => {
            const p = profilesByID[id];
            // A friend of the profile owner is a mutual follow.
            const isMutual = followingSet.has(id) && followerSet.has(id);
            return (
              <div key={id} className={`friendListRow ${isOwn ? "friendListRow--managed" : ""}`}>
                <NameTag user={p || { UserID: id, userID: id, Name: id, name: id }} size="xs" />
                {isMutual && tab !== "requests" && <span className="followFriendBadge">Friend</span>}
                {renderActions(id, p)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
