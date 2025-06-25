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
  
    let n = currentEventToN(currentEvent);
    console.log("n: " + n);

    let faceArray = ["U", "D", "R", "L", "B", "F"];
    const modArray = ["'", "", "2"];
    const nudgeArray = [-1, 0, 1];
    let moves = 0;

    if (n === 2) {
        moves = 10;
        faceArray = ["U", "R", "F"];
    } else if (n === 3) {
        moves = 24;
    } else if (n === 4) {
        moves = 45;
    } else {
        moves = (n - 2) * 20;
    }

    moves += nudgeArray[Math.floor(Math.random() * nudgeArray.length)];

    let randomScramble = "";
    let faceTemp = "";
    let prevLayers = 1; // track layer width of previous move
    let secondFaceTemp = "";

    for (let i = 0; i < moves; i++) {
        let move = "";

        if (n > 3) {
            let layers = Math.floor(Math.random() * (Math.floor(n / 2) + 1 - 1) + 1);

            // Prevent consecutive opposite-face max-layer moves on even cubes
            if (i > 0 && n % 2 === 0 && layers > 1 && prevLayers > 1) {
                // if current face is opposite of previous face
                let isOpposite = (faceTemp === "U" && faceArray.includes("D")) || (faceTemp === "D" && faceArray.includes("U")) ||
                                 (faceTemp === "R" && faceArray.includes("L")) || (faceTemp === "L" && faceArray.includes("R")) ||
                                 (faceTemp === "F" && faceArray.includes("B")) || (faceTemp === "B" && faceArray.includes("F"));

                if (isOpposite) {
                    // Remove opposite face temporarily
                    faceArray = faceArray.filter(face => {
                        return !((faceTemp === "U" && face === "D") || (faceTemp === "D" && face === "U") ||
                                 (faceTemp === "R" && face === "L") || (faceTemp === "L" && face === "R") ||
                                 (faceTemp === "F" && face === "B") || (faceTemp === "B" && face === "F"));
                    });
                }
            }

            if (layers === 1) {
                const faceIndex = Math.floor(Math.random() * faceArray.length);
                if (i > 0) faceArray.push(faceTemp);
                move += faceArray[faceIndex];
                faceTemp = faceArray[faceIndex];
                faceArray.splice(faceIndex, 1);
            } else {
                if (layers > 2) move += layers.toString();

                const faceIndex = Math.floor(Math.random() * faceArray.length);
                if (i > 0) faceArray.push(faceTemp);
                move += faceArray[faceIndex];
                faceTemp = faceArray[faceIndex];
                faceArray.splice(faceIndex, 1);

                move += "w";
            }

            prevLayers = layers; // track for next loop
            move += modArray[Math.floor(Math.random() * modArray.length)];
        } else {
            const faceIndex = Math.floor(Math.random() * faceArray.length);
            move += faceArray[faceIndex];
            
            if (i > 0) {
                if (secondFaceTemp !== "") {
                    faceArray.push(faceTemp);
                    faceArray.push(secondFaceTemp);
                    faceTemp = faceArray[faceIndex];
                    secondFaceTemp = "";
                } else {
                    if ((faceArray[faceIndex] === "U" && faceTemp === "D") || (faceArray[faceIndex] === "D" && faceTemp === "U") ||
                        (faceArray[faceIndex] === "R" && faceTemp === "L") || (faceArray[faceIndex] === "L" && faceTemp === "R") ||
                        (faceArray[faceIndex] === "F" && faceTemp === "B") || (faceArray[faceIndex] === "B" && faceTemp === "F")) {
                        console.log("secondface set: " + faceArray[faceIndex]);
                        secondFaceTemp = faceArray[faceIndex];
                    } else {
                        faceArray.push(faceTemp);
                        faceTemp = faceArray[faceIndex];
                    }
                }
            } else {
                faceTemp = faceArray[faceIndex];
            }

            faceArray.splice(faceIndex, 1);
            move += modArray[Math.floor(Math.random() * modArray.length)];
        }

        randomScramble += move + " ";
    }

    console.log("Moves:", moves);
    console.log("Scramble:", randomScramble);

    return randomScramble;
}

function generateClockScramble() {
  const pins = ["UR", "DR", "DL", "UL"];
  const faces = ["U", "R", "D", "L"];
  const pinMoves = [];
  const faceMoves = [];

  // Phase 1: Pin turns
  for (const pin of pins) {
    const amount = getRandomInt(0, 5); // Valid range: 0 to 5
    const sign = Math.random() < 0.5 ? '+' : '-';
    pinMoves.push(`${pin}${amount}${sign}`);
  }

  // Phase 2: Face turns
  for (const face of faces) {
    const amount = getRandomInt(0, 5);
    const sign = Math.random() < 0.5 ? '+' : '-';
    faceMoves.push(`${face}${amount}${sign}`);
  }

  // Phase 3: ALL turn
  const allAmount = getRandomInt(0, 5);
  const allSign = Math.random() < 0.5 ? '+' : '-';
  const allMove = `ALL${allAmount}${allSign}`;

  // Phase 4: y2 rotation
  const rotation = "y2";

  // Phase 5: second round of face turns
  const secondFaceMoves = [];
  for (const face of faces) {
    const amount = getRandomInt(0, 5);
    const sign = Math.random() < 0.5 ? '+' : '-';
    secondFaceMoves.push(`${face}${amount}${sign}`);
  }

  const finalAllAmount = getRandomInt(0, 5);
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