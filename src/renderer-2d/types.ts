import type { GeometryKind } from '../core';

export type DrawMode = 'select' | GeometryKind;

export interface ShapePaint {
  fillColor?: string;
  fillOpacity?: number;
  outlineColor?: string;
  outlineWidth?: number;
  pointColor?: string;
  pointOutlineColor?: string;
  pointRadius?: number;
  lineColor?: string;
  lineWidth?: number;
}

export interface FeatureToolStyle {
  mode: DrawMode;
  category: string;
  style: ShapePaint;
}

export interface FeatureStyleConfig {
  point?: ShapePaint;
  linestring?: ShapePaint;
  polygon?: ShapePaint;
  circle?: ShapePaint;
  tools?: FeatureToolStyle[];
}

export interface ResultPaint {
  fillColor?: string;
  fillOpacity?: number;
  lineColor?: string;
  lineWidth?: number;
  circleColor?: string;
  circleRadius?: number;
}

export interface TerraDraw2DOptions {
  style: any;
  center?: [number, number];
  zoom?: number;
  featureStyles?: FeatureStyleConfig;
  resultStyles?: ResultPaint;
}

export interface TerraDrawLike {
  start(): void;
  stop(): void;
  setMode(mode: string): void;
  removeFeatures(ids: (string | number)[]): void;
  addFeatures(features: never[]): void;
  getSnapshotFeature(id: string | number): unknown;
  on(event: 'finish', cb: (id: string | number) => void): void;
  on(event: 'change', cb: (ids: (string | number)[]) => void): void;
}

export const DEFAULT_FEATURE_STYLES: Record<DrawMode, ShapePaint> = {
  select: {},
  point: { pointColor: '#2dd4bf', pointOutlineColor: '#222f35', pointRadius: 6 },
  linestring: { lineColor: '#2dd4bf', lineWidth: 2 },
  polygon: { fillColor: '#2dd4bf', fillOpacity: 0.18, outlineColor: '#5eead4', outlineWidth: 2 },
  circle: { fillColor: '#2dd4bf', fillOpacity: 0.12, outlineColor: '#5eead4', outlineWidth: 2 },
};

export const DEFAULT_RESULT_PAINT: Required<ResultPaint> = {
  fillColor: '#E69F00',
  fillOpacity: 0.25,
  lineColor: '#E69F00',
  lineWidth: 2,
  circleColor: '#E69F00',
  circleRadius: 5,
};
