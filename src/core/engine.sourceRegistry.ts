import type { DataSourceDef } from './types';

export class SourceRegistry {
  private _sources = new Map<string, DataSourceDef>();

  register(def: DataSourceDef): void {
    this._sources.set(def.id, def);
  }

  get(id: string): DataSourceDef | undefined {
    return this._sources.get(id);
  }

  list(): DataSourceDef[] {
    return [...this._sources.values()];
  }

  remove(id: string): boolean {
    return this._sources.delete(id);
  }
}