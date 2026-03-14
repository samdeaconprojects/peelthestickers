// src/components/Social/Social.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Social.css';
import Post from '../Profile/Post';
import PostDetail from '../Profile/PostDetail';
import StatSharePost from '../Profile/StatSharePost';
import { getPosts } from '../../services/getPosts';
import { getUser } from '../../services/getUser';
import { updatePostComments } from '../../services/updatePostComments';
import { getMessages } from '../../services/getMessages';
import { sendMessage } from '../../services/sendMessage';
import { getConversations } from '../../services/getConversations';
import { createConversation } from '../../services/createConversation';
import { getGroups } from '../../services/getGroups';
import { getGroupPosts } from '../../services/getGroupPosts';
import { updateGroupPostComments } from '../../services/updateGroupPostComments';
import { deleteGroupPost } from '../../services/deleteGroupPost';
import { createGroup } from '../../services/createGroup';
import { createSession } from '../../services/createSession';

import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import { currentEventToString, generateScramble } from '../scrambleUtils';
import SharedAverageModal from './SharedAverageModal';
import SharedAverageMessage from './SharedAverageMessage';
import CreateGroupModal from './CreateGroupModal';

import DotIcon from '../../assets/Dot.svg';
import FlipIcon from '../../assets/Flip.svg';
import SearchIcon from '../../assets/Search.svg';

import SocialHomeIcon from '../../assets/SocialHome.svg';
import SocialMessagesIcon from '../../assets/SocialMessages.svg';

import { hexToRgbString } from "../../utils/colorUtils";

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

const buildLegacyDmConversationID = (a, b) =>
  [String(a || '').trim(), String(b || '').trim()].filter(Boolean).sort().join('#');

const normalizeConversationRecord = (item, profile = null) => {
  const conversationID = String(item?.ConversationID || item?.conversationID || '').trim();
  const conversationType = String(
    item?.ConversationType || item?.conversationType || 'DM'
  ).toUpperCase();
  const otherUserID = String(item?.OtherUserID || item?.otherUserID || '').trim();

  return {
    conversationID,
    id: conversationID,
    type: conversationType,
    friendID: conversationType === 'DM' ? otherUserID || conversationID : '',
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
    color: profile?.Color || profile?.color || '#cccccc',
    profileEvent: profile?.ProfileEvent || profile?.profileEvent || '333',
    profileScramble: profile?.ProfileScramble || profile?.profileScramble || '',
    messages: Array.isArray(item?.messages) ? item.messages : [],
    lastMessageAt: item?.LastMessageAt || item?.lastMessageAt || null,
    lastMessagePreview: item?.LastMessagePreview || item?.lastMessagePreview || '',
    memberIDs: Array.isArray(item?.MemberIDs) ? item.MemberIDs : [],
    isPlaceholder: false,
  };
};

const buildPlaceholderDmConversation = (currentUserID, friendID, profile = null) => {
  const conversationID = buildLegacyDmConversationID(currentUserID, friendID);
  return {
    conversationID,
    id: conversationID,
    type: 'DM',
    friendID,
    name: profile?.Name || profile?.name || friendID,
    username: profile?.Username || profile?.username || friendID,
    color: profile?.Color || profile?.color || '#cccccc',
    profileEvent: profile?.ProfileEvent || profile?.profileEvent || '333',
    profileScramble: profile?.ProfileScramble || profile?.profileScramble || '',
    messages: [],
    lastMessageAt: null,
    lastMessagePreview: '',
    memberIDs: [currentUserID, friendID].filter(Boolean),
    isPlaceholder: true,
  };
};

const buildConversationMembers = (memberIDs, profilesById, currentUser) =>
  (Array.isArray(memberIDs) ? memberIDs : [])
    .map((memberID) => {
      const id = String(memberID || '').trim();
      if (!id) return null;
      if (id === currentUser?.UserID) {
        return {
          id,
          name: currentUser?.Name || currentUser?.Username || id,
          username: currentUser?.Username || id,
          color: currentUser?.Color || currentUser?.color || '#2EC4B6',
          profileEvent: currentUser?.ProfileEvent || '333',
          profileScramble: currentUser?.ProfileScramble || '',
          isYou: true,
        };
      }
      const profile = profilesById?.[id] || null;
      return {
        id,
        name: profile?.Name || profile?.name || id,
        username: profile?.Username || profile?.username || id,
        color: profile?.Color || profile?.color || '#cccccc',
        profileEvent: profile?.ProfileEvent || profile?.profileEvent || '333',
        profileScramble: profile?.ProfileScramble || profile?.profileScramble || '',
        isYou: false,
      };
    })
    .filter(Boolean);


function Social({ user, deletePost, setSharedSession, mergeSharedSession, refreshTick }) {
  const [activeTab, setActiveTab] = useState(0);
  const [feed, setFeed] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [showSharedModal, setShowSharedModal] = useState(false);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [createGroupError, setCreateGroupError] = useState('');
  const [friendDirectory, setFriendDirectory] = useState([]);

  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);

  const navigate = useNavigate();

  const activityEndRef = useRef(null);
  const messagesEndRef = useRef(null);

  const formatPostDate = (value) => {
    const d = value instanceof Date ? value : new Date(value);
    if (!d || isNaN(d.getTime())) return String(value ?? '');
    return d.toLocaleString();
  };

  const scrollActivityToBottom = () => {
    activityEndRef.current?.scrollIntoView({ behavior: 'instant' });
  };

  const scrollMessagesToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  

  useEffect(() => {
    if (activeTab === 0) scrollActivityToBottom();
  }, [feed, activeTab]);

  useEffect(() => {
    if (activeTab === 1 && selectedConversation?.messages) {
      scrollMessagesToBottom();
    }
  }, [selectedConversation, activeTab]);

  useEffect(() => {
    if (activeTab !== 1) return;
    if (!selectedConversation?.conversationID) return;
    if (!user?.UserID) return;

    handleRefreshMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedConversation?.conversationID, user?.UserID]);

  useEffect(() => {
  // Only refresh when you're actually in Messages tab with a convo selected.
  if (activeTab !== 1) return;
  if (!selectedConversation) return;
  if (!user?.UserID) return;

  handleRefreshMessages();
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [refreshTick]); 


  useEffect(() => {
  if (activeTab !== 1) return;
  if (!selectedConversation) return;
  if (!user?.UserID) return;

  const id = setInterval(() => {
    handleRefreshMessages();
    console.log("REFRESHING IN SOCIAL SHARED?");
  }, 100000);//10000

  return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab, selectedConversation?.conversationID, user?.UserID]);


  const loadSocialData = async (preferredConversationID = '') => {
      if (!user?.UserID) return;

      try {
        const friendIds = user.Friends || [];
        const profilesById = Object.fromEntries(
          await Promise.all(
            friendIds.map(async (id) => {
              try {
                const prof = await getUser(id);
                return [id, prof];
              } catch (e) {
                console.warn('getUser failed for', id, e);
                return [id, null];
              }
            })
          )
        );
        setFriendDirectory(
          friendIds.map((id) => ({
            id,
            name: profilesById[id]?.Name || profilesById[id]?.name || id,
          }))
        );

        const own = await getPosts(user.UserID);
        const ownAnnotated = own.map((p) => ({
          ...p,
          author: user.Name,
          authorID: user.UserID,
          isOwn: true,
          postColor: user.Color || user.color || '#2EC4B6',
          profileEvent: user.ProfileEvent || '333',
          profileScramble: user.ProfileScramble || '',
        }));

        const friendsArrays = await Promise.all(
          friendIds.map(async (id) => {
            const posts = await getPosts(id);
            const prof = profilesById[id];

            return posts.map((p) => ({
              ...p,
              author: prof?.Name || prof?.name || id,
              authorID: id,
              isOwn: false,
              postColor: prof?.Color || prof?.color || '#cccccc',
              profileEvent: prof?.ProfileEvent || prof?.profileEvent || '333',
              profileScramble: prof?.ProfileScramble || prof?.profileScramble || '',
            }));
          })
        );

        let groups = [];
        try {
          groups = await getGroups(user.UserID);
        } catch (err) {
          console.warn('getGroups failed; continuing without group data', err);
          groups = [];
        }

        const groupsByConversationID = Object.fromEntries(
          groups
            .map((group) => [String(group?.ConversationID || '').trim(), group])
            .filter(([conversationID]) => conversationID)
        );

        const groupPostArrays = await Promise.all(
          groups.map(async (group) => {
            const groupID = String(group?.GroupID || '').trim();
            if (!groupID) return [];

            let posts = [];
            try {
              posts = await getGroupPosts(groupID, user.UserID);
            } catch (err) {
              console.warn('getGroupPosts failed for', groupID, err);
              posts = [];
            }
            return posts.map((p) => ({
              ...p,
              author: p.AuthorName || p.AuthorID || group.Name || groupID,
              authorID: p.AuthorID || '',
              isOwn: p.AuthorID === user.UserID,
              isGroupPost: true,
              groupID,
              groupName: group.Name || groupID,
              postColor: group.Color || '#7f8c8d',
              profileEvent: user.ProfileEvent || '333',
              profileScramble: '',
            }));
          })
        );

        const merged = [...ownAnnotated, ...friendsArrays.flat(), ...groupPostArrays.flat()];
        merged.sort((a, b) => new Date(a.DateTime || a.date) - new Date(b.DateTime || b.date));
        setFeed(merged);

        let storedConversations = [];
        try {
          storedConversations = await getConversations(user.UserID);
        } catch (err) {
          console.warn('getConversations failed; continuing with placeholder DMs', err);
          storedConversations = [];
        }

        const normalizedStored = storedConversations.map((item) => {
          const otherUserID = String(item?.OtherUserID || '').trim();
          const profile = otherUserID ? profilesById[otherUserID] || null : null;
          const conversationID = String(item?.ConversationID || '').trim();
          const group = groupsByConversationID[conversationID] || null;
          const memberProfiles = buildConversationMembers(item?.MemberIDs || [], profilesById, user);
          if (String(item?.ConversationType || '').toUpperCase() === 'GROUP') {
            return {
              ...normalizeConversationRecord(item, null),
              name: group?.Name || item?.Name || item?.DisplayName || conversationID,
              username: group?.Name || item?.Name || conversationID,
              color: group?.Color || '#7f8c8d',
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
              buildPlaceholderDmConversation(user.UserID, friendID, profilesById[friendID] || null)
            );
          }
        });

        const nextConversations = Array.from(conversationMap.values());
        setConversations(nextConversations);
        setSelectedConversation((prev) => {
          if (preferredConversationID) {
            return (
              nextConversations.find(
                (conv) => conv.conversationID === preferredConversationID
              ) || prev
            );
          }
          if (!prev?.conversationID) return prev;
          return (
            nextConversations.find((conv) => conv.conversationID === prev.conversationID) || prev
          );
        });
      } catch (err) {
        console.error('Error fetching social data:', err);
      }
    };

  useEffect(() => {
    loadSocialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshTick, user?.UserID, user?.Friends, user?.Posts, user?.Name, user?.Color, user?.ProfileEvent, user?.ProfileScramble]);

  const handleDelete = async post => {
    if (!post.isOwn) return;
    if (post.PostOwnerType === 'GROUP' || post.isGroupPost) {
      await deleteGroupPost(post.groupID, post.DateTime || post.date, user?.UserID);
    } else {
      await deletePost(post.DateTime || post.date);
    }
    setFeed(f => f.filter(p => p !== post));
    setSelectedPost(null);
  };

  const handleAddComment = async (comment) => {
    if (!selectedPost) return;
    const ts = selectedPost.DateTime || selectedPost.date;
    const updatedComments = [...(selectedPost.Comments || []), comment];
    const updated = { ...selectedPost, Comments: updatedComments };

    setFeed(f => f.map(p => (p === selectedPost ? updated : p)));
    setSelectedPost(updated);

    try {
      if (selectedPost.PostOwnerType === 'GROUP' || selectedPost.isGroupPost) {
        await updateGroupPostComments(selectedPost.groupID, ts, user?.UserID, updatedComments);
      } else {
        const ownerID = selectedPost.PK?.split('#')[1];
        await updatePostComments(ownerID, ts, updatedComments);
      }
    } catch (err) {
      console.error('Failed to save comment:', err);
    }
  };

  const handleRefreshMessages = async () => {
    if (!selectedConversation || !user?.UserID) return;

    const conversationID = selectedConversation.conversationID;
    try {
      const messages = await getMessages(conversationID, user.UserID);
      setSelectedConversation(prev =>
        prev?.conversationID === conversationID ? { ...prev, messages, isPlaceholder: false } : prev
      );
      setConversations(prev =>
        prev.map(conv =>
          conv.conversationID === conversationID
            ? {
                ...conv,
                messages,
                isPlaceholder: false,
                lastMessageAt:
                  messages[messages.length - 1]?.timestamp || conv.lastMessageAt || null,
              }
            : conv
        )
      );
    } catch (err) {
      console.error('Failed to refresh messages:', err);
    }
  };

  const ensureSelectedConversationExists = async () => {
    if (!selectedConversation || !user?.UserID) return selectedConversation;
    if (!selectedConversation.isPlaceholder || selectedConversation.type !== 'DM') {
      return selectedConversation;
    }

    try {
      await createConversation({
        conversationType: 'DM',
        memberIDs: [user.UserID, selectedConversation.friendID].filter(Boolean),
        createdBy: user.UserID,
        conversationID: selectedConversation.conversationID,
      });
    } catch (err) {
      console.error('Failed to ensure DM conversation exists:', err);
    }

    const nextConversation = { ...selectedConversation, isPlaceholder: false };
    setSelectedConversation(nextConversation);
    setConversations((prev) =>
      prev.map((conv) =>
        conv.conversationID === nextConversation.conversationID ? nextConversation : conv
      )
    );
    return nextConversation;
  };

  const handleCreateGroup = async ({ name, memberIDs }) => {
    if (!user?.UserID || creatingGroup) return;

    setCreatingGroup(true);
    setCreateGroupError('');
    try {
      const result = await createGroup({
        ownerID: user.UserID,
        name,
        memberIDs,
      });
      const conversationID = String(result?.item?.ConversationID || '').trim();
      await loadSocialData(conversationID);
      setActiveTab(1);
      setShowCreateGroupModal(false);
    } catch (err) {
      console.error('Failed to create group:', err);
      setCreateGroupError(err?.message || 'Failed to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const loadSharedSession = async ({ sharedID, event, scrambles, events }) => {
    if (!user?.UserID) return;

    const sessionID = sharedID.split("#").slice(0, 3).join("#");
    const sessionName = `Shared ${currentEventToString(event)} with ${selectedConversation?.name || "Friend"}`;

    try {
      await createSession(user.UserID, event, sessionID, sessionName);

      setSharedSession({
        sessionID,
        event,
        sharedID,
        scrambles,
        events: Array.isArray(events) ? events : [],
      });
    } catch (err) {
      console.error("Failed to create shared session", err);
    }
  };

  useEffect(() => {
    const fetchSuggestion = async () => {
      if (!searchTerm) {
        setSuggestions([]);
        return;
      }
      try {
        const prof = await getUser(searchTerm);
        if (prof) {
          const id = prof.PK?.split('#')[1];
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
    setSearchTerm('');
    setSuggestions([]);
    setSearchOpen(false);
    navigate(`/profile/${id}`);
  };

  const sortedConversations = [...conversations].sort((a, b) => {
    const aTime = new Date(a.lastMessageAt || a.messages?.[a.messages.length - 1]?.timestamp || 0);
    const bTime = new Date(b.lastMessageAt || b.messages?.[b.messages.length - 1]?.timestamp || 0);
    return bTime - aTime;
  });

  const selectedConversationMembers =
    selectedConversation?.type === 'GROUP'
      ? (selectedConversation.memberProfiles || []).filter((member) => !member.isYou)
      : [];

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageInput.trim()) return;

    const text = messageInput.trim();
    const conversation = await ensureSelectedConversationExists();
    const conversationID = conversation?.conversationID;
    if (!conversationID) return;

    const newMessage = {
      sender: user.UserID,
      text,
      timestamp: new Date().toISOString()
    };

    const updatedConversation = {
      ...conversation,
      messages: [...(conversation.messages || []), newMessage],
      lastMessageAt: newMessage.timestamp,
      lastMessagePreview: text,
    };
    setSelectedConversation(updatedConversation);
    setConversations(prev =>
      prev.map(conv =>
        conv.conversationID === conversationID ? updatedConversation : conv
      )
    );
    setMessageInput('');

    try {
      await sendMessage(conversationID, user.UserID, text);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleConfirmSharedAverage = async ({
    creatorEvent,
    opponentEvent,
    count,
    creatorPlan,
    opponentPlan,
  }) => {
    if (!selectedConversation || !user?.UserID) return;

    const conversation = await ensureSelectedConversationExists();
    const conversationID = conversation?.conversationID;
    if (!conversationID) return;

    const expandPlanToScrambles = (plan, fallbackEvent, fallbackCount) => {
      if (Array.isArray(plan) && plan.length) {
        return plan.flatMap((entry) =>
          Array.from({ length: Number(entry?.count) || 1 }, () => ({
            event: entry?.event || fallbackEvent || "333",
            scramble: generateScramble(entry?.event || fallbackEvent || "333"),
          }))
        );
      }

      return Array.from({ length: fallbackCount || 1 }, () => ({
        event: fallbackEvent || "333",
        scramble: generateScramble(fallbackEvent || "333"),
      }));
    };

    const creatorEntries = expandPlanToScrambles(creatorPlan, creatorEvent, count);
    const opponentEntries = expandPlanToScrambles(opponentPlan, opponentEvent, count);
    const creatorScrambles = creatorEntries.map((entry) => entry.scramble);
    const opponentScrambles = opponentEntries.map((entry) => entry.scramble);
    const creatorEvents = creatorEntries.map((entry) => entry.event);
    const opponentEvents = opponentEntries.map((entry) => entry.event);
    const sessionID = `SHARED#${conversationID}#${creatorEvents[0] || creatorEvent || "333"}`;
    const sharedRunID = `${sessionID}#${Date.now()}`;
    const scrambleText = `[sharedAoN]${JSON.stringify({
      v: 2,
      sharedID: sharedRunID,
      count: Math.max(creatorScrambles.length, opponentScrambles.length),
      creatorID: user.UserID,
      creatorEvent: creatorEvents[0] || creatorEvent || "333",
      opponentEvent: opponentEvents[0] || opponentEvent || "333",
      creatorEvents,
      opponentEvents,
      creatorScrambles,
      opponentScrambles,
    })}`;

    const message = {
      sender: user.UserID,
      text: scrambleText,
      timestamp: new Date().toISOString()
    };

    const updatedConversation = {
      ...conversation,
      messages: [...(conversation.messages || []), message],
      lastMessageAt: message.timestamp,
      lastMessagePreview: message.text,
    };

    setSelectedConversation(updatedConversation);

    setConversations(prev =>
      prev.map(conv =>
        conv.conversationID === conversationID ? updatedConversation : conv
      )
    );

    try {
      await sendMessage(conversationID, user.UserID, message.text);
      await handleRefreshMessages();
    } catch (err) {
      console.error("Failed to send shared average:", err);
    }
  };

  if (!user) return <div>Please sign in to view your feed.</div>;

  return (
    <div className="Page socialPage">
      <div className="socialHeader">
        {/* LEFT: icon tabs */}
        <div className="tabContainer">
          <button
            className={`tabIconButton ${activeTab === 0 ? 'active' : ''}`}
            onClick={() => setActiveTab(0)}
            aria-label="Activity"
            title="Activity"
          >
            <img className="tabIcon" src={SocialHomeIcon} alt="" />
            {activeTab === 0 && <img className="tabDot" src={DotIcon} alt="" />}
          </button>

          <button
            className={`tabIconButton ${activeTab === 1 ? 'active' : ''}`}
            onClick={() => setActiveTab(1)}
            aria-label="Messages"
            title="Messages"
          >
            <img className="tabIcon" src={SocialMessagesIcon} alt="" />
            {activeTab === 1 && <img className="tabDot" src={DotIcon} alt="" />}
          </button>

          <button
            className={`tabIconButton tabIconButton--flip ${activeTab === 1 ? '' : 'disabled'}`}
            onClick={handleRefreshMessages}
            aria-label="Refresh messages"
            title={activeTab === 1 ? "Refresh" : "Switch to Messages to refresh"}
            disabled={activeTab !== 1 || !selectedConversation}
          >
            <img className="tabIcon" src={FlipIcon} alt="" />
          </button>
        </div>

        {/* CENTER: conversation strip (Messages only) */}
        {activeTab === 1 && (
          <div className="headerConversationStrip">
            <button
              type="button"
              className="conversationPreview conversationPreviewCreate"
              onClick={() => setShowCreateGroupModal(true)}
            >
              <div className="avatarContainer">
                <div className="profilePicturePost profilePicturePostCreate">
                  <div className="conversationCreatePlus">+</div>
                </div>
                <div className="avatarName">New Group</div>
              </div>
            </button>
            {sortedConversations.map(conv => (
              <div
                key={conv.conversationID}
                className={`conversationPreview ${selectedConversation?.conversationID === conv.conversationID ? 'selected' : ''}`}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="avatarContainer">
                  <div
                    className="profilePicturePost"
                    style={{ borderColor: conv.color || '#2EC4B6' }}
                  >
                    {conv.type === 'GROUP' ? (
                      <div className="groupAvatarCluster">
                        {(conv.memberProfiles || []).slice(0, 4).map((member, idx) => (
                          <div
                            key={`${conv.conversationID}-${member.id}-${idx}`}
                            className={`groupAvatarMini groupAvatarMini--${idx}`}
                            style={{ borderColor: member.color || '#cccccc' }}
                          >
                            <div className={`groupAvatarMiniCube postNameCube postNameCube--${(member.profileEvent || "333").toLowerCase()}`}>
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
                      <div className={`postNameCube postNameCube--${(conv.profileEvent || "333").toLowerCase()}`}>
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
              </div>
            ))}
          </div>
        )}

        {/* RIGHT: search */}
        <div
          className={`searchContainer ${searchOpen ? 'open' : ''}`}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setSearchOpen(false);
            }
          }}
        >
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search user..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && suggestions.length && handleSearchSelect(suggestions[0].id)}
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

          {searchOpen && suggestions.length > 0 && (
            <ul className="suggestionsList">
              {suggestions.map(s => (
                <li
  key={s.id}
  onMouseDown={(e) => {
    e.preventDefault(); // prevents the blur/unmount before selection
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
          <div className="tabPanel activityPanel">
            {feed.map((post, idx) => (
              <div
                key={`${post.DateTime || post.date}-${idx}`}
                className={`chatBubble ${post.isOwn ? 'ownBubble' : 'otherBubble'}`}
              >
                {(() => {
                  const statShare = post.StatShare || post.statShare || null;
                  const isStatShare = !!statShare;
                  if (isStatShare) {
                    return (
                      <div className="statFeedPost" onClick={() => setSelectedPost(post)}>
                        <div style={{ border: `2px solid ${withAlpha(post.postColor, 0.5)}`, borderRadius: 12 }}>
                        <StatSharePost note={post.Note} statShare={statShare} />
                        <div className="statFeedMeta">
                          <div className="postDate">{formatPostDate(post.DateTime || post.date)}</div>
                          <div className="statFeedAuthor">@{post.author}</div>
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
                      : [{
                        event: post.Event,
                        scramble: post.Scramble,
                        time: post.Time,
                        note: post.Note,
                        comments: post.Comments || []
                      }]
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
                  {selectedConversation.type === 'GROUP' && (
                    <div className="groupThreadMeta">
                      <div className="groupThreadTitle">{selectedConversation.name}</div>
                      <div className="groupThreadMembers">
                        {selectedConversationMembers.length
                          ? selectedConversationMembers.map((member) => member.name).join(', ')
                          : 'No other members'}
                      </div>
                    </div>
                  )}
                  <div className="messages">
                    {selectedConversation.messages.map((msg, idx) => {
                      if (msg.text?.startsWith('[sharedAoN]')) {
                        // DO NOT wrap this — wrapping changes size + can mess scroll.
                        return (
                          <SharedAverageMessage
  key={idx}
  msg={msg}
  user={user}
  messages={selectedConversation.messages}
  onLoadSession={(session) => loadSharedSession(session)}
  onMerge={(session) => mergeSharedSession(session)}
  yourColor={user?.Color || user?.color || "#2EC4B6"}
  theirColor={selectedConversation?.color || "#888888"}

  yourUsername={user?.Username}
  theirUsername={selectedConversation?.username || selectedConversation?.name || selectedConversation?.conversationID}
/>



                        );
                      }

                      if (msg.text?.startsWith('[sharedUpdate]')) return null;

                      const isOwn = msg.sender === user.UserID;

                      const senderColor = isOwn
                        ? (user?.Color || user?.color || '#2EC4B6')
                        : (selectedConversation?.color || '#888888');

                      return (
                        <div
                          key={idx}
                          className={`chatMessage ${isOwn ? 'sent' : 'received'}`}
                          style={{
                            color: '#fff',
                            backgroundColor: hexToRgbString(senderColor, 0.3),
                            border: `2px solid ${senderColor}`,
                          }}
                        >
                          {msg.text || '[no text]'}
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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }}
/>

                    <button onClick={() => setShowSharedModal(true)}>Shared Average</button>
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
        defaultEvent={user?.ProfileEvent || selectedConversation?.profileEvent || '333'}
        yourDefaultEvent={user?.ProfileEvent || '333'}
        theirDefaultEvent={selectedConversation?.profileEvent || '333'}
        isTwoPerson={selectedConversation?.type !== 'GROUP'}
        yourLabel={user?.Username || user?.Name || 'You'}
        theirLabel={selectedConversation?.username || selectedConversation?.name || 'Them'}
        onConfirm={handleConfirmSharedAverage}
      />

      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => {
          setShowCreateGroupModal(false);
          setCreateGroupError('');
        }}
        friends={friendDirectory}
        onCreate={handleCreateGroup}
        isSubmitting={creatingGroup}
        errorMessage={createGroupError}
      />

      {selectedPost && (
        <PostDetail
          author={selectedPost.author}
          date={formatPostDate(selectedPost.DateTime || selectedPost.date)}
          solveList={
            (selectedPost.StatShare || selectedPost.statShare)
              ? []
              : selectedPost.SolveList && selectedPost.SolveList.length
              ? selectedPost.SolveList
              : [{
                event: selectedPost.Event,
                scramble: selectedPost.Scramble,
                time: selectedPost.Time,
                note: selectedPost.Note,
                comments: selectedPost.Comments || []
              }]
          }
          comments={selectedPost.Comments || []}
          note={selectedPost.Note}
          postType={selectedPost.PostType}
          statShare={selectedPost.StatShare || selectedPost.statShare || null}
          onClose={() => setSelectedPost(null)}
          onDelete={() => handleDelete(selectedPost)}
          onAddComment={handleAddComment}
        />
      )}
    </div>
  );
}

export default Social;
