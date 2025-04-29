// src/components/Profile/Profile.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './Profile.css';
import Post from './Post';
import PostDetail from './PostDetail';
import ProfileHeader from './ProfileHeader';
import EventSelectorDetail from '../Detail/EventSelectorDetail';
import LineChart from '../Stats/LineChart';
import EventCountPieChart from '../Stats/EventCountPieChart';
import BarChart from '../Stats/BarChart';
import TimeTable from '../Stats/TimeTable';
import { getPosts } from '../../services/getPosts';
import { getUser } from '../../services/getUser';
import { updateUser } from '../../services/updateUser';
import { updatePostComments } from '../../services/updatePostComments';

function Profile({
  user,
  deletePost: deletePostProp,
  sessions,
  updateComments,
}) {
  const { userID: paramID } = useParams();
  const isOwn = !paramID || paramID === user?.UserID;
  const viewID = isOwn ? user?.UserID : paramID;

  const [viewedProfile, setViewedProfile] = useState(null);
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [activeTab, setActiveTab] = useState(0);
  const [selectedEvents, setSelectedEvents] = useState(["333","444","555","222"]);
  const [showEventSelector, setShowEventSelector] = useState(false);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      if (isOwn) {
        setViewedProfile(user);
      } else {
        try {
          const prof = await getUser(viewID);
          setViewedProfile({ ...prof, UserID: viewID });
        } catch (err) {
          console.error('Error loading profile:', err);
        }
      }
    };
    loadProfile();
  }, [viewID, user, isOwn]);

  // Load posts
  useEffect(() => {
    const loadPosts = async () => {
      try {
        const fresh = await getPosts(viewID);
        setPosts(fresh);
      } catch (err) {
        console.error('Failed to fetch posts:', err);
      }
    };
    if (viewID) loadPosts();
  }, [viewID]);

  // Delete post
  const handleDeletePost = async (ts) => {
    try {
      await deletePostProp(ts);
      const fresh = await getPosts(viewID);
      setPosts(fresh);
      setSelectedPost(null);
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  // Add comment
  const handleAddComment = async (comment) => {
    if (!selectedPost) return;
    const ts = selectedPost.DateTime || selectedPost.date;
    const updatedComments = [...(selectedPost.Comments || []), comment];
    const updated = { ...selectedPost, Comments: updatedComments };

    // UI
    setPosts(pl => pl.map(p => p === selectedPost ? updated : p));
    setSelectedPost(updated);

    // Persist
    const ownerID = viewID;
    try {
      if (updateComments) {
        await updateComments(ts, updatedComments);
      } else {
        await updatePostComments(ownerID, ts, updatedComments);
      }
    } catch (err) {
      console.error('Failed to save comment:', err);
    }
  };

  // Add friend
  const handleAddFriend = async () => {
    if (!user || isOwn) return;
    const current = user.Friends || [];
    if (!current.includes(viewID)) {
      const updatedList = [...current, viewID];
      try {
        await updateUser(user.UserID, { Friends: updatedList });
      } catch (err) {
        console.error('Failed to add friend:', err);
      }
    }
  };

  // Stats data
  const solves = sessions["333"] || [];

  if (!viewedProfile) return null;
  if (!viewedProfile.UserID) return <div>Loading profile…</div>;

  const recentPosts = [...posts].reverse();

  return (
    <div className="Page">
      <ProfileHeader user={viewedProfile} sessions={sessions} />

      {!isOwn && (
        <button className="addFriendButton" onClick={handleAddFriend}>
          Add Friend
        </button>
      )}

      <div className="tabContainer">
        <button
          className={`tabButton ${activeTab === 0 ? 'active' : ''}`}
          onClick={() => setActiveTab(0)}
        >
          Stats
        </button>
        <button
          className={`tabButton ${activeTab === 1 ? 'active' : ''}`}
          onClick={() => setActiveTab(1)}
        >
          Posts
        </button>
      </div>

      <div className="profileContent">
        {activeTab === 0 && (
          <div className="tabPanel">
            <div className="stats-page">
              <div className="stats-grid">
                <div className="stats-item">
                  <LineChart solves={solves} title="3x3" />
                </div>
                <div className="stats-item">
                  <EventCountPieChart sessions={sessions} />
                </div>
                <div className="stats-item">
                  <BarChart solves={solves} />
                </div>
                <div className="stats-item">
                  <TimeTable solves={solves} />
                </div>
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
                  name={viewedProfile.Name || viewedProfile.name}
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
              <p>No posts yet.</p>
            )}
          </div>
        )}
      </div>

      {selectedPost && (
        <PostDetail
          author={viewedProfile.Name || viewedProfile.name}
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
