import { describe, it, expect, vi } from 'vitest';
import { createStubExecutor, stubDelay } from '../src/index';
import type { RunProgress } from '../src/index';

describe('createStubExecutor', () => {
  it('emits a submit step then N stream ticks ending at fraction=1', async () => {
    const exec = createStubExecutor({ latencyMs: 1, steps: 4, stepDelayMs: 1 });
    const progress: RunProgress[] = [];
    const kernel = vi.fn((): { layers: never[] } => ({ layers: [] }));
    const signal = new AbortController().signal;
    const result = await exec.run(
      { payload: { ok: 1 }, onProgress: (p) => progress.push(p), signal },
      kernel,
    );

    expect(result).toEqual({ layers: [] });
    expect(kernel).toHaveBeenCalledTimes(1);
    const submitSteps = progress.filter((p) => p.step === 'submit');
    const streamSteps = progress.filter((p) => p.step === 'stream');
    expect(submitSteps).toHaveLength(1);
    expect(streamSteps).toHaveLength(4);
    expect(streamSteps[0]!.fraction).toBe(1 / 4);
    expect(streamSteps[3]!.fraction).toBe(1);
  });

  it('forwards the payload to the kernel verbatim', async () => {
    const exec = createStubExecutor({ latencyMs: 0, steps: 1, stepDelayMs: 0 });
    const kernel = vi.fn((p: { x: number }): { doubled: number } => ({ doubled: p.x * 2 }));
    const signal = new AbortController().signal;
    const result = await exec.run(
      { payload: { x: 21 }, onProgress: undefined, signal },
      kernel,
    );
    expect(result).toEqual({ doubled: 42 });
    expect(kernel).toHaveBeenCalledWith({ x: 21 });
  });

  it('rejects with an AbortError when aborted before queue is picked up', async () => {
    const ac = new AbortController();
    const exec = createStubExecutor({ latencyMs: 100, steps: 1, stepDelayMs: 0 });
    const kernel = vi.fn((): never => 1 as never);
    const p = exec.run(
      { payload: 0, onProgress: undefined, signal: ac.signal },
      kernel,
    );
    // Abort synchronously, immediately, while still in the simulated queue.
    ac.abort();
    await expect(p).rejects.toThrow('Aborted');
    expect(kernel).not.toHaveBeenCalled();
  });

  it('rejects with an AbortError when aborted mid-stream (between ticks)', async () => {
    const ac = new AbortController();
    const exec = createStubExecutor({ latencyMs: 0, steps: 5, stepDelayMs: 30 });
    const kernel = vi.fn((): never => 1 as never);
    const p = exec.run(
      { payload: 0, onProgress: undefined, signal: ac.signal },
      kernel,
    );
    // Let the first inter-step delay register, then abort before completion.
    await new Promise((r) => setTimeout(r, 5));
    ac.abort();
    await expect(p).rejects.toThrow('Aborted');
    expect(kernel).not.toHaveBeenCalled();
  });
});

describe('stubDelay', () => {
  it('resolves after `ms` when the signal never aborts', async () => {
    const ac = new AbortController();
    let resolved = false;
    const p = stubDelay(30, ac.signal).then(() => { resolved = true; });
    await new Promise((r) => setTimeout(r, 5));
    expect(resolved).toBe(false);
    await p;
    expect(resolved).toBe(true);
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(stubDelay(50, ac.signal)).rejects.toThrow('Aborted');
  });
});