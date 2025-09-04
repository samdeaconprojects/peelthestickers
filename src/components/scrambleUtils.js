export function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min; // max is exclusive
}

export function currentEventToN(currentEvent) {
    let n;

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

      return n;
}

export function currentEventToString(currentEvent) {
  let n;

  switch (currentEvent) {
      case '222':
        n = "2x2";
        break;
      case '333':
        n = "3x3";
        break;
      case '333OH':
        n = "3x3 One-Handed";
        break;
      case '333BLD':
        n = "3x3 Blindfolded";
        break;
      case '444':
        n = "4x4";
        break;
      case '555':
        n = "5x5";
        break;
      case '666':
        n = "6x6";
        break;
      case '777':
        n = "7x7";
        break;
      default:
        n = "3x3"; // Default to 3x3 if currentEvent is not recognized
    }

    return n;
}


export function generateScramble(currentEvent) {
  if (currentEvent === "CLOCK") {
    return generateClockScramble();
  }

  const n = currentEventToN(currentEvent);

  const ALL_FACES = n === 2 ? ["U", "R", "F"] : ["U", "D", "R", "L", "F", "B"];
  const MODS = ["'", "", "2"];
  const NUDGE = [-1, 0, 1];
  const OPP = { U: "D", D: "U", R: "L", L: "R", F: "B", B: "F" };

  let moves =
    n === 2 ? 10 :
    n === 3 ? 24 :
    n === 4 ? 45 :
    (n - 2) * 20;

  moves += NUDGE[Math.floor(Math.random() * NUDGE.length)];

  const parts = [];
  let prevFace = null;        // last face used (e.g. 'U')
  let prevPrevFace = null;    // face from two moves ago
  let prevLayers = 1;         // last move layers

  for (let i = 0; i < moves; i++) {
    // how many layers this move?
    const maxLayers = n > 3 ? Math.floor(n / 2) : 1;
    const layers = maxLayers > 1 ? (1 + Math.floor(Math.random() * maxLayers)) : 1;

    // start with all faces each time
    let candidates = ALL_FACES.slice();

    // 1) never repeat the exact same face immediately (no A A)
    if (prevFace) {
      candidates = candidates.filter(f => f !== prevFace);
    }

    // 2) even cubes: if previous was wide and this is wide, forbid the opposite face (no wide A then wide opp(A))
    if (n % 2 === 0 && layers > 1 && prevLayers > 1 && prevFace) {
      const oppPrev = OPP[prevFace];
      candidates = candidates.filter(f => f !== oppPrev);
    }

    // 3) block the A, opp(A), A bounce (allow U→D, but forbid U→D→U)
    if (prevPrevFace && prevFace === OPP[prevPrevFace]) {
      candidates = candidates.filter(f => f !== prevPrevFace);
    }

    // safety fallback (very rare)
    if (candidates.length === 0) {
      candidates = ALL_FACES.filter(f => f !== prevFace);
    }

    // pick a face
    const face = candidates[Math.floor(Math.random() * candidates.length)];

    // build the move token
    let move = "";
    if (n > 3 && layers > 1) {
      if (layers > 2) move += String(layers);
      move += face + "w";
    } else {
      move += face;
    }
    move += MODS[Math.floor(Math.random() * MODS.length)];

    parts.push(move);

    // roll state
    prevPrevFace = prevFace;
    prevFace = face;
    prevLayers = layers;
  }

  return parts.join(" ");
}


function generateClockScramble() {
  const pins = ["UR", "DR", "DL", "UL"];
  const faces = ["U", "R", "D", "L"];
  const pinMoves = [];
  const faceMoves = [];

  // Phase 1: Pin turns
  for (const pin of pins) {
    const amount = getRandomInt(0, 7); 
    const sign = Math.random() < 0.5 ? '+' : '-';
    pinMoves.push(`${pin}${amount}${sign}`);
  }

  // Phase 2: Face turns
  for (const face of faces) {
    const amount = getRandomInt(0, 7);
    const sign = Math.random() < 0.5 ? '+' : '-';
    faceMoves.push(`${face}${amount}${sign}`);
  }

  // Phase 3: ALL turn
  const allAmount = getRandomInt(0, 7);
  const allSign = Math.random() < 0.5 ? '+' : '-';
  const allMove = `ALL${allAmount}${allSign}`;

  // Phase 4: y2 rotation
  const rotation = "y2";

  // Phase 5: second round of face turns
  const secondFaceMoves = [];
  for (const face of faces) {
    const amount = getRandomInt(0, 7);
    const sign = Math.random() < 0.5 ? '+' : '-';
    secondFaceMoves.push(`${face}${amount}${sign}`);
  }

  const finalAllAmount = getRandomInt(0, 7);
  const finalAllSign = Math.random() < 0.5 ? '+' : '-';
  const finalAllMove = `ALL${finalAllAmount}${finalAllSign}`;

  return [
    ...pinMoves,
    ...faceMoves,
    allMove,
    rotation,
    ...secondFaceMoves,
    finalAllMove
  ].join(' ');
}





  // ************ Cube Structure for face arrays ************
  export function getScrambledFaces(scr, currentEvent) {
    let n = currentEventToN(currentEvent);

    let faces = initializeFaces(n);

    parseAlgorithm(scr, faces, n);

    return faces;

  }

  export function initializeFaces(n) {
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

  export function Up(mod, layerCount, faces, n) {
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
  
  export function Down(mod, layerCount, faces, n) {
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
  
  export function Right(mod, layerCount, faces, n) {
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
  
  export function Left(mod, layerCount, faces, n) {
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
  
  export function Front(mod, layerCount, faces, n) {
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
  
 export function Back(mod, layerCount, faces, n) {
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
  
 export function rotateFaceClockwise(matrix) {
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
  
export function rotateFaceCounterClockwise(matrix) {
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

export function parseAlgorithm(alg, faces, n) {
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
  
      if (wide && layerCount === 1) {
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