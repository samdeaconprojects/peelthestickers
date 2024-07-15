import React from 'react';
import PropTypes from 'prop-types';
import './TimeTable.css';
import { formatTime } from '../TimeList/TimeUtils';


const TimeTable = ({ solves }) => {
  console.log("Solves data:", solves); // Debugging statement

  const times = solves.map(solve => solve.time);


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
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{formatTime(solve.time)}</td>
              <td>{solve.scramble}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
};

export default TimeTable;
