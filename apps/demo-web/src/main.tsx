import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createSimulationEngine } from '@catshark/core';
import { AppProvider } from '@catshark/react';
import { App } from './components/App';
import { installRadialSpread } from './models/radialSpread';
import './styles/index.css';

// Construct a single engine instance, install our demo model + its executor,
// and select the model — then hand the engine to <AppProvider>. Apps pass an
// explicit `engine` to <AppProvider> whenever they need to wire executors
// (the default path constructs an empty engine with only the built-ins).
const engine = createSimulationEngine();
installRadialSpread(engine);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider engine={engine}>
      <App />
    </AppProvider>
  </StrictMode>,
);