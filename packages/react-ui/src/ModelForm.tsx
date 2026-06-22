import { useModel } from '@catshark/react';
import { getModel, listModels, type ModelParamDef } from '@catshark/core';

function ParamField({ def, value, onChange }: { def: ModelParamDef; value: number; onChange: (v: number) => void }) {
  if (def.type === 'range') {
    return (
      <label className="field">
        <span className="field-label">{def.label}</span>
        <div className="range-field">
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step}
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="range-value">{value}</span>
        </div>
      </label>
    );
  }
  return (
    <label className="field">
      <span className="field-label">{def.label}</span>
      <input
        type="number"
        min={def.min}
        max={def.max}
        step={def.step ?? 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export interface ModelFormProps {
  className?: string;
}

export function ModelForm({ className = 'panel-section' }: ModelFormProps) {
  const { state, dispatch } = useModel();
  const models = listModels();
  const def = getModel(state.modelId);

  return (
    <div className={className}>
      <label className="field">
        <span className="field-label">Model</span>
        <select
          value={state.modelId}
          onChange={(e) => dispatch({ type: 'SET_MODEL', payload: e.target.value })}
        >
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>
      </label>

      {def?.description && <p className="hint">{def.description}</p>}

      {def && def.params.map((p) => (
        <ParamField
          key={p.key}
          def={p}
          value={state.params[p.key] ?? p.default}
          onChange={(v) => dispatch({ type: 'SET_PARAM', payload: { key: p.key, value: v } })}
        />
      ))}
    </div>
  );
}