import { useEngine, useModel } from '../react';
import { ParamField } from './ParamField';

export interface ModelFormProps {
  className?: string;
}

/**
 * A minimal, generic form for simple models: a model selector followed by all
 * non-hidden params. Models needing custom layout should compose
 * {@link ParamField} themselves from the declarative schema.
 */
export function ModelForm({ className = 'panel-section' }: ModelFormProps) {
  const { state, setModel, setModelParam } = useModel();
  const engine = useEngine();
  const models = engine.models.list();
  const def = engine.models.get(state.modelId);

  return (
    <div className={className}>
      <label className="field">
        <span className="field-label">Model</span>
        <select
          value={state.modelId}
          onChange={(e) => setModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      {def?.description && <p className="hint">{def.description}</p>}

      {def && def.params
        .filter((p) => !p.hidden)
        .map((p) => (
          <ParamField
            key={p.key}
            def={p}
            value={state.params[p.key] ?? p.default}
            onChange={(v) => setModelParam(p.key, v)}
          />
        ))}
    </div>
  );
}
