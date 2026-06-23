import type { DrawMode, DrawnFeature, GeometryKind } from '../types';

export interface DrawState {
  features: DrawnFeature[];
  selectedFeatureId: string | null;
  drawMode: DrawMode;
  /**
   * Category to seed onto the next drawn feature (set by the active tool's
   * label, so two tools sharing a mode — "Roost" vs "Light Source" — produce
   * features with different categories). Cleared whenever `select` is active.
   */
  pendingCategory: string | null;
}

export type DrawAction =
  | { type: 'ADD_FEATURE'; payload: DrawnFeature }
  | { type: 'REMOVE_FEATURE'; payload: string }
  | { type: 'UPDATE_FEATURE'; payload: { id: string; updates: Partial<DrawnFeature> } }
  | { type: 'SELECT_FEATURE'; payload: string | null }
  | { type: 'START_DRAWING'; payload: { mode: DrawMode; category: string } }
  | { type: 'SET_DRAW_MODE'; payload: DrawMode }
  | { type: 'CLEAR_ALL' };

export const initialDrawState: DrawState = {
  features: [],
  selectedFeatureId: null,
  drawMode: 'select',
  pendingCategory: null,
};

export function drawReducer(state: DrawState, action: DrawAction): DrawState {
  switch (action.type) {
    case 'ADD_FEATURE':
      return { ...state, features: [...state.features, action.payload] };
    case 'REMOVE_FEATURE':
      return {
        ...state,
        features: state.features.filter((f) => f.id !== action.payload),
        selectedFeatureId: state.selectedFeatureId === action.payload ? null : state.selectedFeatureId,
      };
    case 'UPDATE_FEATURE':
      return {
        ...state,
        features: state.features.map((f) =>
          f.id === action.payload.id ? { ...f, ...action.payload.updates } : f,
        ),
      };
    case 'SELECT_FEATURE':
      return { ...state, selectedFeatureId: action.payload };
    case 'START_DRAWING':
      return {
        ...state,
        drawMode: action.payload.mode,
        pendingCategory: action.payload.category,
      };
    case 'SET_DRAW_MODE':
      // Switching the mode (incl. back to `select` after a finish) clears the
      // pending category — a new draw must come from a fresh tool click.
      return { ...state, drawMode: action.payload, pendingCategory: null };
    case 'CLEAR_ALL':
      return { ...initialDrawState };
    default:
      return state;
  }
}

/** Map a logical draw mode to a geometry kind. `select` defaults to `point`. */
export function geometryKindForMode(mode: DrawMode): GeometryKind {
  switch (mode) {
    case 'point': return 'point';
    case 'linestring': return 'linestring';
    case 'polygon': return 'polygon';
    case 'circle': return 'circle';
    default: return 'point';
  }
}

/**
 * Filter drawn features by category — enables "retrieve all roosts" /
 * "retrieve all light sources" queries after labelled-drawing.
 */
export function featuresByCategory(
  features: ReadonlyArray<DrawnFeature>,
  category: string,
): DrawnFeature[] {
  return features.filter((f) => f.category === category);
}