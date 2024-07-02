import React from 'react';
import './Profile.css';
import Post from './Post';
import ProfileHeader from './ProfileHeader';

function Profile() {
  return (
    <div className="Page">
      
      <ProfileHeader />

      <div className='profileContent'>
          <Post/>
      </div>
    </div>
  );
}

export default Profile;
