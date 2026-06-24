/**
 * Stub executor — a reusable, headless backend simulator that an `Executor`
 * may use *inside* its `submit` to fake server latency/progress before a real
 * backend exists.
 *
 * Real model executors (the `Executor` port in `types.ts`) ship in their own
 * code; expensive `submit` roundtrips happen against an actual backend. The
 * `StubExecutor` takes a pure dev-supplied **kernel** (the domain math +
 * payload → result) and wraps it with simulated network/compute behaviour so
 * a model looks and behaves like it was submitted to a server: queue latency,
 * streaming progress ticks, and cooperative cancellation via `AbortSignal`.
 *
 * Note: `StubExecutor` is a *utility*, not an `Executor` itself — it has no
 * `preprocess`/`submit` methods. The dev's `Executor.submit` calls
 * `stubExecutor.run(...)` to drive its kernel.
 *
 * It is intentionally framework- and host-agnostic — no DOM, no `fetch`, no
 * canvas. That keeps it unit-testable in pure Node without a graphics stack
 * and lets the demo plug its `OffscreenCanvas`-backed kernel in at the call
 * site. The dev's `submit` is the only thing that imports browser APIs.
 */
import type { RunProgress } from './types';

export interface StubExecutorOptions {
  /** Simulated backend queue latency dispatched before compute starts (ms).
   *  Mirrors "send a job, wait to be picked up". Defaults to 100. */
  latencyMs?: number;
  /** Number of streaming "compute" progress ticks `run()` emits between
   *  queue-acquired and done. Every tick advances `fraction` from 0 → 1.
   *  Defaults to 5. */
  steps?: number;
  /** Delay between two consecutive progress ticks (ms). Defaults to 20. */
  stepDelayMs?: number;
}

export interface StubRunInput<TPayload> {
  /** Preprocessed payload the kernel runs against (the dev's `submit`
   *  forwards its `ctx.payload`). */
  payload: TPayload;
  /** Forwarded progress callback — emitted with `step: 'submit'` once queue
   *  is acquired, then `step: 'stream'` at each tick. */
  onProgress?: (progress: RunProgress) => void;
  /** Cooperative cancellation. Aborts reject with `AbortError` promptly. */
  signal: AbortSignal;
}

/** The pure part of the model — receives the preprocessed payload and returns
 *  the `RunResult` (e.g. `{ layers, summary }`). May be async (e.g. awaiting
 *  an `OffscreenCanvas.toBlob()`). It is invoked exactly once per run once
 *  queue latency + progress steps have elapsed. */
export interface StubComputeKernel<TPayload, TResult> {
  (payload: TPayload): TResult | Promise<TResult>;
}

export interface StubExecutor {
  /** Run the kernel under simulated backend transport. Resolves to the
   *  kernel's result. Honours `signal.aborted` at every await boundary. */
  run<TPayload, TResult>(
    input: StubRunInput<TPayload>,
    kernel: StubComputeKernel<TPayload, TResult>,
  ): Promise<TResult>;
}

/** `setTimeout`/`AbortSignal` sleep — the only timing primitive used, so the
 *  executor runs in any JS host (Node, browser, worker). Rejects with an
 *  `AbortError` `DOMException` when the signal fires before the timer. */
export function stubDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/** Construct a reusable stub executor. Defaults produce a ~200ms run with
 *  five streaming ticks — enough for visible progress in the demo without
 *  feeling instant when unit-testing. */
export function createStubExecutor(options: StubExecutorOptions = {}): StubExecutor {
  const latencyMs = options.latencyMs ?? 100;
  const steps = Math.max(1, options.steps ?? 5);
  const stepDelayMs = options.stepDelayMs ?? 20;

  return {
    async run<TPayload, TResult>(
      input: StubRunInput<TPayload>,
      kernel: StubComputeKernel<TPayload, TResult>,
    ): Promise<TResult> {
      const { signal, onProgress } = input;
      // Simulated backend: request submitted, waiting to be picked up.
      onProgress?.({ step: 'submit', fraction: undefined, label: 'Queued…' });
      await stubDelay(latencyMs, signal);

      // Streaming compute: emit a progress tick per step.
      for (let i = 1; i <= steps; i++) {
        onProgress?.({
          step: 'stream',
          fraction: i / steps,
          label: `Computing ${i}/${steps}`,
        });
        // A final no-delay tick isn't useful, so delay between ticks only.
        if (i < steps) await stubDelay(stepDelayMs, signal);
      }

      // Kernel may also be async (e.g. awaiting `canvas.toBlob()`). Run it
      // after the simulated transport completes — a real backend would in
      // turn its result by now.
      return kernel(input.payload);
    },
  };
}