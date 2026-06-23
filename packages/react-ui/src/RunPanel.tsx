import { useRun } from '@gsbio/react';
import type { RunStatus } from '@gsbio/core';

/** Statuses that count as "running" — the run button shows the sliding-hash
 *  overlay and disables interaction while in any of these states. */
const ACTIVE: ReadonlySet<RunStatus> = new Set([
  'preprocessing',
  'submitting',
  'running',
]);

/** Inline labels shown on the run button while in each active phase. */
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

/**
 * `<RunPanel>` — the run button + cancel + live progress indicator.
 *
 * **Stable class names** (themed by the host app; no shipped CSS here):
 * `.run-panel` (root, default from `className`)
 * `.btn-run` (the run button)
 * `.btn-run--idle | --active | --succeeded | --failed | --cancelled` (state)
 * `.btn-run__overlay` (the sliding-hash overlay, shown while active)
 * `.btn-run__label` (the inline status text)
 * `.btn-cancel` (the cancel button, shown only while active)
 * `.run-error` (inline error message, shown only when `status === 'failed'`)
 * `.run-progress` (progress bar wrapper; child `.run-progress__bar` has width set)
 *
 * The sliding-hash keyframes live in the demo app's stylesheet.
 */
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