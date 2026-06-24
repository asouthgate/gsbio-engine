import type { RunRecord } from './types';

export interface RunState {
  current: RunRecord | null;
  history: RunRecord[];
}
