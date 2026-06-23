/**
 * Network/storage providers for the gsbio engine.
 *
 * Per the headless-engine contract, the engine itself owns data-source
 * *registration* (`@gsbio/core`'s `registerDataSource`); this package owns
 * the *fetching* — tile sources, uploaded GeoJSON/CSV, model outputs. Your
 * React components never import from this package directly; the demo app
 * (and other consumers) wire providers here into the engine.
 */

import type { DataSourceDef } from '@gsbio/core';

/**
 * Bare OSM raster style spec, the previous baked-in tile source. The object
 * is structurally compatible with maplibre-gl's `StyleSpecification`;
 * `@gsbio/renderer-2d` consumes it as such.
 */
export const OSM_RASTER_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-layer', type: 'raster', source: 'osm' }],
} as const;

/**
 * Stub uploader: registers a data source with an `upload` kind pointing at
 * the given feature ids. A real implementation parses a File into GeoJSON /
 * CSV, derives feature ids from the engine's storage, then registers.
 */
export interface RegisterUploadOptions {
  id: string;
  name: string;
  featureIds: string[];
}

export function registerUploadedDataSource(opts: RegisterUploadOptions): DataSourceDef {
  const def: DataSourceDef = {
    id: opts.id,
    name: opts.name,
    kind: 'upload',
    featureIds: opts.featureIds,
  };
  return def;
}