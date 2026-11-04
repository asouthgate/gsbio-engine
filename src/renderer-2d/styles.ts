import type { DrawMode, ShapePaint } from './types';
import type { TerraDrawPolygonMode } from 'terra-draw';

const drawingPointOpacity = (feature: Parameters<TerraDrawPolygonMode['styleFeature']>[0]): number =>
  feature.properties.currentlyDrawing === true ? 1 : 0;

export function compositeModeName(drawMode: DrawMode, category: string): string {
  return `${drawMode}__${category}`;
}

export function mergePaint(base: ShapePaint, override: ShapePaint | undefined): ShapePaint {
  return override ? { ...base, ...override } : { ...base };
}

export function toPointStyles(p: ShapePaint): Record<string, unknown> {
  const s: any = {};
  if (p.pointColor ?? p.fillColor) s.pointColor = p.pointColor ?? p.fillColor;
  if (p.pointRadius != null) s.pointWidth = p.pointRadius;
  if (p.pointOutlineColor ?? p.outlineColor) s.pointOutlineColor = p.pointOutlineColor ?? p.outlineColor;
  return s;
}

export function toLineStringStyles(p: ShapePaint): Record<string, unknown> {
  const s: any = {};
  if (p.lineColor ?? p.outlineColor) s.lineStringColor = p.lineColor ?? p.outlineColor;
  if (p.lineWidth ?? p.outlineWidth) s.lineStringWidth = p.lineWidth ?? p.outlineWidth;
  return s;
}

export function toPolygonStyles(p: ShapePaint): Record<string, unknown> {
  const s: any = {
    coordinatePointOpacity: drawingPointOpacity,
    coordinatePointOutlineOpacity: drawingPointOpacity,
  };
  if (p.fillColor) s.fillColor = p.fillColor;
  if (p.fillOpacity != null) s.fillOpacity = p.fillOpacity;
  if (p.outlineColor) s.outlineColor = p.outlineColor;
  if (p.outlineWidth != null) s.outlineWidth = p.outlineWidth;
  return s;
}
