// src/contexts/SettingsContext.js
import React, { createContext, useContext, useState } from 'react';

const SettingsContext = createContext();

export const useSettings = () => useContext(SettingsContext);

const defaultEventBindings = {
  "222": "Alt+2",
  "333": "Alt+3",
  "444": "Alt+4",
  "555": "Alt+5",
  "666": "Alt+6",
  "777": "Alt+7",
  "SQ1": "Alt+Q",
  "SKEWB": "Alt+S",
  "333OH": "Alt+O",
  "MEGAMINX": "Alt+M",
   "PYRAMINX": "Alt+P",
  "333BLD": "Alt+B",
};

export const SettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({
    primaryColor: '#0E171D',
    secondaryColor: '#ffffff',
    timerInput: 'Keyboard',
    horizontalTimeList: false,
    eventKeyBindings: defaultEventBindings
  });

  const updateSettings = (newSettings) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

