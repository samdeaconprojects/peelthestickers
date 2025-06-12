// src/components/Social/Social.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './Social.css';
import Post from '../Profile/Post';
import PostDetail from '../Profile/PostDetail';
import { getPosts } from '../../services/getPosts';
import { getUser } from '../../services/getUser';
import { updatePostComments } from '../../services/updatePostComments';

function Social({ user, deletePost }) {
  const [activeTab, setActiveTab] = useState(0);
  const [feed, setFeed] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messageInput, setMessageInput] = useState('');
  const navigate = useNavigate();

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
        merged.sort((a, b) => new Date(b.DateTime || b.date) - new Date(a.DateTime || a.date));
        setFeed(merged);

        // Simulated messages
        const dummyConversations = friendIds.map(fid => ({
          id: fid,
          name: nameById[fid] || fid,
          messages: [
            { sender: fid, text: 'Hey' },
            { sender: user.UserID, text: 'Hi' }
          ]
        }));
        setConversations(dummyConversations);
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

  const handleSendMessage = () => {
    if (!selectedConversation || !messageInput.trim()) return;

    const updated = conversations.map(conv => {
      if (conv.id === selectedConversation.id) {
        return {
          ...conv,
          messages: [...conv.messages, { sender: user.UserID, text: messageInput }]
        };
      }
      return conv;
    });

    setConversations(updated);
    setMessageInput('');
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
          </div>
        )}

        {activeTab === 1 && (
          <div className="tabPanel messagesPanel">
            <div className="conversationList">
              {conversations.map(conv => (
                <div
                  key={conv.id}
                  className={`conversationPreview ${selectedConversation?.id === conv.id ? 'selected' : ''}`}
                  onClick={() => setSelectedConversation(conv)}
                >
                  {conv.name}
                </div>
              ))}
            </div>
            <div className="conversationView">
              {selectedConversation ? (
                <>
                  <div className="messages">
                    {selectedConversation.messages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`chatMessage ${msg.sender === user.UserID ? 'sent' : 'received'}`}
                      >
                        {msg.text}
                      </div>
                    ))}
                  </div>
                  <div className="messageInput">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Type a message..."
                    />
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
