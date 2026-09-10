import type { FileSourceDef, RawSource } from './engine.fileSource.types';
import type { DataFeature, FeatureState } from './engine.feature.types';
import type { DataSourceDef } from './types';
import { parseGeoJsonToFeatures } from './engine.fileSource';

export const DRAWN_SOURCE_ID = 'drawn-features';

export interface FileSourceState {
  sourceId: string;
  name: string;
  featureIds: string[];
}

export class DataStore {
  private _features: DataFeature[] = [];
  private _selectedFeatureId: string | null = null;
  private _fileSources: FileSourceState[] = [];
  private _rawSources = new Map<string, RawSource>();

  getSnapshot(): FeatureState {
    return {
      features: this._features,
      selectedFeatureId: this._selectedFeatureId,
    };
  }

  getFeatures(): ReadonlyArray<DataFeature> {
    return this._features;
  }

  getFeature(id: string): DataFeature | undefined {
    return this._features.find((f) => f.id === id);
  }

  setRawSource(id: string, name: string, data: unknown): void {
    this._rawSources.set(id, { id, name, data });
  }

  getRawSource(id: string): RawSource | undefined {
    return this._rawSources.get(id);
  }

  getRawSources(): RawSource[] {
    return [...this._rawSources.values()];
  }

  removeRawSource(id: string): void {
    this._rawSources.delete(id);
  }

  clearRawSources(): void {
    this._rawSources.clear();
  }

  addFeature(feature: DataFeature): void {
    this._features = [...this._features, feature];
  }

  removeFeature(id: string): void {
    this._features = this._features.filter((f) => f.id !== id);
    if (this._selectedFeatureId === id) this._selectedFeatureId = null;
  }

  updateFeature(id: string, updates: Partial<DataFeature>): void {
    this._features = this._features.map((f) =>
      f.id === id ? { ...f, ...updates } : f,
    );
  }

  selectFeature(id: string | null): void {
    this._selectedFeatureId = id;
  }

  toggleVisibility(id: string): DataFeature | undefined {
    const f = this.getFeature(id);
    if (!f) return undefined;
    const visible = !f.visible;
    this.updateFeature(id, { visible });
    return { ...f, visible };
  }

  replaceGeometry(id: string, geojson: GeoJSON.Feature, circle?: DataFeature['circle']): void {
    this._features = this._features.map((f) =>
      f.id === id ? { ...f, geojson, ...(circle !== undefined ? { circle } : {}) } : f,
    );
  }

  clearFeatures(): void {
    this._features = [];
    this._selectedFeatureId = null;
  }

  getFileSources(): FileSourceState[] {
    return this._fileSources;
  }

  getSources(): DataSourceDef[] {
    const fileSourceIds = new Set(this._fileSources.flatMap((s) => s.featureIds));
    const drawn: DataSourceDef = {
      id: DRAWN_SOURCE_ID,
      name: 'Drawn features',
      kind: 'drawn',
      featureIds: this._features
        .filter((f) => !fileSourceIds.has(f.id))
        .map((f) => f.id),
    };
    const uploads: DataSourceDef[] = this._fileSources.map((fs) => ({
      id: fs.sourceId,
      name: fs.name,
      kind: 'upload',
      featureIds: fs.featureIds,
    }));
    return [drawn, ...uploads];
  }

  addGeoJsonSource(def: FileSourceDef, data: object): DataFeature[] {
    const parsed = parseGeoJsonToFeatures(def, data);
    const existing = this._fileSources.find((s) => s.sourceId === def.id);

    if (existing) {
      const oldIds = new Set(existing.featureIds);
      this._features = this._features.filter((f) => !oldIds.has(f.id));
      this._fileSources = this._fileSources.map((s) =>
        s.sourceId === def.id
          ? { sourceId: def.id, name: def.name, featureIds: parsed.map((f) => f.id) }
          : s,
      );
    } else {
      this._fileSources = [
        ...this._fileSources,
        { sourceId: def.id, name: def.name, featureIds: parsed.map((f) => f.id) },
      ];
    }

    this._features = [...this._features, ...parsed];
    return parsed;
  }
}
