import React from 'react'
import PropTypes from 'prop-types'

const ChartTitle = ({text}) => (
    <h3 style={{ color: "#FFFFFF", opacity: .8}}>{text}</h3>
);

ChartTitle.propTypes = {
    text: PropTypes.string.isRequired
}

export default ChartTitle;