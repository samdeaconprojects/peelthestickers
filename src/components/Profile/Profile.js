import React, { useState, useEffect } from 'react';
import './Profile.css';
import Post from './Post';
import ProfileHeader from './ProfileHeader';
import EventSelectorDetail from '../Detail/EventSelectorDetail';
import LineChart from '../Stats/LineChart';
import EventCountPieChart from '../Stats/EventCountPieChart';
import BarChart from '../Stats/BarChart';
import TimeTable from '../Stats/TimeTable';
import { getPosts } from '../../services/getPosts';

function Profile({ user, deletePost: deletePostProp, sessions }) {
  const [activeTab, setActiveTab] = useState(0);
  const [showEventSelector, setShowEventSelector] = useState(false);
  const [selectedEvents, setSelectedEvents] = useState(["333", "444", "555", "222"]);
  const [posts, setPosts] = useState([]);

  // Fetch posts on mount and whenever user changes
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

  // Handler to delete a post and refresh list
  const handleDeletePost = async (timestamp) => {
    try {
      await deletePostProp(timestamp);
      const fresh = await getPosts(user.UserID);
      setPosts(fresh);
    } catch (err) {
      console.error('Failed to delete post:', err);
    }
  };

  // Stats data for 3x3
  const solves = sessions["333"] || [];

  const handleEventSave = (newSelectedEvents) => {
    setSelectedEvents(newSelectedEvents);
    setShowEventSelector(false);
  };

  if (!user) {
    return <div>Please sign in to view your profile.</div>;
  }

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
                  key={post.date || idx}
                  name={user.Name}
                  date={post.date}
                  event={post.event}
                  singleOrAverage={post.singleOrAverage}
                  scramble={post.scramble}
                  time={post.time}
                  deletePost={() => handleDeletePost(post.date)}
                  postColor={'#2EC4B6'}
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
            {/* Add your favorites UI here */}
          </div>
        )}
      </div>

      {showEventSelector && (
        <EventSelectorDetail
          events={["222", "333", "444", "555", "666", "777", "333OH", "333BLD"]}
          selectedEvents={selectedEvents}
          onClose={() => setShowEventSelector(false)}
          onSave={handleEventSave}
        />
      )}
    </div>
  );
}

export default Profile;
