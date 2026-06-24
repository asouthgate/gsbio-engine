/**
 * Executor for the Radial Spread (API) model — fetch from a backend API.
 *
 * Bound to the model by id at install time. `preprocess` filters the drawn
 * `Spread_zone` circles; `submit` POSTs them to the mock API, polls the run
 * until completion (propagating progress), then wraps the returned tile-URL
 * template in a single `tiles` envelope. Abort fires a best-effort cancel to
 * the mock server so its internal scheduler drops the dead run. The mock
 * server shades each XYZ tile on demand with the same warm ramp as the WASM
 * archetype, so the visible result matches the WASM model — only the compute
 * path differs.
 */

import type {
  Executor,
  MapLayerEnvelope,
  ResultLayerEntry,
  RunResult,
  SimulationEngine,
} from '@gsbio/engine';
import { delay } from '../../shared/delay';
import { selectSpreadZones, type Zone } from '../shared';
import { radialSpreadApiModel } from './model';

interface RadialSpreadApiPayload {
  zones: Zone[];
  resolution: number;
}

interface PollResult {
  status: 'pending' | 'completed' | 'cancelled';
  progress: number;
  tilesUrl?: string;
}

export const radialSpreadApiExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const zones = selectSpreadZones(ctx.features);
    if (zones.length === 0) {
      ctx.onLog?.('warning', 'No Spread_zone circles drawn — submit will produce zero result layers.');
    }
    const resolution =
      ctx.params.resolution ?? radialSpreadApiModel.params[0]!.default;
    return { payload: { zones, resolution } };
  },

  async submit(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { zones, resolution } = ctx.payload as RadialSpreadApiPayload;
    if (zones.length === 0) {
      return {
        layers: [] as ResultLayerEntry[],
        summary: { count: 0, zoneIds: [] as string[] },
      };
    }
    // POST the circles — start a run, get a runId.
    const createRes = await fetch('/api/spread/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zones, resolution }),
      signal,
    });
    if (!createRes.ok) throw new Error(`failed to start spread run: ${createRes.status}`);
    const createBody = (await createRes.json()) as { runId: string };
    const { runId } = createBody;
    ctx.onLog?.('info', `Backend run ${runId} started; polling for completion.`);

    // Poll the run until it terminates; abort fires a best-effort cancel.
    const onAbort = () => {
      fetch(`/api/spread/run/${runId}/cancel`, { method: 'POST' }).catch(() => {});
    };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      let poll: PollResult = { status: 'pending', progress: 0 };
      for (;;) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        await delay(250, signal);
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const res = await fetch(`/api/spread/run/${runId}`, { signal });
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
          summary: { count: zones.length, zoneIds: zones.map((z) => z.id), status: poll.status },
        };
      }
      const envelope: MapLayerEnvelope = {
        kind: 'tiles',
        url: poll.tilesUrl,
        type: 'raster',
      };
      return {
        layers: [{ id: 'radial-spread-api', envelope } as ResultLayerEntry],
        summary: { count: zones.length, zoneIds: zones.map((z) => z.id), runId },
      } satisfies RunResult;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  },
};

/** One-call installer: register the model, bind its executor. Does NOT
 *  auto-select (the WASM archetype stays default-selected). */
export function installRadialSpreadApi(engine: SimulationEngine): void {
  engine.registerModel(radialSpreadApiModel);
  engine.registerExecutor(radialSpreadApiModel.id, radialSpreadApiExecutor);
}