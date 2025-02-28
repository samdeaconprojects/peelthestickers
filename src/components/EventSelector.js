import React from 'react';

function EventSelector({ currentEvent, handleEventChange }) {
  return (
    <select onChange={handleEventChange} value={currentEvent} className="event-select">
      <option value="222">2x2</option>
      <option value="333">3x3</option>
      <option value="444">4x4</option>
      <option value="555">5x5</option>
      <option value="666">6x6</option>
      <option value="777">7x7</option>
      <option value="333OH">3x3 OH</option>
      <option value="PYRAMINX">PYRAMINX</option>
      <option value="SKEWB">SKEWB</option>
      <option value="SQ1">SQUARE-1</option>
      <option value="MEGAMINX">MEGAMINX</option>
      <option value="CLOCK">CLOCK</option>
      <option value="333BLD">3x3 BLD</option>
      <option value="444BLD">4x4 BLD</option>
      <option value="555BLD">5x5 BLD</option>
      <option value="333MULTIBLD">3x3 MULTI-BLD</option>
      <option value="333FEW">3x3 FEWEST</option>
    </select>
  );
}

export default EventSelector;
