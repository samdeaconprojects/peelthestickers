// © 2025 Peel The Stickers LLC. All rights reserved.


import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { BrowserRouter as Router } from 'react-router-dom';
import { SettingsProvider } from './contexts/SettingsContext'; // ✅ import the provider

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <SettingsProvider> {/* ✅ wrap App in SettingsProvider */}
      <Router>
        <App />
      </Router>
    </SettingsProvider>
  </React.StrictMode>
);


// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
