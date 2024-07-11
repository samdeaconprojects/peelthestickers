import React from 'react';
import './Profile.css';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { getScrambledFaces } from '../cubeStructure';
import { currentEventToString } from "../../components/scrambleUtils";




function Post({ name, date, event, scramble, singleOrAverage, time  }) {
    // Component logic can go here

    const eventToString = currentEventToString(event);

    return (
        <div className="post">
            <div className='titleAndContent'>
                <div className='postTitle'>
                    <div className='postTitleCube'>
                        <RubiksCubeSVG className="postCube" n={event} faces={getScrambledFaces(scramble, event)} isMusicPlayer={false} isTimerCube={false} />
                    </div>
                    <div className='titleText'>
                        {eventToString} {singleOrAverage} - {time}
                    </div>
                </div>
                <div className='postContent'></div>
            </div>

            <div className='dateAndName'>
                <div className='postDate'>{date}</div>
                <div className='postNameAndPicture'>
                    <div className='postName'>{name}</div>
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
