import OSM_LIBERTY_STYLE from './osm_liberty.json';

/**
 * Bare OSM raster style spec, the previous baked-in tile source. The object
 * is structurally compatible with maplibre-gl's `StyleSpecification`;
 * `../renderer-2d` consumes it as such.
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
 * Build a MapLibre vector style that renders the PMTiles archive at
 * `pmtilesUrl` using the OSM Liberty (OpenMapTiles schema) styling.
 *
 * The PMTiles archive must contain MVT/PBF vector tiles. We reuse the
 * public OSM Liberty style, repoint its `openmaptiles` source at our
 * `pmtiles://`-protocol URL (handled by `../renderer-2d/mapManager`), and
 * drop the external Natural Earth raster relief source + its single
 * layer since that raster is not bundled. Sprites and glyphs remain
 * served from their public CDNs; fill/line/boundary layers render fully
 * even if those remote assets are unreachable.
 */
export function createPmtilesStyle(pmtilesUrl: string) {
  const { natural_earth_shaded_relief: _ne, ...sources } =
    OSM_LIBERTY_STYLE.sources;
  void _ne;

  const layers = OSM_LIBERTY_STYLE.layers.filter(
    (l) => l.source !== 'natural_earth_shaded_relief',
  );

  return {
    ...OSM_LIBERTY_STYLE,
    sources: {
      ...sources,
      openmaptiles: {
        type: 'vector' as const,
        tiles: [`pmtiles://${pmtilesUrl}/{z}/{x}/{y}`],
      },
    },
    layers,
  };
}

