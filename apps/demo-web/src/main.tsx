import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createSimulationEngine } from '@catshark/core';
import { AppProvider } from '@catshark/react';
import { App } from './components/App';
import { installCustomRadiusRaster } from './models/customRadiusRaster';
import './styles/index.css';

// Construct a single engine instance, register our demo model + provider, and
// select the model — then hand the engine to <AppProvider>. Apps pass an
// explicit `engine` to <AppProvider> whenever they need to wire providers
// (the default path constructs an empty engine with only the built-ins).
const engine = createSimulationEngine();
installCustomRadiusRaster(engine);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider engine={engine}>
      <App />
    </AppProvider>
  </StrictMode>,
);