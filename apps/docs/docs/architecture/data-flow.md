# Data flow

This page traces a complete user cycle through the engine: **draw a
feature → edit it in the side panel → run a model against it**. Each step
shows which package calls which API and in which direction data flows.

The demo at `apps/demo-web` reproduces this exact sequence end-to-end.

## 1. User clicks "Polygon" in the toolbar

```
DrawToolbar.tsx                     (apps/demo-web)
  └─ useDraw().startDrawing('polygon')
       └─ engine.startDrawing('polygon')
            └─ engine.dispatchDraw({ type: 'SET_DRAW_MODE', payload: 'polygon' })
                 ├─ drawReducer() returns new DrawState
                 └─ engine.patch({ draw }) → engine.emit()
                      ├─ <DrawToolbar> re-renders (toolbar button highlight flips)
                      └─ TerraDraw2DRenderer (subscribed) receives emit,
                         reads engine.getSnapshot().draw.drawMode === 'polygon',
                         calls draw.setMode('polygon')
```

Direction: **app → react → core → (subscribe) → renderer-2d**. The
renderer reads the new state; no one called `draw.setMode` directly.

## 2. User draws a polygon on the map

TerraDraw fires `finish` when the polygon is closed:

```
TerraDraw2DRenderer.draw.on('finish', id)        (renderer-2d)
  ├─ draw.getSnapshotFeature(id) → GeoJSON feature
  ├─ engine.getSnapshot().draw.features.find(f => f.id === id)  → undefined (new)
  └─ engine.dispatchDraw({
       type: 'ADD_FEATURE',
       payload: {
         id: String(id),
         geometryKind: geometryKindForMode(engine.getSnapshot().draw.drawMode),
         category: '', label: '', visible: true,
         geojson: feature,
       },
     })
       ├─ engine patches state, emits
       │   ├─ <DataSection> re-renders with the new feature in the list
       │   └─ <DrawToolbar> sees the engine's own SET_DRAW_MODE('select')
       │      dispatched right after ADD_FEATURE (toolbar flips back)
       └─ (the renderer is **not** asked to add the feature again —
            it's already on the canvas; it authored the event)
```

Direction: **renderer-2d → core → react (subscribers)**.

## 3. User edits the category field in the side panel

```
DataSection.tsx → FeatureCard  (apps/demo-web)
  └─ onChange → useDraw().dispatch({
        type: 'UPDATE_FEATURE',
        payload: { id, updates: { category: 'river' } }
      })
       └─ engine.dispatchDraw(...) → reducer maps over features, patches,
          emits.
            ├─ <DataSection> re-renders with new category text
            └─ renderer is subscribed but takes no action — it doesn't
               render the category, so the snapshot diff is a no-op for it.
```

Direction: **app → react → core → react (subscribers)**. Renderer not
involved.

## 4. User toggles visibility (delete-from-canvas but keep-in-state)

```
DataSection.tsx → FeatureCard
  └─ useDraw().toggleVisibility(id)
       └─ engine.toggleVisibility(id)            (core)
            ├─ find feature by id, flip visible flag
            ├─ engine.dispatchDraw({ type: 'UPDATE_FEATURE', ... visible })
            │   └─ <DataSection> re-renders; eye icon flips
            └─ engine.mapActions.setFeatureVisibility(id, false, geojson)
                 └─ TerraDraw2DRenderer's bridge:
                    draw.removeFeatures([id])   (canvas only — engine state
                                                still holds the feature)
```

This is the imperative escape hatch. The **engine** already updated its
state (the feature is still in `state.draw.features` with
`visible: false`), and the engine asks the renderer to mirror that on the
canvas. If no renderer is attached, the call is skipped — headless mode
just updates state.

Direction: **app → react → core → renderer-2d (via DrawMapActions)**.

## 5. User clicks "Run model"

```
ModelPanel.tsx                        (apps/demo-web)
  └─ useModel().run(drawState.features)
       └─ runModel(engine, features)               (core)
            ├─ def = getModel(engine.getSnapshot().model.modelId)   → helloWorldModel
            ├─ engine.dispatchModel({ type: 'RUN_START' })
            │   └─ <ModelPanel> re-renders; button shows "Running…" and disables
            ├─ def.run({ params: engine.getSnapshot().model.params, features })
            │     └─ helloWorldModel.run logs params + featureCount to console
            └─ engine.dispatchModel({ type: 'RUN_FINISH' })
                └─ <ModelPanel> re-renders; button re-enables,
                   "Last run at HH:MM:SS" appears
```

Direction: **app → react → core (model registry + dispatchModel)**. The
model itself receives only `{ params, features }` — no React, no
maplibre, no DOM. The model is the analysis plugin the guide describes.

## Reconstructing visibility after a remount

If the `<Canvas>` is re-mounted (Strict Mode, navigation, hot reload), the
renderer's `mount` reads the **engine's** state — `state.draw.features`
still contains every feature ever drawn (the engine never lost them) — and
re-adds the visible ones to TerraDraw via `draw.addFeatures`. Hidden
features stay in engine state but are not re-added to the canvas. This is
why storage is data, not drawing instructions: the canvas is reproducible
from state alone.

## Where state lives at every step

| Step | Mutator | Where state changes | Who reads the change |
| --- | --- | --- | --- |
| 1. Click "Polygon" | `engine.dispatchDraw` | `core` `_state.draw.drawMode` | toolbar + renderer |
| 2. Draw polygon | `engine.dispatchDraw` (from renderer) | `core` `_state.draw.features` | side panel + toolbar |
| 3. Edit category | `engine.dispatchDraw` (from app) | `core` `_state.draw.features[i].category` | side panel |
| 4. Toggle visibility | `engine.dispatchDraw` + `engine.mapActions` | `core` state + canvas | side panel + canvas |
| 5. Run model | `engine.dispatchModel` + `def.run` | `core` `_state.model` | model panel |

The engine is the **only** writer. React reads via `useSyncExternalStore`;
the renderer reads via `engine.subscribe`. Both are notifications ("state
changed — pull a new snapshot"), never state mutations.