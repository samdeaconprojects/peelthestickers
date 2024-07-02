import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';



function Post() {
    // Component logic can go here

    return (
        <div className="post">
            <div className='titleAndContent'>
                <div className='postTitle'>
                    <div className='postTitleCube'>
                        <RubiksCubeSVG className="postCube" n={"333"} faces={getScrambledFaces("U2 F2 U2 F B D2 U2 L2 B' L F' R F' U' B D F2 U D2 L'", "333")} isMusicPlayer={false} isTimerCube={false} />
                    </div>
                    <div className='titleText'>
                        3x3 Single - 6.72
                    </div>
                </div>
                <div className='postContent'></div>
            </div>

            <div className='dateAndName'>
                <div className='postDate'>07/01/2024</div>
                <div className='postNameAndPicture'>
                    <div className='postName'>sam</div>
                    <div className='profilePicturePost'>
                        <div className='postNameCube'>
                            <RubiksCubeSVG className="postNameCube" n={"333"} faces={getScrambledFaces("U2 F2 U2 F B D2 U2 L2 B' L F' R F' U' B D F2 U D2 L'", "333")} isMusicPlayer={false} isTimerCube={false} />
                        </div>     
                    </div> 
                </div>       
            </div>    
        </div>
    );
}

export default Post;
