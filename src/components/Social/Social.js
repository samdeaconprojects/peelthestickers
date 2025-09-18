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
import PuzzleSVG from '../PuzzleSVGs/PuzzleSVG';
import { generateScramble } from '../scrambleUtils';
import SharedAverageModal from './SharedAverageModal';
import SharedAverageMessage from './SharedAverageMessage'; // ✅ NEW

function Social({ user, deletePost, setSharedSession, mergeSharedSession }) {
  const [activeTab, setActiveTab] = useState(0);
  const [feed, setFeed] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const [showSharedModal, setShowSharedModal] = useState(false); // ✅ NEW

  const navigate = useNavigate();

  const activityEndRef = useRef(null);
  const messagesEndRef = useRef(null);

  const scrollActivityToBottom = () => {
    activityEndRef.current?.scrollIntoView({ behavior: 'instant' });
  };

  const scrollMessagesToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const getTransform = (event) => {
    const transforms = {
      '222': 'translate(23px, 58px) scale(0.7)',
      '333': 'translate(6px, 38px)scale(0.6)',
      '444': 'translate(3px, 34px) scale(0.55)',
      '555': 'translate(-1px, 26px) scale(0.55)',
      '666': 'translate(0px, 32px) scale(0.54)',
      '777': 'translate(0px, 31px) scale(0.54)',
      'CLOCK': 'translate(6px, 12px) scale(0.55)',
      'SKEWB': 'translate(16px, 25px) scale(0.80)',
      'MEGAMINX': 'translate(-4px, -16px) scale(0.8)',
      'PYRAMINX': 'translate(0px, -18px) scale(0.88)',
    };
    return transforms[event] || 'scale(0.6)';
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
    const fetchFeed = async () => {
      if (!user?.UserID) return;
      try {
        const own = await getPosts(user.UserID);
        const ownAnnotated = own.map(p => ({
          ...p,
          author: user.Name,
          isOwn: true,
          postColor: user.Color || user.color || '#2EC4B6'
        }));

        const friendIds = user.Friends || [];
        const profiles = await Promise.all(friendIds.map(id => getUser(id)));

        const nameById = {}, colorById = {};
        profiles.forEach(prof => {
          const fid = prof.PK?.split('#')[1] || prof.userID;
          nameById[fid] = prof.Name || prof.name;
          colorById[fid] = prof.Color || prof.color || '#cccccc';
        });

        const friendsArrays = await Promise.all(
          friendIds.map(async id => {
            const posts = await getPosts(id);
            return posts.map(p => ({
              ...p,
              author: nameById[id] || id,
              isOwn: false,
              postColor: colorById[id] || '#cccccc'
            }));
          })
        );

        const merged = [...ownAnnotated, ...friendsArrays.flat()];
        merged.sort((a, b) => new Date(a.DateTime || a.date) - new Date(b.DateTime || b.date));
        setFeed(merged);

        const convos = await Promise.all(friendIds.map(async fid => {
          const id = [user.UserID, fid].sort().join('#');
          const messages = await getMessages(id);
          const prof = profiles.find(p => p.PK?.endsWith(`#${fid}`));
          return {
            id: fid,
            name: nameById[fid] || fid,
            color: colorById[fid] || '#cccccc',
            profileEvent: prof?.ProfileEvent || '333',
            profileScramble: prof?.ProfileScramble || '',
            messages
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
    const scrambleText = `[sharedAoN]${event}|${count}|${scrambles.join('||')}`;

    const message = {
      sender: user.UserID,
      text: scrambleText,
      timestamp: new Date().toISOString()
    };

    const fid = selectedConversation.id;
    const conversationID = [user.UserID, fid].sort().join('#');

    const updatedConversation = {
      ...selectedConversation,
      messages: [...(selectedConversation.messages || []), message]
    };
    setSelectedConversation(updatedConversation);
    setConversations(prev =>
      prev.map(conv => (conv.id === fid ? updatedConversation : conv))
    );

    try {
      await sendMessage(conversationID, user.UserID, message.text);
    } catch (err) {
      console.error("Failed to send shared average:", err);
    }
  };

  if (!user) return <div>Please sign in to view your feed.</div>;

  return (
    <div className="Page">
      <div className="socialHeader">
        <div className="tabContainer">
          <button className={`tabButton ${activeTab === 0 ? 'active' : ''}`} onClick={() => setActiveTab(0)}>Activity</button>
          <button className={`tabButton ${activeTab === 1 ? 'active' : ''}`} onClick={() => setActiveTab(1)}>Messages</button>
        </div>
        <div className="searchContainer">
          <input
            type="text"
            placeholder="Search user..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && suggestions.length && handleSearchSelect(suggestions[0].id)}
          />
          {suggestions.length > 0 && (
            <ul className="suggestionsList">
              {suggestions.map(s => (
                <li key={s.id} onClick={() => handleSearchSelect(s.id)}>
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
            <div className="conversationStrip">
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
                      <div
                        className="postNameCube"
                        style={{ transform: getTransform(conv.profileEvent) }}
                      >
                        <PuzzleSVG
                          event={conv.profileEvent || '333'}
                          scramble={conv.profileScramble || ''}
                          isMusicPlayer={false}
                          isTimerCube={false}
                        />
                      </div>
                    </div>
                    <div className="avatarName">{conv.name}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="conversationView">
              <button className="refreshButton" onClick={async () => {
                if (!selectedConversation) return;
                const fid = selectedConversation.id;
                const conversationID = [user.UserID, fid].sort().join('#');
                const messages = await getMessages(conversationID);
                setSelectedConversation(prev => ({ ...prev, messages }));
                setConversations(prev =>
                  prev.map(conv =>
                    conv.id === fid ? { ...conv, messages } : conv
                  )
                );
              }}>
                Refresh
              </button>

              {selectedConversation ? (
                <>
                  <div className="messages">
                    {selectedConversation.messages.map((msg, idx) => {
                      if (msg.text?.startsWith('[sharedAoN]')) {
                        return (
                          <SharedAverageMessage
                            key={idx}
                            msg={msg}
                            user={user}
                            onLoadSession={(session) => setSharedSession(session)}
                            onMergeSession={(session) => mergeSharedSession(session)}
                          />
                        );
                      }
                      return (
                        <div
                          key={idx}
                          className={`chatMessage ${msg.sender === user.UserID ? 'sent' : 'received'}`}
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
