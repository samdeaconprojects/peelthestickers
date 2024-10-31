import React, { useState } from 'react';
import Post from '../Profile/Post';


function Social({ user, deletePost }) {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabClick = (index) => {
    setActiveTab(index);
  };

  if (!user) {
    return <div>Please sign in to view your feed.</div>;
  }

  const recentPosts = [...user.Posts].reverse(); // Reverse to show the most recent posts first

  return (
    <div className="Page">

      <div className="tabContainer">
        <button className={`tabButton ${activeTab === 0 ? 'active' : ''}`} onClick={() => handleTabClick(0)}>Activity</button>
        <button className={`tabButton ${activeTab === 1 ? 'active' : ''}`} onClick={() => handleTabClick(1)}>Messages</button>
      </div>

      <div className="profileContent">
        {activeTab === 0 && (
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
        {activeTab === 1 && (
          <div className="tabPanel">
            <h2>Messages</h2>
            {/* Add your favorite posts or content here */}
          </div>
        )}
       
      </div>
    </div>
  );
}

export default Social;
