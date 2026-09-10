/**
 * Transport-agnostic remote job runner.
 *
 * Owns the mechanics of running an async backend job: start → poll for status
 * and logs → report progress → handle cancellation and timeouts. HTTP, auth,
 * and response parsing are delegated to a {@link RemoteJobAdapter} supplied by
 * the caller (typically a model), so the engine stays free of API/auth concerns.
 */

export type RemoteJobStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type RemoteLogLevel = 'info' | 'warning' | 'error';

export interface RemoteLogEntry {
  level: RemoteLogLevel;
  message: string;
}

export interface RemoteJobLogs {
  /** New log entries since the previous fetch. */
  entries: RemoteLogEntry[];
  /** Opaque cursor to request the next chunk of logs. */
  offset: number;
}

export interface RemoteJobPoll<TResult = unknown> {
  status: RemoteJobStatus;
  progress: number;
  progressLabel: string;
  error: string | null;
  warnings?: string[];
  logs?: RemoteJobLogs;
  /** The parsed final result, present only when `status === 'completed'`. */
  result?: TResult;
}

export interface RemoteJobAdapter<TResult = unknown> {
  /** Start the job and return the id used to poll and cancel it. */
  start(body: unknown, signal: AbortSignal): Promise<string>;
  /** Fetch current status and (optionally) any new log lines. */
  fetch(jobId: string, signal: AbortSignal, logOffset: number): Promise<RemoteJobPoll<TResult>>;
  /** Best-effort cancellation of a running job. */
  cancel(jobId: string): Promise<void>;
}

export interface RemoteJobOptions {
  onLog?: (level: RemoteLogLevel, message: string) => void;
  onProgress?: (fraction: number, label: string) => void;
  onStarted?: (jobId: string) => void;
  pollIntervalMs?: number;
  slowPollAfter?: number;
  slowPollIntervalMs?: number;
  maxPolls?: number;
}

export type RemoteJobOutcome<TResult> =
  | { status: 'completed'; result: TResult }
  | { status: 'cancelled' };

export class RemoteJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteJobError';
  }
}

export class RemoteJobTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RemoteJobTimeoutError';
  }
}

const DEFAULT_POLL_INTERVAL_MS = 2000;
const DEFAULT_SLOW_POLL_AFTER = 60;
const DEFAULT_SLOW_POLL_INTERVAL_MS = 5000;
const DEFAULT_MAX_POLLS = 420;

const TERMINAL: ReadonlySet<RemoteJobStatus> = new Set(['completed', 'failed', 'cancelled']);

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const id = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Runs a remote job to completion. Resolves with the parsed result on success,
 * a `{ status: 'cancelled' }` outcome when the server reports cancellation, and
 * rejects with {@link RemoteJobError} on failure or {@link RemoteJobTimeoutError}
 * on timeout. A client-side abort rejects with `DOMException('AbortError')`.
 */
export async function runRemoteJob<TResult>(
  adapter: RemoteJobAdapter<TResult>,
  body: unknown,
  signal: AbortSignal,
  options: RemoteJobOptions = {},
): Promise<RemoteJobOutcome<TResult>> {
  const {
    onLog,
    onProgress,
    onStarted,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    slowPollAfter = DEFAULT_SLOW_POLL_AFTER,
    slowPollIntervalMs = DEFAULT_SLOW_POLL_INTERVAL_MS,
    maxPolls = DEFAULT_MAX_POLLS,
  } = options;

  const jobId = await adapter.start(body, signal);
  onStarted?.(jobId);

  const onAbort = () => {
    adapter.cancel(jobId).catch(() => {});
  };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    let logOffset = 0;
    let latest: RemoteJobPoll<TResult> = {
      status: 'pending',
      progress: 0,
      progressLabel: '',
      error: null,
    };

    for (let poll = 0; poll < maxPolls; poll++) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await delay(poll < slowPollAfter ? pollIntervalMs : slowPollIntervalMs, signal);
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      latest = await adapter.fetch(jobId, signal, logOffset);

      if (latest.logs?.entries?.length) {
        for (const entry of latest.logs.entries) onLog?.(entry.level, entry.message);
        logOffset = latest.logs.offset;
      }

      onProgress?.(latest.progress, latest.progressLabel);

      if (TERMINAL.has(latest.status)) break;
    }

    if (!TERMINAL.has(latest.status)) {
      throw new RemoteJobTimeoutError(
        'Pipeline timed out: it took longer than expected. Try a smaller area or contact support.',
      );
    }

    // Drain any remaining logs after the job has finished.
    try {
      const finalPoll = await adapter.fetch(jobId, signal, logOffset);
      if (finalPoll.logs?.entries?.length) {
        for (const entry of finalPoll.logs.entries) onLog?.(entry.level, entry.message);
      }
    } catch { /* best-effort */ }

    if (latest.status === 'failed') {
      onLog?.('error', latest.error ?? 'Remote job failed');
      throw new RemoteJobError(latest.error ?? 'Remote job failed');
    }

    if (latest.status === 'cancelled') {
      return { status: 'cancelled' };
    }

    for (const w of latest.warnings ?? []) onLog?.('warning', w);

    return { status: 'completed', result: latest.result as TResult };
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}
