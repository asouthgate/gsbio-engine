import type {
  Executor,
  PreprocessContext,
  PreprocessResult,
  ResultLayerEntry,
  RunResult,
  SubmitContext,
} from '@gsbio/engine';
import { delay } from '../../shared/delay';
import { circleBounds, selectSpreadZones, type Zone } from '../shared';
import { radialSpreadApiModel } from './model';
import { renderRadialRaster } from '../radialSpread/rasterize';

interface RadialSpreadApiPayload {
  zones: Zone[];
  resolution: number;
}

interface PollResult {
  status: 'pending' | 'completed' | 'cancelled';
  progress: number;
}

export const radialSpreadApiExecutor: Executor = {
  async preprocess(ctx: PreprocessContext, signal: AbortSignal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const zones = selectSpreadZones(ctx.features);
    if (zones.length === 0) {
      ctx.onLog?.('warning', 'No Spread_zone circles drawn: submit will produce zero result layers.');
    }
    const resolution = ctx.params.resolution ?? radialSpreadApiModel.params[0]!.default;
    return { payload: { zones, resolution } } satisfies PreprocessResult;
  },

  async submit(ctx: SubmitContext, signal: AbortSignal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { zones, resolution } = ctx.payload as RadialSpreadApiPayload;

    if (zones.length === 0) {
      return {
        layers: [] as ResultLayerEntry[],
        summary: { count: 0, zoneIds: [] as string[] },
      } satisfies RunResult;
    }

    const createRes = await fetch('/api/spread/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ zones }),
      signal,
    });
    if (!createRes.ok) throw new Error(`failed to start spread run: ${createRes.status}`);
    const { runId } = (await createRes.json()) as { runId: string };

    ctx.onLog?.('info', `Backend run ${runId} started; polling for completion.`);

    const onAbort = () => {
      fetch(`/api/spread/run/${runId}/cancel`, { method: 'POST' }).catch(() => {});
    };
    signal.addEventListener('abort', onAbort, { once: true });

    try {
      let poll: PollResult = { status: 'pending', progress: 0 };

      for (let attempt = 0; attempt < 100; attempt++) {
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

      if (poll.status !== 'completed') {
        ctx.onLog?.('info', `Backend run ${runId} did not complete.`);
        return {
          layers: [] as ResultLayerEntry[],
          summary: { count: zones.length, zoneIds: zones.map((z) => z.id), status: poll.status },
        } satisfies RunResult;
      }

      const url = renderRadialRaster(resolution);
      const layers: ResultLayerEntry[] = zones.map((z) => ({
        id: z.id,
        envelope: { kind: 'image', url, bounds: circleBounds(z) },
      }));
      ctx.onProgress?.({ step: 'submit', fraction: 1, label: 'rasterised' });

      return {
        layers,
        summary: { count: layers.length, zoneIds: zones.map((z) => z.id), runId },
      } satisfies RunResult;
    } finally {
      signal.removeEventListener('abort', onAbort);
    }
  },
};
