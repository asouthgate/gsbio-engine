import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runRemoteJob,
  RemoteJobError,
  RemoteJobTimeoutError,
  type RemoteJobAdapter,
  type RemoteJobPoll,
} from './index';

interface Result {
  id: string;
  value: number;
}

function poll(status: RemoteJobPoll['status'], overrides: Partial<RemoteJobPoll<Result>> = {}): RemoteJobPoll<Result> {
  return {
    status,
    progress: status === 'completed' ? 1 : 0.5,
    progressLabel: status === 'completed' ? 'Done' : 'Working',
    error: null,
    ...overrides,
  };
}

function makeAdapter(
  fetchImpl: (jobId: string, logOffset: number) => Promise<RemoteJobPoll<Result>>,
): RemoteJobAdapter<Result> {
  return {
    start: vi.fn(async () => 'job-1'),
    fetch: vi.fn(fetchImpl),
    cancel: vi.fn(async () => {}),
  };
}

describe('runRemoteJob', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the completed result and streams logs/progress', async () => {
    const onLog = vi.fn();
    const onProgress = vi.fn();
    let call = 0;
    const adapter = makeAdapter(async () => {
      call += 1;
      if (call === 1) {
        return poll('running', { logs: { entries: [{ level: 'info', message: 'step one' }, { level: 'warning', message: 'careful' }], offset: 2 } });
      }
      return poll('completed', { result: { id: 'job-1', value: 42 }, warnings: ['sparse'] });
    });

    const promise = runRemoteJob(adapter, { a: 1 }, new AbortController().signal, { onLog, onProgress });
    await vi.runAllTimersAsync();
    const outcome = await promise;

    expect(outcome.status).toBe('completed');
    expect((outcome as { result: Result }).result.value).toBe(42);
    expect(onLog).toHaveBeenCalledWith('info', 'step one');
    expect(onLog).toHaveBeenCalledWith('warning', 'careful');
    expect(onLog).toHaveBeenCalledWith('warning', 'sparse');
    expect(onProgress).toHaveBeenCalled();
  });

  it('throws RemoteJobError when the job fails', async () => {
    const adapter = makeAdapter(async () => poll('failed', { error: 'No data for area' }));
    const promise = runRemoteJob(adapter, {}, new AbortController().signal, {});
    const assertion = expect(promise).rejects.toBeInstanceOf(RemoteJobError);
    await vi.runAllTimersAsync();
    await assertion;
    await expect(promise).rejects.toThrow('No data for area');
  });

  it('returns a cancelled outcome when the server reports cancellation', async () => {
    const adapter = makeAdapter(async () => poll('cancelled'));
    const promise = runRemoteJob(adapter, {}, new AbortController().signal, {});
    await vi.runAllTimersAsync();
    const outcome = await promise;
    expect(outcome.status).toBe('cancelled');
  });

  it('throws RemoteJobTimeoutError when the job never finishes', async () => {
    const adapter = makeAdapter(async () => poll('running'));
    const promise = runRemoteJob(adapter, {}, new AbortController().signal, { maxPolls: 2 });
    const assertion = expect(promise).rejects.toBeInstanceOf(RemoteJobTimeoutError);
    await vi.runAllTimersAsync();
    await assertion;
  });

  it('propagates a start failure', async () => {
    const adapter: RemoteJobAdapter<Result> = {
      start: vi.fn(async () => { throw new Error('Failed to start pipeline: Server busy'); }),
      fetch: vi.fn(),
      cancel: vi.fn(),
    };
    await expect(runRemoteJob(adapter, {}, new AbortController().signal, {})).rejects.toThrow('Server busy');
  });

  it('passes the request body and id through to the adapter', async () => {
    const body = { roost: { lng: -3, lat: 50 }, params: {} };
    const adapter = makeAdapter(async () => poll('completed', { result: { id: 'job-1', value: 1 } }));
    const promise = runRemoteJob(adapter, body, new AbortController().signal, {});
    await vi.runAllTimersAsync();
    await promise;
    expect(adapter.start).toHaveBeenCalledWith(body, expect.anything());
    expect(adapter.fetch).toHaveBeenCalledWith('job-1', expect.anything(), 0);
  });
});
