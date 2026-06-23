/**
 * Corridor Connect — demo model (archetype A: fetch from a backend API).
 *
 * Frames "movement corridors between habitat patches": each drawn `Patch`
 * point becomes a habitat node, and the (mocked) backend computes a
 * nearest-neighbour corridor graph between them (`buildCorridors`). The
 * executor POSTs patches + params, polls the run until it completes, then
 * wraps the returned tile-URL template into a `tiles` envelope — the same
 * `kind:` the `@gsbio/renderer-2d` showcases against the
 * `corridors/:runId/{z}/{x}/{y}.png` XYZ endpoint in
 * `apps/demo-web/src/mock/fakeApi.ts`.
 *
 * The raw math (nearest-neighbour graph + per-tile rasterisation) lives in
 * `./corridors.ts` and the mock API server; only the executor contract glue
 * lives here: serialise features → POST → poll → format envelope.
 */

import type {
  DrawnFeature,
  Executor,
  MapLayerEnvelope,
  ModelDef,
  ResultLayerEntry,
  SimulationEngine,
} from '@gsbio/core';
import type { PatchPoint } from './corridors';
import { delay } from '../../shared/delay';

export const corridorConnectModel: ModelDef = {
  id: 'corridor-connect',
  name: 'Corridor Connect',
  description:
    'Movement corridors between habitat patches. The executor POSTs drawn ' +
    "Patch points to a mock backend that computes a nearest-neighbour " +
    "corridor graph; the result is rendered as XYZ raster tiles the engine " +
    "treats as a `tiles` envelope.",
  params: [
    {
      key: 'maxPatches',
      label: 'Max patches',
      type: 'range',
      min: 2,
      max: 50,
      step: 1,
      default: 20,
    },
  ],
};

interface CorridorsPayload {
  patches: PatchPoint[];
  maxPatches: number;
}

interface PollResult {
  status: 'pending' | 'completed' | 'cancelled';
  progress: number;
  result?: unknown;
  tilesUrl?: string;
}

function collectPatches(features: ReadonlyArray<DrawnFeature>, max: number): PatchPoint[] {
  const out: PatchPoint[] = [];
  for (const f of features) {
    if (f.category === 'Patch' && f.geometryKind === 'point') {
      const g = f.geojson.geometry;
      if (g.type === 'Point' && g.coordinates) {
        const [lng, lat] = g.coordinates as [number, number];
        out.push({ lng, lat, id: f.id });
        if (out.length >= max) break;
      }
    }
  }
  return out;
}

export const corridorConnectExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const maxPatches = ctx.params.maxPatches ?? corridorConnectModel.params[0]!.default;
    const patches = collectPatches(ctx.features, maxPatches);
    if (patches.length < 2) {
      ctx.onLog?.('warning', 'Need at least two Patch points to build corridors — submit will produce zero corridors.');
    }
    return { payload: { patches, maxPatches } };
  },

  async submit(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { patches } = ctx.payload as CorridorsPayload;
    if (patches.length < 2) {
      return {
        layers: [] as ResultLayerEntry[],
        summary: { patchCount: patches.length, corridorCount: 0 },
      };
    }
    // POST the patches — start a run, get a runId.
    const createRes = await fetch('/api/corridors/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ patches }),
      signal,
    });
    if (!createRes.ok) throw new Error(`failed to start corridor run: ${createRes.status}`);
    const createBody = (await createRes.json()) as { runId: string };
    const { runId } = createBody;
    ctx.onLog?.('info', `Backend run ${runId} started; polling for completion.`);

    // Poll the run until it terminates; abort fires a best-effort cancel to
    // the mock server so its internal scheduler drops the dead run.
    const onAbort = () => {
      fetch(`/api/corridors/run/${runId}/cancel`, { method: 'POST' }).catch(() => {});
    };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      let poll: PollResult = { status: 'pending', progress: 0 };
      for (;;) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await delay(250, signal);
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const res = await fetch(`/api/corridors/run/${runId}`, { signal });
        if (!res.ok) throw new Error(`poll failed: ${res.status}`);
        poll = (await res.json()) as PollResult;
        ctx.onProgress?.({
          step: 'submit',
          fraction: poll.progress,
          label: poll.status === 'cancelled' ? 'cancelled' : `${Math.round(poll.progress * 100)}%`,
        });
        if (poll.status === 'completed' || poll.status === 'cancelled') break;
      }
      if (poll.status !== 'completed' || !poll.tilesUrl) {
        return {
          layers: [] as ResultLayerEntry[],
          summary: { patchCount: patches.length, corridorCount: 0, status: poll.status },
        };
      }
      const envelope: MapLayerEnvelope = {
        kind: 'tiles',
        url: poll.tilesUrl,
        type: 'raster',
      };
      return {
        layers: [{ id: 'corridors', envelope } as ResultLayerEntry],
        summary: {
          patchCount: patches.length,
          corridorCount: Array.isArray(poll.result) ? (poll.result as unknown[]).length : 0,
          runId,
        },
      };
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  },
};

/** One-call installer: register the model, bind its executor. Does NOT
 *  auto-select (the user picks a model via the Model dropdown). */
export function installCorridorConnect(engine: SimulationEngine): void {
  engine.registerModel(corridorConnectModel);
  engine.registerExecutor(corridorConnectModel.id, corridorConnectExecutor);
}