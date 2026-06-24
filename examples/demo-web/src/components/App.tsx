import { MapView } from './MapView';
import { SidePanel } from './SidePanel';

export function App() {
  return (
    <div className="app-container">
      <div className="map-area">
        <MapView />
      </div>
      <SidePanel />
    </div>
  );
}