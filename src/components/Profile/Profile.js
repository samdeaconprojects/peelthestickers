import React, { useState } from 'react';
import './Profile.css';
import Post from './Post';
import ProfileHeader from './ProfileHeader';
import LineChart from '../Stats/LineChart';
import StatsSummary from '../Stats/StatsSummary';
import PieChart from '../Stats/PieChart';
import BarChart from '../Stats/BarChart';
import TimeTable from '../Stats/TimeTable';

function Profile({ user, deletePost, sessions }) {
  const [activeTab, setActiveTab] = useState(0);

  const solves = sessions["333OH"] || [];

  const handleTabClick = (index) => {
    setActiveTab(index);
  };

  if (!user) {
    return <div>Please sign in to view your profile.</div>;
  }

  const recentPosts = [...user.Posts].reverse(); // Reverse to show the most recent posts first

  return (
    <div className="Page">
      <ProfileHeader user={user} />

      <div className="tabContainer">
        <button className={`tabButton ${activeTab === 0 ? 'active' : ''}`} onClick={() => handleTabClick(0)}>Stats</button>
        <button className={`tabButton ${activeTab === 1 ? 'active' : ''}`} onClick={() => handleTabClick(1)}>Posts</button>
        <button className={`tabButton ${activeTab === 2 ? 'active' : ''}`} onClick={() => handleTabClick(2)}>Favorites</button>
      </div>

      <div className="profileContent">
        {activeTab === 0 && (
          <div className="tabPanel">
            <div className="stats-page">
        <div className="stats-grid">
          <div className="stats-item">
            <LineChart solves={solves} title={`Current Avg: $"{3x3 OH"}`}  />
          </div>
          <div className="stats-item">
            <PieChart solves={solves} title="Solves Distribution by Time" />
          </div>
          <div className="stats-item">
            <BarChart solves={solves} />
          </div>
          <div className="stats-item">
            <TimeTable solves={solves}  />
          </div>
        </div>
      </div>
          </div>
        )}
        {activeTab === 1 && (
          <div className="tabPanel">
            {recentPosts.length > 0 ? (
              recentPosts.map((post, index) => (
                <Post
                  key={index}
                  name={user.Name}
                  date={post.date}
                  event={post.event}
                  singleOrAverage={post.singleOrAverage}
                  scramble={post.scramble}
                  time={post.time}
                  deletePost={() => deletePost(user.Posts.length - 1 - index)} // Adjust index to match original order
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
            {/* Add your profile stats content here */}
          </div>
        )}
      </div>
    </div>
  );
}

export default Profile;
