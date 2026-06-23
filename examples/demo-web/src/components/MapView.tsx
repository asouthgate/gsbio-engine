import { useMemo } from 'react';
import type { DrawMode } from '@gsbio/engine';
import { MapScene, DrawToolbar, type DrawTool } from '@gsbio/engine';
import {
  createTerraDraw2DRenderer,
  type TerraDraw2DRenderer,
  type ShapePaint,
  type FeatureStyleConfig,
  type ResultPaint,
} from '@gsbio/engine';
import { OSM_RASTER_STYLE } from '@gsbio/engine';

const DEFAULT_CENTER: [number, number] = [-3.6, 50.604];
const DEFAULT_ZOOM = 13;

/**
 * Per-category drawn-feature styles (frontend-determined). Okabe-Ito
 * colourblind-safe hues sit on top of the renderer's teal base; each declared
 * `tools` entry registers a composite terra-draw mode so the matching shape
 * is painted with its own colour while it is drawn, not only afterwards.
 */
const REGION_FILL = 0.16;
const toolStyles: Record<string, ShapePaint> = {
  // Spread zones (circles) — sky blue, the cool counterpoint to amber results.
  Spread_zone: { fillColor: '#56B4E9', fillOpacity: REGION_FILL, outlineColor: '#56B4E9', outlineWidth: 2 },
  // Barriers (polygons) — vermillion, reads as an exclusion edge.
  Barrier: { fillColor: '#D55E00', fillOpacity: REGION_FILL, outlineColor: '#D55E00', outlineWidth: 2 },
  // Sources / patches (points) — yellow + bluish-green, distinct warm/cool.
  Source: { pointColor: '#F0E442', pointOutlineColor: '#0a0e10', pointRadius: 7 },
  Patch: { pointColor: '#009E73', pointOutlineColor: '#0a0e10', pointRadius: 7 },
};

const TOOLS: Array<{ mode: DrawMode; label: string; icon: string }> = [
  { mode: 'point', label: 'Point', icon: '•' },
  { mode: 'linestring', label: 'Line', icon: '╱' },
  { mode: 'circle', label: 'Circle', icon: '○' },
  { mode: 'circle', label: 'Spread_zone', icon: '○' },
  { mode: 'point', label: 'Source', icon: '꩜' },
  { mode: 'polygon', label: 'Barrier', icon: '𝍌' },
  { mode: 'point', label: 'Patch', icon: '▢' },
];

const drawTools: DrawTool[] = TOOLS.map((t) => ({ mode: t.mode, label: t.label, icon: t.icon }));

const featureStyles: FeatureStyleConfig = {
  tools: TOOLS
    .filter((t) => toolStyles[t.label])
    .map((t) => ({ mode: t.mode, category: t.label, style: toolStyles[t.label] })),
};

// Result (model-output) layers override the renderer default just enough to
// widen the amber lines so spread outputs read clearly over the dark basemap.
const resultStyles: ResultPaint = {
  lineWidth: 2,
  fillOpacity: 0.28,
  circleRadius: 6,
};

export function MapView() {
  const renderer = useMemo<TerraDraw2DRenderer>(
    () =>
      createTerraDraw2DRenderer({
        style: OSM_RASTER_STYLE as never,
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
        featureStyles,
        resultStyles,
      }),
    [],
  );

  return (
    <MapScene renderer={renderer}>
      <DrawToolbar tools={drawTools} />
    </MapScene>
  );
}