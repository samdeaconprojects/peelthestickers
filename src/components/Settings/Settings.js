import React, { useEffect } from 'react';
import './Settings.css';
import { useSettings } from '../../contexts/SettingsContext';

function Settings() {
    const { settings, updateSettings } = useSettings();

    useEffect(() => {
        // This will update the CSS variables whenever the settings change
        document.documentElement.style.setProperty('--primary-color', settings.primaryColor);
        document.documentElement.style.setProperty('--secondary-color', settings.secondaryColor);
    }, [settings.primaryColor, settings.secondaryColor]);

    const handlePrimaryColorChange = (event) => {
        updateSettings({ primaryColor: event.target.value });
    };

    const handleSecondaryColorChange = (event) => {
        updateSettings({ secondaryColor: event.target.value });
    };

    const handleCustomPrimaryChange = (event) => {
        updateSettings({ primaryColor: event.target.value });
    };

    const handleCustomSecondaryChange = (event) => {
        updateSettings({ secondaryColor: event.target.value });
    };

    const handleTimerInputChange = (event) => {
        updateSettings({ timerInput: event.target.value });
    };

    return (
        <div className='Page'>
            <h1>Customize Theme</h1>
            <div className="settings-container">
                <div className="setting-item">
                    <label>Primary Color:</label>
                    <select onChange={handlePrimaryColorChange} value={settings.primaryColor === '#0E171D' ? 'custom' : settings.primaryColor}>
                        <option value="#0E171D">Default</option>
                        <option value="#0c2b40">Medium Blue</option>
                        <option value="#140D21">Purple</option>
                        <option value="#000000">Black</option>
                        <option value="custom">Custom</option>
                    </select>
                    {settings.primaryColor === 'custom' && (
                        <input type="color" value={settings.primaryColor} onChange={handleCustomPrimaryChange} />
                    )}
                </div>
                <div className="setting-item">
                    <label>Secondary Color:</label>
                    <select onChange={handleSecondaryColorChange} value={settings.secondaryColor === '#ffffff' ? 'custom' : settings.secondaryColor}>
                        <option value="#ffffff">White</option>
                        <option value="#000000">Black</option>
                        <option value="custom">Custom</option>
                    </select>
                    {settings.secondaryColor === 'custom' && (
                        <input type="color" value={settings.secondaryColor} onChange={handleCustomSecondaryChange} />
                    )}
                </div>
                <div className="setting-item">
                    <label>Timer Input:</label>
                    <select onChange={handleTimerInputChange} value={settings.timerInput}>
                        <option value="Keyboard">Keyboard</option>
                        <option value="Type">Type</option>
                        <option value="Stackmat">Stackmat</option>
                    </select>
                    
                </div>
            </div>
        </div>
    );
}

export default Settings;
