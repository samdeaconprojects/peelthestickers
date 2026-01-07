function Scramble({ onScrambleClick, onForwardScramble, onBackwardScramble, scramble, currentEvent, isMusicPlayer }) {
  let fontSize, maxWidth;
  switch (currentEvent) {
    case '222': fontSize = 20; maxWidth = 100; break;
    case '333':
    case '333OH':
    case '333BLD': fontSize = 20; maxWidth = 80; break;
    case '444': fontSize = isMusicPlayer ? 16 : 20; maxWidth = 80; break;
    case '555': fontSize = isMusicPlayer ? 15 : 16; maxWidth = 70; break;
    case '666': fontSize = isMusicPlayer ? 12 : 14; maxWidth = 70; break;
    case '777': fontSize = isMusicPlayer ? 11 : 13; maxWidth = 70; break;
    case 'MEGAMINX': fontSize = isMusicPlayer ? 12 : 15; maxWidth = 90; break;
    default: fontSize = 20; maxWidth = 80;
  }

  return (
    <div className="scramble-container">
  <button
    className="scramble-prev-button"
    onClick={onBackwardScramble}
  >
    ←
  </button>

  <p
    className="scramble-text"
    style={{ fontSize: `${fontSize}pt`, maxWidth: `${maxWidth}%` }}
    onClick={() => onScrambleClick(scramble)}
  >
    {scramble}
  </p>

  <button
    className="scramble-next-button"
    onClick={onForwardScramble}
  >
    →
  </button>
</div>

  );
}


export default Scramble;
