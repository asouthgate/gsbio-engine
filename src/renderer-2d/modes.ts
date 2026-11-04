import {
  TerraDrawSelectMode,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawCircleMode,
} from 'terra-draw';
import type { DrawMode } from './types';
import { mergePaint, toPointStyles, toLineStringStyles, toPolygonStyles } from './styles';

class TapCircleMode extends TerraDrawCircleMode {
  override onClick(event: Parameters<TerraDrawCircleMode['onClick']>[0]): void {
    // Touch has no hover movement between the center and radius taps.
    if (this.state === 'drawing' && (event.button === 'left' || event.button === 'right')) {
      this.onMouseMove(event);
    }
    super.onClick(event);
  }
}

export function makeComposite(
  drawMode: DrawMode,
  name: string,
  featurePaints: Record<DrawMode, any>,
  paint: any,
): never {
  switch (drawMode) {
    case 'point':
      return new TerraDrawPointMode({ modeName: name, styles: toPointStyles(paint) }) as never;
    case 'linestring':
      return new TerraDrawLineStringMode({ modeName: name, showCoordinatePoints: true, styles: toLineStringStyles(paint) }) as never;
    case 'polygon':
      return new TerraDrawPolygonMode({ modeName: name, showCoordinatePoints: true, styles: toPolygonStyles(paint) }) as never;
    case 'circle':
      return new TapCircleMode({ modeName: name, styles: toPolygonStyles(paint) }) as never;
    default:
      throw new Error(`Cannot create composite mode for ${drawMode}`);
  }
}

export function createAllModes(
  featurePaints: Record<DrawMode, any>,
  compositeModes: Map<string, { drawMode: DrawMode; category: string; style: any; options?: Record<string, unknown> }>,
  selectionColor?: string,
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
    makeComposite(
      compositeModes.get(name)!.drawMode,
      name,
      featurePaints,
      mergePaint(featurePaints[compositeModes.get(name)!.drawMode], compositeModes.get(name)!.style),
    ),
  );

  return [
    new TerraDrawSelectMode({
      flags: selectFlags,
      ...(selectionColor ? { styles: {
        selectedPointColor: selectionColor,
        selectedPointOutlineColor: selectionColor,
        selectedLineStringColor: selectionColor,
        selectedPolygonColor: selectionColor,
        selectedPolygonOutlineColor: selectionColor,
        selectionPointColor: selectionColor,
        selectionPointOutlineColor: selectionColor,
        midPointColor: selectionColor,
        midPointOutlineColor: selectionColor,
      } } : {}),
    } as never) as never,
    new TerraDrawPointMode({ styles: toPointStyles(featurePaints.point) }) as never,
    new TerraDrawLineStringMode({ showCoordinatePoints: true, styles: toLineStringStyles(featurePaints.linestring) }) as never,
    new TerraDrawPolygonMode({ showCoordinatePoints: true, styles: toPolygonStyles(featurePaints.polygon) }) as never,
    new TapCircleMode({ styles: toPolygonStyles(featurePaints.circle) }) as never,
    ...compositeModeInstances,
  ];
}
