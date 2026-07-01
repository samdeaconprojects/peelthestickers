import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "./Social.css";
import { useDbStatus } from "../../contexts/DbStatusContext";
import Post from "../Profile/Post";
import PostDetail from "../Profile/PostDetail";
import StatSharePost from "../Profile/StatSharePost";
import NameTag from "../Profile/NameTag";
import { getPosts } from "../../services/getPosts";
import { getUser } from "../../services/getUser";
import { updatePostComments } from "../../services/updatePostComments";
import { getMessagesPage } from "../../services/getMessages";
import { sendMessage } from "../../services/sendMessage";
import { getConversations } from "../../services/getConversations";
import { createConversation } from "../../services/createConversation";
import { getGroups } from "../../services/getGroups";
import { joinGroup } from "../../services/joinGroup";
import { getGroupPosts } from "../../services/getGroupPosts";
import { updateGroupPostComments } from "../../services/updateGroupPostComments";
import { deleteGroupPost } from "../../services/deleteGroupPost";
import { createGroup } from "../../services/createGroup";
import { createSession } from "../../services/createSession";
import { createSocialEventSource } from "../../services/socialEvents";

import PuzzleSVG from "../PuzzleSVGs/PuzzleSVG";
import { currentEventToString, generateScramble } from "../scrambleUtils";
import SharedAverageModal from "./SharedAverageModal";
import SharedAverageMessage from "./SharedAverageMessage";
import CreateGroupModal from "./CreateGroupModal";
import JoinRoomModal from "./JoinRoomModal";

import DotIcon from "../../assets/Dot.svg";
import FlipIcon from "../../assets/Flip.svg";
import SearchIcon from "../../assets/Search.svg";

import SocialHomeIcon from "../../assets/SocialHome.svg";
import SocialMessagesIcon from "../../assets/SocialMessages.svg";

import { hexToRgbString } from "../../utils/colorUtils";

const FEED_POST_LIMIT = 25;
const GROUP_POST_LIMIT = 25;
const CONVERSATION_LIMIT = 100;
const MESSAGE_PAGE_SIZE = 25;
const REALTIME_BACKSTOP_REFRESH_MS = 300000;

const isDocumentVisible = () =>
  typeof document === "undefined" || document.visibilityState === "visible";

const withAlpha = (hex, alpha = 0.12) => {
  if (!hex) return `rgba(255,255,255,${alpha})`;
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return `rgba(255,255,255,${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

const buildLegacyDmConversationID = (a, b) =>
  [String(a || "").trim(), String(b || "").trim()]
    .filter(Boolean)
    .sort()
    .join("#");

const isInteractiveFeedTarget = (target) =>
  !!target?.closest?.(
    "button, input, select, textarea, a, .statsToggleBtn, .statsMiniBtn, .chartScaleInput, .lineChartDot, [data-interactive='solve-point'], svg .timeLineSegment, .timeLineSegment"
  );

const getMessageKey = (message = {}) =>
  `${message?.sender || ""}|${message?.timestamp || ""}|${message?.text || ""}`;

const mergeMessagesByKey = (...lists) => {
  const map = new Map();

  lists
    .flat()
    .filter(Boolean)
    .forEach((message) => {
      map.set(getMessageKey(message), message);
    });

  return Array.from(map.values()).sort((a, b) =>
    String(a?.timestamp || "").localeCompare(String(b?.timestamp || ""))
  );
};

const getPostIdentity = (post = {}) => {
  const ownerScope =
    String(post?.PostOwnerType || "").toUpperCase() === "GROUP" || post?.isGroupPost
      ? `GROUP:${post?.GroupID || post?.groupID || ""}`
      : `USER:${post?.authorID || post?.ownerUserID || post?.PK?.split?.("#")?.[1] || ""}`;
  const timestamp =
    post?.DateTime ||
    post?.date ||
    post?.CreatedAt ||
    (typeof post?.SK === "string" && post.SK.startsWith("POST#") ? post.SK.slice(5) : "");
  return `${ownerScope}|${timestamp}`;
};

const getPostTimestamp = (post = {}) => {
  const raw =
    post?.DateTime ||
    post?.date ||
    post?.CreatedAt ||
    (typeof post?.SK === "string" && post.SK.startsWith("POST#") ? post.SK.slice(5) : null);
  const value = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(value) ? value : 0;
};

const sortFeedItems = (items = []) =>
  [...items].sort((a, b) => getPostTimestamp(a) - getPostTimestamp(b)).slice(-FEED_POST_LIMIT);

const loadProfilesById = async (ids = []) => {
  const uniqueIds = Array.from(
    new Set(
      (Array.isArray(ids) ? ids : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    )
  );

  const entries = await Promise.all(
    uniqueIds.map(async (id) => {
      try {
        const prof = await getUser(id);
        return [id, prof];
      } catch (e) {
        console.warn("getUser failed for", id, e);
        return [id, null];
      }
    })
  );

  return Object.fromEntries(entries);
};

const normalizeConversationRecord = (item, profile = null) => {
  const conversationID = String(
    item?.ConversationID || item?.conversationID || ""
  ).trim();
  const conversationType = String(
    item?.ConversationType || item?.conversationType || "DM"
  ).toUpperCase();
  const otherUserID = String(item?.OtherUserID || item?.otherUserID || "").trim();

  return {
    conversationID,
    id: conversationID,
    type: conversationType,
    friendID: conversationType === "DM" ? otherUserID || conversationID : "",
    name:
      profile?.Name ||
      profile?.name ||
      item?.DisplayName ||
      item?.displayName ||
      item?.Name ||
      item?.name ||
      conversationID,
    username:
      profile?.Username ||
      profile?.username ||
      otherUserID ||
      item?.DisplayName ||
      item?.displayName ||
      conversationID,
    color: profile?.Color || profile?.color || "#cccccc",
    profileEvent: profile?.ProfileEvent || profile?.profileEvent || "333",
    profileScramble: profile?.ProfileScramble || profile?.profileScramble || "",
    messages: Array.isArray(item?.messages) ? item.messages : [],
    messagesCursor: item?.messagesCursor || null,
    hasOlderMessages: !!item?.hasOlderMessages,
    loadingOlderMessages: false,
    lastMessageAt: item?.LastMessageAt || item?.lastMessageAt || null,
    lastMessagePreview: item?.LastMessagePreview || item?.lastMessagePreview || "",
    sharedStats: item?.SharedStats || item?.sharedStats || null,
    memberIDs: Array.isArray(item?.MemberIDs) ? item.MemberIDs : [],
    isPlaceholder: false,
  };
};

const buildPlaceholderDmConversation = (currentUserID, friendID, profile = null) => {
  const conversationID = buildLegacyDmConversationID(currentUserID, friendID);
  return {
    conversationID,
    id: conversationID,
    type: "DM",
    friendID,
    name: profile?.Name || profile?.name || friendID,
    username: profile?.Username || profile?.username || friendID,
    color: profile?.Color || profile?.color || "#cccccc",
    profileEvent: profile?.ProfileEvent || profile?.profileEvent || "333",
    profileScramble: profile?.ProfileScramble || profile?.profileScramble || "",
    messages: [],
    messagesCursor: null,
    hasOlderMessages: false,
    loadingOlderMessages: false,
    lastMessageAt: null,
    lastMessagePreview: "",
    sharedStats: null,
    memberIDs: [currentUserID, friendID].filter(Boolean),
    isPlaceholder: true,
  };
};

const buildConversationMembers = (memberIDs, profilesById, currentUser) =>
  (Array.isArray(memberIDs) ? memberIDs : [])
    .map((memberID) => {
      const id = String(memberID || "").trim();
      if (!id) return null;
      if (id === currentUser?.UserID) {
        return {
          id,
          name: currentUser?.Name || currentUser?.Username || id,
          username: currentUser?.Username || id,
          color: currentUser?.Color || currentUser?.color || "#2EC4B6",
          profileEvent: currentUser?.ProfileEvent || "333",
          profileScramble: currentUser?.ProfileScramble || "",
          isYou: true,
        };
      }
      const profile = profilesById?.[id] || null;
      return {
        id,
        name: profile?.Name || profile?.name || id,
        username: profile?.Username || profile?.username || id,
        color: profile?.Color || profile?.color || "#cccccc",
        profileEvent: profile?.ProfileEvent || profile?.profileEvent || "333",
        profileScramble: profile?.ProfileScramble || profile?.profileScramble || "",
        isYou: false,
      };
    })
    .filter(Boolean);

const buildFeedEntryFromNotification = (payload, currentUser) => {
  const post = payload?.post;
  if (!post || !currentUser?.UserID) return null;

  const author = payload?.author || {};
  const group = payload?.group || null;
  const authorID = String(
    author?.userID || post?.AuthorID || payload?.ownerUserID || ""
  ).trim();
  const isGroupPost = String(payload?.scope || "").toUpperCase() === "GROUP";

  return {
    ...post,
    author: author?.name || post?.AuthorName || authorID || "Unknown",
    authorID,
    isOwn: authorID === currentUser.UserID,
    isGroupPost,
    groupID: isGroupPost ? String(payload?.groupID || post?.GroupID || "").trim() : "",
    groupName: isGroupPost ? group?.name || post?.GroupID || "" : "",
    postColor: isGroupPost
      ? group?.color || "#7f8c8d"
      : author?.color || currentUser.Color || currentUser.color || "#cccccc",
    authorTagColorCatalog: author?.tagColorCatalog || null,
    profileEvent: author?.profileEvent || currentUser.ProfileEvent || "333",
    profileScramble: author?.profileScramble || "",
  };
};

const getGroupAvatarGridConfig = (memberCount) => {
  const count = Math.max(1, Math.min(Number(memberCount) || 0, 9));

  if (count === 1) return { cols: 1, rows: 1, densityClass: "groupAvatarCluster--solo" };
  if (count === 2) return { cols: 2, rows: 1, densityClass: "groupAvatarCluster--wide" };
  if (count <= 4) return { cols: 2, rows: 2, densityClass: "groupAvatarCluster--quad" };
  if (count <= 6) return { cols: 3, rows: 2, densityClass: "groupAvatarCluster--compact" };
  return { cols: 3, rows: 3, densityClass: "groupAvatarCluster--dense" };
};

const parseSharedAoNPayload = (text) => {
  if (!String(text || "").startsWith("[sharedAoN]")) return null;
  try {
    return JSON.parse(String(text).slice("[sharedAoN]".length));
  } catch (err) {
    console.warn("Failed to parse sharedAoN payload:", err);
    return null;
  }
};

const parseSharedRoomClosedPayload = (text) => {
  if (!String(text || "").startsWith("[sharedRoomClosed]")) return null;
  try {
    return JSON.parse(String(text).slice("[sharedRoomClosed]".length));
  } catch (err) {
    console.warn("Failed to parse sharedRoomClosed payload:", err);
    return null;
  }
};

const parseSharedPostPayload = (text) => {
  if (!String(text || "").startsWith("[sharedPost]")) return null;
  try {
    const raw = String(text).slice("[sharedPost]".length);
    return JSON.parse(decodeURIComponent(raw));
  } catch (err) {
    console.warn("Failed to parse sharedPost payload:", err);
    return null;
  }
};

const parseSharedExtendPayload = (text) => {
  if (!String(text || "").startsWith("[sharedExtend]")) return null;
  try {
    return JSON.parse(String(text).slice("[sharedExtend]".length));
  } catch (err) {
    console.warn("Failed to parse sharedExtend payload:", err);
    return null;
  }
};

const parseSharedUpdatePayload = (text) => {
  if (!String(text || "").startsWith("[sharedUpdate]")) return null;

  const raw = String(text).slice("[sharedUpdate]".length);
  const [sharedID, solveIndexRaw, timeRaw, senderID] = raw.split("|");

  const solveIndex = Number(solveIndexRaw);
  const time = Number(timeRaw);

  if (!sharedID || !senderID || !Number.isFinite(solveIndex)) return null;

  return {
    sharedID,
    solveIndex,
    time: Number.isFinite(time) ? time : null,
    senderID,
  };
};

const getSharedSessionEvent = (...candidates) =>
  candidates
    .flatMap((candidate) => (Array.isArray(candidate) ? candidate : [candidate]))
    .map((value) => String(value || "").trim().toUpperCase())
    .find(Boolean) || "333";

const getLatestHostedSharedMessage = (messages = []) =>
  [...(Array.isArray(messages) ? messages : [])]
    .filter((msg) => msg?.text?.startsWith("[sharedAoN]"))
    .map((msg) => ({
      msg,
      payload: parseSharedAoNPayload(msg?.text),
    }))
    .filter(
      (entry) =>
        entry?.payload?.sharedID &&
        (entry?.payload?.isHosted === true ||
          String(entry?.payload?.mode || entry?.payload?.type || "").toLowerCase() === "hosted")
    )
    .sort((a, b) =>
      String(a?.msg?.timestamp || a?.msg?.createdAt || "").localeCompare(
        String(b?.msg?.timestamp || b?.msg?.createdAt || "")
      )
    )
    .at(-1) || null;

const getLatestHostedRoomClosedMessage = (messages = []) =>
  [...(Array.isArray(messages) ? messages : [])]
    .map((msg) => ({
      msg,
      payload: parseSharedRoomClosedPayload(msg?.text),
    }))
    .filter((entry) => entry?.payload?.conversationID || entry?.payload?.roomCode)
    .sort((a, b) =>
      String(a?.msg?.timestamp || a?.msg?.createdAt || "").localeCompare(
        String(b?.msg?.timestamp || b?.msg?.createdAt || "")
      )
    )
    .at(-1) || null;

const isSharedPostMessage = (msg = {}) =>
  String(msg?.messageType || "").toUpperCase() === "SHARED_POST" ||
  !!parseSharedPostPayload(msg?.text) ||
  !!msg?.statShare ||
  String(msg?.postType || "").toLowerCase() === "stat-share" ||
  (Array.isArray(msg?.solveList) && msg.solveList.length > 0);

const getSharedMessagePreviewText = (msg = {}) => {
  const parsed = parseSharedPostPayload(msg?.text) || {};
  const note = String(msg?.note || parsed?.note || "").trim();
  if (note) return note;
  if (
    msg?.statShare ||
    parsed?.statShare ||
    String(msg?.postType || parsed?.postType || "").toLowerCase() === "stat-share"
  ) {
    return "[Shared stat card]";
  }
  const solveCount = Array.isArray(msg?.solveList)
    ? msg.solveList.length
    : Array.isArray(parsed?.solveList)
      ? parsed.solveList.length
      : 0;
  return solveCount > 1 ? `[Shared average of ${solveCount}]` : "[Shared solve]";
};

const buildRoundResultsFromMessages = (messages, sharedID) => {
  const nextRoundResults = {};

  (Array.isArray(messages) ? messages : []).forEach((msg) => {
    const payload = parseSharedUpdatePayload(msg?.text);
    if (!payload || payload.sharedID !== sharedID) return;

    nextRoundResults[payload.solveIndex] = {
      ...(nextRoundResults[payload.solveIndex] || {}),
      [payload.senderID]: {
        ...(nextRoundResults[payload.solveIndex]?.[payload.senderID] || {}),
        time: payload.time,
        updatedAt:
          msg?.timestamp || msg?.createdAt || msg?.datetime || new Date().toISOString(),
      },
    };
  });

  return nextRoundResults;
};

const applySharedExtensions = (session, messages = []) => {
  if (!session?.sharedID) return session;

  const extensions = (Array.isArray(messages) ? messages : [])
    .filter((msg) => msg?.text?.startsWith("[sharedExtend]"))
    .map((msg) => ({
      payload: parseSharedExtendPayload(msg.text),
      timestamp: msg?.timestamp || msg?.createdAt || msg?.datetime || "",
    }))
    .filter((entry) => entry.payload?.sharedID === session.sharedID)
    .sort((a, b) => String(a.timestamp || "").localeCompare(String(b.timestamp || "")));

  if (!extensions.length) return session;

  let next = { ...session };

  extensions.forEach(({ payload }) => {
    next = {
      ...next,
      creatorEvents: [...(next.creatorEvents || []), ...(payload.creatorEvents || [])],
      opponentEvents: [...(next.opponentEvents || []), ...(payload.opponentEvents || [])],
      creatorScrambles: [...(next.creatorScrambles || []), ...(payload.creatorScrambles || [])],
      opponentScrambles: [...(next.opponentScrambles || []), ...(payload.opponentScrambles || [])],
      events: [...(next.events || []), ...(payload.creatorEvents || payload.events || [])],
      scrambles: [...(next.scrambles || []), ...(payload.creatorScrambles || payload.scrambles || [])],
      count: Math.max(
        Number(next.count || 0),
        Number(payload.count || 0),
        [...(next.scrambles || []), ...(payload.creatorScrambles || payload.scrambles || [])].length
      ),
    };
  });

  return next;
};

const mergeRoundResults = (baseRoundResults, incomingRoundResults) => {
  const merged = { ...(baseRoundResults || {}) };

  Object.entries(incomingRoundResults || {}).forEach(([solveIndex, incomingRow]) => {
    const baseRow = merged[solveIndex] || {};
    const nextRow = { ...baseRow };

    Object.entries(incomingRow || {}).forEach(([participantID, incomingResult]) => {
      const baseResult = baseRow?.[participantID] || null;
      const incomingTs = incomingResult?.updatedAt
        ? new Date(incomingResult.updatedAt).getTime()
        : 0;
      const baseTs = baseResult?.updatedAt ? new Date(baseResult.updatedAt).getTime() : 0;

      nextRow[participantID] =
        incomingTs >= baseTs && incomingResult?.time != null ? incomingResult : baseResult || incomingResult;
    });

    merged[solveIndex] = nextRow;
  });

  return merged;
};

function Social({
  user,
  deletePost,
  beginSharedSession,
  updateSharedSession,
  mergeSharedSession,
  refreshTick,
  sharedSession,
  leaveSharedRun,
  currentEvent,
}) {
  const { runDb } = useDbStatus();
  const [activeTab, setActiveTab] = useState(0);
  const [feed, setFeed] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [suggestions, setSuggestions] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageInput, setMessageInput] = useState("");
  const [showConversationStats, setShowConversationStats] = useState(false);
  const [showConversationHeader, setShowConversationHeader] = useState(true);
  const [showSharedModal, setShowSharedModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState("");
  const [showJoinRoomModal, setShowJoinRoomModal] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [joinRoomError, setJoinRoomError] = useState("");
  const [friendDirectory, setFriendDirectory] = useState([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);

  const navigate = useNavigate();
  const location = useLocation();

  const activityEndRef = useRef(null);
  const activityPanelRef = useRef(null);
  const messagesPanelRef = useRef(null);
  const messagesEndRef = useRef(null);
  const sharedMessageRefs = useRef({});
  const profileCacheRef = useRef(new Map());
  const selectedConversationRef = useRef(null);
  const sharedSessionRef = useRef(sharedSession);
  const conversationsRef = useRef(conversations);
  const refreshInFlightRef = useRef(false);
  const socialLoadInFlightRef = useRef(false);
  const loadOlderInFlightRef = useRef(false);
  const skipNextAutoScrollRef = useRef(false);
  const shouldStickActivityToBottomRef = useRef(true);
  const lastMessageMetaRef = useRef({
    conversationID: "",
    count: 0,
  });

  useEffect(() => {
    selectedConversationRef.current = selectedConversation;
  }, [selectedConversation]);

  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    setShowConversationStats(false);
  }, [selectedConversation?.conversationID]);

  useEffect(() => {
    sharedSessionRef.current = sharedSession;
  }, [sharedSession]);

  const loadProfilesByIdCached = useCallback(async (ids = []) => {
    const uniqueIds = Array.from(
      new Set(
        (Array.isArray(ids) ? ids : [])
          .map((id) => String(id || "").trim())
          .filter(Boolean)
      )
    );

    const missingIds = uniqueIds.filter((id) => !profileCacheRef.current.has(id));

    if (missingIds.length) {
      const entries = await loadProfilesById(missingIds);
      Object.entries(entries || {}).forEach(([id, value]) => {
        profileCacheRef.current.set(id, value || null);
      });
    }

    return Object.fromEntries(
      uniqueIds.map((id) => [id, profileCacheRef.current.get(id) || null])
    );
  }, []);

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

  const scrollActivityToBottom = useCallback(() => {
    const panel = activityPanelRef.current;
    if (panel) {
      panel.scrollTop = panel.scrollHeight;
      return;
    }
    activityEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, []);

  const handleActivityScroll = useCallback(() => {
    const panel = activityPanelRef.current;
    if (!panel) return;

    const distanceFromBottom =
      panel.scrollHeight - panel.scrollTop - panel.clientHeight;
    shouldStickActivityToBottomRef.current = distanceFromBottom < 80;
  }, []);

  const scrollToSharedRun = (sharedID, behavior = "smooth") => {
    if (!sharedID) return false;
    const el = sharedMessageRefs.current[sharedID];
    if (!el) return false;

    el.scrollIntoView({
      behavior,
      block: "center",
    });
    return true;
  };

  const mergeConversationLists = useCallback((incoming, existing) => {
    const existingMap = new Map(
      (Array.isArray(existing) ? existing : []).map((conv) => [conv.conversationID, conv])
    );

    return (Array.isArray(incoming) ? incoming : []).map((conv) => {
      const prev = existingMap.get(conv.conversationID);
      if (!prev) return conv;

      const prevMessages = Array.isArray(prev.messages) ? prev.messages : [];
      const nextMessages =
        Array.isArray(conv.messages) && conv.messages.length ? conv.messages : prevMessages;

      return {
        ...prev,
        ...conv,
        messages: nextMessages,
        lastMessageAt:
          conv.lastMessageAt ||
          prev.lastMessageAt ||
          nextMessages[nextMessages.length - 1]?.timestamp ||
          null,
        lastMessagePreview:
          conv.lastMessagePreview ||
          prev.lastMessagePreview ||
          nextMessages[nextMessages.length - 1]?.text ||
          "",
      };
    });
  }, []);

  const upsertConversation = useCallback((conversation) => {
    if (!conversation?.conversationID) return;

    setConversations((prev) => {
      const found = prev.some((conv) => conv.conversationID === conversation.conversationID);
      if (!found) return [...prev, conversation];

      return prev.map((conv) =>
        conv.conversationID === conversation.conversationID
          ? {
              ...conv,
              ...conversation,
              messages:
                Array.isArray(conversation.messages) && conversation.messages.length
                  ? conversation.messages
                  : Array.isArray(conv.messages)
                  ? conv.messages
                  : [],
            }
          : conv
      );
    });

    setSelectedConversation((prev) => {
      if (!prev?.conversationID) return prev;
      if (prev.conversationID !== conversation.conversationID) return prev;

      return {
        ...prev,
        ...conversation,
        messages:
          Array.isArray(conversation.messages) && conversation.messages.length
            ? conversation.messages
            : Array.isArray(prev.messages)
            ? prev.messages
            : [],
      };
    });
  }, []);

  const upsertFeedItem = useCallback((feedItem) => {
    if (!feedItem) return;

    setFeed((prev) => {
      const next = new Map((Array.isArray(prev) ? prev : []).map((item) => [getPostIdentity(item), item]));
      next.set(getPostIdentity(feedItem), {
        ...(next.get(getPostIdentity(feedItem)) || {}),
        ...feedItem,
      });
      return sortFeedItems(Array.from(next.values()));
    });

    setSelectedPost((prev) => {
      if (!prev) return prev;
      if (getPostIdentity(prev) !== getPostIdentity(feedItem)) return prev;
      return {
        ...prev,
        ...feedItem,
      };
    });
  }, []);

  const patchFeedItem = useCallback((matcher, patch) => {
    setFeed((prev) =>
      sortFeedItems(
        (Array.isArray(prev) ? prev : []).map((item) =>
          matcher(item)
            ? {
                ...item,
                ...patch,
              }
            : item
        )
      )
    );

    setSelectedPost((prev) => {
      if (!prev || !matcher(prev)) return prev;
      return {
        ...prev,
        ...patch,
      };
    });
  }, []);

  const removeFeedItem = useCallback((matcher) => {
    setFeed((prev) => (Array.isArray(prev) ? prev : []).filter((item) => !matcher(item)));
    setSelectedPost((prev) => (prev && matcher(prev) ? null : prev));
  }, []);

  useEffect(() => {
    if (activeTab !== 0) return;
    if (!shouldStickActivityToBottomRef.current) return;
    scrollActivityToBottom();
  }, [feed.length, activeTab, scrollActivityToBottom]);

  useEffect(() => {
    if (activeTab !== 1) return;
    if (!selectedConversation?.conversationID) return;

    const currentCount = Array.isArray(selectedConversation.messages)
      ? selectedConversation.messages.length
      : 0;

    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      lastMessageMetaRef.current = {
        conversationID: selectedConversation.conversationID,
        count: currentCount,
      };
      return;
    }

    const prev = lastMessageMetaRef.current;
    const switchedConversation =
      prev.conversationID !== selectedConversation.conversationID;
    const gainedMessages = currentCount > prev.count;

    if (switchedConversation) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    } else if (gainedMessages) {
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
    }

    lastMessageMetaRef.current = {
      conversationID: selectedConversation.conversationID,
      count: currentCount,
    };
  }, [activeTab, selectedConversation?.conversationID, selectedConversation?.messages]);

  const handleRefreshMessages = useCallback(async () => {
    const activeConversation = selectedConversationRef.current;
    if (!activeConversation || !user?.UserID) return;
    if (refreshInFlightRef.current) return;

    const conversationID = activeConversation.conversationID;
    const activeSharedSession = sharedSessionRef.current;

    refreshInFlightRef.current = true;
    try {
      const page = await getMessagesPage(conversationID, user.UserID, {
        limit: MESSAGE_PAGE_SIZE,
      });
      const messages = page.items || [];

      setSelectedConversation((prev) =>
        prev?.conversationID === conversationID
          ? {
              ...prev,
              messages: mergeMessagesByKey(prev.messages || [], messages),
              messagesCursor:
                prev?.messagesCursor !== undefined && prev?.messagesCursor !== null
                  ? prev.messagesCursor
                  : page.nextCursor,
              hasOlderMessages:
                prev?.hasOlderMessages !== undefined
                  ? prev.hasOlderMessages
                  : !!page.hasMore,
              loadingOlderMessages: false,
              isPlaceholder: false,
              lastMessageAt:
                messages[messages.length - 1]?.timestamp || prev.lastMessageAt || null,
              lastMessagePreview:
                messages[messages.length - 1]?.text || prev.lastMessagePreview || "",
            }
          : prev
      );

      setConversations((prev) =>
        prev.map((conv) =>
          conv.conversationID === conversationID
            ? {
                ...conv,
                messages: mergeMessagesByKey(conv.messages || [], messages),
                messagesCursor:
                  conv?.messagesCursor !== undefined && conv?.messagesCursor !== null
                    ? conv.messagesCursor
                    : page.nextCursor,
                hasOlderMessages:
                  conv?.hasOlderMessages !== undefined
                    ? conv.hasOlderMessages
                    : !!page.hasMore,
                loadingOlderMessages: false,
                isPlaceholder: false,
                lastMessageAt:
                  messages[messages.length - 1]?.timestamp || conv.lastMessageAt || null,
                lastMessagePreview:
                  messages[messages.length - 1]?.text || conv.lastMessagePreview || "",
              }
            : conv
        )
      );

      if (
        activeSharedSession?.sharedID &&
        String(activeSharedSession?.conversationID || "") === String(conversationID || "")
      ) {
        const fetchedRoundResults = buildRoundResultsFromMessages(
          mergeMessagesByKey(activeConversation.messages || [], messages),
          activeSharedSession.sharedID
        );
        const extendedSession = applySharedExtensions(
          {
            ...activeSharedSession,
            roundResults: mergeRoundResults(activeSharedSession.roundResults, fetchedRoundResults),
          },
          mergeMessagesByKey(activeConversation.messages || [], messages)
        );

        updateSharedSession((prev) => {
          if (!prev || prev.sharedID !== activeSharedSession.sharedID) return prev;
          return {
            ...prev,
            ...extendedSession,
            roundResults: mergeRoundResults(prev.roundResults, fetchedRoundResults),
          };
        });
      }
    } catch (err) {
      console.error("Failed to refresh messages:", err);
    } finally {
      refreshInFlightRef.current = false;
    }
  }, [user?.UserID, updateSharedSession]);

  useEffect(() => {
    if (activeTab !== 1) return;
    if (!selectedConversation?.conversationID) return;
    if (!user?.UserID) return;

    handleRefreshMessages();
  }, [activeTab, selectedConversation?.conversationID, user?.UserID, handleRefreshMessages]);

  useEffect(() => {
    if (activeTab !== 1) return;
    if (!selectedConversation?.conversationID) return;
    if (!user?.UserID) return;

    handleRefreshMessages();
  }, [refreshTick, activeTab, selectedConversation?.conversationID, user?.UserID, handleRefreshMessages]);

  const handleLoadOlderMessages = useCallback(async () => {
    const activeConversation = selectedConversationRef.current;
    const panel = messagesPanelRef.current;
    if (!activeConversation?.conversationID || !user?.UserID || !panel) return;
    if (!activeConversation?.hasOlderMessages || !activeConversation?.messagesCursor) return;
    if (loadOlderInFlightRef.current) return;

    loadOlderInFlightRef.current = true;
    const previousHeight = panel.scrollHeight;
    const previousTop = panel.scrollTop;

    setSelectedConversation((prev) =>
      prev?.conversationID === activeConversation.conversationID
        ? { ...prev, loadingOlderMessages: true }
        : prev
    );
    setConversations((prev) =>
      prev.map((conv) =>
        conv.conversationID === activeConversation.conversationID
          ? { ...conv, loadingOlderMessages: true }
          : conv
      )
    );

    try {
      const page = await getMessagesPage(activeConversation.conversationID, user.UserID, {
        limit: MESSAGE_PAGE_SIZE,
        cursor: activeConversation.messagesCursor,
      });

      skipNextAutoScrollRef.current = true;

      setSelectedConversation((prev) =>
        prev?.conversationID === activeConversation.conversationID
          ? {
              ...prev,
              messages: mergeMessagesByKey(page.items || [], prev.messages || []),
              messagesCursor: page.nextCursor,
              hasOlderMessages: !!page.hasMore,
              loadingOlderMessages: false,
            }
          : prev
      );

      setConversations((prev) =>
        prev.map((conv) =>
          conv.conversationID === activeConversation.conversationID
            ? {
                ...conv,
                messages: mergeMessagesByKey(page.items || [], conv.messages || []),
                messagesCursor: page.nextCursor,
                hasOlderMessages: !!page.hasMore,
                loadingOlderMessages: false,
              }
            : conv
        )
      );

      window.requestAnimationFrame(() => {
        const nextPanel = messagesPanelRef.current;
        if (!nextPanel) return;
        const heightDelta = nextPanel.scrollHeight - previousHeight;
        nextPanel.scrollTop = previousTop + Math.max(0, heightDelta);
      });
    } catch (err) {
      console.error("Failed to load older messages:", err);
      setSelectedConversation((prev) =>
        prev?.conversationID === activeConversation.conversationID
          ? { ...prev, loadingOlderMessages: false }
          : prev
      );
      setConversations((prev) =>
        prev.map((conv) =>
          conv.conversationID === activeConversation.conversationID
            ? { ...conv, loadingOlderMessages: false }
            : conv
        )
      );
    } finally {
      loadOlderInFlightRef.current = false;
    }
  }, [user?.UserID]);

  const handleMessagesScroll = useCallback(() => {
    const panel = messagesPanelRef.current;
    if (!panel || loadOlderInFlightRef.current) return;
    if (panel.scrollTop > 80) return;
    handleLoadOlderMessages();
  }, [handleLoadOlderMessages]);

  const loadSocialData = useCallback(
    async (preferredConversationID = "", { includeFeed = true } = {}) => {
      if (!user?.UserID) return;
      if (socialLoadInFlightRef.current) return;

      socialLoadInFlightRef.current = true;
      try {
        const friendIds = user.Friends || [];
        let groups = [];
        try {
          groups = await getGroups(user.UserID);
        } catch (err) {
          console.warn("getGroups failed; continuing without group data", err);
          groups = [];
        }

        let storedConversations = [];
        try {
          storedConversations = await getConversations(user.UserID, CONVERSATION_LIMIT);
        } catch (err) {
          console.warn("getConversations failed; continuing with placeholder DMs", err);
          storedConversations = [];
        }

        const conversationProfileIds = storedConversations.flatMap((item) => {
          const memberIds = Array.isArray(item?.MemberIDs) ? item.MemberIDs : [];
          const otherUserID = String(item?.OtherUserID || "").trim();
          return [...memberIds, otherUserID];
        });

        const profilesById = await loadProfilesByIdCached([
          ...friendIds,
          ...conversationProfileIds,
        ]);

        setFriendDirectory(
          friendIds.map((id) => ({
            id,
            name: profilesById[id]?.Name || profilesById[id]?.name || id,
          }))
        );

        const groupsByConversationID = Object.fromEntries(
          groups
            .map((group) => [String(group?.ConversationID || "").trim(), group])
            .filter(([conversationID]) => conversationID)
        );

        if (includeFeed) {
          const own = await getPosts(user.UserID, FEED_POST_LIMIT);
          const ownAnnotated = own.map((p) => ({
            ...p,
            author: user.Name,
            authorID: user.UserID,
            isOwn: true,
            postColor: user.Color || user.color || "#2EC4B6",
            authorTagColorCatalog: user.TagColorCatalog || null,
            profileEvent: user.ProfileEvent || "333",
            profileScramble: user.ProfileScramble || "",
          }));

          const friendsArrays = await Promise.all(
            friendIds.map(async (id) => {
              const posts = await getPosts(id, FEED_POST_LIMIT);
              const prof = profilesById[id];

              return posts.map((p) => ({
                ...p,
                author: prof?.Name || prof?.name || id,
                authorID: id,
                isOwn: false,
                postColor: prof?.Color || prof?.color || "#cccccc",
                authorTagColorCatalog: prof?.TagColorCatalog || null,
                profileEvent: prof?.ProfileEvent || prof?.profileEvent || "333",
                profileScramble: prof?.ProfileScramble || prof?.profileScramble || "",
              }));
            })
          );

          const groupPostArrays = await Promise.all(
            groups.map(async (group) => {
              const groupID = String(group?.GroupID || "").trim();
              if (!groupID) return [];

              let posts = [];
              try {
                posts = await getGroupPosts(groupID, user.UserID, GROUP_POST_LIMIT);
              } catch (err) {
                console.warn("getGroupPosts failed for", groupID, err);
                posts = [];
              }
              return posts.map((p) => ({
                ...p,
                author: p.AuthorName || p.AuthorID || group.Name || groupID,
                authorID: p.AuthorID || "",
                isOwn: p.AuthorID === user.UserID,
                isGroupPost: true,
                groupID,
                groupName: group.Name || groupID,
                postColor: group.Color || "#7f8c8d",
                authorTagColorCatalog:
                  profilesById[p.AuthorID || ""]?.TagColorCatalog ||
                  (p.AuthorID === user.UserID ? user.TagColorCatalog || null : null),
                profileEvent: user.ProfileEvent || "333",
                profileScramble: "",
              }));
            })
          );

          const merged = [...ownAnnotated, ...friendsArrays.flat(), ...groupPostArrays.flat()];
          merged.sort((a, b) => new Date(a.DateTime || a.date) - new Date(b.DateTime || b.date));
          setFeed(merged.slice(-FEED_POST_LIMIT));
        }

        const normalizedStored = storedConversations.map((item) => {
          const otherUserID = String(item?.OtherUserID || "").trim();
          const profile = otherUserID ? profilesById[otherUserID] || null : null;
          const conversationID = String(item?.ConversationID || "").trim();
          const group = groupsByConversationID[conversationID] || null;
          const memberProfiles = buildConversationMembers(
            item?.MemberIDs || [],
            profilesById,
            user
          );

          if (String(item?.ConversationType || "").toUpperCase() === "GROUP") {
            return {
              ...normalizeConversationRecord(item, null),
              name: group?.Name || item?.Name || item?.DisplayName || conversationID,
              username: group?.Name || item?.Name || conversationID,
              color: group?.Color || "#7f8c8d",
              groupID: group?.GroupID || "",
              isJoinable: group?.IsJoinable === true,
              roomCode: group?.JoinCode || group?.GroupID || "",
              isStreamRoom: group?.IsStreamRoom === true,
              memberProfiles,
            };
          }

          return {
            ...normalizeConversationRecord(item, profile),
            memberProfiles,
          };
        });

        const conversationMap = new Map(
          normalizedStored.map((conv) => [conv.conversationID, conv])
        );

        friendIds.forEach((friendID) => {
          const conversationID = buildLegacyDmConversationID(user.UserID, friendID);
          if (!conversationMap.has(conversationID)) {
            conversationMap.set(
              conversationID,
              buildPlaceholderDmConversation(
                user.UserID,
                friendID,
                profilesById[friendID] || null
              )
            );
          }
        });

        const nextConversationsRaw = Array.from(conversationMap.values());
        const nextConversations = mergeConversationLists(
          nextConversationsRaw,
          conversationsRef.current
        );

        setConversations(nextConversations);

        setSelectedConversation((prev) => {
          const currentSelectedID =
            String(preferredConversationID || "").trim() ||
            String(location.state?.conversationID || "").trim() ||
            String(prev?.conversationID || "").trim();

          if (!currentSelectedID) return prev;

          const match = nextConversations.find(
            (conv) => String(conv.conversationID) === currentSelectedID
          );

          if (!match) return prev;

          return {
            ...prev,
            ...match,
            messages:
              Array.isArray(match.messages) && match.messages.length
                ? match.messages
                : Array.isArray(prev?.messages)
                ? prev.messages
                : [],
          };
        });
      } catch (err) {
        console.error("Error fetching social data:", err);
      } finally {
        socialLoadInFlightRef.current = false;
      }
    },
    [user, mergeConversationLists, location.state?.conversationID, loadProfilesByIdCached]
  );

  const refreshConversationDirectory = useCallback(async () => {
    const preferredConversationID = String(location.state?.conversationID || "").trim();
    await loadSocialData(preferredConversationID, { includeFeed: false });
  }, [loadSocialData, location.state?.conversationID]);

  const handleRefreshMessagesAndSidebar = useCallback(async () => {
    await Promise.allSettled([refreshConversationDirectory(), handleRefreshMessages()]);
  }, [refreshConversationDirectory, handleRefreshMessages]);

  const handleSocialEvent = useCallback(
    async (payload = {}) => {
      const eventType = String(payload?.type || "").trim();
      if (!eventType || eventType === "stream.connected") return;

      if (eventType === "message.created") {
        const conversationID = String(payload?.conversationID || "").trim();
        const message = payload?.message || null;
        const conversationPatch = {
          conversationID,
          type: String(payload?.conversation?.conversationType || "DM").toUpperCase(),
          memberIDs: Array.isArray(payload?.conversation?.memberIDs)
            ? payload.conversation.memberIDs
            : [],
          lastMessageAt: payload?.conversation?.lastMessageAt || message?.timestamp || null,
          lastMessagePreview:
            payload?.conversation?.lastMessagePreview || message?.text || "",
          isPlaceholder: false,
        };

        const hasConversation = conversationsRef.current.some(
          (conv) => conv.conversationID === conversationID
        );

        if (!hasConversation) {
          await refreshConversationDirectory();
          return;
        }

        setConversations((prev) =>
          prev.map((conv) =>
            conv.conversationID === conversationID
              ? {
                  ...conv,
                  ...conversationPatch,
                  messages: message
                    ? mergeMessagesByKey(conv.messages || [], [message])
                    : conv.messages || [],
                }
              : conv
          )
        );

        setSelectedConversation((prev) =>
          prev?.conversationID === conversationID
            ? {
                ...prev,
                ...conversationPatch,
                messages: message
                  ? mergeMessagesByKey(prev.messages || [], [message])
                  : prev.messages || [],
              }
            : prev
        );
        return;
      }

      if (eventType === "post.created") {
        const feedItem = buildFeedEntryFromNotification(payload, user);
        upsertFeedItem(feedItem);
        return;
      }

      if (eventType === "post.comments.updated") {
        const targetTimestamp = String(payload?.timestamp || "").trim();
        const targetScope = String(payload?.scope || "").toUpperCase();
        patchFeedItem(
          (item) => {
            const itemTimestamp = String(
              item?.DateTime || item?.date || item?.CreatedAt || ""
            ).trim();
            if (itemTimestamp !== targetTimestamp) return false;
            if (targetScope === "GROUP") {
              return (
                String(item?.groupID || item?.GroupID || "").trim() ===
                String(payload?.groupID || "").trim()
              );
            }
            return (
              String(item?.authorID || item?.PK?.split?.("#")?.[1] || "").trim() ===
              String(payload?.ownerUserID || "").trim()
            );
          },
          { Comments: Array.isArray(payload?.comments) ? payload.comments : [] }
        );
        return;
      }

      if (eventType === "post.deleted") {
        const targetTimestamp = String(payload?.timestamp || "").trim();
        const targetScope = String(payload?.scope || "").toUpperCase();
        removeFeedItem((item) => {
          const itemTimestamp = String(
            item?.DateTime || item?.date || item?.CreatedAt || ""
          ).trim();
          if (itemTimestamp !== targetTimestamp) return false;
          if (targetScope === "GROUP") {
            return (
              String(item?.groupID || item?.GroupID || "").trim() ===
              String(payload?.groupID || "").trim()
            );
          }
          return (
            String(item?.authorID || item?.PK?.split?.("#")?.[1] || "").trim() ===
            String(payload?.ownerUserID || "").trim()
          );
        });
      }
    },
    [patchFeedItem, refreshConversationDirectory, removeFeedItem, upsertFeedItem, user]
  );

  useEffect(() => {
    const preferredConversationID = String(location.state?.conversationID || "").trim();

    if (location.state?.openMessages) {
      setActiveTab(1);
    }

    if (activeTab === 1) {
      loadSocialData(preferredConversationID, { includeFeed: false });

      if (selectedConversationRef.current?.conversationID && user?.UserID) {
        handleRefreshMessages();
      }
      return;
    }

    loadSocialData(preferredConversationID, { includeFeed: true });
  }, [
    refreshTick,
    activeTab,
    user?.UserID,
    user?.Friends,
    user?.Posts,
    user?.Name,
    user?.Color,
    user?.ProfileEvent,
    user?.ProfileScramble,
    location.state?.conversationID,
    location.state?.openMessages,
    loadSocialData,
    handleRefreshMessages,
  ]);

  useEffect(() => {
    if (!user?.UserID) return undefined;

    const source = createSocialEventSource(user.UserID, {
      onEvent: (payload) => {
        handleSocialEvent(payload);
      },
      onError: () => {
        // EventSource reconnects automatically; keep a sparse backstop refresh below.
      },
    });

    return () => {
      source?.close();
    };
  }, [handleSocialEvent, user?.UserID]);

  useEffect(() => {
    if (!user?.UserID) return undefined;

    const handleVisibilityChange = () => {
      if (!isDocumentVisible()) return;
      const preferredConversationID = String(location.state?.conversationID || "").trim();
      loadSocialData(preferredConversationID, {
        includeFeed: activeTab === 0,
      });
      if (activeTab === 1 && selectedConversationRef.current?.conversationID) {
        handleRefreshMessages();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [
    activeTab,
    handleRefreshMessages,
    loadSocialData,
    location.state?.conversationID,
    user?.UserID,
  ]);

  useEffect(() => {
    if (!user?.UserID) return undefined;

    const id = setInterval(() => {
      if (!isDocumentVisible()) return;
      const preferredConversationID = String(location.state?.conversationID || "").trim();
      loadSocialData(preferredConversationID, {
        includeFeed: activeTab === 0,
      });
      if (activeTab === 1 && selectedConversationRef.current?.conversationID) {
        handleRefreshMessages();
      }
    }, REALTIME_BACKSTOP_REFRESH_MS);

    return () => clearInterval(id);
  }, [
    activeTab,
    handleRefreshMessages,
    loadSocialData,
    location.state?.conversationID,
    user?.UserID,
  ]);

  const handleDelete = async (post) => {
    if (!post.isOwn) return;
    if (post.PostOwnerType === "GROUP" || post.isGroupPost) {
      await runDb("Deleting group post", () =>
        deleteGroupPost(post.groupID, post.DateTime || post.date, user?.UserID)
      );
    } else {
      await deletePost(post.DateTime || post.date);
    }
    setFeed((f) => f.filter((p) => p !== post));
    setSelectedPost(null);
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

    setFeed((f) => f.map((p) => (p === selectedPost ? updated : p)));
    setSelectedPost(updated);

    try {
      if (selectedPost.PostOwnerType === "GROUP" || selectedPost.isGroupPost) {
        await runDb("Updating comments", () =>
          updateGroupPostComments(
            selectedPost.groupID,
            ts,
            user?.UserID,
            updatedComments
          )
        );
      } else {
        const ownerID = selectedPost.PK?.split("#")[1];
        await runDb("Updating comments", () =>
          updatePostComments(ownerID, ts, updatedComments)
        );
      }
    } catch (err) {
      console.error("Failed to save comment:", err);
    }
  };

  const ensureSelectedConversationExists = async () => {
    const currentSelected = selectedConversationRef.current;
    if (!currentSelected || !user?.UserID) return currentSelected;
    if (!currentSelected.isPlaceholder || currentSelected.type !== "DM") {
      return currentSelected;
    }

    try {
      await runDb("Creating conversation", () =>
        createConversation({
          conversationType: "DM",
          memberIDs: [user.UserID, currentSelected.friendID].filter(Boolean),
          createdBy: user.UserID,
          conversationID: currentSelected.conversationID,
        })
      );
    } catch (err) {
      console.error("Failed to ensure DM conversation exists:", err);
    }

    const nextConversation = { ...currentSelected, isPlaceholder: false };
    upsertConversation(nextConversation);
    return nextConversation;
  };

  const handleCreateGroup = async ({
    name,
    memberIDs,
    isJoinable = false,
    isStreamRoom = false,
    roomCode = "",
  }) => {
    if (!user?.UserID || creatingGroup) return;

    setCreatingGroup(true);
    setCreateGroupError("");
    try {
      const result = await runDb("Creating group", () =>
        createGroup({
          ownerID: user.UserID,
          name,
          memberIDs,
          groupID: roomCode,
          isJoinable,
          isStreamRoom,
        })
      );
      const conversationID = String(result?.item?.ConversationID || "").trim();
      const roomConversation = {
        conversationID,
        id: conversationID,
        type: "GROUP",
        name: result?.item?.Name || name,
        username: result?.item?.Name || name,
        color: result?.item?.Color || "#7f8c8d",
        groupID: result?.item?.GroupID || roomCode,
        isJoinable: result?.item?.IsJoinable === true,
        roomCode: result?.item?.JoinCode || result?.item?.GroupID || roomCode,
        isStreamRoom: result?.item?.IsStreamRoom === true,
        memberIDs: Array.isArray(result?.members)
          ? result.members.map((member) => String(member?.UserID || "").trim()).filter(Boolean)
          : [user.UserID],
        messages: [],
        messagesCursor: null,
        hasOlderMessages: false,
        loadingOlderMessages: false,
        isPlaceholder: false,
        lastMessageAt: null,
        lastMessagePreview: "",
      };

      upsertConversation(roomConversation);
      await loadSocialData(conversationID);

      if (isStreamRoom) {
        await startHostedRoomForConversation(roomConversation);
      } else {
        setActiveTab(1);
      }

      setShowCreateGroupModal(false);
    } catch (err) {
      console.error("Failed to create group:", err);
      setCreateGroupError(err?.message || "Failed to create group.");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleJoinRoom = async ({ roomCode }) => {
    if (!user?.UserID || joiningRoom) return;

    setJoiningRoom(true);
    setJoinRoomError("");
    try {
      const result = await runDb("Joining room", () =>
        joinGroup({
          userID: user.UserID,
          roomCode,
        })
      );
      const conversationID = String(result?.item?.ConversationID || "").trim();
      const initialMessagesPage = conversationID
        ? await getMessagesPage(conversationID, user.UserID, {
            limit: MESSAGE_PAGE_SIZE,
          })
        : { items: [], nextCursor: null, hasMore: false };
      const initialMessages = Array.isArray(initialMessagesPage?.items)
        ? initialMessagesPage.items
        : [];
      const roomConversation = {
        conversationID,
        id: conversationID,
        type: "GROUP",
        name: result?.item?.Name || roomCode,
        username: result?.item?.Name || roomCode,
        color: result?.item?.Color || "#7f8c8d",
        groupID: result?.item?.GroupID || roomCode,
        isJoinable: result?.item?.IsJoinable === true,
        roomCode: result?.item?.JoinCode || result?.item?.GroupID || roomCode,
        isStreamRoom: result?.item?.IsStreamRoom === true,
        memberIDs: Array.isArray(result?.members)
          ? result.members.map((member) => String(member?.UserID || "").trim()).filter(Boolean)
          : [],
        messages: initialMessages,
        messagesCursor: initialMessagesPage?.nextCursor || null,
        hasOlderMessages: !!initialMessagesPage?.hasMore,
        loadingOlderMessages: false,
        isPlaceholder: false,
        lastMessageAt:
          initialMessages[initialMessages.length - 1]?.timestamp || result?.item?.UpdatedAt || null,
        lastMessagePreview:
          initialMessages[initialMessages.length - 1]?.text || result?.item?.Name || "",
      };

      upsertConversation(roomConversation);
      await loadSocialData(conversationID);
      setShowJoinRoomModal(false);
      await followHostedRoomConversation(roomConversation, initialMessages);
    } catch (err) {
      console.error("Failed to join room:", err);
      setJoinRoomError(err?.message || "Failed to join room.");
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleCloseRoom = useCallback(async () => {
    if (!sharedSession?.conversationID || !user?.UserID) return;

    try {
      await runDb("Closing room", () =>
        sendMessage(
          sharedSession.conversationID,
          user.UserID,
          `[sharedRoomClosed]${JSON.stringify({
            conversationID: sharedSession.conversationID,
            roomCode: sharedSession.roomCode || null,
            closedBy: user.UserID,
            closedByName: user?.Username || user?.Name || user.UserID,
            closedAt: new Date().toISOString(),
          })}`
        )
      );
      leaveSharedRun?.();
    } catch (err) {
      console.error("Failed to close room:", err);
    }
  }, [sharedSession, user?.UserID, user?.Username, user?.Name, runDb, leaveSharedRun]);

  useEffect(() => {
    if (!user?.UserID) return;
    if (String(selectedConversation?.type || "").toUpperCase() !== "GROUP") return;
    if (selectedConversation?.isStreamRoom !== true) return;

    const latestHosted = getLatestHostedSharedMessage(selectedConversation?.messages || []);
    const latestClosed = getLatestHostedRoomClosedMessage(selectedConversation?.messages || []);
    if (!latestHosted?.payload?.sharedID) return;

    const latestHostedTs = new Date(
      latestHosted?.msg?.timestamp || latestHosted?.msg?.createdAt || 0
    ).getTime();
    const latestClosedTs = new Date(
      latestClosed?.msg?.timestamp || latestClosed?.msg?.createdAt || 0
    ).getTime();

    if (latestClosedTs >= latestHostedTs) return;

    const shouldReplaceActive =
      !sharedSession ||
      String(sharedSession?.conversationID || "") !==
        String(selectedConversation?.conversationID || "") ||
      String(sharedSession?.sharedID || "") !== String(latestHosted.payload.sharedID || "");

    if (!shouldReplaceActive) return;

    loadSharedSession(
      {
        ...latestHosted.payload,
        sourceMessage: latestHosted.payload,
      },
      {
        targetIndex: undefined,
      }
    );
  }, [
    user?.UserID,
    selectedConversation?.type,
    selectedConversation?.isStreamRoom,
    selectedConversation?.conversationID,
    selectedConversation?.messages,
    sharedSession,
  ]);

  const loadSharedSession = async (
    {
      sharedID,
      event,
      scrambles,
      events,
      creatorEvent,
      opponentEvent,
      creatorEvents,
      opponentEvents,
      creatorScrambles,
      opponentScrambles,
      creatorID,
      mode,
      targetWins,
      batchSize,
      saveSessionID,
      hostID,
      hostName,
      roomCode,
      isHosted,
      sourceMessage,
    },
    options = {}
  ) => {
    if (!user?.UserID) return;
    const baseConversation = options?.conversationOverride || selectedConversationRef.current || {};

    const resolvedEvent = getSharedSessionEvent(
      event,
      creatorEvent,
      opponentEvent,
      events,
      creatorEvents,
      opponentEvents,
      sourceMessage?.event,
      sourceMessage?.creatorEvent,
      sourceMessage?.opponentEvent,
      sourceMessage?.events,
      sourceMessage?.creatorEvents,
      sourceMessage?.opponentEvents
    );
    const sessionID = sharedID.split("#").slice(0, 3).join("#");
    const sessionName = `Shared ${currentEventToString(resolvedEvent)} with ${
      baseConversation?.name || "Friend"
    }`;
    const currentMessages = baseConversation?.messages || [];
    const roundResults = buildRoundResultsFromMessages(currentMessages, sharedID);

    try {
      await runDb("Creating shared session", () =>
        createSession(user.UserID, resolvedEvent, sessionID, sessionName)
      );

      beginSharedSession(
        applySharedExtensions(
          {
            sessionID,
            event: resolvedEvent,
            sharedID,
            mode: mode || sourceMessage?.mode || sourceMessage?.type || "average",
            targetWins: targetWins || sourceMessage?.targetWins || null,
            batchSize: batchSize || sourceMessage?.batchSize || null,
            saveSessionID:
              saveSessionID || sourceMessage?.saveSessionID || (mode === "hosted" ? "main" : null),
            hostID: hostID || sourceMessage?.hostID || creatorID || null,
            hostName: hostName || sourceMessage?.hostName || null,
            roomCode: roomCode || sourceMessage?.roomCode || baseConversation?.roomCode || null,
            isHosted: isHosted === true || mode === "hosted" || sourceMessage?.isHosted === true,
            scrambles:
              Array.isArray(scrambles) && scrambles.length
                ? scrambles
                : Array.isArray(creatorScrambles) && creatorScrambles.length
                ? creatorScrambles
                : Array.isArray(sourceMessage?.scrambles)
                ? sourceMessage.scrambles
                : Array.isArray(sourceMessage?.creatorScrambles)
                ? sourceMessage.creatorScrambles
                : [],
            events:
              Array.isArray(events) && events.length
                ? events
                : Array.isArray(creatorEvents) && creatorEvents.length
                ? creatorEvents
                : Array.isArray(sourceMessage?.events)
                ? sourceMessage.events
                : Array.isArray(sourceMessage?.creatorEvents)
                ? sourceMessage.creatorEvents
                : [],
            creatorEvent: creatorEvent || sourceMessage?.creatorEvent || resolvedEvent,
            opponentEvent: opponentEvent || sourceMessage?.opponentEvent || resolvedEvent,
            creatorEvents:
              Array.isArray(creatorEvents) && creatorEvents.length
                ? creatorEvents
                : Array.isArray(sourceMessage?.creatorEvents)
                ? sourceMessage.creatorEvents
                : [],
            opponentEvents:
              Array.isArray(opponentEvents) && opponentEvents.length
                ? opponentEvents
                : Array.isArray(sourceMessage?.opponentEvents)
                ? sourceMessage.opponentEvents
                : [],
            creatorScrambles:
              Array.isArray(creatorScrambles) && creatorScrambles.length
                ? creatorScrambles
                : Array.isArray(sourceMessage?.creatorScrambles)
                ? sourceMessage.creatorScrambles
                : [],
            opponentScrambles:
              Array.isArray(opponentScrambles) && opponentScrambles.length
                ? opponentScrambles
                : Array.isArray(sourceMessage?.opponentScrambles)
                ? sourceMessage.opponentScrambles
                : [],
            creatorID: creatorID || null,
            opponentID:
              baseConversation?.type === "DM"
                ? baseConversation?.friendID ||
                  baseConversation?.username ||
                  null
                : null,
            opponentName:
              baseConversation?.name ||
              baseConversation?.username ||
              "Opponent",
            theirLabel:
              baseConversation?.username ||
              baseConversation?.name ||
              "Opponent",
            theirUsername:
              baseConversation?.username ||
              baseConversation?.name ||
              "Opponent",
            opponentColor: baseConversation?.color || "#888888",
            theirColor: baseConversation?.color || "#888888",
            color: baseConversation?.color || "#888888",
            conversationID: baseConversation?.conversationID || "",
            roundResults,
          },
          currentMessages
        ),
        options
      );
    } catch (err) {
      console.error("Failed to create shared session", err);
    }
  };

  const followHostedRoomConversation = useCallback(
    async (conversation, messages = []) => {
      const latestHosted = getLatestHostedSharedMessage(messages);
      const latestClosed = getLatestHostedRoomClosedMessage(messages);
      const latestHostedTs = new Date(
        latestHosted?.msg?.timestamp || latestHosted?.msg?.createdAt || 0
      ).getTime();
      const latestClosedTs = new Date(
        latestClosed?.msg?.timestamp || latestClosed?.msg?.createdAt || 0
      ).getTime();

      if (!latestHosted?.payload?.sharedID || latestHostedTs <= latestClosedTs) {
        return false;
      }

      await loadSharedSession(
        {
          ...latestHosted.payload,
          sourceMessage: latestHosted.payload,
        },
        {
          conversationOverride: {
            ...(conversation || {}),
            messages,
          },
          targetIndex: undefined,
        }
      );

      return true;
    },
    [loadSharedSession]
  );

  const startHostedRoomForConversation = useCallback(
    async (conversation) => {
      const conversationID = String(conversation?.conversationID || "").trim();
      if (!conversationID || !user?.UserID) return false;

      const normalizedEvent = getSharedSessionEvent(currentEvent, user?.ProfileEvent, "333");
      const batchSize = 25;
      const creatorEvents = [];
      const opponentEvents = [];
      const creatorScrambles = [];
      const opponentScrambles = [];

      for (let i = 0; i < batchSize; i += 1) {
        const scramble = generateScramble(normalizedEvent);
        creatorEvents.push(normalizedEvent);
        opponentEvents.push(normalizedEvent);
        creatorScrambles.push(scramble);
        opponentScrambles.push(scramble);
      }

      const payload = {
        v: 2,
        mode: "hosted",
        type: "hosted",
        sharedID: `SHARED#${conversationID}#${normalizedEvent}#${Date.now()}`,
        count: creatorScrambles.length,
        batchSize,
        isHosted: true,
        saveSessionID: "main",
        hostID: user.UserID,
        hostName: user?.Username || user?.Name || user.UserID,
        roomCode: conversation?.roomCode || null,
        creatorID: user.UserID,
        creatorEvent: normalizedEvent,
        opponentEvent: normalizedEvent,
        creatorEvents,
        opponentEvents,
        creatorScrambles,
        opponentScrambles,
      };

      const scrambleText = `[sharedAoN]${JSON.stringify(payload)}`;
      const saved = await sendMessage(conversationID, user.UserID, scrambleText);
      const savedMessage = {
        sender: saved?.SenderID || user.UserID,
        text: saved?.Text || scrambleText,
        timestamp: saved?.CreatedAt || new Date().toISOString(),
      };
      const nextConversation = {
        ...(conversation || {}),
        messages: mergeMessagesByKey(conversation?.messages || [], [savedMessage]),
        lastMessageAt: savedMessage.timestamp,
        lastMessagePreview: savedMessage.text,
      };

      upsertConversation(nextConversation);

      await loadSharedSession(
        {
          ...payload,
          sourceMessage: payload,
        },
        {
          conversationOverride: nextConversation,
          targetIndex: 0,
        }
      );

      return true;
    },
    [currentEvent, loadSharedSession, upsertConversation, user?.ProfileEvent, user?.UserID, user?.Username, user?.Name]
  );

  useEffect(() => {
    const fetchSuggestion = async () => {
      if (!searchTerm) {
        setSuggestions([]);
        return;
      }
      try {
        const prof = await getUser(searchTerm);
        if (prof) {
          const id = prof.PK?.split("#")[1];
          setSuggestions([{ id, name: prof.Name || prof.name }]);
        } else {
          setSuggestions([]);
        }
      } catch {
        setSuggestions([]);
      }
    };
    fetchSuggestion();
  }, [searchTerm]);

  const handleSearchSelect = (id) => {
    setSearchTerm("");
    setSuggestions([]);
    setSearchOpen(false);
    navigate(`/profile/${id}`);
  };

  const sortedConversations = [...conversations].sort((a, b) => {
    const aTime = new Date(
      a.lastMessageAt || a.messages?.[a.messages.length - 1]?.timestamp || 0
    );
    const bTime = new Date(
      b.lastMessageAt || b.messages?.[b.messages.length - 1]?.timestamp || 0
    );
    return bTime - aTime;
  });
  const activeRoomConversationID = String(sharedSession?.conversationID || "").trim();
  const selectedConversationID = String(selectedConversation?.conversationID || "").trim();
  const visibleConversations = sortedConversations.filter((conv) => {
    if (conv?.isStreamRoom !== true) return true;

    const conversationID = String(conv?.conversationID || "").trim();
    return (
      !!conversationID &&
      (conversationID === selectedConversationID || conversationID === activeRoomConversationID)
    );
  });
  const activeRoomConversation = useMemo(() => {
    if (!activeRoomConversationID) return null;
    return (
      sortedConversations.find(
        (conv) => String(conv?.conversationID || "").trim() === activeRoomConversationID
      ) || null
    );
  }, [activeRoomConversationID, sortedConversations]);

  useEffect(() => {
    const preferredConversationID = String(location.state?.conversationID || "").trim();
    if (!preferredConversationID || !conversations.length) return;

    const match = conversations.find(
      (conv) => String(conv.conversationID) === preferredConversationID
    );

    if (match) {
      setSelectedConversation((prev) => ({
        ...prev,
        ...match,
        messages:
          Array.isArray(match.messages) && match.messages.length
            ? match.messages
            : Array.isArray(prev?.messages)
            ? prev.messages
            : [],
      }));
      if (location.state?.openMessages) {
        setActiveTab(1);
      }
    }
  }, [conversations, location.state?.conversationID, location.state?.openMessages]);

  useEffect(() => {
    if (!activeRoomConversationID || !conversations.length) return;

    const activeMatch = conversations.find(
      (conv) => String(conv?.conversationID || "").trim() === activeRoomConversationID
    );
    if (!activeMatch || activeMatch?.isStreamRoom !== true) return;

    if (selectedConversationID === activeRoomConversationID) {
      return;
    }

    setSelectedConversation((prev) => ({
      ...(prev || {}),
      ...activeMatch,
      messages:
        Array.isArray(activeMatch.messages) && activeMatch.messages.length
          ? activeMatch.messages
          : Array.isArray(prev?.messages)
          ? prev.messages
          : [],
    }));
    setActiveTab(1);
  }, [activeRoomConversationID, conversations, selectedConversationID]);

  useEffect(() => {
    if (activeTab !== 1) return;

    const targetConversationID = String(location.state?.conversationID || "").trim();
    const targetSharedID = String(location.state?.sharedID || "").trim();

    if (!targetSharedID) return;
    if (
      targetConversationID &&
      selectedConversation?.conversationID !== targetConversationID
    ) {
      return;
    }

    const id = setTimeout(() => {
      const didScroll = scrollToSharedRun(targetSharedID, "smooth");
      if (!didScroll) return;

      const nextState = { ...(location.state || {}) };
      delete nextState.sharedID;

      navigate(location.pathname, {
        replace: true,
        state: Object.keys(nextState).length ? nextState : null,
      });
    }, 80);

    return () => clearTimeout(id);
  }, [
    activeTab,
    location.pathname,
    selectedConversation?.conversationID,
    selectedConversation?.messages,
    location.state?.conversationID,
    location.state?.sharedID,
    navigate,
    location.state,
  ]);

  const handleOpenMessagesTab = useCallback(() => {
    setActiveTab(1);
    if (visibleConversations.length > 0) {
      setSelectedConversation(visibleConversations[0]);
    }
  }, [visibleConversations]);

  const selectedConversationMembers =
    selectedConversation?.type === "GROUP"
      ? (selectedConversation.memberProfiles || []).filter((member) => !member.isYou)
      : [];

  const selectedConversationSharedStats = selectedConversation?.sharedStats || {
    TotalSolves: 0,
    TotalWins: 0,
    TotalSessions: 0,
    LastSharedAt: null,
    ByEvent: {},
    ByUser: {},
  };

  const yourSharedStats = selectedConversationSharedStats.ByUser?.[user?.UserID] || {
    Solves: 0,
    Wins: 0,
    Sessions: 0,
  };
  const otherParticipantID =
    selectedConversation?.type === "DM"
      ? selectedConversation?.friendID || selectedConversation?.memberIDs?.find((id) => id !== user?.UserID)
      : null;
  const theirSharedStats =
    (otherParticipantID && selectedConversationSharedStats.ByUser?.[otherParticipantID]) || {
      Solves: 0,
      Wins: 0,
      Sessions: 0,
    };

  const selectedConversationTopEvents = Object.entries(
    selectedConversationSharedStats.ByEvent || {}
  )
    .map(([eventKey, values]) => ({
      eventKey,
      solves: Number(values?.Solves || 0),
      wins: Number(values?.Wins || 0),
      yourWins: Number(values?.ByUser?.[user?.UserID]?.Wins || 0),
      theirWins: Number(values?.ByUser?.[otherParticipantID]?.Wins || 0),
      sessions: Number(values?.Sessions || 0),
    }))
    .filter((item) => item.solves || item.wins || item.sessions)
    .sort((a, b) => b.solves - a.solves || b.wins - a.wins)
    .slice(0, 3);

  const handleSendMessage = async () => {
    if (!selectedConversationRef.current || !messageInput.trim()) return;

    const text = messageInput.trim();
    const conversation = await ensureSelectedConversationExists();
    const conversationID = conversation?.conversationID;
    if (!conversationID) return;
    setMessageInput("");

    try {
      const saved = await sendMessage(conversationID, user.UserID, text);
      const savedMessage = {
        sender: saved?.SenderID || user.UserID,
        text: saved?.Text || text,
        timestamp: saved?.CreatedAt || new Date().toISOString(),
      };

      upsertConversation({
        ...conversation,
        messages: mergeMessagesByKey(conversation.messages || [], [savedMessage]),
        lastMessageAt: savedMessage.timestamp,
        lastMessagePreview: savedMessage.text,
      });
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleConfirmSharedAverage = async ({
    mode = "average",
    creatorEvent,
    opponentEvent,
    count,
    targetWins,
    batchSize,
    creatorPlan,
    opponentPlan,
  }) => {
    if (!selectedConversationRef.current || !user?.UserID) return;

    const conversation = await ensureSelectedConversationExists();
    const conversationID = conversation?.conversationID;
    if (!conversationID) return;

    const expandPlanToEvents = (plan, fallbackEvent, fallbackCount) => {
      if (Array.isArray(plan) && plan.length) {
        return plan.flatMap((entry) =>
          Array.from({ length: Number(entry?.count) || 1 }, () => ({
            event: entry?.event || fallbackEvent || "333",
          }))
        );
      }

      return Array.from({ length: fallbackCount || 1 }, () => ({
        event: fallbackEvent || "333",
      }));
    };

    const creatorEntries = expandPlanToEvents(creatorPlan, creatorEvent, count);
    const opponentEntries = expandPlanToEvents(opponentPlan, opponentEvent, count);
    const creatorEvents = creatorEntries.map((entry) => entry.event);
    const opponentEvents = opponentEntries.map((entry) => entry.event);
    const roundCount = Math.max(creatorEvents.length, opponentEvents.length);
    const creatorScrambles = [];
    const opponentScrambles = [];

    for (let i = 0; i < roundCount; i += 1) {
      const creatorRoundEvent = creatorEvents[i] || creatorEvent || "333";
      const opponentRoundEvent = opponentEvents[i] || opponentEvent || "333";

      if (String(creatorRoundEvent).toUpperCase() === String(opponentRoundEvent).toUpperCase()) {
        const sharedScramble = generateScramble(creatorRoundEvent);
        creatorScrambles.push(sharedScramble);
        opponentScrambles.push(sharedScramble);
      } else {
        creatorScrambles.push(generateScramble(creatorRoundEvent));
        opponentScrambles.push(generateScramble(opponentRoundEvent));
      }
    }

    const sessionID = `SHARED#${conversationID}#${
      creatorEvents[0] || creatorEvent || "333"
    }`;
    const sharedRunID = `${sessionID}#${Date.now()}`;

    const scrambleText = `[sharedAoN]${JSON.stringify({
      v: 2,
      mode,
      type: mode,
      sharedID: sharedRunID,
      count: roundCount,
      targetWins: Number(targetWins) || null,
      batchSize: Number(batchSize) || null,
      isHosted: mode === "hosted",
      saveSessionID: mode === "hosted" ? "main" : null,
      hostID: user.UserID,
      hostName: user?.Username || user?.Name || user.UserID,
      roomCode: selectedConversation?.roomCode || null,
      creatorID: user.UserID,
      creatorEvent: creatorEvents[0] || creatorEvent || "333",
      opponentEvent: opponentEvents[0] || opponentEvent || "333",
      creatorEvents,
      opponentEvents,
      creatorScrambles,
      opponentScrambles,
    })}`;

    try {
      const saved = await sendMessage(conversationID, user.UserID, scrambleText);
      const savedMessage = {
        sender: saved?.SenderID || user.UserID,
        text: saved?.Text || scrambleText,
        timestamp: saved?.CreatedAt || new Date().toISOString(),
      };

      upsertConversation({
        ...conversation,
        messages: mergeMessagesByKey(conversation.messages || [], [savedMessage]),
        lastMessageAt: savedMessage.timestamp,
        lastMessagePreview: savedMessage.text,
      });
    } catch (err) {
      console.error("Failed to send shared average:", err);
    }
  };

  if (!user) return <div>Please sign in to view your feed.</div>;

  return (
    <div className="Page socialPage">
      <div className="socialHeader">
        <div className="tabContainer">
          <button
            className={`tabIconButton ${activeTab === 0 ? "active" : ""}`}
            onClick={() => setActiveTab(0)}
            aria-label="Activity"
            title="Activity"
          >
            <img className="tabIcon" src={SocialHomeIcon} alt="" />
            {activeTab === 0 && <img className="tabDot" src={DotIcon} alt="" />}
          </button>

          <span className="tabDivider" aria-hidden="true">
            |
          </span>

          <button
            className={`tabIconButton tabIconButton--messages ${
              activeTab === 1 ? "active" : ""
            }`}
            onClick={handleOpenMessagesTab}
            aria-label="Messages"
            title="Messages"
          >
            <img className="tabIcon" src={SocialMessagesIcon} alt="" />
            {activeTab === 1 && <img className="tabDot" src={DotIcon} alt="" />}
          </button>
        </div>

        {activeTab === 1 && (
          <div className="headerConversationStrip">
            {visibleConversations.map((conv) => (
              (() => {
                const groupGrid = getGroupAvatarGridConfig((conv.memberProfiles || []).length);

                return (
                  <button
                    type="button"
                    key={conv.conversationID}
                    className={`conversationPreview ${
                      selectedConversation?.conversationID === conv.conversationID
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => {
                      setSelectedConversation(conv);
                      setActiveTab(1);
                    }}
                  >
                    <div className="avatarContainer">
                      <div
                        className={`profilePicturePost ${
                          conv.type === "GROUP" ? "profilePicturePost--group" : ""
                        }`}
                        style={
                          conv.type === "GROUP"
                            ? undefined
                            : { borderColor: conv.color || "#2EC4B6" }
                        }
                      >
                        {conv.type === "GROUP" ? (
                          <div
                            className={`groupAvatarCluster ${groupGrid.densityClass}`}
                            style={{
                              "--group-grid-cols": groupGrid.cols,
                              "--group-grid-rows": groupGrid.rows,
                            }}
                          >
                            {(conv.memberProfiles || []).slice(0, 9).map((member, idx) => (
                              <div
                                key={`${conv.conversationID}-${member.id}-${idx}`}
                                className="groupAvatarMini"
                                style={{ borderColor: member.color || "#cccccc" }}
                              >
                                <div
                                  className={`groupAvatarMiniCube postNameCube postNameCube--${(
                                    member.profileEvent || "333"
                                  ).toLowerCase()}`}
                                >
                                  <PuzzleSVG
                                    event={member.profileEvent || "333"}
                                    scramble={member.profileScramble || ""}
                                    isMusicPlayer={false}
                                    isTimerCube={false}
                                    isNameTagCube={true}
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div
                            className={`postNameCube postNameCube--${(
                              conv.profileEvent || "333"
                            ).toLowerCase()}`}
                          >
                            <PuzzleSVG
                              event={conv.profileEvent || "333"}
                              scramble={conv.profileScramble || ""}
                              isMusicPlayer={false}
                              isTimerCube={false}
                              isNameTagCube={true}
                            />
                          </div>
                        )}
                      </div>
                      <div className="avatarName">{conv.name}</div>
                    </div>
                  </button>
                );
              })()
            ))}
            {activeRoomConversation &&
            !visibleConversations.some(
              (conv) => conv.conversationID === activeRoomConversation.conversationID
            ) ? (
              <button
                type="button"
                key={activeRoomConversation.conversationID}
                className={`conversationPreview ${
                  selectedConversation?.conversationID === activeRoomConversation.conversationID
                    ? "selected"
                    : ""
                }`}
                onClick={() => {
                  setSelectedConversation(activeRoomConversation);
                  setActiveTab(1);
                }}
              >
                <div className="avatarContainer">
                  <div className="profilePicturePost profilePicturePost--group">
                    <div className="groupAvatarCluster groupAvatarCluster--solo">
                      <div className="groupAvatarMini" style={{ borderColor: activeRoomConversation.color || "#50B6FF" }}>
                        <div className="groupAvatarMiniCube postNameCube">
                          <span style={{ fontSize: "11px", fontWeight: 900, color: "#fff" }}>
                            Room
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="avatarName">{activeRoomConversation.name || "Active room"}</div>
                </div>
              </button>
            ) : null}
          </div>
        )}

        <div
          className={`searchContainer ${searchOpen ? "open" : ""}`}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setSearchOpen(false);
            }
          }}
        >
          <div className="searchRow">
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search user..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" &&
                suggestions.length &&
                handleSearchSelect(suggestions[0].id)
              }
            />

            <button
              className="searchIconButton"
              onClick={() => {
                setSearchOpen(true);
                setTimeout(() => searchInputRef.current?.focus(), 0);
              }}
              aria-label="Search users"
              title="Search"
              type="button"
            >
              <img className="tabIcon" src={SearchIcon} alt="" />
            </button>
          </div>

          <div className="searchActionRow">
            <button
              type="button"
              className="searchActionButton"
              onClick={handleRefreshMessagesAndSidebar}
              aria-label="Refresh messages"
              title={activeTab === 1 ? "Refresh" : "Open a conversation to refresh"}
              disabled={activeTab !== 1 || !selectedConversation}
            >
              <img className="searchActionIcon" src={FlipIcon} alt="" />
            </button>

            <button
              type="button"
              className="searchActionButton"
              onClick={() => setShowCreateGroupModal(true)}
              aria-label="Create group"
              title="New group"
              disabled={activeTab !== 1}
            >
              <span className="searchActionPlus">+</span>
            </button>

            <button
              type="button"
              className="searchActionButton searchActionButton--join"
              onClick={() => setShowJoinRoomModal(true)}
              aria-label="Join room"
              title="Join room"
              disabled={activeTab !== 1}
            >
              <span className="searchActionJoin">Join</span>
            </button>
          </div>

          {searchOpen && suggestions.length > 0 && (
            <ul className="suggestionsList">
              {suggestions.map((s) => (
                <li
                  key={s.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSearchSelect(s.id);
                  }}
                >
                  {s.name} ({s.id})
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="profileContent">
        {activeTab === 0 && (
          <div
            ref={activityPanelRef}
            className="tabPanel activityPanel"
            onScroll={handleActivityScroll}
          >
            {feed.map((post, idx) => (
              <div
                key={`${post.DateTime || post.date}-${idx}`}
                className={`chatBubble ${post.isOwn ? "ownBubble" : "otherBubble"}`}
              >
                {(() => {
                  const statShare = post.StatShare || post.statShare || null;
                  const isStatShare = !!statShare;
                  if (isStatShare) {
                    return (
                      <div
                        className="statFeedPost"
                        onClick={(event) => {
                          if (isInteractiveFeedTarget(event.target)) return;
                          setSelectedPost(post);
                        }}
                      >
                        <div
                          style={{
                            border: `2px solid ${withAlpha(post.postColor, 0.5)}`,
                            borderRadius: 12,
                          }}
                        >
                          <StatSharePost
                            note={post.Note}
                            statShare={statShare}
                            shareColor={post.postColor}
                          />
                          <div className="statFeedMeta">
                            <div className="postDate">
                              {formatPostDate(post.DateTime || post.date)}
                            </div>
                            <div className="postNameAndPicture">
                              <NameTag
                                user={{
                                  UserID: post.authorID,
                                  Name: post.author,
                                  Color: post.postColor,
                                  ProfileEvent: post.profileEvent,
                                  ProfileScramble: post.profileScramble,
                                }}
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
                      name={post.author}
                      user={{
                        UserID: post.authorID,
                        Name: post.author,
                        Color: post.postColor,
                        ProfileEvent: post.profileEvent,
                        ProfileScramble: post.profileScramble,
                      }}
                      date={formatPostDate(post.DateTime || post.date)}
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
                      postColor={post.postColor}
                      note={post.Note}
                      postType={post.PostType}
                      statShare={statShare}
                      onClick={() => setSelectedPost(post)}
                    />
                  );
                })()}
              </div>
            ))}
            <div ref={activityEndRef} />
          </div>
        )}

        {activeTab === 1 && (
          <div className="tabPanel messagesPanel">
            <div className="conversationView">
              {selectedConversation ? (
                <>
                  <div className="conversationHeaderToggleWrap">
                    <button
                      type="button"
                      className="conversationHeaderToggle"
                      onClick={() => setShowConversationHeader((prev) => !prev)}
                      aria-label={
                        showConversationHeader
                          ? "Collapse conversation details"
                          : "Expand conversation details"
                      }
                    >
                      <span className="conversationHeaderToggleLabel">Details</span>
                      <span
                        className={`conversationHeaderToggleArrow ${
                          showConversationHeader ? "is-open" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ^
                      </span>
                    </button>
                  </div>

                  {showConversationHeader && (
                    <>
                      {selectedConversation.type === "GROUP" && (
                        <div className="groupThreadMeta">
                          <div className="groupThreadTitleRow">
                            <div className="groupThreadTitle">{selectedConversation.name}</div>
                            {selectedConversation?.isStreamRoom ? (
                              <span className="groupThreadBadge">Room</span>
                            ) : null}
                          </div>
                          <div className="groupThreadMembers">
                            {selectedConversationMembers.length
                              ? selectedConversationMembers.map((member) => member.name).join(", ")
                              : "No other members"}
                          </div>
                          {selectedConversation?.isJoinable && selectedConversation?.roomCode ? (
                            <div className="groupThreadRoomCode">
                              Room code: <span>{selectedConversation.roomCode}</span>
                            </div>
                          ) : null}
                          {selectedConversation?.isStreamRoom ? (
                            <div className="groupThreadRoomCode">
                              {String(sharedSession?.conversationID || "") ===
                              String(selectedConversation?.conversationID || "") ? (
                                <>
                                  <span>
                                    {String(sharedSession?.hostID || sharedSession?.creatorID || "") ===
                                    String(user?.UserID || "")
                                      ? "You are hosting this room."
                                      : "You are following this room."}
                                  </span>
                                  <button
                                    type="button"
                                    className="sharedConversationStatsToggle"
                                    onClick={() => {
                                      if (
                                        String(sharedSession?.hostID || sharedSession?.creatorID || "") ===
                                        String(user?.UserID || "")
                                      ) {
                                        handleCloseRoom();
                                      } else {
                                        leaveSharedRun?.();
                                      }
                                    }}
                                    style={{ marginLeft: "10px" }}
                                  >
                                    <span>
                                      {String(sharedSession?.hostID || sharedSession?.creatorID || "") ===
                                      String(user?.UserID || "")
                                        ? "Stop room"
                                        : "Leave room"}
                                    </span>
                                  </button>
                                </>
                              ) : (
                                <span>Open this room to follow the host scramble feed.</span>
                              )}
                            </div>
                          ) : null}
                        </div>
                      )}

                      <div className="sharedConversationStatsWrap">
                        <button
                          type="button"
                          className="sharedConversationStatsToggle"
                          onClick={() => setShowConversationStats((prev) => !prev)}
                        >
                          <span>Chat stats</span>
                          <span>{showConversationStats ? "Hide" : "Show"}</span>
                        </button>

                        {showConversationStats && (
                          <div className="sharedConversationStats">
                            <div className="sharedConversationStatsTitle">Shared totals</div>
                            <div className="sharedConversationStatsGrid">
                              <div className="sharedConversationStatCard">
                                <div className="sharedConversationStatValue">
                                  {selectedConversationSharedStats.TotalSessions || 0}
                                </div>
                                <div className="sharedConversationStatLabel">Sessions</div>
                              </div>
                              <div className="sharedConversationStatCard">
                                <div className="sharedConversationStatValue">
                                  {selectedConversationSharedStats.TotalSolves || 0}
                                </div>
                                <div className="sharedConversationStatLabel">Shared solves</div>
                              </div>
                              <div className="sharedConversationStatCard">
                                <div className="sharedConversationStatValue">
                                  {yourSharedStats.Wins || 0}
                                </div>
                                <div className="sharedConversationStatLabel">Your wins</div>
                              </div>
                            </div>

                            {selectedConversation?.type === "DM" && (
                              <div className="sharedConversationHeadToHeadRow">
                                <div className="sharedConversationHeadToHeadName">
                                  {user?.Username || user?.Name || "You"}:{" "}
                                  {yourSharedStats.Wins || 0}
                                </div>
                                <div className="sharedConversationHeadToHeadName">
                                  {selectedConversation?.username ||
                                    selectedConversation?.name ||
                                    "Them"}
                                  : {theirSharedStats.Wins || 0}
                                </div>
                              </div>
                            )}

                            {selectedConversationTopEvents.length > 0 && (
                              <div className="sharedConversationEventRow">
                                {selectedConversationTopEvents.map((row) => (
                                  <div
                                    key={`${selectedConversation.conversationID}-${row.eventKey}`}
                                    className="sharedConversationEventPill"
                                  >
                                    <span>{currentEventToString(row.eventKey)}</span>
                                    <span>{row.solves} solves</span>
                                    {selectedConversation?.type === "DM" ? (
                                      <span>{row.yourWins}-{row.theirWins} wins</span>
                                    ) : (
                                      <span>{row.wins} wins</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </>
                  )}

                  <div
                    className="messages"
                    ref={messagesPanelRef}
                    onScroll={handleMessagesScroll}
                  >
                    {selectedConversation.loadingOlderMessages ? (
                      <div className="messagesHistoryStatus">Loading older messages...</div>
                    ) : null}
                    {!selectedConversation.loadingOlderMessages &&
                    selectedConversation.hasOlderMessages ? (
                      <div className="messagesHistoryStatus">Scroll up to load older messages</div>
                    ) : null}
                    {(selectedConversation.messages || []).map((msg, idx) => {
                      if (isSharedPostMessage(msg)) {
                        const parsedSharedPost = parseSharedPostPayload(msg?.text) || {};
                        const isOwn = msg.sender === user.UserID;
                        const senderMember = (selectedConversation?.memberProfiles || []).find(
                          (member) => member.id === msg.sender
                        );
                        const senderColor = isOwn
                          ? user?.Color || user?.color || "#2EC4B6"
                          : senderMember?.color ||
                            selectedConversation?.color ||
                            "#888888";
                        const sharedPostRecord = {
                          author: isOwn
                            ? user?.Name || user?.name || "You"
                            : senderMember?.name ||
                              selectedConversation?.name ||
                              selectedConversation?.username ||
                              msg.sender ||
                              "Shared post",
                          authorID: msg.sender || "",
                          postColor: senderColor,
                          authorTagColorCatalog: isOwn ? user?.TagColorCatalog || null : null,
                          profileEvent: isOwn
                            ? user?.ProfileEvent || "333"
                            : senderMember?.profileEvent ||
                              selectedConversation?.profileEvent ||
                              "333",
                          profileScramble: isOwn
                            ? user?.ProfileScramble || ""
                            : senderMember?.profileScramble ||
                              selectedConversation?.profileScramble ||
                              "",
                          DateTime: msg.timestamp,
                          Note: String(msg.note || parsedSharedPost.note || "").trim(),
                          PostType:
                            msg.postType ||
                            parsedSharedPost.postType ||
                            (msg.statShare || parsedSharedPost.statShare ? "stat-share" : "solve"),
                          StatShare: msg.statShare || parsedSharedPost.statShare || null,
                          SolveList: Array.isArray(msg.solveList) && msg.solveList.length
                            ? msg.solveList
                            : Array.isArray(parsedSharedPost.solveList)
                              ? parsedSharedPost.solveList
                              : [],
                          Comments: [],
                          fromMessage: true,
                        };

                        return (
                          <div
                            key={`shared-post-${idx}-${msg.timestamp || ""}-${msg.sender || ""}`}
                            className={`chatMessage chatMessage--sharedPost ${
                              isOwn ? "sent" : "received"
                            }`}
                            onClick={() => setSelectedPost(sharedPostRecord)}
                          >
                            <div className="chatSharedPostSender">
                              {isOwn ? "You" : sharedPostRecord.author}
                            </div>
                            {sharedPostRecord.StatShare ? (
                              <div className="statFeedPost">
                                <div
                                  style={{
                                    border: `2px solid ${withAlpha(senderColor, 0.5)}`,
                                    borderRadius: 12,
                                  }}
                                >
                                  <StatSharePost
                                    note={sharedPostRecord.Note}
                                    statShare={sharedPostRecord.StatShare}
                                    shareColor={senderColor}
                                  />
                                </div>
                              </div>
                            ) : (
                              <Post
                                name={sharedPostRecord.author}
                                user={{
                                  UserID: sharedPostRecord.authorID,
                                  Name: sharedPostRecord.author,
                                  Color: senderColor,
                                  ProfileEvent: sharedPostRecord.profileEvent,
                                  ProfileScramble: sharedPostRecord.profileScramble,
                                }}
                                date={formatPostDate(sharedPostRecord.DateTime)}
                                solveList={sharedPostRecord.SolveList}
                                note={sharedPostRecord.Note}
                                postColor={senderColor}
                                postType={sharedPostRecord.PostType}
                                showMeta={false}
                              />
                            )}
                          </div>
                        );
                      }

                      if (msg.text?.startsWith("[sharedAoN]")) {
                        const payload = parseSharedAoNPayload(msg.text);
                        const sharedID = payload?.sharedID || "";
                        const isGroupConversation =
                          String(selectedConversation?.type || "DM").toUpperCase() !== "DM";
                        const isTargeted =
                          isGroupConversation &&
                          String(location.state?.sharedID || "") === String(sharedID || "");

                        return (
                          <div
                            key={`${sharedID || "shared"}-${idx}`}
                            ref={(el) => {
                              if (sharedID && el) sharedMessageRefs.current[sharedID] = el;
                              if (sharedID && !el) delete sharedMessageRefs.current[sharedID];
                            }}
                            className={`sharedMessageAnchor ${
                              isTargeted ? "sharedMessageAnchor--target" : ""
                            }`}
                          >
                            <SharedAverageMessage
                              msg={msg}
                              user={user}
                              messages={selectedConversation.messages}
                              onLoadSession={(session, options) => loadSharedSession(session, options)}
                              onLeaveSharedSession={leaveSharedRun}
                              onMerge={(session) => mergeSharedSession(session)}
                              onRequestRefresh={handleRefreshMessages}
                              yourColor={user?.Color || user?.color || "#2EC4B6"}
                              theirColor={selectedConversation?.color || "#888888"}
                              yourUsername={user?.Username}
                              theirUsername={
                                selectedConversation?.username ||
                                selectedConversation?.name ||
                                selectedConversation?.conversationID
                              }
                              activeSharedID={sharedSession?.sharedID || null}
                              sessionData={
                                sharedSession?.sharedID === sharedID ? sharedSession : null
                              }
                              conversationType={selectedConversation?.type || "DM"}
                              memberProfiles={selectedConversation?.memberProfiles || []}
                            />
                          </div>
                        );
                      }

                      if (msg.text?.startsWith("[sharedUpdate]")) return null;
                      if (msg.text?.startsWith("[sharedExtend]")) return null;

                      const isOwn = msg.sender === user.UserID;

                      const senderColor = isOwn
                        ? user?.Color || user?.color || "#2EC4B6"
                        : selectedConversation?.color || "#888888";

                      return (
                        <div
                          key={`msg-${idx}-${msg.timestamp || ""}-${msg.sender || ""}`}
                          className={`chatMessage ${isOwn ? "sent" : "received"}`}
                          style={{
                            color: "#fff",
                            backgroundColor: hexToRgbString(senderColor, 0.3),
                            border: `2px solid ${senderColor}`,
                          }}
                        >
                          {msg.text || getSharedMessagePreviewText(msg) || "[no text]"}
                        </div>
                      );
                    })}

                    <div ref={messagesEndRef} />
                  </div>

                  <div className="messageInput">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Type a message..."
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          handleSendMessage();
                        }
                      }}
                    />

                    <button onClick={() => setShowSharedModal(true)}>
                      {selectedConversation?.isStreamRoom
                        ? sharedSession
                          ? "Host Another"
                          : "Start Hosting"
                        : sharedSession
                        ? "New Shared Avg"
                        : "Shared Average"}
                    </button>
                    <button onClick={handleSendMessage}>Send</button>
                  </div>
                </>
              ) : (
                <div className="noConversation">Select a conversation</div>
              )}
            </div>
          </div>
        )}
      </div>

      <SharedAverageModal
        isOpen={showSharedModal}
        onClose={() => setShowSharedModal(false)}
        defaultEvent={user?.ProfileEvent || selectedConversation?.profileEvent || "333"}
        yourDefaultEvent={user?.ProfileEvent || "333"}
        theirDefaultEvent={selectedConversation?.profileEvent || "333"}
        isTwoPerson={selectedConversation?.type !== "GROUP"}
        allowHostedMode={selectedConversation?.isStreamRoom === true}
        yourLabel={user?.Username || user?.Name || "You"}
        theirLabel={selectedConversation?.username || selectedConversation?.name || "Them"}
        onConfirm={handleConfirmSharedAverage}
      />

      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => {
          setShowCreateGroupModal(false);
          setCreateGroupError("");
        }}
        friends={friendDirectory}
        onCreate={handleCreateGroup}
        isSubmitting={creatingGroup}
        errorMessage={createGroupError}
      />

      <JoinRoomModal
        isOpen={showJoinRoomModal}
        onClose={() => {
          setShowJoinRoomModal(false);
          setJoinRoomError("");
        }}
        onJoin={handleJoinRoom}
        isSubmitting={joiningRoom}
        errorMessage={joinRoomError}
      />

      {selectedPost && (
        <PostDetail
          author={selectedPost.author}
          authorUser={{
            UserID: selectedPost.authorID,
            Name: selectedPost.author,
            Color: selectedPost.postColor,
            TagColorCatalog: selectedPost.authorTagColorCatalog || null,
            ProfileEvent: selectedPost.profileEvent,
            ProfileScramble: selectedPost.profileScramble,
          }}
          date={formatPostDate(selectedPost.DateTime || selectedPost.date)}
          solveList={
            selectedPost.StatShare || selectedPost.statShare
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
          postColor={selectedPost.postColor || ""}
          onClose={() => setSelectedPost(null)}
          onDelete={selectedPost.fromMessage ? undefined : () => handleDelete(selectedPost)}
          onAddComment={selectedPost.fromMessage ? undefined : handleAddComment}
        />
      )}
    </div>
  );
}

export default Social;
