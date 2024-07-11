import React from 'react';
import './Profile.css';
import Post from './Post';
import ProfileHeader from './ProfileHeader';

function Profile() {
  return (
    <div className="Page">
      
      <ProfileHeader />

      <div className='profileContent'>
          <Post name={"sam"} date={"07/01/2024"} event={"333"} singleOrAverage={"Single"} scramble={"U2 F2 U2 F B D2 U2 L2 B' L F' R F' U' B D F2 U D2 L'"} time={"6.72"}/>
          <Post name={"sam"} date={"07/01/2024"} event={"444"} singleOrAverage={"Single"} scramble={"Lw' Bw2 Rw2 D' Rw2 U' R U Bw Uw' R D B' Lw2 D Bw2 U' Fw Rw Lw2 Dw Lw' D' Rw Bw' D Rw U2 Lw U' F2 L' Bw' Rw Lw Uw2 Dw2 Bw2 Dw Lw' D U2 Bw' Lw'"} time={"36.42"}/>
          <Post name={"sam"} date={"07/01/2024"} event={"777"} singleOrAverage={"Single"} scramble={"3Rw' 3Dw Fw' Lw' 3Rw' 3Fw' 3Dw L 3Rw2 3Bw2 Rw Dw2 3Bw' U D 3Lw Rw Lw2 Fw' B2 3Lw B' Dw' R2 Uw' 3Rw2 3Fw Uw2 3Bw' 3Lw2 3Rw 3Lw Uw Fw' Rw 3Uw2 Bw2 Lw D' 3Lw' Fw Lw U Bw Fw B2 R F' 3Uw Bw D' Rw' D' R' Bw' 3Dw' 3Uw2 R' 3Fw2 Uw2 B 3Uw2 F2 Rw' 3Lw' 3Rw2 3Dw 3Lw2 U' Bw D' Bw' 3Uw' 3Fw 3Lw R' 3Fw Bw' 3Rw2 3Uw 3Dw2 3Fw2 3Dw' 3Lw2 3Uw B 3Fw2 D' B F2 3Lw2 3Uw F2 Dw 3Uw2 3Lw Rw2 3Uw' 3Lw"} time={"1:33.42"}/>
      </div>
    </div>
  );
}

export default Profile;
