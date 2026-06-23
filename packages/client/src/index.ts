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
 * CARTO Positron — light grayscale basemap. Highly readable, inherently
 * colourblind-safe, and designed specifically for data overlays. The light
 * map paired with a dark app chrome is a classic pattern (VS Code, Figma).
 * No API key; same external-tile dependency model as `OSM_RASTER_STYLE`.
 */
export const POSITRON_STYLE = {
  version: 8,
  sources: {
    pos: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; OpenStreetMap contributors, &copy; CARTO',
    },
  },
  layers: [{ id: 'positron-layer', type: 'raster', source: 'pos' }],
} as const;

/** Positron without place labels, for minimal-clutter overlays. */
export const POSITRON_NOLABELS_STYLE = {
  version: 8,
  sources: {
    pos: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; OpenStreetMap contributors, &copy; CARTO',
    },
  },
  layers: [{ id: 'positron-layer', type: 'raster', source: 'pos' }],
} as const;

/**
 * CARTO dark grayscale raster style. See `POSITRON_STYLE` for a lighter,
 * more readable alternative.
 * @deprecated Prefer `POSITRON_STYLE` for readability.
 */
export const DARK_STYLE = {
  version: 8,
  sources: {
    dark: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; OpenStreetMap contributors, &copy; CARTO',
    },
  },
  layers: [{ id: 'dark-layer', type: 'raster', source: 'dark' }],
} as const;

/** @deprecated Prefer `POSITRON_NOLABELS_STYLE` for readability. */
export const DARK_NOLABELS_STYLE = {
  version: 8,
  sources: {
    dark: {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
        'https://d.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '&copy; OpenStreetMap contributors, &copy; CARTO',
    },
  },
  layers: [{ id: 'dark-layer', type: 'raster', source: 'dark' }],
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