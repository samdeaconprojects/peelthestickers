// PlayerBar.js
import React from 'react';
import './PlayerBar.css';
import Timer from '../Timer/Timer';
import TimeList from '../TimeList/TimeList';
import EventSelector from '../EventSelector';
import Scramble from '../Scramble/Scramble';
import RubiksCubeSVG from '../RubiksCubeSVG';
import { generateScramble, getScrambledFaces } from "../scrambleUtils";
import { useLocation } from 'react-router-dom';



function PlayerBar({ sessions, currentEvent, handleEventChange, deleteTime, addTime, scramble }) {
    const location = useLocation();
    const { pathname } = location;

    // Define border colors for different paths
    const borderColor = {
        '/': 'blue',          // Home page
        '/profile': '#2EC4B6',
        '/stats': 'yellow',   
        '/social': '#50B6FF', 
        '/settings': '#F64258'
           
    };

    // Get the border color based on the current path, default to black if path not defined
    const currentBorderColor = borderColor[pathname] || 'white';

    // Styles object
    const divStyle = {
        border: `1px solid ${currentBorderColor}`,
    };

    return (
        <div className="player-bar" style={{ 'border-top': `1px solid ${currentBorderColor}` }}>
            <Timer addTime={addTime} />
            <div className='scramble-timelist'>
            <Scramble scramble={scramble} currentEvent={currentEvent} isMusicPlayer={true} />
            <TimeList solves={sessions[currentEvent]} deleteTime={(index) => deleteTime(currentEvent, index)} />
            </div>
            <EventSelector currentEvent={currentEvent} handleEventChange={handleEventChange}/>
            <RubiksCubeSVG n={currentEvent} faces={getScrambledFaces(scramble, currentEvent)} isMusicPlayer={true} isTimerCube={false} />
        </div>
    );
}

export default PlayerBar;

