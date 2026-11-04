import { describe, expect, it, vi } from 'vitest';
import { TerraDrawCircleMode, TerraDrawExtend } from 'terra-draw';
import { makeComposite } from './modes';
import type { DrawMode } from './types';

function setup(drawMode: DrawMode) {
  const mode = makeComposite(drawMode, `${drawMode}__test`, {} as never, {}) as TerraDrawCircleMode;
  const store = new TerraDrawExtend.GeoJSONStore();
  const onFinish = vi.fn();
  mode.register({
    mode: mode.mode,
    store,
    coordinatePrecision: 9,
    project: (lng, lat) => ({ x: lng * 1000, y: lat * 1000 }),
    unproject: (x, y) => ({ lng: x / 1000, lat: y / 1000 }),
    setCursor: vi.fn(),
    setDoubleClickToZoom: vi.fn(),
    onChange: vi.fn(),
    onSelect: vi.fn(),
    onDeselect: vi.fn(),
    onFinish,
  });
  mode.start();
  return { mode, store, onFinish };
}

const tap = (lng: number, lat: number) => ({
  lng, lat, containerX: lng * 1000, containerY: lat * 1000,
  button: 'left' as const, heldKeys: [], isContextMenu: false,
});

describe('drawing without pointer hover', () => {
  it('previews and finishes a roost circle by dragging', () => {
    const { mode, store, onFinish } = setup('circle');
    const setDraggability = vi.fn();
    mode.onDragStart(tap(0, 51), setDraggability);
    expect(setDraggability).toHaveBeenLastCalledWith(false);

    mode.onDrag(tap(0.01, 51), setDraggability);
    const preview = store.copyAll().find((feature) => feature.geometry.type === 'Polygon')!;
    expect(preview.properties.radiusKilometers).toBeGreaterThan(0.5);
    expect(onFinish).not.toHaveBeenCalled();

    mode.onDragEnd(tap(0.01, 51), setDraggability);
    expect(onFinish).toHaveBeenCalledOnce();
    expect(setDraggability).toHaveBeenLastCalledWith(true);
  });

  it('hides building coordinate markers when the polygon is completed', () => {
    const { mode, store, onFinish } = setup('polygon');
    mode.onClick(tap(0, 51));
    mode.onClick(tap(0.1, 51));
    mode.onClick(tap(0.1, 51.1));
    mode.onClick(tap(0, 51));

    expect(onFinish).toHaveBeenCalledOnce();
    const points = store.copyAll().filter((feature) => feature.geometry.type === 'Point');
    expect(points.length).toBeGreaterThan(0);
    for (const point of points) {
      const style = mode.styleFeature(point);
      expect(style.pointOpacity).toBe(0);
      expect(style.pointOutlineOpacity).toBe(0);
    }
  });

  it('sets the roost radius from the second tap without a mouse move', () => {
    const { mode, store, onFinish } = setup('circle');
    mode.onClick(tap(0, 51));
    mode.onClick(tap(0.01, 51));

    expect(onFinish).toHaveBeenCalledOnce();
    const circle = store.copyAll().find((feature) => feature.geometry.type === 'Polygon')!;
    expect(circle.properties.radiusKilometers).toBeGreaterThan(0.5);
    expect(circle.properties.radiusKilometers).toBeLessThan(1);
  });

  it.each(['polygon', 'linestring'] as const)('renders a point after the first %s tap', (drawMode: 'polygon' | 'linestring') => {
    const { mode, store } = setup(drawMode);
    mode.onClick(tap(0, 51));

    const points = store.copyAll().filter((feature) => feature.geometry.type === 'Point');
    expect(points.length).toBeGreaterThan(0);
    expect(points.some((point) => {
      const style = mode.styleFeature(point);
      return style.pointWidth > 0 && style.pointOpacity !== undefined && style.pointOpacity > 0;
    })).toBe(true);
  });
});
