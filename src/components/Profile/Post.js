import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';



function Post() {
    // Component logic can go here

    return (
        <div className="post">
            <div className='profilePicture'>
                <div className='profileCube'>
                    <RubiksCubeSVG className="postCube" n={"333"} faces={getScrambledFaces("U2 F2 U2 F B D2 U2 L2 B' L F' R F' U' B D F2 U D2 L'", "333")} isMusicPlayer={false} isTimerCube={false} />
                </div>     
            </div>            
            <div>sam</div>
        </div>
    );
}

export default Post;
