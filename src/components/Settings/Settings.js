import React, { useEffect, useState } from 'react';
import './Settings.css';
import { useSettings } from '../../contexts/SettingsContext';
import { getUser } from '../../services/getUser';
import { updateUser } from '../../services/updateUser';

/**
 * Render settings as a modal popup overlay
 * Props:
 * - userID: string
 * - onClose: () => void
 * - onProfileUpdate: (freshProfile) => void
 */
function Settings({ userID, onClose, onProfileUpdate }) {
    const { settings, updateSettings } = useSettings();
    const [profileData, setProfileData] = useState({
        Name: '',
        Color: '',
        ProfileEvent: '',
        ProfileScramble: '',
        ChosenStats: [],
        DateFounded: '',
        CubeCollection: [],
        WCAID: ''
    });

    // Apply theme colors to document
    useEffect(() => {
        document.documentElement.style.setProperty('--primary-color', settings.primaryColor);
        document.documentElement.style.setProperty('--secondary-color', settings.secondaryColor);
    }, [settings.primaryColor, settings.secondaryColor]);

    // Fetch profile data
    useEffect(() => {
        const fetchProfile = async () => {
            if (!userID) return;
            try {
                const user = await getUser(userID);
                setProfileData({
                    Name:            user.Name            || '',
                    Color:           user.Color           || '',
                    ProfileEvent:    user.ProfileEvent    || '',
                    ProfileScramble: user.ProfileScramble || '',
                    ChosenStats:     user.ChosenStats     || [],
                    DateFounded:     user.DateFounded     || '',
                    CubeCollection:  user.CubeCollection  || [],
                    WCAID:           user.WCAID           || ''
                });
            } catch (err) {
                console.error('Failed to fetch user profile:', err);
            }
        };
        fetchProfile();
    }, [userID]);

    const handleProfileChange = (key, value) => {
        setProfileData(prev => ({ ...prev, [key]: value }));
    };

    const handleCommaListChange = (key, value) => {
        const array = value.split(',').map(item => item.trim());
        handleProfileChange(key, array);
    };

    const saveProfileChanges = async () => {
        if (!userID) return;
        try {
            await updateUser(userID, profileData);
            const fresh = await getUser(userID);
            setProfileData({
                Name:            fresh.Name,
                Color:           fresh.Color,
                ProfileEvent:    fresh.ProfileEvent,
                ProfileScramble: fresh.ProfileScramble,
                ChosenStats:     fresh.ChosenStats,
                DateFounded:     fresh.DateFounded,
                CubeCollection:  fresh.CubeCollection,
                WCAID:           fresh.WCAID
            });
            if (onProfileUpdate) onProfileUpdate(fresh);
            alert('✅ Profile updated.');
        } catch (err) {
            console.error('❌ Error updating profile:', err);
            alert('❌ Failed to update profile.');
        }
    };

    // Close on Escape key
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    return (
        <div className="settingsPopup" onClick={e => e.target.className === 'settingsPopup' && onClose()}>
            <div className="settingsPopupContent">
                <button className="closeButton" onClick={onClose}>×</button>
                <h2>Customize Theme</h2>
                <div className="settings-container">
                    <div className="setting-item">
                        <label>Primary Color:</label>
                        <select onChange={e => updateSettings({ primaryColor: e.target.value })} value={settings.primaryColor}>
                            <option value="#0E171D">Default</option>
                            <option value="#0c2b40">Medium Blue</option>
                            <option value="#140D21">Purple</option>
                            <option value="#000000">Black</option>
                            <option value="custom">Custom</option>
                        </select>
                        {settings.primaryColor === 'custom' && (
                            <input type="color" value={settings.primaryColor} onChange={e => updateSettings({ primaryColor: e.target.value })} />
                        )}
                    </div>
                    <div className="setting-item">
                        <label>Secondary Color:</label>
                        <select onChange={e => updateSettings({ secondaryColor: e.target.value })} value={settings.secondaryColor}>
                            <option value="#ffffff">White</option>
                            <option value="#000000">Black</option>
                            <option value="custom">Custom</option>
                        </select>
                        {settings.secondaryColor === 'custom' && (
                            <input type="color" value={settings.secondaryColor} onChange={e => updateSettings({ secondaryColor: e.target.value })} />
                        )}
                    </div>
                    <div className="setting-item">
                        <label>Timer Input:</label>
                        <select onChange={e => updateSettings({ timerInput: e.target.value })} value={settings.timerInput}>
                            <option value="Keyboard">Keyboard</option>
                            <option value="Type">Type</option>
                            <option value="Stackmat">Stackmat</option>
                        </select>
                    </div>
                </div>
                <h2>Profile Settings</h2>
                <div className="settings-container">
                    <div className="setting-item"><label>Name:</label><input value={profileData.Name} onChange={e => handleProfileChange('Name', e.target.value)} /></div>
                    <div className="setting-item"><label>Color:</label><input type="color" value={profileData.Color} onChange={e => handleProfileChange('Color', e.target.value)} /></div>
                    <div className="setting-item"><label>Profile Event:</label><input value={profileData.ProfileEvent} onChange={e => handleProfileChange('ProfileEvent', e.target.value)} /></div>
                    <div className="setting-item"><label>Profile Scramble:</label><input value={profileData.ProfileScramble} onChange={e => handleProfileChange('ProfileScramble', e.target.value)} /></div>
                    <div className="setting-item"><label>Chosen Stats:</label><input value={profileData.ChosenStats.join(', ')} onChange={e => handleCommaListChange('ChosenStats', e.target.value)} /></div>
                    <div className="setting-item"><label>Date Founded:</label><input value={profileData.DateFounded} onChange={e => handleProfileChange('DateFounded', e.target.value)} /></div>
                    <div className="setting-item"><label>Cube Collection:</label><input value={profileData.CubeCollection.join(', ')} onChange={e => handleCommaListChange('CubeCollection', e.target.value)} /></div>
                    <div className="setting-item"><label>WCA ID:</label><input value={profileData.WCAID} onChange={e => handleProfileChange('WCAID', e.target.value)} /></div>
                </div>
                <button className="save-button" onClick={saveProfileChanges}>Save Profile</button>
            </div>
        </div>
    );
}

export default Settings;
