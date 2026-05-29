import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './AppPro.jsx';
import './index.css';
import './styles/theme.css';
import { registerNotificationServiceWorker } from './services/notifications.js';

registerNotificationServiceWorker().catch(() => {});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
