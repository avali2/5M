import React from 'react';
import { createRoot } from 'react-dom/client';
import AppPro from './AppPro.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { AuthGate } from './components/AuthGate.jsx';
import './index.css';
import './styles/theme.css';
import { registerNotificationServiceWorker } from './services/notifications.js';

registerNotificationServiceWorker().catch(() => {});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AuthGate><AppPro /></AuthGate>
    </ErrorBoundary>
  </React.StrictMode>
);
