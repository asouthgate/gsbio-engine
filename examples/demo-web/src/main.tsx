import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createSimulationEngine } from '@gsbio/engine';
import { AppProvider } from '@gsbio/engine';
import { App } from './components/App';
import { installRadialSpread } from './models/radialSpread';
import { installRadialSpreadApi } from './models/radialSpreadApi';
import './styles/index.css';

// Construct a single engine instance, install the two demo models + their
// executors, and select one — then hand the engine to <AppProvider>. Apps
// pass an explicit `engine` to <AppProvider> whenever they need to wire
// executors (the default path constructs an empty engine with only the
// built-ins). The demo ships two archetypes over the same radial-spread
// biology: WASM compute (in-browser raster) and a mock-API compute path
// (POST + poll + XYZ tiles) — pick one via the Model dropdown.
const engine = createSimulationEngine();
installRadialSpread(engine);
installRadialSpreadApi(engine);
// Demo UX: render a freshly-succeeded run's layers on the map immediately so
// the user doesn't have to expand the Results section + click "Show on map".
engine.autoShowResults = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider engine={engine}>
      <App />
    </AppProvider>
  </StrictMode>,
);