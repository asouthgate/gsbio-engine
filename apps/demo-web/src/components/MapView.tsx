import { useMemo } from 'react';
import { MapScene, DrawToolbar } from '@gsbio/react-ui';
import {
  createTerraDraw2DRenderer,
  type TerraDraw2DRenderer,
} from '@gsbio/renderer-2d';
import { OSM_RASTER_STYLE } from '@gsbio/client';

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
    <MapScene renderer={renderer}>
      <DrawToolbar
        tools={[
          { mode: 'point', label: 'Point'},
          { mode: 'linestring', label: 'Line'},
          { mode: 'circle', label: 'Circle', icon: '○' },
          { mode: 'circle', label: 'Spread_zone', icon: '○' },
          { mode: 'point', label: 'Source', icon: '꩜' },
          { mode: 'polygon', label: 'Barrier', icon: '𝍌' },
          { mode: 'point', label: 'Patch', icon: '▢' },
        ]}
      />
    </MapScene>
  );
}