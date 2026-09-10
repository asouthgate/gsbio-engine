export interface GeoJsonCircleStyle {
  /** Property value this style applies to (matched against `styleProperty`). */
  value: string;
  color?: string;
  radius?: number;
  strokeColor?: string;
  strokeWidth?: number;
}

export type MapLayerEnvelope =
  | {
      kind: 'geojson';
      data: GeoJSON.FeatureCollection;
      /** Property used to key `circleStyles` (defaults to `kind`). */
      styleProperty?: string;
      /** Optional per-value circle styling for point features. */
      circleStyles?: GeoJsonCircleStyle[];
    }
  | { kind: 'tiles'; url: string; sourceLayer?: string; type: 'raster' | 'vector' }
  | { kind: 'image'; url: string; bounds: [number, number, number, number] };
