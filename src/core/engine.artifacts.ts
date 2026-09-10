/**
 * A simple keyed store for model-produced intermediate values that must flow
 * between runs (e.g. a resistance raster computed in one pipeline stage and
 * consumed by the next).
 *
 * Artifacts are deliberately kept *out* of `EngineState` / `getSnapshot()`
 * because they are not user-visible, are not rendered, and can be large typed
 * arrays that must never enter the React-subscribed state.
 */
export class ArtifactStore {
  private _values = new Map<string, unknown>();

  set<T>(key: string, value: T): void {
    this._values.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this._values.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this._values.has(key);
  }

  delete(key: string): boolean {
    return this._values.delete(key);
  }

  clear(): void {
    this._values.clear();
  }
}
