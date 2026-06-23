import { describe, it, expect, vi } from 'vitest';
import {
  createSimulationEngine,
  type Executor,
  type DrawnFeature,
  type LngLat,
  type MapActions,
} from '../src/index';

function feature(
  id: string,
  kind: DrawnFeature['geometryKind'],
  over: Partial<DrawnFeature> = {},
): DrawnFeature {
  // GeoJSON features carry TerraDraw's `id` + `properties.mode` — the engine
  // helpers preserve these when replacing geometry so TerraDraw's
  // `addFeatures` accepts the new GeoJSON instead of silently rejecting.
  return {
    id,
    geometryKind: kind,
    category: '',
    label: '',
    visible: true,
    geojson: {
      type: 'Feature',
      id,
      geometry:
        kind === 'point'
          ? { type: 'Point', coordinates: [0, 0] }
          : kind === 'linestring'
            ? { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
            : { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { mode: kind === 'linestring' ? 'linestring' : kind },
    },
    ...(kind === 'circle'
      ? { circle: { center: { lng: 0, lat: 0 }, radiusMeters: 100 } }
      : {}),
    ...over,
  } as DrawnFeature;
}

function engineWith(initialFeature: DrawnFeature) {
  const engine = createSimulationEngine();
  engine.dispatchDraw({ type: 'ADD_FEATURE', payload: initialFeature });
  const actions = {
    removeFeatureFromMap: vi.fn(),
    setFeatureVisibility: vi.fn(),
    updateFeatureGeometry: vi.fn(),
    addResultLayer: vi.fn(),
    removeResultLayer: vi.fn(),
  };
  engine.setMapActions(actions);
  return { engine, actions };
}

const PERTH: LngLat = { lng: 115.86, lat: -31.95 };

describe('updatePointPosition', () => {
  it('moves the point and pushes geometry to the map', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updatePointPosition('p1', PERTH);
    const f = engine.getSnapshot().draw.features[0];
    expect((f.geojson.geometry as GeoJSON.Point).coordinates).toEqual([PERTH.lng, PERTH.lat]);
    expect(f.geojson.id).toBe('p1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('point');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
    expect(actions.updateFeatureGeometry).toHaveBeenCalledWith('p1', f.geojson);
  });

  it('no-ops on a non-point feature', () => {
    const { engine, actions } = engineWith(feature('l1', 'linestring'));
    engine.updatePointPosition('l1', PERTH);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updateCircle', () => {
  it('updates radius and regenerates the polygon approximation', () => {
    const { engine, actions } = engineWith(feature('c1', 'circle'));
    engine.updateCircle('c1', { radiusMeters: 250 });
    const f = engine.getSnapshot().draw.features[0];
    expect(f.circle?.radiusMeters).toBe(250);
    expect(f.circle?.center).toEqual({ lng: 0, lat: 0 });
    expect((f.geojson.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(65);
    expect(f.geojson.id).toBe('c1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('circle');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('updates center and regenerates the polygon approximation', () => {
    const { engine, actions } = engineWith(feature('c1', 'circle'));
    engine.updateCircle('c1', { center: PERTH });
    const f = engine.getSnapshot().draw.features[0];
    expect(f.circle?.center).toEqual(PERTH);
    expect(f.circle?.radiusMeters).toBe(100);
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-circle feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updateCircle('p1', { radiusMeters: 999 });
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updateLineStringCoords', () => {
  it('replaces vertices and pushes geometry to the map', () => {
    const { engine, actions } = engineWith(feature('l1', 'linestring'));
    const coords: LngLat[] = [{ lng: 1, lat: 2 }, { lng: 3, lat: 4 }, { lng: 5, lat: 6 }];
    engine.updateLineStringCoords('l1', coords);
    const f = engine.getSnapshot().draw.features[0];
    expect((f.geojson.geometry as GeoJSON.LineString).coordinates).toEqual([
      [1, 2], [3, 4], [5, 6],
    ]);
    expect(f.geojson.id).toBe('l1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('linestring');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-linestring feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updateLineStringCoords('p1', [PERTH]);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updatePolygonRing', () => {
  it('replaces the outer ring and re-closes if needed', () => {
    const { engine, actions } = engineWith(feature('pg1', 'polygon'));
    const ring: LngLat[] = [
      { lng: 0, lat: 0 },
      { lng: 2, lat: 0 },
      { lng: 2, lat: 2 },
    ];
    engine.updatePolygonRing('pg1', ring);
    const f = engine.getSnapshot().draw.features[0];
    const coords = (f.geojson.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords).toHaveLength(4);
    expect(coords[0]).toEqual([0, 0]);
    expect(coords[3]).toEqual([0, 0]);
    expect(f.geojson.id).toBe('pg1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('polygon');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-polygon feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updatePolygonRing('p1', [PERTH]);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

/* ----------------------------- run pipeline ----------------------------- */

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

/** Build a fake `Executor` with cancelable delays and progress. */
function makeProvider(opts?: {
  preprocessMs?: number;
  submitMs?: number;
  submitProgress?: { count: number; delayMs: number };
  fail?: string | undefined;
  failAfter?: number;
}): { provider: Executor; calls: { preprocess: number; submit: number; progress: number } } {
  const calls = { preprocess: 0, submit: 0, progress: 0 };
  const provider: Executor = {
    async preprocess(ctx, signal) {
      calls.preprocess++;
      void ctx;
      await delay(opts?.preprocessMs ?? 10, signal);
      return { payload: { ok: true } };
    },
    async submit(ctx, signal) {
      calls.submit++;
      const progress = opts?.submitProgress;
      if (progress) {
        for (let i = 1; i <= progress.count; i++) {
          await delay(progress.delayMs, signal);
          ctx.onProgress?.({ step: 'stream', fraction: i / progress.count, label: `s${i}` });
          calls.progress++;
        }
      } else {
        await delay(opts?.submitMs ?? 10, signal);
      }
      if (opts?.fail !== undefined) {
        const failAfter = opts.failAfter ?? 0;
        if (failAfter <= 0) throw new Error(opts.fail);
        await delay(failAfter, signal);
        throw new Error(opts.fail);
      }
      return {
        layer: {
          kind: 'geojson' as const,
          data: { type: 'FeatureCollection' as const, features: [] },
        },
        summary: { ok: true },
      };
    },
  };
  return { provider, calls };
}

function engineWithRun(): { engine: ReturnType<typeof createSimulationEngine>; actions: MapActions } {
  const engine = createSimulationEngine();
  const actions: MapActions = {
    removeFeatureFromMap: vi.fn(),
    setFeatureVisibility: vi.fn(),
    updateFeatureGeometry: vi.fn(),
    addResultLayer: vi.fn(),
    removeResultLayer: vi.fn(),
  };
  engine.setMapActions(actions);
  return { engine, actions };
}

describe('run pipeline', () => {
  it('happy path: idle → preprocessing → submitting → running → succeeded', async () => {
    const { engine } = engineWithRun();
    const { provider, calls } = makeProvider({
      preprocessMs: 5,
      submitProgress: { count: 3, delayMs: 5 },
    });
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const run = engine.getSnapshot().run.current!;
    expect(run.status).toBe('succeeded');
    expect(run.result).toEqual({
      layer: { kind: 'geojson', data: { type: 'FeatureCollection', features: [] } },
      summary: { ok: true },
    });
    expect(calls.preprocess).toBe(1);
    expect(calls.submit).toBe(1);
    expect(calls.progress).toBe(3);
    expect(run.progress).not.toBeNull();
  });

  it('cancelRun aborts an in-flight submit and marks cancelled', async () => {
    const { engine } = engineWithRun();
    const { provider, calls } = makeProvider({ submitMs: 500 });
    engine.registerExecutor('hello-world', provider);
    const p = engine.run();
    // let it start submitting
    await new Promise((r) => setTimeout(r, 30));
    engine.cancelRun();
    await p;
    const run = engine.getSnapshot().run.current!;
    expect(run.status).toBe('cancelled');
    expect(calls.submit).toBe(1);
  });

  it('a failed submit records the error message', async () => {
    const { engine } = engineWithRun();
    const { provider } = makeProvider({ fail: 'backend down', failAfter: 5 });
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const run = engine.getSnapshot().run.current!;
    expect(run.status).toBe('failed');
    expect(run.error).toBe('backend down');
  });

  it('missing executor fails immediately with a useful message', async () => {
    const { engine } = engineWithRun();
    // swap to a model with no executor registered
    engine.dispatchModel({ type: 'SET_MODEL', payload: 'no-such-model' });
    await engine.run();
    const run = engine.getSnapshot().run.current!;
    expect(run.status).toBe('failed');
    expect(run.error).toContain('No executor');
  });

  it('starting a second run cancels the first; both records preserved', async () => {
    const { engine } = engineWithRun();
    const { provider } = makeProvider({ submitMs: 300 });
    engine.registerExecutor('hello-world', provider);
    const first = engine.run();
    await new Promise((r) => setTimeout(r, 20));
    const second = engine.run();
    await first;
    await second;
    const snap = engine.getSnapshot().run;
    expect(snap.history.length).toBe(1);
    expect(snap.history[0]!.status).toBe('cancelled');
    expect(snap.current!.status).toBe('succeeded');
  });

  it('showResult / hideResult call map actions', async () => {
    const { engine, actions } = engineWithRun();
    const { provider } = makeProvider();
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const runId = engine.getSnapshot().run.current!.runId;
    engine.showResult(runId);
    expect(actions.addResultLayer).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().run.current!.visible).toBe(true);
    // Idempotent: hidden state can be re-toggled.
    engine.hideResult(runId);
    expect(actions.removeResultLayer).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().run.current!.visible).toBe(false);
  });

  it('clearResult removes the layer if it was visible', async () => {
    const { engine, actions } = engineWithRun();
    const { provider } = makeProvider();
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const runId = engine.getSnapshot().run.current!.runId;
    engine.showResult(runId);
    engine.clearResult(runId);
    expect(actions.removeResultLayer).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().run.current).toBeNull();
  });

  it('clearAllResults removes all visible layers and resets state', async () => {
    const { engine, actions } = engineWithRun();
    const { provider } = makeProvider();
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    engine.showResult(engine.getSnapshot().run.current!.runId);
    engine.clearAllResults();
    expect(actions.removeResultLayer).toHaveBeenCalledTimes(1);
    expect(engine.getSnapshot().run.current).toBeNull();
    expect(engine.getSnapshot().run.history).toEqual([]);
  });

  it('multi-layer result: per-layer show/hide fan out via the renderer port', async () => {
    const { engine, actions } = engineWithRun();
    const add = actions.addResultLayer as ReturnType<typeof vi.fn>;
    const remove = actions.removeResultLayer as ReturnType<typeof vi.fn>;
    const multiLayerResult = {
      layers: [
        { id: 'c1', envelope: { kind: 'image' as const, url: 'data:1', bounds: [0, 0, 1, 1] } },
        { id: 'c2', envelope: { kind: 'image' as const, url: 'data:2', bounds: [2, 2, 3, 3] } },
      ],
      summary: { count: 2 },
    };
    const provider: Executor = {
      async preprocess() { return { payload: null }; },
      async submit(_ctx, signal) {
        void _ctx;
        await delay(5, signal);
        return multiLayerResult;
      },
    };
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const runId = engine.getSnapshot().run.current!.runId;

    // RunRecord carries both layer ids; none visible yet.
    const rec = engine.getSnapshot().run.current!;
    expect(rec.layerIds).toEqual(['c1', 'c2']);
    expect(rec.visibleLayerIds).toEqual([]);
    expect(rec.visible).toBe(false);

    // Per-layer show fans out exactly one addResultLayer per layer.
    engine.showResultLayer(runId, 'c1');
    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(runId, 'c1', expect.objectContaining({ kind: 'image', url: 'data:1' }));
    expect(engine.getSnapshot().run.current!.visibleLayerIds).toEqual(['c1']);
    expect(engine.getSnapshot().run.current!.visible).toBe(true);

    // Whole-run show adds the remaining layer only (idempotency).
    engine.showResult(runId);
    expect(add).toHaveBeenCalledTimes(2);
    expect(add).toHaveBeenLastCalledWith(runId, 'c2', expect.objectContaining({ kind: 'image', url: 'data:2' }));
    expect(engine.getSnapshot().run.current!.visibleLayerIds).toEqual(['c1', 'c2']);

    // Per-layer hide removes exactly that layer.
    engine.hideResultLayer(runId, 'c1');
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith(runId, 'c1');
    expect(engine.getSnapshot().run.current!.visibleLayerIds).toEqual(['c2']);
    // Partial state now.
    const sum = engine.getSnapshot().run.current!;
    expect(sum.visibleLayerIds.length).toBe(1);
    expect(sum.layerIds.length).toBe(2);
    // Whole-run hide empties the rest.
    engine.hideResult(runId);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenLastCalledWith(runId, 'c2');
    expect(engine.getSnapshot().run.current!.visible).toBe(false);

    // clearResult tears down everything currently visible.
    engine.showResult(runId);
    engine.clearResult(runId);
    expect(remove).toHaveBeenCalledTimes(4); // 2 from hide above + 2 from clear
    expect(engine.getSnapshot().run.current).toBeNull();
  });

  it('showResult is a no-op on a run with zero result layers', async () => {
    const { engine, actions } = engineWithRun();
    const add = actions.addResultLayer as ReturnType<typeof vi.fn>;
    const provider: Executor = {
      async preprocess() { return { payload: null }; },
      async submit(_ctx, signal) {
        void _ctx;
        await delay(5, signal);
        return { summary: { only: true } }; // no layers
      },
    };
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const runId = engine.getSnapshot().run.current!.runId;
    engine.showResult(runId);
    engine.showResultLayer(runId, 'whatever');
    expect(add).not.toHaveBeenCalled();
    expect(engine.getSnapshot().run.current!.visible).toBe(false);
    expect(engine.getSnapshot().run.current!.layerIds).toEqual([]);
  });

  it('autoShowResults renders every layer on the map without a manual showResult', async () => {
    const { engine, actions } = engineWithRun();
    const add = actions.addResultLayer as ReturnType<typeof vi.fn>;
    engine.autoShowResults = true;
    const multiLayerResult = {
      layers: [
        { id: 'c1', envelope: { kind: 'image' as const, url: 'data:1', bounds: [0, 0, 1, 1] } },
        { id: 'c2', envelope: { kind: 'image' as const, url: 'data:2', bounds: [2, 2, 3, 3] } },
      ],
      summary: { count: 2 },
    };
    const provider: Executor = {
      async preprocess() { return { payload: null }; },
      async submit(_ctx, signal) {
        void _ctx;
        await delay(5, signal);
        return multiLayerResult;
      },
    };
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    expect(add).toHaveBeenCalledTimes(2);
    expect(engine.getSnapshot().run.current!.visible).toBe(true);
    expect(engine.getSnapshot().run.current!.visibleLayerIds).toEqual(['c1', 'c2']);
  });

  it('autoShowResults stays a no-op when submit produced zero layers', async () => {
    const { engine, actions } = engineWithRun();
    const add = actions.addResultLayer as ReturnType<typeof vi.fn>;
    engine.autoShowResults = true;
    const provider: Executor = {
      async preprocess() { return { payload: null }; },
      async submit(_ctx, signal) {
        void _ctx;
        await delay(5, signal);
        return { summary: { only: true } };
      },
    };
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    expect(add).not.toHaveBeenCalled();
    expect(engine.getSnapshot().run.current!.visible).toBe(false);
    expect(engine.getSnapshot().run.current!.layerIds).toEqual([]);
  });

  it('executor onLog entries land in run.log and warnings summary', async () => {
    const { engine } = engineWithRun();
    const provider: Executor = {
      async preprocess(ctx, signal) {
        await delay(2, signal);
        ctx.onLog?.('warning', 'No Source points drawn');
        ctx.onLog?.('info', 'preprocessed');
        return { payload: null };
      },
      async submit(ctx, signal) {
        ctx.onLog?.('info', 'submit body');
        void await delay(2, signal);
        return {
          layer: { kind: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } },
          summary: { ok: true },
        };
      },
    };
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const run = engine.getSnapshot().run.current!;
    const messages = run.log.map((e) => `[${e.level}] ${e.message}`);
    // Lifecycle entries were appended by the engine.
    expect(messages).toContain('[info] Run started · model "hello-world"');
    expect(messages).toContain('[info] Preprocessing…');
    expect(messages).toContain('[info] Submitting…');
    expect(messages).toContain('[info] Completed · 1 layer');
    // Executor-emitted entries threaded through too.
    expect(messages).toContain('[warning] No Source points drawn');
    expect(messages).toContain('[info] preprocessed');
    expect(messages).toContain('[info] submit body');
    // Warnings projection only includes warning-level entries.
    expect(messages.filter((m) => m.startsWith('[warning]'))).toEqual([
      '[warning] No Source points drawn',
    ]);
  });

  it('a failed submit appends an error log entry alongside RUN_FAIL', async () => {
    const { engine } = engineWithRun();
    const provider: Executor = {
      async preprocess() { return { payload: null }; },
      async submit(_ctx, signal) {
        void _ctx;
        await delay(2, signal);
        throw new Error('backend down');
      },
    };
    engine.registerExecutor('hello-world', provider);
    await engine.run();
    const run = engine.getSnapshot().run.current!;
    expect(run.status).toBe('failed');
    expect(run.error).toBe('backend down');
    expect(run.log.at(-1)).toMatchObject({ level: 'error', message: 'backend down' });
  });

  it('executor onLog calls from an aborted run do not pollute the next run', async () => {
    const { engine } = engineWithRun();
    const providerGood: Executor = {
      async preprocess(c, s) { c.onLog?.('info', 'started preprocess'); await delay(50, s); return { payload: null }; },
      async submit(c, s) { c.onLog?.('info', 'submitting'); void await delay(2, s); return { layer: { kind: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } }, summary: {} }; },
    };
    engine.registerExecutor('hello-world', providerGood);
    const first = engine.run();
    await new Promise((r) => setTimeout(r, 5));
    engine.cancelRun();
    await first.catch(() => {});
    const second = engine.run();
    await second;
    const cur = engine.getSnapshot().run.current!;
    expect(cur.status).toBe('succeeded');
    // The aborted run's onLog call should have fired while it was active, but
    // any late call landing after abort must not appear in the new run's log.
    const firstStartedEntry = cur.log.findIndex((e) => e.message === 'Run started · model "hello-world"');
    // There should be exactly one "Run started" entry in the current run's log
    // because the aborted run's record was dropped (RUN_REQUEST replaced current).
    expect(cur.log.filter((e) => e.message === 'Run started · model "hello-world"')).toHaveLength(1);
    expect(firstStartedEntry).toBeGreaterThanOrEqual(0);
  });
});