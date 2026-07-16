import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MsalProvider } from '@azure/msal-react';

import './index.css';
import App from './App.jsx';
import { msalInstance } from './auth/msalConfig.js';

async function startApp() {
  await msalInstance.initialize();

  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>
    </StrictMode>
  );
}

startApp();
