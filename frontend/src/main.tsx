import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Fix 3: StrictMode removed to prevent React 18 double-mounting in development,
// which was causing useEffect hooks (including stock API fetches) to run twice.
createRoot(document.getElementById('root')!).render(
  <App />
);
