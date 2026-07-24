import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createSimulationEngine } from '@gsbio/engine';
import { AppProvider } from '@gsbio/engine';
import { App } from './components/App';
import { radialSpreadModel, radialSpreadExecutor } from './models/radialSpread';
import { radialSpreadApiModel, radialSpreadApiExecutor } from './models/radialSpreadApi';
import './styles/index.css';

const engine = createSimulationEngine();
engine.registerModel(radialSpreadModel);
engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);

engine.registerModel(radialSpreadApiModel);
engine.registerExecutor(radialSpreadApiModel.id, radialSpreadApiExecutor);
engine.setModel(radialSpreadApiModel.id);  // starting model

// Render a freshly-succeeded run's layers on the map immediately
engine.autoShowResults = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider engine={engine}>
      <App />
    </AppProvider>
  </StrictMode>,
);