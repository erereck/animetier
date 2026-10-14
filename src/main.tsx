import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/manrope';
import '@fontsource-variable/unbounded';
import './styles/theme.css';
import './styles/base.css';
import './styles/editor.css';
import './styles/panels.css';
import './styles/overlays.css';
import './styles/home.css';
import './styles/features.css';
import './styles/insights.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
