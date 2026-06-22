import { describe, it, expect, beforeEach } from 'vitest';
import {
  ensureDefaultDataSources,
  listDataSources,
  getDataSource,
  registerDataSource,
  removeDataSource,
} from '../src/index';

describe('engine data source registry', () => {
  beforeEach(() => {
    ensureDefaultDataSources();
  });

  it('bootstraps the drawn-features source', () => {
    const ids = listDataSources().map((s) => s.id);
    expect(ids).toContain('drawn-features');
  });

  it('registerDataSource adds a new source', () => {
    registerDataSource({ id: 'csv-1', name: 'CSV upload', kind: 'upload', featureIds: [] });
    expect(getDataSource('csv-1')?.name).toBe('CSV upload');
    removeDataSource('csv-1');
  });

  it('removeDataSource removes a source', () => {
    registerDataSource({ id: 'tmp', name: 'Temp', kind: 'upload', featureIds: [] });
    expect(removeDataSource('tmp')).toBe(true);
    expect(getDataSource('tmp')).toBeUndefined();
  });

  it('is idempotent', () => {
    ensureDefaultDataSources();
    ensureDefaultDataSources();
    const drawn = listDataSources().filter((s) => s.id === 'drawn-features');
    expect(drawn).toHaveLength(1);
  });
});