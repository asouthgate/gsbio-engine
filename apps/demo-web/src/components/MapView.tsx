import { useMemo } from 'react';
import { Canvas } from '@catshark/react';
import {
  createTerraDraw2DRenderer,
  type TerraDraw2DRenderer,
} from '@catshark/renderer-2d';
import { OSM_RASTER_STYLE } from '@catshark/client';
import { DrawToolbar } from './DrawToolbar';

const DEFAULT_CENTER: [number, number] = [-3.6, 50.604];
const DEFAULT_ZOOM = 13;

export function MapView() {
  const renderer = useMemo<TerraDraw2DRenderer>(
    () =>
      createTerraDraw2DRenderer({
        style: OSM_RASTER_STYLE as never,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      }),
    [],
  );

  return (
    <div className="map-wrapper">
      <Canvas renderer={renderer} className="map-view" />
      <DrawToolbar />
    </div>
  );
}