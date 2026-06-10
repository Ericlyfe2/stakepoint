import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ThemeProvider } from './providers/ThemeProvider.jsx';
import { migrateLegacyStorage } from './lib/migrateStorage.js';
import './styles/app.css';
import './styles/login.css';
import './styles/admin.css';
import './styles/games.css';

// Carry forward any persisted preferences from the pre-rebrand `xenbet_*`
// localStorage keys to their `oddsify_*` counterparts. One-time, idempotent.
migrateLegacyStorage();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <App />
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>
);
