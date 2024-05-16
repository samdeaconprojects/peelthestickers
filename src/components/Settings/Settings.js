import React, { useState, useEffect } from 'react';
import './Settings.css';

function Settings() {
    const defaultPrimary = '#0E171D'; // Define default primary color
    const [primaryColor, setPrimaryColor] = useState(defaultPrimary); 
    const [secondaryColor, setSecondaryColor] = useState('#ffffff'); // Default secondary color
    const [customPrimary, setCustomPrimary] = useState('#0E171D');
    const [customSecondary, setCustomSecondary] = useState('#ffffff');

    useEffect(() => {
        document.documentElement.style.setProperty('--primary-color', primaryColor);
        document.documentElement.style.setProperty('--secondary-color', secondaryColor);
    }, [primaryColor, secondaryColor]);

    const handlePrimaryColorChange = (event) => {
        const { value } = event.target;
        if (value === "custom") {
            setPrimaryColor(customPrimary);
        } else {
            setPrimaryColor(value);
        }
    };

    const handleSecondaryColorChange = (event) => {
        const { value } = event.target;
        if (value === "custom") {
            setSecondaryColor(customSecondary);
        } else {
            setSecondaryColor(value);
        }
    };

    const handleCustomPrimaryChange = (event) => {
        const { value } = event.target;
        setCustomPrimary(value);
        setPrimaryColor(value);
    };

    const handleCustomSecondaryChange = (event) => {
        const { value } = event.target;
        setCustomSecondary(value);
        setSecondaryColor(value);
    };

    return (
        <div className='Page'>
            <h1>Customize Theme</h1>
            <div className="settings-container">
                <div className="setting-item">
                    <label>Primary Color:</label>
                    <select onChange={handlePrimaryColorChange} value={primaryColor === customPrimary ? 'custom' : primaryColor}>
                        <option value={defaultPrimary}>Default</option>
                        <option value="#0c2b40">Medium Blue</option>
                        <option value="#140D21">Purple</option>
                        <option value="#000000">Black</option>
                        <option value="custom">Custom</option>
                    </select>
                    {primaryColor === customPrimary && (
                        <input 
                            type="color" 
                            value={customPrimary} 
                            onChange={handleCustomPrimaryChange} 
                        />
                    )}
                </div>
                <div className="setting-item">
                    <label>Secondary Color:</label>
                    <select onChange={handleSecondaryColorChange} value={secondaryColor === customSecondary ? 'custom' : secondaryColor}>
                        <option value="#ffffff">White</option>
                        <option value="#000000">Black</option>
                        <option value="custom">Custom</option>
                    </select>
                    {secondaryColor === customSecondary && (
                        <input 
                            type="color" 
                            value={customSecondary} 
                            onChange={handleCustomSecondaryChange} 
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default Settings;
