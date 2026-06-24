import { useRun } from '../react';
import type { RunStatus } from '../core';

const ACTIVE: ReadonlySet<RunStatus> = new Set([
  'preprocessing',
  'submitting',
  'running',
]);

const PHASE_LABEL: Record<RunStatus, string> = {
  idle: 'Run model',
  preprocessing: 'Preparing…',
  submitting: 'Submitting…',
  running: 'Running…',
  succeeded: 'Run model',
  failed: 'Run model',
  cancelled: 'Run model',
};

export interface RunPanelProps {
  className?: string;
}

export function RunPanel({ className = 'run-panel' }: RunPanelProps) {
  const { state, run, cancel } = useRun();
  const cur = state.current;
  const status: RunStatus = cur?.status ?? 'idle';
  const active = ACTIVE.has(status);
  const error = status === 'failed' ? cur?.error ?? null : null;
  const fraction = cur?.progress?.fraction;

  return (
    <div className={className}>
      <div className="btn-run-row">
        <button
          type="button"
          className={`btn btn-run btn-run--${status}`}
          onClick={() => { void run(); }}
          disabled={active}
          aria-busy={active}
        >
          <span className="btn-run__label">{PHASE_LABEL[status]}</span>
          {active && <span className="btn-run__overlay" aria-hidden="true" />}
        </button>
        {active && (
          <button type="button" className="btn btn-cancel" onClick={cancel}>
            Cancel
          </button>
        )}
      </div>

      {active && (
        <div className="run-progress" aria-hidden={fraction == null}>
          <div
            className="run-progress__bar"
            style={fraction != null ? { width: `${Math.max(0, Math.min(1, fraction)) * 100}%` } : undefined}
          />
        </div>
      )}

      {cur?.progress?.label && active && (
        <p className="hint">{cur.progress.label}</p>
      )}

      {error && <p className="run-error">{error}</p>}
    </div>
  );
}