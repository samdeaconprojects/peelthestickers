// src/components/Profile/Profile.js
import React, { useState, useEffect } from 'react';
import './Profile.css';
import Post from './Post';
import PostDetail from './PostDetail';               // popup
import ProfileHeader from './ProfileHeader';
import EventSelectorDetail from '../Detail/EventSelectorDetail';
import LineChart from '../Stats/LineChart';
import EventCountPieChart from '../Stats/EventCountPieChart';
import BarChart from '../Stats/BarChart';
import TimeTable from '../Stats/TimeTable';
import { getPosts } from '../../services/getPosts';
import { updatePostComments } from '../../services/updatePostComments'; // ← new

function Profile({ user, deletePost: deletePostProp, sessions }) {
  const [activeTab, setActiveTab] = useState(0);
  const [showEventSelector, setShowEventSelector] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState(["333", "444", "555", "222"]);
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);

  // Fetch posts whenever the user changes
  useEffect(() => {
    const fetch = async () => {
      if (!user?.UserID) return;
      try {
        const fresh = await getPosts(user.UserID);
        setPosts(fresh);
      } catch (err) {
        console.error('Failed to fetch posts:', err);
      }
    };
    fetch();
  }, [user?.UserID]);

  // Delete + refresh
  const handleDeletePost = async (timestamp) => {
    try {
      await deletePostProp(timestamp);
      const fresh = await getPosts(user.UserID);
      setPosts(fresh);
      setSelectedPost(null);
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  // Add a new comment locally & persist to DynamoDB
  const handleAddComment = async (comment) => {
    if (!selectedPost) return;
    const ts = selectedPost.DateTime || selectedPost.date;
    const updatedComments = [...(selectedPost.Comments || []), comment];
    const updatedPost = { ...selectedPost, Comments: updatedComments };

    // 1) update UI
    setPosts(ps => ps.map(p => p === selectedPost ? updatedPost : p));
    setSelectedPost(updatedPost);

    // 2) persist comments
    try {
      await updatePostComments(user.UserID, ts, updatedComments);
    } catch (err) {
      console.error('Failed to save comment:', err);
    }
  };

  // stats for 3x3
  const solves = sessions["333"] || [];

  if (!user) {
    return <div>Please sign in to view your profile.</div>;
  }

  // show most recent first
  const recentPosts = [...posts].reverse();

  return (
    <div className="Page">
      <ProfileHeader user={user} sessions={sessions} />

      <div className="tabContainer">
        <button
          className={`tabButton ${activeTab === 0 ? 'active' : ''}`}
          onClick={() => setActiveTab(0)}
        >Stats</button>
        <button
          className={`tabButton ${activeTab === 1 ? 'active' : ''}`}
          onClick={() => setActiveTab(1)}
        >Posts</button>
        <button
          className={`tabButton ${activeTab === 2 ? 'active' : ''}`}
          onClick={() => setActiveTab(2)}
        >Favorites</button>
      </div>

      <div className="profileContent">
        {activeTab === 0 && (
          <div className="tabPanel">
            <div className="stats-page">
              <div className="stats-grid">
                <div className="stats-item"><LineChart solves={solves} title="3x3" /></div>
                <div className="stats-item"><EventCountPieChart sessions={sessions} /></div>
                <div className="stats-item"><BarChart solves={solves} /></div>
                <div className="stats-item"><TimeTable solves={solves} /></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className="tabPanel">
            {recentPosts.length > 0 ? (
              recentPosts.map((post, idx) => (
                <Post
                  key={`${post.DateTime || post.date}-${idx}`}
                  name={user.Name}
                  date={
                    post.DateTime
                      ? new Date(post.DateTime).toLocaleString()
                      : post.date
                  }
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
                  postColor={'#2EC4B6'}
                  onClick={() => setSelectedPost(post)}
                />
              ))
            ) : (
              <p>No posts yet. Start solving to create posts!</p>
            )}
          </div>
        )}

        {activeTab === 2 && (
          <div className="tabPanel">
            <h2>Favorites</h2>
          </div>
        )}
      </div>

      {showEventSelector && (
        <EventSelectorDetail
          events={["222","333","444","555","666","777","333OH","333BLD"]}
          selectedEvents={selectedEvents}
          onClose={() => setShowEventSelector(false)}
          onSave={(e) => { setSelectedEvents(e); setShowEventSelector(false); }}
        />
      )}

      {selectedPost && (
        <PostDetail
          author={user.Name}
          date={
            selectedPost.DateTime
              ? new Date(selectedPost.DateTime).toLocaleString()
              : selectedPost.date
          }
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
          onDelete={() =>
            handleDeletePost(selectedPost.DateTime || selectedPost.date)
          }
          onAddComment={handleAddComment}
        />
      )}
    </div>
  );
}

export default Profile;
