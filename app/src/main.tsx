import { createRoot } from 'react-dom/client';
import '@solana/wallet-adapter-react-ui/styles.css';
import './index.css';
import './ui/icons.css';
import './ui/theme.css';
import { App } from './ui/App';
// Loaded last so the mobile/responsive overrides win over the base + component
// sheets (media queries don't raise specificity, so load order breaks ties).
import './ui/mobile.css';

createRoot(document.getElementById('root')!).render(<App />);
