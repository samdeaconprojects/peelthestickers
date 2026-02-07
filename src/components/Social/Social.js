// src/components/Social/Social.js
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import './Social.css';
import Post from '../Profile/Post';
import PostDetail from '../Profile/PostDetail';
import { getPosts } from '../../services/getPosts';
import { getUser } from '../../services/getUser';
import { updatePostComments } from '../../services/updatePostComments';
import { getMessages } from '../../services/getMessages';
import { sendMessage } from '../../services/sendMessage';
import { createSession } from '../../services/createSession';

import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import { generateScramble } from '../scrambleUtils';
import SharedAverageModal from './SharedAverageModal';
import SharedAverageMessage from './SharedAverageMessage';

import DotIcon from '../../assets/Dot.svg';
import FlipIcon from '../../assets/Flip.svg';
import SearchIcon from '../../assets/Search.svg';

import SocialHomeIcon from '../../assets/SocialHome.svg';
import SocialMessagesIcon from '../../assets/SocialMessages.svg';

import { hexToRgbString } from "../../utils/colorUtils";


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

  const [searchOpen, setSearchOpen] = useState(false);
  const searchInputRef = useRef(null);

  const navigate = useNavigate();

  const activityEndRef = useRef(null);
  const messagesEndRef = useRef(null);

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
  }, 10000);

  return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [activeTab, selectedConversation?.id, user?.UserID]);


  useEffect(() => {
    const fetchFeed = async () => {
      if (!user?.UserID) return;
      try {
        const own = await getPosts(user.UserID);
        const ownAnnotated = own.map(p => ({
          ...p,
          author: user.Name,
          authorID: user.UserID,
          isOwn: true,
          postColor: user.Color || user.color || '#2EC4B6',
          profileEvent: user.ProfileEvent || '333',
 profileScramble: user.ProfileScramble || ''
        }));

        const friendIds = user.Friends || [];

const profilesById = Object.fromEntries(
  await Promise.all(
    friendIds.map(async (id) => {
      try {
        const prof = await getUser(id);
        return [id, prof];
      } catch (e) {
        console.warn("getUser failed for", id, e);
        return [id, null];
      }
    })
  )
);

const nameById = {};
const colorById = {};
friendIds.forEach((id) => {
  const prof = profilesById[id];
  nameById[id] = prof?.Name || prof?.name || id;
  colorById[id] = prof?.Color || prof?.color || "#cccccc";
});



        const friendsArrays = await Promise.all(
  friendIds.map(async (id) => {
    const posts = await getPosts(id);
    const prof = profilesById[id];

    return posts.map((p) => ({
      ...p,
      author: nameById[id] || id,
      authorID: id,
      isOwn: false,
      postColor: colorById[id] || "#cccccc",
      profileEvent: prof?.ProfileEvent || prof?.profileEvent || "333",
      profileScramble: prof?.ProfileScramble || prof?.profileScramble || "",
    }));
  })
);


        const merged = [...ownAnnotated, ...friendsArrays.flat()];
        merged.sort((a, b) => new Date(a.DateTime || a.date) - new Date(b.DateTime || b.date));
        setFeed(merged);

        const convos = await Promise.all(friendIds.map(async fid => {
          const id = [user.UserID, fid].sort().join('#');
          const messages = await getMessages(id);
          const prof = profilesById[fid];

return {
  id: fid,
  name: nameById[fid] || fid,
  color: colorById[fid] || "#cccccc",
  profileEvent: prof?.ProfileEvent || prof?.profileEvent || "333",
  profileScramble: prof?.ProfileScramble || prof?.profileScramble || "",
  messages,
};

        }));
        setConversations(convos);
      } catch (err) {
        console.error('Error fetching feed:', err);
      }
    };
    fetchFeed();
  }, [user]);

  const handleDelete = async post => {
    if (!post.isOwn) return;
    await deletePost(post.DateTime || post.date);
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

    const ownerID = selectedPost.PK?.split('#')[1];
    try {
      await updatePostComments(ownerID, ts, updatedComments);
    } catch (err) {
      console.error('Failed to save comment:', err);
    }
  };

  const handleRefreshMessages = async () => {
    if (!selectedConversation || !user?.UserID) return;

    const fid = selectedConversation.id;
    const conversationID = [user.UserID, fid].sort().join('#');
    const messages = await getMessages(conversationID);

    setSelectedConversation(prev => ({ ...prev, messages }));
    setConversations(prev =>
      prev.map(conv =>
        conv.id === fid ? { ...conv, messages } : conv
      )
    );
  };

  const loadSharedSession = async ({ sharedID, event, scrambles }) => {
    if (!user?.UserID) return;

    const sessionID = sharedID.split("#").slice(0, 3).join("#");
    const sessionName = `Shared ${event} with ${selectedConversation?.name || "Friend"}`;

    try {
      await createSession(user.UserID, event, sessionID, sessionName);

      setSharedSession({
        sessionID,
        event,
        sharedID,
        scrambles
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
    const aTime = new Date(a.messages?.[a.messages.length - 1]?.timestamp || 0);
    const bTime = new Date(b.messages?.[b.messages.length - 1]?.timestamp || 0);
    return bTime - aTime;
  });

  const handleSendMessage = async () => {
    if (!selectedConversation || !messageInput.trim()) return;

    const text = messageInput.trim();
    const fid = selectedConversation.id;
    const conversationID = [user.UserID, fid].sort().join('#');

    const newMessage = {
      sender: user.UserID,
      text,
      timestamp: new Date().toISOString()
    };

    const updatedConversation = {
      ...selectedConversation,
      messages: [...(selectedConversation.messages || []), newMessage]
    };
    setSelectedConversation(updatedConversation);
    setConversations(prev =>
      prev.map(conv =>
        conv.id === fid ? updatedConversation : conv
      )
    );
    setMessageInput('');

    try {
      await sendMessage(conversationID, user.UserID, text);
    } catch (err) {
      console.error("Failed to send message:", err);
    }
  };

  const handleConfirmSharedAverage = async (event, count) => {
    if (!selectedConversation || !user?.UserID) return;

    const scrambles = Array.from({ length: count }, () => generateScramble(event));

    const fid = selectedConversation.id;
    const conversationID = [user.UserID, fid].sort().join('#');
    const sessionID = `SHARED#${conversationID}#${event}`;
    const sharedRunID = `${sessionID}#${Date.now()}`;

    const scrambleText =
      `[sharedAoN]${sharedRunID}|${event}|${count}|${scrambles.join('||')}`;

    const message = {
      sender: user.UserID,
      text: scrambleText,
      timestamp: new Date().toISOString()
    };

    const updatedConversation = {
      ...selectedConversation,
      messages: [...(selectedConversation.messages || []), message]
    };

    setSelectedConversation(updatedConversation);

    setConversations(prev =>
      prev.map(conv =>
        conv.id === fid ? updatedConversation : conv
      )
    );

    try {
      await sendMessage(conversationID, user.UserID, message.text);
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
            {sortedConversations.map(conv => (
              <div
                key={conv.id}
                className={`conversationPreview ${selectedConversation?.id === conv.id ? 'selected' : ''}`}
                onClick={() => setSelectedConversation(conv)}
              >
                <div className="avatarContainer">
                  <div
                    className="profilePicturePost"
                    style={{ borderColor: conv.color || '#2EC4B6' }}
                  >
                    <div className={`postNameCube postNameCube--${(conv.profileEvent || "333").toLowerCase()}`}>
                      <PuzzleSVG
                        event={conv.profileEvent || "333"}
                        scramble={conv.profileScramble || ""}
                        isMusicPlayer={false}
                        isTimerCube={false}
                        isNameTagCube={true}
                      />
                    </div>
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
                <Post
                  name={post.author}
                  user={{
   UserID: post.authorID,
   Name: post.author,
  Color: post.postColor,
  ProfileEvent: post.profileEvent,
   ProfileScramble: post.profileScramble,
 }}
                  date={new Date(post.DateTime || post.date).toLocaleString()}
                  solveList={
                    post.SolveList && post.SolveList.length
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
                  onClick={() => setSelectedPost(post)}
                />
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
  theirUsername={selectedConversation?.username || selectedConversation?.id}
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
        defaultEvent={selectedConversation?.profileEvent || '333'}
        onConfirm={handleConfirmSharedAverage}
      />

      {selectedPost && (
        <PostDetail
          author={selectedPost.author}
          date={new Date(selectedPost.DateTime || selectedPost.date).toLocaleString()}
          solveList={
            selectedPost.SolveList && selectedPost.SolveList.length
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
          onClose={() => setSelectedPost(null)}
          onDelete={() => handleDelete(selectedPost)}
          onAddComment={handleAddComment}
        />
      )}
    </div>
  );
}

export default Social;
