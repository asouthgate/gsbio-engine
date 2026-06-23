import type { DataSourceDef } from '../types';

const sources = new Map<string, DataSourceDef>();

/** Register a data source definition. */
export function registerDataSource(def: DataSourceDef): void {
  sources.set(def.id, def);
}

export function getDataSource(id: string): DataSourceDef | undefined {
  return sources.get(id);
}

export function listDataSources(): DataSourceDef[] {
  return [...sources.values()];
}

export function removeDataSource(id: string): boolean {
  return sources.delete(id);
}

/** Built-in drawn-features source, present in every engine instance. */
export const DRAWN_SOURCE_ID = 'drawn-features';

let bootstrapped = false;
export function ensureDefaultDataSources(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  if (!sources.has(DRAWN_SOURCE_ID)) {
    sources.set(DRAWN_SOURCE_ID, {
      id: DRAWN_SOURCE_ID,
      name: 'Drawn features',
      kind: 'drawn',
      featureIds: [],
    });
  }
}