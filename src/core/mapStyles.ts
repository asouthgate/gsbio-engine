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

export interface PmtilesStyleOptions {
  /** Lowest zoom the archive holds tiles for. MapLibre won't request below this. */
  minzoom?: number;
  /**
   * Highest zoom the archive holds tiles for. MapLibre overscales tiles at
   * this zoom when the map is zoomed in further, instead of requesting
   * non-existent higher-zoom tiles (which render blank). Defaults to 14,
   * the max zoom of the bundled `uk.pmtiles` archive.
   */
  maxzoom?: number;
  /**
   * Name of the vector source in `style.sources` to repoint at the PMTiles
   * archive. Defaults to `'openmaptiles'` (the OpenMapTiles convention used
   * by OSM Liberty and most OpenMapTiles-derived styles).
   */
  sourceName?: string;
}

/**
 * Adapt a MapLibre vector style spec to render a PMTiles archive at
 * `pmtilesUrl`. The style is passed in (not imported) so consumers can
 * provide their own — e.g. a custom OSM Liberty variant from `frontend/` —
 * and override colours/layers freely. Use the exported `STYLE_TEMPLATE`
 * from `@gsbio/engine` with `resolvePaletteTokens()` and `DEFAULT_PALETTE`
 *
 * The PMTiles archive must contain MVT/PBF vector tiles. This function
 * finds the vector source named `sourceName` (default `'openmaptiles'`) in
 * the given `style` and replaces its tile URL with a `pmtiles://`-protocol
 * URL (handled by `../renderer-2d/mapManager`), adding `minzoom`/`maxzoom`
 * to match the archive's zoom range.
 *
 * `maxzoom`/`minzoom` on the vector source MUST match the archive's zoom
 * range, otherwise MapLibre requests tiles the archive doesn't have and
 * renders blank (see `PmtilesStyleOptions.maxzoom`).
 */
export function createPmtilesStyle(
  style: any,
  pmtilesUrl: string,
  opts: PmtilesStyleOptions = {},
) {
  const maxzoom = opts.maxzoom ?? 14;
  const minzoom = opts.minzoom ?? 0;
  const sourceName = opts.sourceName ?? 'openmaptiles';

  const original = style.sources?.[sourceName] ?? {};

  return {
    ...style,
    sources: {
      ...style.sources,
      [sourceName]: {
        ...original,
        url: undefined,
        type: 'vector' as const,
        tiles: [`pmtiles://${pmtilesUrl}/{z}/{x}/{y}`],
        minzoom,
        maxzoom,
      },
    },
  };
}

