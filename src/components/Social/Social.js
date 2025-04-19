import React, { useState, useEffect } from 'react';
import './Social.css';
import Post from '../Profile/Post';
import { getPosts } from '../../services/getPosts';
import { getUser } from '../../services/getUser';

function Social({ user, deletePost }) {
  const [activeTab, setActiveTab] = useState(0);
  const [feed, setFeed] = useState([]);

  useEffect(() => {
    const fetchFeed = async () => {
      if (!user?.UserID) return;

      try {
        // 1. Fetch own posts
        const own = await getPosts(user.UserID);
        const ownAnnotated = own.map(p => ({
          ...p,
          author: user.Name,
          isOwn: true,
        }));

        // 2. Fetch friends' posts
        //const friendIds = user.Friends || [];

        const friendIds = ['samtest12'];

        // Fetch friend profiles to get their names
        const profiles = await Promise.all(friendIds.map(id => getUser(id)));
        const nameById = profiles.reduce((map, prof) => {
          const id = prof.PK.split('#')[1];
          map[id] = prof.Name;
          return map;
        }, {});

        // Fetch posts for each friend
        const friendPostsArrays = await Promise.all(
          friendIds.map(async id => {
            const posts = await getPosts(id);
            return posts.map(p => ({
              ...p,
              author: nameById[id] || id,
              isOwn: false,
            }));
          })
        );

        // 3. Merge and sort by date (newest first)
        const merged = [...ownAnnotated, ...friendPostsArrays.flat()];
        merged.sort((a, b) => new Date(b.date) - new Date(a.date));

        setFeed(merged);
      } catch (err) {
        console.error('Error fetching social feed:', err);
      }
    };

    fetchFeed();
  }, [user]);

  const handleTabClick = (index) => setActiveTab(index);

  const handleDelete = async (post) => {
    if (!post.isOwn) return;
    await deletePost(post.date);
    // refresh feed
    setFeed(prev => prev.filter(p => !(p.isOwn && p.date === post.date)));
  };

  if (!user) {
    return <div>Please sign in to view your feed.</div>;
  }

  return (
    <div className="Page">
      <div className="tabContainer">
        <button className={`tabButton ${activeTab === 0 ? 'active' : ''}`} onClick={() => handleTabClick(0)}>Activity</button>
        <button className={`tabButton ${activeTab === 1 ? 'active' : ''}`} onClick={() => handleTabClick(1)}>Messages</button>
      </div>

      <div className="profileContent">
        {activeTab === 0 && (
          <div className="tabPanel">
            {feed.length > 0 ? (
              feed.map((post, idx) => (
                <Post
                  key={`${post.date}-${idx}`}
                  name={post.author}
                  date={post.date}
                  event={post.event}
                  singleOrAverage={post.singleOrAverage}
                  scramble={post.scramble}
                  time={post.time}
                  deletePost={() => handleDelete(post)}
                  postColor={'#2EC4B6'}
                />
              ))
            ) : (
              <p>No activity yet.</p>
            )}
          </div>
        )}
        {activeTab === 1 && (
          <div className="tabPanel">
            <h2>Messages</h2>
            {/* Add a messaging UI here */}
          </div>
        )}
      </div>
    </div>
  );
}

export default Social;
