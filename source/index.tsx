import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { LogProvider } from './contexts/LogContext';

localStorage.removeItem('editor_test_level');
localStorage.removeItem('editor_test_player');

if (typeof sessionStorage !== 'undefined') {
  sessionStorage.removeItem('editor_zoom');
  sessionStorage.removeItem('editor_test_character');
  sessionStorage.removeItem('editor_scroll_left');
  sessionStorage.removeItem('editor_scroll_top');
  sessionStorage.removeItem('editor_test_tabs');
  sessionStorage.removeItem('editor_active_tab');
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LogProvider>
      <App />
    </LogProvider>
  </React.StrictMode>
);