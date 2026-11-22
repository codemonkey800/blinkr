import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="shell" aria-label="Blinkr">
      <span className="marker" aria-hidden="true" />
      <span className="wordmark">Blinkr</span>
    </main>
  );
}

const root = document.getElementById('root');

if (root === null) {
  throw new Error('Blinkr could not find its application root.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
