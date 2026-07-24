import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createEngine } from '@gsbio/engine';
import { GsbioEngineProvider } from '@gsbio/engine';
import { App } from './components/App';
import { radialSpreadModel, radialSpreadExecutor } from './models/radialSpread';
import { radialSpreadApiModel, radialSpreadApiExecutor } from './models/radialSpreadApi';
import './styles/index.css';

const engine = createEngine();
engine.registerModel(radialSpreadModel);
engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);

engine.registerModel(radialSpreadApiModel);
engine.registerExecutor(radialSpreadApiModel.id, radialSpreadApiExecutor);
engine.setModel(radialSpreadApiModel.id);  // starting model

// Render a freshly-succeeded run's layers on the map immediately
engine.autoShowResults = true;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GsbioEngineProvider engine={engine}>
      <App />
    </GsbioEngineProvider>
  </StrictMode>,
);