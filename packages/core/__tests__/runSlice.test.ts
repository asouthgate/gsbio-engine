import { describe, it, expect } from 'vitest';
import {
  runReducer,
  initialRunState,
  allSummaries,
  toSummary,
  type RunAction,
  type RunState,
} from '../src/index';

const request: RunAction = {
  type: 'RUN_REQUEST',
  runId: 'r1',
  modelId: 'hello-world',
  params: { threshold: 0.5 },
  startedAt: 1000,
};

describe('runReducer', () => {
  it('initial state has no current and empty history', () => {
    expect(initialRunState.current).toBeNull();
    expect(initialRunState.history).toEqual([]);
  });

  it('RUN_REQUEST creates a current record with idle status', () => {
    const s = runReducer(initialRunState, request);
    expect(s.current).not.toBeNull();
    expect(s.current!.runId).toBe('r1');
    expect(s.current!.status).toBe('idle');
    expect(s.current!.result).toBeNull();
    expect(s.current!.visible).toBe(false);
  });

  it('PREPROCESS_START advances status', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'PREPROCESS_START' });
    expect(s2.current!.status).toBe('preprocessing');
  });

  it('SUBMIT_START advances status', () => {
    const s = runReducer(
      runReducer(initialRunState, request),
      { type: 'SUBMIT_START' },
    );
    expect(s.current!.status).toBe('submitting');
  });

  it('PROGRESS with step=stream promotes to running and stores progress', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'SUBMIT_START' });
    const s3 = runReducer(s2, {
      type: 'PROGRESS',
      payload: { step: 'stream', fraction: 0.42, label: 'Streaming…' },
    });
    expect(s3.current!.status).toBe('running');
    expect(s3.current!.progress).toEqual({ step: 'stream', fraction: 0.42, label: 'Streaming…' });
  });

  it('PROGRESS with step=preprocess leaves status unchanged', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'PREPROCESS_START' });
    const s3 = runReducer(s2, {
      type: 'PROGRESS',
      payload: { step: 'preprocess' },
    });
    expect(s3.current!.status).toBe('preprocessing');
  });

  it('RUN_SUCCEED stores result + finishedAt', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'RUN_SUCCEED', result: { layer: { kind: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } } }, finishedAt: 2000 });
    expect(s2.current!.status).toBe('succeeded');
    expect(s2.current!.result).toEqual({ layer: { kind: 'geojson', data: { type: 'FeatureCollection', features: [] } } });
    expect(s2.current!.finishedAt).toBe(2000);
  });

  it('RUN_FAIL stores error + finishedAt', () => {
    const s = runReducer(
      runReducer(initialRunState, request),
      { type: 'RUN_FAIL', error: 'boom', finishedAt: 3000 },
    );
    expect(s.current!.status).toBe('failed');
    expect(s.current!.error).toBe('boom');
    expect(s.current!.finishedAt).toBe(3000);
  });

  it('RUN_CANCEL marks status cancelled', () => {
    const s = runReducer(
      runReducer(initialRunState, request),
      { type: 'RUN_CANCEL', finishedAt: 4000 },
    );
    expect(s.current!.status).toBe('cancelled');
    expect(s.current!.finishedAt).toBe(4000);
  });

  it('RUN_REQUEST moves a finished current into history', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'RUN_SUCCEED', result: null, finishedAt: 2000 });
    const s3 = runReducer(s2, { ...request, runId: 'r2', startedAt: 5000 });
    expect(s3.history).toHaveLength(1);
    expect(s3.history[0]!.runId).toBe('r1');
    expect(s3.current!.runId).toBe('r2');
  });

  it('RUN_REQUEST drops an in-flight current (it was aborted)', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'PREPROCESS_START' });
    const s3 = runReducer(s2, { ...request, runId: 'r2', startedAt: 5000 });
    expect(s3.history).toEqual([]);
    expect(s3.current!.runId).toBe('r2');
  });

  it('SHOW_RESULT / HIDE_RESULT toggle visibility on current', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, {
      type: 'RUN_SUCCEED',
      result: { layer: { kind: 'geojson' as const, data: { type: 'FeatureCollection' as const, features: [] } } },
      finishedAt: 1,
    });
    const s3 = runReducer(s2, { type: 'SHOW_RESULT', runId: 'r1' });
    expect(s3.current!.visible).toBe(true);
    const s4 = runReducer(s3, { type: 'HIDE_RESULT', runId: 'r1' });
    expect(s4.current!.visible).toBe(false);
  });

  it('SHOW_RESULT / HIDE_RESULT toggle visibility on history rows', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'RUN_SUCCEED', result: null, finishedAt: 1 });
    const s3 = runReducer(s2, { ...request, runId: 'r2', startedAt: 5000 });
    const s4 = runReducer(s3, { type: 'SHOW_RESULT', runId: 'r1' });
    expect(s4.history[0]!.visible).toBe(true);
    expect(s4.current!.visible).toBe(false);
  });

  it('CLEAR_RESULT removes from current', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'CLEAR_RESULT', runId: 'r1' });
    expect(s2.current).toBeNull();
  });

  it('CLEAR_RESULT removes from history', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'RUN_SUCCEED', result: null, finishedAt: 1 });
    const s3 = runReducer(s2, { ...request, runId: 'r2', startedAt: 5000 });
    const s4 = runReducer(s3, { type: 'CLEAR_RESULT', runId: 'r1' });
    expect(s4.history).toEqual([]);
  });

  it('CLEAR_ALL_RESULTS resets to initial', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'RUN_SUCCEED', result: null, finishedAt: 1 });
    const s3 = runReducer(s2, { type: 'CLEAR_ALL_RESULTS' });
    expect(s3).toEqual(initialRunState);
  });

  it('unknown action returns state unchanged', () => {
    const s = runReducer(initialRunState, { type: '__bogus__' } as unknown as RunAction);
    expect(s).toBe(initialRunState);
  });

  it('terminal actions are no-ops when no current', () => {
    expect(runReducer(initialRunState, { type: 'RUN_SUCCEED', result: null, finishedAt: 1 })).toBe(initialRunState);
    expect(runReducer(initialRunState, { type: 'RUN_FAIL', error: 'x', finishedAt: 1 })).toBe(initialRunState);
    expect(runReducer(initialRunState, { type: 'RUN_CANCEL', finishedAt: 1 })).toBe(initialRunState);
    expect(runReducer(initialRunState, { type: 'PROGRESS', payload: { step: 'stream' } })).toBe(initialRunState);
  });
});

describe('allSummaries / toSummary', () => {
  it('returns empty list for fresh state', () => {
    expect(allSummaries(initialRunState)).toEqual([]);
  });

  it('projects current + history, newest-first', () => {
    const s1 = runReducer(initialRunState, request);
    const s2 = runReducer(s1, { type: 'RUN_SUCCEED', result: null, finishedAt: 1 });
    const s3 = runReducer(s2, { ...request, runId: 'r2', startedAt: 5 });
    const list = allSummaries(s3 as RunState);
    expect(list).toHaveLength(2);
    expect(list[0]!.runId).toBe('r2');
    expect(list[1]!.runId).toBe('r1');
    // Summaries must not carry the heavy `result` field.
    expect('result' in list[0]!).toBe(false);
  });

  it('toSummary preserves visibility + status', () => {
    const s = runReducer(
      runReducer(initialRunState, request),
      { type: 'SHOW_RESULT', runId: 'r1' },
    );
    const sum = toSummary(s.current!);
    expect(sum.runId).toBe('r1');
    expect(sum.visible).toBe(true);
    expect(sum.status).toBe('idle');
  });
});