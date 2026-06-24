import type { DataFeature, CircleGeometry } from './engine.featureStore.types';

export interface FeatureState {
  features: DataFeature[];
  selectedFeatureId: string | null;
}
