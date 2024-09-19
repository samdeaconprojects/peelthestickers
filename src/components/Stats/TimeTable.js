import React, { useState } from 'react';
import PropTypes from 'prop-types';
import './TimeTable.css';
import { formatTime } from '../TimeList/TimeUtils';
import Detail from '../Detail/Detail';

const TimeTable = ({ solves, deleteTime, addPost }) => {
  const [selectedSolve, setSelectedSolve] = useState(null);
  const [selectedSolveIndex, setSelectedSolveIndex] = useState(null);

  return (
    <div className="time-table-container">
      <table className="time-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Time</th>
            <th>Scramble</th>
          </tr>
        </thead>
        <tbody>
          {solves.map((solve, index) => (
            <tr key={index} onClick={() => {
              setSelectedSolve(solve);
              setSelectedSolveIndex(index);
            }}>
              <td>{index + 1}</td>
              <td>{formatTime(solve.time)}</td>
              <td>{solve.scramble}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedSolve && (
        <Detail
          solve={selectedSolve}
          onClose={() => setSelectedSolve(null)}
          deleteTime={() => deleteTime(selectedSolveIndex)} // Pass only the index
          addPost={addPost}
        />
      )}
    </div>
  );
};

TimeTable.propTypes = {
  solves: PropTypes.arrayOf(
    PropTypes.shape({
      time: PropTypes.oneOfType([PropTypes.number, PropTypes.string]).isRequired,
      scramble: PropTypes.string.isRequired,
    })
  ).isRequired,
  deleteTime: PropTypes.func.isRequired,
  addPost: PropTypes.func.isRequired,
};

export default TimeTable;
