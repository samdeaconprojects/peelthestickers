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
  const [activeTab, setActiveTab]       = useState(0);
  const [feed, setFeed]                 = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [searchTerm, setSearchTerm]     = useState('');
  const [suggestions, setSuggestions]   = useState([]);
  const navigate = useNavigate();

  // --- Load activity feed ---
  useEffect(() => {
    const fetchFeed = async () => {
      if (!user?.UserID) return;
      try {
        // your own posts
        const own = await getPosts(user.UserID);
        const ownAnnotated = own.map(p => ({
          ...p,
          author: user.Name,
          isOwn: true,
          postColor: user.Color || user.color || '#2EC4B6'
        }));

        // friend list from user.Friends
        const friendIds = user.Friends || [];

        const profiles = await Promise.all(friendIds.map(id => getUser(id)));
        const nameById = {}, colorById = {};
        profiles.forEach(prof => {
          const fid = prof.PK?.split('#')[1] || prof.userID;
          nameById[fid]  = prof.Name  || prof.name;
          colorById[fid] = prof.Color || prof.color || '#cccccc';
        });

        const friendsArrays = await Promise.all(
          friendIds.map(async id => {
            const posts = await getPosts(id);
            return posts.map(p => ({
              ...p,
              author:    nameById[id]  || id,
              isOwn:     false,
              postColor: colorById[id] || '#cccccc'
            }));
          })
        );

        const merged = [...ownAnnotated, ...friendsArrays.flat()];
        merged.sort((a, b) => new Date(b.DateTime || b.date) - new Date(a.DateTime || a.date));
        setFeed(merged);
      } catch (err) {
        console.error('Error fetching social feed:', err);
      }
    };
    fetchFeed();
  }, [user]);

  // --- Delete your own post ---
  const handleDelete = async post => {
    if (!post.isOwn) return;
    await deletePost(post.DateTime || post.date);
    setFeed(f => f.filter(p => p !== post));
    setSelectedPost(null);
  };

  // --- Comment on any post (writes under real owner) ---
  const handleAddComment = async (comment) => {
    if (!selectedPost) return;
    const ts = selectedPost.DateTime || selectedPost.date;
    const updatedComments = [...(selectedPost.Comments || []), comment];
    const updated = { ...selectedPost, Comments: updatedComments };

    // Update UI
    setFeed(f => f.map(p => (p === selectedPost ? updated : p)));
    setSelectedPost(updated);

    // Persist under post’s owner
    const ownerID = selectedPost.PK?.split('#')[1];
    try {
      await updatePostComments(ownerID, ts, updatedComments);
    } catch (err) {
      console.error('Failed to save comment:', err);
    }
  };

  // --- Typeahead search ---
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

  if (!user) return <div>Please sign in to view your feed.</div>;

  return (
    <div className="Page">
      <div className="socialHeader">
        <div className="tabContainer">
          <button
            className={`tabButton ${activeTab === 0 ? 'active' : ''}`}
            onClick={() => setActiveTab(0)}
          >
            Activity
          </button>
          <button
            className={`tabButton ${activeTab === 1 ? 'active' : ''}`}
            onClick={() => setActiveTab(1)}
          >
            Messages
          </button>
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
          <div className="tabPanel">
            {feed.map((post, idx) => (
              <Post
                key={`${post.DateTime || post.date}-${idx}`}
                name={post.author}
                date={new Date(post.DateTime || post.date).toLocaleString()}
                solveList={
                  post.SolveList && post.SolveList.length
                    ? post.SolveList
                    : [{
                        event:    post.Event,
                        scramble: post.Scramble,
                        time:     post.Time,
                        note:     post.Note,
                        comments: post.Comments || []
                      }]
                }
                postColor={post.postColor}
                onClick={() => setSelectedPost(post)}
              />
            ))}
          </div>
        )}
        {activeTab === 1 && (
          <div className="tabPanel">
            <h2>Messages</h2>
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
                  event:    selectedPost.Event,
                  scramble: selectedPost.Scramble,
                  time:     selectedPost.Time,
                  note:     selectedPost.Note,
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
