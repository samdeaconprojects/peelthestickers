// src/components/Profile/Profile.js
import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import './Profile.css';
import Post from './Post';
import PostDetail from './PostDetail';
import ProfileHeader from './ProfileHeader';
import LineChart from '../Stats/LineChart';
import EventCountPieChart from '../Stats/EventCountPieChart';
import BarChart from '../Stats/BarChart';
import TimeTable from '../Stats/TimeTable';
import { getPosts } from '../../services/getPosts';
import { getUser } from '../../services/getUser';
import { updateUser } from '../../services/updateUser';
import { updatePostComments } from '../../services/updatePostComments';
import { getSessions } from '../../services/getSessions';
import { getSolvesBySession } from '../../services/getSolvesBySession';

function Profile({ user, setUser, deletePost: deletePostProp }) {
  const { userID: paramID } = useParams();
  const isOwn = !paramID || paramID === user?.UserID;
  const viewID = isOwn ? user?.UserID : paramID;

  const isFriend = user?.Friends?.includes(viewID);

  const [viewedProfile, setViewedProfile] = useState(null);
  const [viewedSessions, setViewedSessions] = useState({});
  const [posts, setPosts] = useState([]);
  const [selectedPost, setSelectedPost] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Default visible stats
  const defaultVisibleStats = [
    { chart: 'lineChart', event: '333', session: 'all' },
    { chart: 'pieChart' },
  ];
  const [visibleStats, setVisibleStats] = useState(defaultVisibleStats);
  const [editingStats, setEditingStats] = useState(false);

  // Load profile data
  useEffect(() => {
    const loadProfile = async () => {
      if (isOwn) {
        setViewedProfile(user);
        setVisibleStats(
          Array.isArray(user?.VisibleStats) && user.VisibleStats.length > 0
            ? user.VisibleStats
            : defaultVisibleStats
        );
      } else {
        try {
          const prof = await getUser(viewID);
          setViewedProfile({ ...prof, UserID: viewID });
          setVisibleStats(
            Array.isArray(prof?.VisibleStats) && prof.VisibleStats.length > 0
              ? prof.VisibleStats
              : defaultVisibleStats
          );
        } catch (err) {
          console.error('Error loading profile:', err);
        }
      }
    };
    loadProfile();
  }, [viewID, user, isOwn]);

  // Load sessions and group by event + session
  useEffect(() => {
    const loadSessions = async () => {
      if (!viewID) return;
      try {
        const sessionItems = await getSessions(viewID);

        const grouped = {};
        for (const session of sessionItems) {
          const ev = session.Event || 'UNKNOWN';
          const sid = session.SessionID || 'main';

          if (!grouped[ev]) grouped[ev] = {};
          if (!grouped[ev][sid]) grouped[ev][sid] = [];

          try {
            const solves = await getSolvesBySession(viewID, ev, sid);
            grouped[ev][sid].push(...solves.map(normalizeSolve));
          } catch (err) {
            console.error('Error fetching solves for', ev, sid, err);
          }
        }

        console.log('Grouped sessions for profile:', grouped);
        setViewedSessions(grouped);
      } catch (err) {
        console.error('Failed to fetch sessions:', err);
      }
    };
    loadSessions();
  }, [viewID]);

  const normalizeSolve = (item) => ({
    time: item.Time,
    scramble: item.Scramble,
    event: item.Event,
    penalty: item.Penalty,
    note: item.Note || '',
    datetime: item.DateTime,
    tags: item.Tags || {},
  });

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

    setPosts((pl) => pl.map((p) => (p === selectedPost ? updated : p)));
    setSelectedPost(updated);

    const ownerID = viewID;
    try {
      await updatePostComments(ownerID, ts, updatedComments);
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
        setUser((prev) => ({ ...prev, Friends: updatedList }));
      } catch (err) {
        console.error('Failed to add friend:', err);
      }
    }
  };

  // Save stat preferences
  const handleSaveStats = async () => {
    try {
      await updateUser(user.UserID, { VisibleStats: visibleStats });
      setUser((prev) => ({ ...prev, VisibleStats: visibleStats }));
      setEditingStats(false);
    } catch (err) {
      console.error('Failed to update visible stats:', err);
    }
  };

  if (!viewedProfile) return null;
  if (!viewedProfile.UserID) return <div>Loading profile…</div>;

  const recentPosts = [...posts].reverse();

  return (
    <div className="Page">
      <ProfileHeader user={viewedProfile} sessions={viewedSessions} />

      {!isOwn && (
        <button
          className="addFriendButton"
          onClick={handleAddFriend}
          disabled={isFriend}
        >
          {isFriend ? 'Friend' : 'Add Friend'}
        </button>
      )}

      {isOwn && (
        <button
          className="editStatsButton"
          onClick={() => setEditingStats(true)}
        >
          Edit Visible Stats
        </button>
      )}

      {editingStats && (
        <div className="statsEditor">
          <h3>Select visible stats</h3>
          {visibleStats.map((item, idx) => (
            <div key={idx} className="statSelector">
              <select
                value={item.chart}
                onChange={(e) => {
                  const newStats = [...visibleStats];
                  newStats[idx] = { ...item, chart: e.target.value };
                  setVisibleStats(newStats);
                }}
              >
                <option value="lineChart">Line Chart</option>
                <option value="pieChart">Event Breakdown</option>
                <option value="barChart">Bar Chart</option>
                <option value="timeTable">Time Table</option>
              </select>
              {item.chart !== 'pieChart' && (
                <>
                  <select
                    value={item.event || '333'}
                    onChange={(e) => {
                      const newStats = [...visibleStats];
                      newStats[idx] = { ...item, event: e.target.value };
                      setVisibleStats(newStats);
                    }}
                  >
                    {Object.keys(viewedSessions).map((ev) => (
                      <option key={ev} value={ev}>
                        {ev}
                      </option>
                    ))}
                  </select>

                  <select
                    value={item.session || 'all'}
                    onChange={(e) => {
                      const newStats = [...visibleStats];
                      newStats[idx] = { ...item, session: e.target.value };
                      setVisibleStats(newStats);
                    }}
                  >
                    <option value="all">All Sessions</option>
                    {Object.keys(viewedSessions[item.event] || {}).map((sid) => (
                      <option key={sid} value={sid}>
                        {sid}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>
          ))}
          <button
            onClick={() =>
              setVisibleStats([
                ...visibleStats,
                { chart: 'lineChart', event: '333', session: 'all' },
              ])
            }
          >
            + Add Chart
          </button>
          <div>
            <button onClick={handleSaveStats}>Save</button>
            <button onClick={() => setEditingStats(false)}>Cancel</button>
          </div>
        </div>
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
                {visibleStats.map((item, idx) => {
                  if (item.chart === 'lineChart') {
                    let solves = [];
                    if (item.session === 'all') {
                      solves = Object.values(viewedSessions[item.event] || {}).flat();
                    } else {
                      solves = viewedSessions[item.event]?.[item.session] || [];
                    }
                    return (
                      <div key={idx} className="stats-item">
                        <LineChart
                          solves={solves.slice(-100)}
                          title={`${item.event} (${item.session || 'all'})`}
                        />
                      </div>
                    );
                  }
                  if (item.chart === 'pieChart') {
                    return (
                      <div key={idx} className="stats-item">
                        <EventCountPieChart sessions={viewedSessions} />
                      </div>
                    );
                  }
                  if (item.chart === 'barChart') {
                    let solves = [];
                    if (item.session === 'all') {
                      solves = Object.values(viewedSessions[item.event] || {}).flat();
                    } else {
                      solves = viewedSessions[item.event]?.[item.session] || [];
                    }
                    return (
                      <div key={idx} className="stats-item">
                        <BarChart solves={solves} />
                      </div>
                    );
                  }
                  if (item.chart === 'timeTable') {
                    let solves = [];
                    if (item.session === 'all') {
                      solves = Object.values(viewedSessions[item.event] || {}).flat();
                    } else {
                      solves = viewedSessions[item.event]?.[item.session] || [];
                    }
                    return (
                      <div key={idx} className="stats-item">
                        <TimeTable solves={solves} />
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        )}

        {activeTab === 1 && (
          <div className="tabPanel postsPanel">
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
                  postColor={viewedProfile.Color}
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
