# Architecture

## Why a headless engine?

The engine acts as the **Single Source of Truth** — it manages the data model regardless of whether that data is currently being rendered on a screen, exported to a report, or sent to a worker thread.

In a professional-grade architecture:

- **Data / Map Layers** — the engine holds the registry of layers. Whether these are GeoJSON, raster tiles, or vector layers, the View simply asks the engine: *"Give me the visible layers for this viewport."*
- **Shapes / Drawings** — these are stored as Geometric Models (Data), not as drawing instructions (View). Stored as data, you can run analysis on them later (e.g. *"calculate the area of this polygon"*) without needing the canvas.
- **Analysis Models** — these are the plugins that *"subscribe"* to the data. They don't know the canvas exists; they just receive an input (e.g. "Feature Collection") and output a result (e.g. "Simulation Report").

## Decoupling strategy

| Layer | Responsibility | Package |
| --- | --- | --- |
| Data Source / Storage | Managing raw GIS / Map data, spatial indexing, feature attributes. | `@catshark/core` + `@catshark/client` |
| Analysis Plugin | Taking inputs, performing math, returning results (Model-based). | `@catshark/core` (`ModelDef`) |
| Engine Core | Coordinating events, providing the Projection service, state management. | `@catshark/core` (`SimulationEngine`) |
| View (React / Canvas) | Listening for `data-changed` events and painting the result on the screen. | `@catshark/react` + `.renderer-2d` |

The one bridge is the **Coordinate / Projection System**: data is stored in `Longitude/Latitude`, the View translates those coordinates into `[x, y]` pixels. `@catshark/core`'s `CoordinateService` exposes projection functions both sides share.

## Network handling

The engine — via its providers (`@catshark/client`) — handles fetching of map tiles, vector data, and model outputs. React components have **zero** knowledge of URLs, API keys, or binary data parsing: they ask the engine for the "Map State" and "Simulation State" and render.