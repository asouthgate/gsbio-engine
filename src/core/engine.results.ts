// simulation-engine.results.ts
import type { SimulationEngine } from './engine';
import type { MapLayerEnvelope } from './types';
import { extractResultLayers } from './types';

export class EngineResultActions {
  constructor(private engine: SimulationEngine) {}

  private resolveLayers(runId: string): Map<string, MapLayerEnvelope> {
    const rec = this.engine.findRun(runId);
    if (!rec || !rec.result) return new Map();
    return new Map(extractResultLayers(rec.result, runId).map((l) => [l.id, l.envelope]));
  }

  showResult = (runId: string): void => {
    const rec = this.engine.findRun(runId);
    if (!rec || rec.status !== 'succeeded' || rec.layerIds.length === 0) return;
    const toAdd = rec.layerIds.filter((id) => !rec.visibleLayerIds.includes(id));
    if (toAdd.length === 0) return;
    const layers = this.resolveLayers(runId);
    this.engine.dispatchRun({ type: 'SHOW_RESULT', runId });
    for (const layerId of toAdd) {
      const envelope = layers.get(layerId);
      if (envelope) this.engine.mapActions?.addResultLayer(runId, layerId, envelope);
    }
  };

  hideResult = (runId: string): void => {
    const rec = this.engine.findRun(runId);
    if (!rec || rec.visibleLayerIds.length === 0) return;
    const toRemove = [...rec.visibleLayerIds];
    this.engine.dispatchRun({ type: 'HIDE_RESULT', runId });
    for (const layerId of toRemove) this.engine.mapActions?.removeResultLayer(runId, layerId);
  };

  toggleResult = (runId: string): void => {
    const rec = this.engine.findRun(runId);
    if (!rec || rec.layerIds.length === 0) return;
    if (rec.visibleLayerIds.length < rec.layerIds.length) this.showResult(runId);
    else this.hideResult(runId);
  };

  showResultLayer = (runId: string, layerId: string): void => {
    const rec = this.engine.findRun(runId);
    if (!rec || rec.status !== 'succeeded' || !rec.layerIds.includes(layerId) || rec.visibleLayerIds.includes(layerId)) return;
    const layers = this.resolveLayers(runId);
    const envelope = layers.get(layerId);
    if (!envelope) return;
    this.engine.dispatchRun({ type: 'SHOW_RESULT_LAYER', runId, layerId });
    this.engine.mapActions?.addResultLayer(runId, layerId, envelope);
  };

  hideResultLayer = (runId: string, layerId: string): void => {
    const rec = this.engine.findRun(runId);
    if (!rec || !rec.visibleLayerIds.includes(layerId)) return;
    this.engine.dispatchRun({ type: 'HIDE_RESULT_LAYER', runId, layerId });
    this.engine.mapActions?.removeResultLayer(runId, layerId);
  };

  toggleResultLayer = (runId: string, layerId: string): void => {
    const rec = this.engine.findRun(runId);
    if (!rec || !rec.layerIds.includes(layerId)) return;
    if (rec.visibleLayerIds.includes(layerId)) this.hideResultLayer(runId, layerId);
    else this.showResultLayer(runId, layerId);
  };

  clearResult = (runId: string): void => {
    const rec = this.engine.findRun(runId);
    if (rec) {
      for (const layerId of rec.visibleLayerIds) {
        this.engine.mapActions?.removeResultLayer(runId, layerId);
      }
    }
    this.engine.dispatchRun({ type: 'CLEAR_RESULT', runId });
  };

  clearAllResults = (): void => {
    const cur = this.engine.getSnapshot().run.current;
    if (cur) {
      for (const layerId of cur.visibleLayerIds) {
        this.engine.mapActions?.removeResultLayer(cur.runId, layerId);
      }
    }
    for (const rec of this.engine.getSnapshot().run.history) {
      for (const layerId of rec.visibleLayerIds) {
        this.engine.mapActions?.removeResultLayer(rec.runId, layerId);
      }
    }
    this.engine.dispatchRun({ type: 'CLEAR_ALL_RESULTS' });
  };
}