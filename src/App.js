// App.js
import React, { useState, useEffect } from "react";
import "./App.css";
import Timer from "./components/Timer/Timer";
import TimeList from "./components/TimeList/TimeList";
import Scramble from "./components/Scramble/Scramble";
import Navigation from "./components/Navigation/Navigation";
import Detail from "./components/Detail/Detail";
import RubiksCubeSVG from "./components/RubiksCubeSVG";
import EmailTester from './components/EmailTester';
import { randomScrambleForEvent } from "cubing/scramble"; // Make sure to import this

function App() {
  const [currentEvent, setCurrentEvent] = useState('333');
  const [scramble, setScramble] = useState('');
  const [showDetail, setShowDetail] = useState(false);
  const [isMusicPlayerMode, setIsMusicPlayerMode] = useState(false); // New state for toggling the layout
  const [sessions, setSessions] = useState({
    '222': [],
    '333': [],
    '444': [],
    '555': [],
    '666': [],
    '777': [],
    '333OH': [],
    '333BLD': [],
  });

  useEffect(() => {
    setScramble(generateScramble()); // Generate an initial scramble when the app loads
  }, [currentEvent]); // Also regenerate when the current event changes

  const generateNewScramble = async () => {
    try {
      var currentEventToScramble = currentEvent
      if (currentEventToScramble === "333OH") {
        currentEventToScramble = "333"
      }
      const newScramble = await randomScrambleForEvent(currentEventToScramble);
      setScramble(newScramble.toString());
    } catch (error) {
      console.error('Error generating scramble:', error);
    }
  };

  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; // max is exclusive
  }
  
  function generateScramble() {
    let n;
    var currentEventToScramble = currentEvent
    switch (currentEvent) {
      case '222':
        n = 2;
        break;
      case '333':
      case '333OH':
      case '333BLD':
        n = 3;
        break;
      case '444':
        n = 4;
        break;
      case '555':
        n = 5;
        break;
      case '666':
        n = 6;
        break;
      case '777':
        n = 7;
        break;
      default:
        n = 3; // Default to 3x3 if currentEvent is not recognized
    }

    console.log("n: " + n);
  
    let faceArray = ["U", "D", "R", "L", "B", "F"];
    const modArray = ["'", "", "2"];
    const nudgeArray = [-1, 0, 1];
    let moves;
  
    if (n === 2) {
      moves = 10;
      faceArray = ["U", "R", "F"];
    } else if (n === 4) {
      moves = 45;
    } else {
      moves = (n - 2) * 20;
    }
  
    moves += nudgeArray[getRandomInt(0, nudgeArray.length)];
    let randomScramble = "";
    let faceTemp = "";
  
    for (let i = 0; i < moves; i++) {
      let move = "";
      const layers = n > 3 ? getRandomInt(1, Math.floor(n / 2) + 1) : 1;
  
      if (layers === 1) {
        const faceIndex = getRandomInt(0, faceArray.length);
        if (i > 0) {
          faceArray.push(faceTemp);
        }
        move += faceArray[faceIndex];
        faceTemp = faceArray[faceIndex];
        faceArray.splice(faceIndex, 1);
      } else {
        if (layers > 2) {
          move += String(layers);
        }
  
        const faceIndex = getRandomInt(0, faceArray.length);
        if (i > 0) {
          faceArray.push(faceTemp);
        }
        move += faceArray[faceIndex];
        faceTemp = faceArray[faceIndex];
        faceArray.splice(faceIndex, 1);
  
        if (layers > 1) {
          move += "w";
        }
      }
  
      move += modArray[getRandomInt(0, modArray.length)];
      randomScramble += move + " ";
    }
  
    console.log("Moves:", moves);
    console.log("Scramble:", randomScramble);
    return randomScramble;
  }
  
  // ************ Cube Structure for face arrays ************
  function getScrambledFaces(scr) {
    let n = 0;

    switch (currentEvent) {
      case '222':
        n = 2;
        break;
      case '333':
      case '333OH':
      case '333BLD':
        n = 3;
        break;
      case '444':
        n = 4;
        break;
      case '555':
        n = 5;
        break;
      case '666':
        n = 6;
        break;
      case '777':
        n = 7;
        break;
      default:
        n = 3; // Default to 3x3 if currentEvent is not recognized
    }

    let faces = initializeFaces(n);

    parseAlgorithm(scr, faces, n);

    return faces;

  }

  function initializeFaces(n) {
    let faceNames = ['white', 'green', 'red', 'blue', 'orange', 'yellow'];

    let faces = [];
    for (let i = 0; i < faceNames.length; i++) {
      let facesArray = []
      for (let j = 0; j < n; j++) {
        facesArray[j] = [];
        for (let k = 0; k < n; k++) {
          facesArray[j][k] = faceNames[i];
        }
      }
      faces.push(facesArray);
    }

    return faces;
  
  }

  function Up(mod, layerCount, faces, n) {
    //print("up mod: " + mod + " layercount: " + layerCount);
    if (mod === "2") {
  
      rotateFaceClockwise(faces[0]);
      rotateFaceClockwise(faces[0]);
  
      for (let i = 0; i < layerCount; i++) {
        [faces[1][i], faces[2][i], faces[3][i], faces[4][i]] = [faces[3][i], faces[4][i], faces[1][i], faces[2][i]];
      }
  
    } else if (mod === "'") {
  
      rotateFaceCounterClockwise(faces[0]);
  
      for (let i = 0; i < layerCount; i++) {
        [faces[1][i], faces[2][i], faces[3][i], faces[4][i]] = [faces[4][i], faces[1][i], faces[2][i], faces[3][i]];
      }
  
    } else {
  
      rotateFaceClockwise(faces[0]);
  
      for (let i = 0; i < layerCount; i++) {
        [faces[1][i], faces[2][i], faces[3][i], faces[4][i]] = [faces[2][i], faces[3][i], faces[4][i], faces[1][i]];
      }
  
    }
  
  }
  
  function Down(mod, layerCount, faces, n) {
    //print("down mod: " + mod + " layercount: " + layerCount);
    if (mod === "2") {
  
      rotateFaceClockwise(faces[5]);
      rotateFaceClockwise(faces[5]);
  
      for (let i = 0; i < layerCount; i++) {
        [faces[1][n - 1 - i], faces[2][n - 1 - i], faces[3][n - 1 - i], faces[4][n - 1 - i]] = [faces[3][n - 1 - i], faces[4][n - 1 - i], faces[1][n - 1 - i], faces[2][n - 1 - i]];
      }
  
    } else if (mod === "'") {
  
      rotateFaceCounterClockwise(faces[5]);
  
      for (let i = 0; i < layerCount; i++) {
        [faces[1][n - 1 - i], faces[2][n - 1 - i], faces[3][n - 1 - i], faces[4][n - 1 - i]] = [faces[2][n - 1 - i], faces[3][n - 1 - i], faces[4][n - 1 - i], faces[1][n - 1 - i]];
      }
  
    } else {
  
      rotateFaceClockwise(faces[5]);
  
      for (let i = 0; i < layerCount; i++) {
        [faces[1][n - 1 - i], faces[2][n - 1 - i], faces[3][n - 1 - i], faces[4][n - 1 - i]] = [faces[4][n - 1 - i], faces[1][n - 1 - i], faces[2][n - 1 - i], faces[3][n - 1 - i]];
      }
  
    }
  }
  
  function Right(mod, layerCount, faces, n) {
    //print("right mod: " + mod + " layercount: " + layerCount);
    if (mod === "2") {
  
      rotateFaceClockwise(faces[2]);
      rotateFaceClockwise(faces[2]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[1][j][n - 1 - i], faces[0][j][n - 1 - i], faces[3][n - 1 - j][i], faces[5][j][n - 1 - i]] = [faces[3][n - 1 - j][i], faces[5][j][n - 1 - i], faces[1][j][n - 1 - i], faces[0][j][n - 1 - i]];
        }
      }
  
    } else if (mod === "'") {
  
      rotateFaceCounterClockwise(faces[2]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[1][j][n - 1 - i], faces[0][j][n - 1 - i], faces[3][n - 1 - j][i], faces[5][j][n - 1 - i]] = [faces[0][j][n - 1 - i], faces[3][n - 1 - j][i], faces[5][j][n - 1 - i], faces[1][j][n - 1 - i]];
        }
      }
  
    } else {
  
      rotateFaceClockwise(faces[2]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[1][j][n - 1 - i], faces[0][j][n - 1 - i], faces[3][n - 1 - j][i], faces[5][j][n - 1 - i]] = [faces[5][j][n - 1 - i], faces[1][j][n - 1 - i], faces[0][j][n - 1 - i], faces[3][n - 1 - j][i]];
        }
      }
  
    }
  }
  
  function Left(mod, layerCount, faces, n) {
    //print("left mod: " + mod + " layercount: " + layerCount);
    if (mod === "2") {
  
      rotateFaceClockwise(faces[4]);
      rotateFaceClockwise(faces[4]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[1][j][i], faces[0][j][i], faces[3][n - 1 - j][n - 1 - i], faces[5][j][i]] = [faces[3][n - 1 - j][n - 1 - i], faces[5][j][i], faces[1][j][i], faces[0][j][i]];
        }
      }
  
    } else if (mod === "'") {
  
      rotateFaceCounterClockwise(faces[4]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[1][j][i], faces[0][j][i], faces[3][n - 1 - j][n - 1 - i], faces[5][j][i]] = [faces[5][j][i], faces[1][j][i], faces[0][j][i], faces[3][n - 1 - j][n - 1 - i]];
        }
      }
  
    } else {
  
      rotateFaceClockwise(faces[4]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[1][j][i], faces[0][j][i], faces[3][n - 1 - j][n - 1 - i], faces[5][j][i]] = [faces[0][j][i], faces[3][n - 1 - j][n - 1 - i], faces[5][j][i], faces[1][j][i]];
        }
      }
  
    }
  }
  
  function Front(mod, layerCount, faces, n) {
    //print("front mod: " + mod + " layercount: " + layerCount);
    if (mod === "2") {
  
      rotateFaceClockwise(faces[1]);
      rotateFaceClockwise(faces[1]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[0][n - 1 - i][j], faces[2][j][i], faces[5][i][n - 1 - j], faces[4][n - 1 - j][n - 1 - i]] = [faces[5][i][n - 1 - j], faces[4][n - 1 - j][n - 1 - i], faces[0][n - 1 - i][j], faces[2][j][i]];
        }
      }
  
    } else if (mod === "'") {
  
      rotateFaceCounterClockwise(faces[1]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[0][n - 1 - i][j], faces[2][j][i], faces[5][i][n - 1 - j], faces[4][n - 1 - j][n - 1 - i]] = [faces[2][j][i], faces[5][i][n - 1 - j], faces[4][n - 1 - j][n - 1 - i], faces[0][n - 1 - i][j]];
        }
      }
  
    } else {
  
      rotateFaceClockwise(faces[1]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[0][n - 1 - i][j], faces[2][j][i], faces[5][i][n - 1 - j], faces[4][n - 1 - j][n - 1 - i]] = [faces[4][n - 1 - j][n - 1 - i], faces[0][n - 1 - i][j], faces[2][j][i], faces[5][i][n - 1 - j]];
        }
      }
  
    }
  }
  
  function Back(mod, layerCount, faces, n) {
    //print("back mod: " + mod + " layercount: " + layerCount);
    if (mod === "2") {
  
      rotateFaceClockwise(faces[3]);
      rotateFaceClockwise(faces[3]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[0][i][j], faces[2][j][n - 1 - i], faces[5][n - 1 - i][n - 1 - j], faces[4][n - 1 - j][i]] = [faces[5][n - 1 - i][n - 1 - j], faces[4][n - 1 - j][i], faces[0][i][j], faces[2][j][n - 1 - i]];
        }
      }
  
    } else if (mod === "'") {
  
      rotateFaceCounterClockwise(faces[3]);
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[0][i][j], faces[2][j][n - 1 - i], faces[5][n - 1 - i][n - 1 - j], faces[4][n - 1 - j][i]] = [faces[4][n - 1 - j][i], faces[0][i][j], faces[2][j][n - 1 - i], faces[5][n - 1 - i][n - 1 - j]];
        }
      }
  
    } else {
  
      rotateFaceClockwise(faces[3]);
  
  
  
      for (let i = 0; i < layerCount; i++) {
        for (let j = 0; j < n; j++) {
          [faces[0][i][j], faces[2][j][n - 1 - i], faces[5][n - 1 - i][n - 1 - j], faces[4][n - 1 - j][i]] = [faces[2][j][n - 1 - i], faces[5][n - 1 - i][n - 1 - j], faces[4][n - 1 - j][i], faces[0][i][j]];
        }
      }
  
    }
  }
  
  function rotateFaceClockwise(matrix) {
    let n = matrix.length;
  
    for (let layer = 0; layer < n / 2; layer++) {
      let first = layer;
      let last = n - 1 - layer;
      for (let i = first; i < last; i++) {
        let offset = i - first;
  
        let top = matrix[first][i];
  
        matrix[first][i] = matrix[last - offset][first];
  
        matrix[last - offset][first] = matrix[last][last - offset];
  
        matrix[last][last - offset] = matrix[i][last];
  
        matrix[i][last] = top;
      }
    }
  }
  
  function rotateFaceCounterClockwise(matrix) {
    let n = matrix.length;
  
    for (let layer = 0; layer < n / 2; layer++) {
      let first = layer;
      let last = n - 1 - layer;
      for (let i = first; i < last; i++) {
        let offset = i - first;
  
        let top = matrix[first][i];
  
        matrix[first][i] = matrix[i][last];
  
        matrix[i][last] = matrix[last][last - offset];
  
        matrix[last][last - offset] = matrix[last - offset][first];
  
        matrix[last - offset][first] = top;
      }
    }
  }

  function parseAlgorithm(alg, faces, n) {
    const moves = alg.split(' ');
  
    moves.forEach(move => {
  
      let wide = move.includes('w'); // Check if it's a wide move
      let layerCount = 1; // Default layer count
      let mod = ''; // Modifier (' or 2)
      let face; // The face to move (R, U, etc.)
  
      if (wide) {
        let indexW = move.indexOf('w');
        face = move.charAt(indexW - 1); // Get the face character before 'w'
        layerCount = indexW > 1 ? parseInt(move.substring(0, indexW - 1)) : 1; // Layer count (number before face character and 'w')
        mod = move.length > indexW + 1 ? move.substring(indexW + 1) : ''; // Modifier after 'w'
      } else {
        face = isNaN(parseInt(move.charAt(0))) ? move.charAt(0) : move.charAt(1); // Get the face character, checking if the first character is not a number
        mod = move.length > 1 ? move.substring(1) : '';
      }
  
      if (wide && layerCount == 1) {
        layerCount = 2;
      }
  
      switch (face) {
        case 'R':
          Right(mod, layerCount, faces, n);
          break;
        case 'L':
          Left(mod, layerCount, faces, n);
          break;
        case 'U':
          Up(mod, layerCount, faces, n);
          break;
        case 'D':
          Down(mod, layerCount, faces, n);
          break;
        case 'F':
          Front(mod, layerCount, faces, n);
          break;
        case 'B':
          Back(mod, layerCount, faces, n);
          break;
      }
  
    });
  }

  // ********************************************************

  const handleScrambleClick = () => {
    setShowDetail(true);
  };

  const addSolve = (newTime) => {
    const newSolve = {
      time: newTime, // Ensure that newTime is a number
      scramble: scramble,
      event: currentEvent
    };
    setSessions(prevSessions => ({
      ...prevSessions,
      [currentEvent]: [...prevSessions[currentEvent], newSolve]
    }));
    setShowDetail(false); // Optionally hide detail when new time is added
    setScramble(generateScramble()); // Generate a new scramble after adding the solve
  };

  const handleEventChange = (event) => {
    setCurrentEvent(event.target.value);
    // No need to call generateNewScramble here since it's called by useEffect when currentEvent changes
  };

  const handleCloseDetail = () => {
    setShowDetail(false);
  };

  const toggleMusicPlayerMode = () => {
    setIsMusicPlayerMode(!isMusicPlayerMode); // Toggle the layout mode
  };

  const resetToDefaultLayout = () => {
    setIsMusicPlayerMode(false);
  };

  return (
    <div className={`App ${isMusicPlayerMode ? 'music-player-mode' : ''}`}>
      <Navigation 
        onNavClick={toggleMusicPlayerMode}
        onMainLogoClick={resetToDefaultLayout}
      />
      <div className={`main-content ${isMusicPlayerMode ? 'hide-content' : ''}`}>
        <div className="scramble-select-container">
        <select onChange={handleEventChange} value={currentEvent} className="event-select">
          <option value="222">2x2</option>
          <option value="333">3x3</option>
          <option value="444">4x4</option>
          <option value="555">5x5</option>
          <option value="666">6x6</option>
          <option value="777">7x7</option>
          <option value="333OH">3x3 One-Handed</option>
          <option value="333BLD">3x3 Blindfolded</option>
          {/* Add more options for other events as needed */}
        </select>
        <Scramble onScrambleClick={handleScrambleClick} scramble={scramble} currentEvent={currentEvent} />

        <RubiksCubeSVG n={currentEvent} faces={getScrambledFaces(scramble)} />
        </div>
        {!isMusicPlayerMode && (
          <>
            <Timer addTime={addSolve} />
            <TimeList times={sessions[currentEvent].map(solve => solve.time)} />

          </>
        )}
      </div>
      {showDetail && <Detail scramble={scramble} currentEvent={currentEvent} onClose={handleCloseDetail} />}
      {isMusicPlayerMode && (
        <div className="player">
          <Timer addTime={addSolve} />
          <TimeList times={sessions[currentEvent].map(solve => solve.time)} />
        </div>
      )}
    </div>
  );
  
  
}

export default App;
