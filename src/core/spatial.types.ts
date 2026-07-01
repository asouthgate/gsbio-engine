export type MapLayerEnvelope =
  | { kind: 'geojson'; data: GeoJSON.FeatureCollection }
  | { kind: 'tiles'; url: string; sourceLayer?: string; type: 'raster' | 'vector' }
  | { kind: 'image'; url: string; bounds: [number, number, number, number] };
