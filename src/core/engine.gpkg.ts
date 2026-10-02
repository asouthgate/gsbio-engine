/**
 * GeoPackage (.gpkg) support for the engine.
 *
 * `@ngageoint/geopackage` is a large library (sql.js WASM + proj4) that is
 * only needed when reading or writing GeoPackage files, so it is loaded
 * lazily via a dynamic import to keep it out of the initial bundle.
 */

import type { GeometryKind, CircleGeometry } from './engine.feature.types';

type GpkgModule = typeof import('@ngageoint/geopackage');
type GpkgBoundingBox = InstanceType<GpkgModule['BoundingBox']>;
type GeoPackageInstance = InstanceType<GpkgModule['GeoPackage']>;

let modulePromise: Promise<GpkgModule> | null = null;

function loadModule(): Promise<GpkgModule> {
  if (!modulePromise) {
    modulePromise = import('@ngageoint/geopackage');
  }
  return modulePromise;
}

/** Configure where the sql.js wasm is served from. See consuming app for usage. */
export async function setSqljsWasmLocateFile(
  locateFile: (file: string) => string,
): Promise<void> {
  const mod = await loadModule();
  mod.setSqljsWasmLocateFile(locateFile);
}

export interface GpkgTable {
  name: string;
  features: GeoJSON.Feature[];
}

/** Columns used to round-trip app metadata through a GeoPackage. */
const GPKG_METADATA_COLUMNS = ['_dp_category', '_dp_label', '_dp_data', '_dp_circle'] as const;

export interface DecodedGpkgFeature {
  geometryKind: GeometryKind;
  category: string | undefined;
  label: string | undefined;
  data: Record<string, unknown> | undefined;
  circle: CircleGeometry | undefined;
  geojson: GeoJSON.Feature;
}

function geometryKindFromGeoJson(type: string | undefined): GeometryKind {
  if (type === 'LineString' || type === 'MultiLineString') return 'linestring';
  if (type === 'Polygon' || type === 'MultiPolygon') return 'polygon';
  if (type === 'MultiPoint') return 'multipoint';
  return 'point';
}

function parseJsonObject(raw: unknown): Record<string, unknown> | undefined {
  if (typeof raw !== 'string') return undefined;
  const parsed: unknown = JSON.parse(raw);
  return parsed !== null && typeof parsed === 'object'
    ? (parsed as Record<string, unknown>)
    : undefined;
}

/**
 * Decodes a GeoJSON feature written by {@link writeGpkg} back into the
 * engine's feature model. This is the exact inverse of the metadata that
 * `writeGpkg` stores: `_dp_category`/`_dp_label` are strings, and
 * `_dp_data`/`_dp_circle` are JSON-encoded values.
 */
export function decodeGpkgFeature(gj: GeoJSON.Feature): DecodedGpkgFeature {
  const props = (gj.properties ?? {}) as Record<string, unknown>;
  return {
    geometryKind: geometryKindFromGeoJson(gj.geometry?.type),
    category: props._dp_category as string | undefined,
    label: props._dp_label as string | undefined,
    data: parseJsonObject(props._dp_data),
    circle: parseJsonObject(props._dp_circle) as CircleGeometry | undefined,
    geojson: { ...gj, properties: {} },
  };
}

function sanitizeTableName(input: string, index: number): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z]+/, '');
  return (base || `table_${index}`).slice(0, 63);
}

/**
 * Reads all feature tables from a GeoPackage and returns them as WGS84 GeoJSON.
 *
 * The underlying library reprojects geometries to WGS84 automatically and maps
 * table columns onto GeoJSON `properties`.
 */
export async function readGpkgFeatureTables(arrayBuffer: ArrayBuffer): Promise<GpkgTable[]> {
  const mod = await loadModule();
  const bytes = new Uint8Array(arrayBuffer);
  const gpkg = await mod.GeoPackageAPI.open(bytes);
  try {
    const tables: GpkgTable[] = [];
    for (const name of gpkg.getFeatureTables()) {
      // Full scan (no bounding box) so tables without an RTree index still work.
      const features = gpkg.queryForGeoJSONFeaturesInTable(
        name,
        undefined as unknown as GpkgBoundingBox,
      );
      tables.push({ name, features: features as unknown as GeoJSON.Feature[] });
    }
    return tables;
  } finally {
    gpkg.close();
  }
}

/**
 * Writes feature tables (one per category) into a single in-memory GeoPackage
 * and returns the resulting `.gpkg` bytes.
 *
 * Each feature's `properties` should carry the scalar string values for the
 * metadata columns (see {@link GPKG_METADATA_COLUMNS}); anything nested should
 * be JSON-encoded by the caller first.
 */
export async function writeGpkg(tables: GpkgTable[]): Promise<Uint8Array> {
  const mod = await loadModule();
  const gpkg = await mod.GeoPackageAPI.create();
  const used = new Set<string>();
  try {
    for (let i = 0; i < tables.length; i++) {
      const table = tables[i]!;
      let name = sanitizeTableName(table.name, i + 1);
      let suffix = 2;
      while (used.has(name)) {
        name = `${sanitizeTableName(table.name, i + 1)}_${suffix++}`;
      }
      used.add(name);

      gpkg.createFeatureTableFromProperties(
        name,
        GPKG_METADATA_COLUMNS.map((col) => ({ name: col, dataType: 'TEXT' })),
      );
      await gpkg.addGeoJSONFeaturesToGeoPackage(
        table.features as unknown as Parameters<GeoPackageInstance['addGeoJSONFeaturesToGeoPackage']>[0],
        name,
      );
    }
    return await gpkg.export();
  } finally {
    gpkg.close();
  }
}
