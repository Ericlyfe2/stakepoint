import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ThemeProvider } from './providers/ThemeProvider.jsx';
import { migrateLegacyStorage } from './lib/migrateStorage.js';
import './styles/app.css';
// Premium design-system layer. Loaded after app.css (so it can override the
// legacy sportsbook rules) and before the scoped login/admin/games stylesheets.
import './styles/premium.css';
import './styles/shell.css';
import './styles/slip.css';
import './styles/login.css';
import './styles/admin.css';
import './styles/games.css';
// Stitch premium sportsbook ports. Every rule is nested under `.stx` so this
// layer is fully isolated from the app stylesheets above.
import './styles/stitch.css';

// Carry forward any preferences persisted under the former brand's
// `oddsify_*` / `xenbet_*` localStorage keys to their `betxentra_*`
// counterparts. One-time, idempotent.
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
