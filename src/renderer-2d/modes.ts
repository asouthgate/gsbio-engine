import {
  TerraDrawSelectMode,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawCircleMode,
} from 'terra-draw';
import type { DrawMode } from './types';
import { mergePaint, toPointStyles, toLineStringStyles, toPolygonStyles } from './styles';

export function makeComposite(
  drawMode: DrawMode,
  name: string,
  featurePaints: Record<DrawMode, any>,
  compositeModes: Map<string, { drawMode: DrawMode; category: string; style: any }>,
): never {
  const entry = compositeModes.get(name);
  const paint = mergePaint(featurePaints[drawMode], entry?.style);
  switch (drawMode) {
    case 'point':
      return new TerraDrawPointMode({ modeName: name, styles: toPointStyles(paint) }) as never;
    case 'linestring':
      return new TerraDrawLineStringMode({ modeName: name, styles: toLineStringStyles(paint) }) as never;
    case 'polygon':
      return new TerraDrawPolygonMode({ modeName: name, styles: toPolygonStyles(paint) }) as never;
    case 'circle':
      return new TerraDrawCircleMode({ modeName: name, styles: toPolygonStyles(paint) }) as never;
    default:
      throw new Error(`Cannot create composite mode for ${drawMode}`);
  }
}

export function createAllModes(
  featurePaints: Record<DrawMode, any>,
  compositeModes: Map<string, { drawMode: DrawMode; category: string; style: any }>,
): never[] {
  const selectFlags: Record<string, unknown> = {
    point: { feature: { draggable: true } },
    linestring: {
      feature: { draggable: true, coordinates: { draggable: true, midpoints: { draggable: true } } },
    },
    polygon: {
      feature: { draggable: true, coordinates: { draggable: true, midpoints: { draggable: true } } },
    },
    circle: { feature: { draggable: true, scaleable: true } },
  };

  for (const [name, cm] of compositeModes) {
    selectFlags[name] = selectFlags[cm.drawMode];
  }

  const compositeModeInstances = Array.from(compositeModes.keys()).map((name) =>
    makeComposite(compositeModes.get(name)!.drawMode, name, featurePaints, compositeModes),
  );

  return [
    new TerraDrawSelectMode({ flags: selectFlags } as never) as never,
    new TerraDrawPointMode({ styles: toPointStyles(featurePaints.point) }) as never,
    new TerraDrawLineStringMode({ styles: toLineStringStyles(featurePaints.linestring) }) as never,
    new TerraDrawPolygonMode({ styles: toPolygonStyles(featurePaints.polygon) }) as never,
    new TerraDrawCircleMode({ styles: toPolygonStyles(featurePaints.circle) }) as never,
    ...compositeModeInstances,
  ];
}
