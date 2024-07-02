import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';

function ProfileHeader() {
    // Component logic can go here

    return (
        <div className='profileHeader'>
            
            <div className='profileAndName'>
                <div className='profilePicture'>
                    <div className='profileCube'>
                        <RubiksCubeSVG className="profileCube" n={"333"} faces={getScrambledFaces("U2 F2 U2 F B D2 U2 L2 B' L F' R F' U' B D F2 U D2 L'", "333")} isMusicPlayer={false} isTimerCube={false} />
                    </div>     
                </div>
                <div className='profileNameAndUsername'>
                <div className='profileName'>sam</div>
                <div className='profileUsername'>@sam</div>
             </div>
            </div>
        
            <div className='profileStats'>
            
            </div>
        </div>
    );
}

export default ProfileHeader;

