// Download helper: bundle each rendered result layer together with its raw
// scientific artifact (GeoTIFF) into a single ZIP.

import type { ResultLayerEntry } from '../core/engine.runController.types';
import { buildZip, downloadBlob, type ZipEntry } from './zip';

/** Fetches an arbitrary URL (including `blob:`) as bytes. */
export type FetchBytes = (url: string) => Promise<Uint8Array>;

async function toBytes(input: ArrayBuffer | Uint8Array): Promise<Uint8Array> {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

function safeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9._-]+/g, '_');
}

/** Build a ZIP of rendered PNGs plus any raw artifacts for the given layers. */
export async function buildLayerZip(layers: ResultLayerEntry[], fetchBytes: FetchBytes): Promise<Blob> {
  const entries: ZipEntry[] = [];
  for (const layer of layers) {
    const base = safeName(layer.name ?? layer.id);
    if (layer.envelope.kind === 'image') {
      entries.push({ name: `${base}.png`, data: await toBytes(await fetchBytes(layer.envelope.url)) });
    }
    if (layer.raw) {
      const rawName = layer.raw.filename || `${base}.tif`;
      const data = layer.raw.bytes
        ? await toBytes(layer.raw.bytes)
        : layer.raw.url
          ? await toBytes(await fetchBytes(layer.raw.url))
          : null;
      if (data) entries.push({ name: rawName, data });
    }
  }
  return buildZip(entries);
}

/** Build and trigger a browser download of the given layers. */
export async function downloadLayerZip(
  filename: string,
  layers: ResultLayerEntry[],
  fetchBytes: FetchBytes,
): Promise<void> {
  downloadBlob(await buildLayerZip(layers, fetchBytes), filename);
}
