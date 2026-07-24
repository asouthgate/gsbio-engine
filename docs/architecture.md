# Architecture

```
GsbioEngineProvider
  EngineProvider
    SimulationEngine
      ModelRegistry
      DataStore
      Executor pipeline
    TerraDraw2DRenderer
      MapManager
      Modes
```

## Provider
A React component that creates (or accepts) an engine and puts it in context.

## Engine
Orchestrates model registration, feature management, and run execution.

## Renderer
Draws map features and result layers on a maplibre-gl canvas via terra-draw.

## Models
Each model is a schema (id, name, params) plus a registered executor.

## Executors
Implement `preprocess` (filter/validate features) and `submit` (run computation).

## Data sources
Drawn features and uploaded geo files, surfaced through the engine's data store.

## Envelope
Union with `kind: 'image' | 'geojson' | 'tiles'`. Carries a result
from executor to renderer with the payload needed to place it on the map.