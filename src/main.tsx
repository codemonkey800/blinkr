import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { readInitialState } from './app/devOverrides';
import './styles.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Blinkr could not find its application root.');
}

// URL overrides are for development only. Production builds ignore them.
const initial = readInitialState(window.location.search, import.meta.env.DEV);

createRoot(root).render(
  <StrictMode>
    <App initial={initial} backend={initial.overridden ? null : undefined} />
  </StrictMode>,
);
