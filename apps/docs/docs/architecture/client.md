# `@catshark/client`

Network and storage providers. Per the headless-engine contract, the engine
owns data-source **registration** (`registerDataSource` in
`@catshark/core`); `@catshark/client` owns the **fetching** — tile sources,
uploaded GeoJSON / CSV, model outputs.

React components never import from `@catshark/client`. Apps and bootstrap
code wire providers here into the engine.

## What's here today

### `OSM_RASTER_STYLE`

[`packages/client/src/index.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/client/src/index.ts)

A bare MapLibre raster style spec pointing at the OpenStreetMap tile
server. This was previously baked inline into `MapView.tsx`; pulling it
into `@catshark/client` makes the URL / attribution / tile size a
swappable concern:

```ts
import { OSM_RASTER_STYLE } from '@catshark/client';
import { createTerraDraw2DRenderer } from '@catshark/renderer-2d';

const renderer = createTerraDraw2DRenderer({
  style: OSM_RASTER_STYLE,
  center: [-3.6, 50.604],
  zoom: 13,
});
```

The struct satisfies MapLibre's `StyleSpecification`. A production
deployment would add their own style here (vector tiles, a self-hosted
tile server, satellite imagery, etc.) without touching any other package.

### `registerUploadedDataSource`

Builds a `DataSourceDef` with `kind: 'upload'`:

```ts
interface RegisterUploadOptions {
  id: string;
  name: string;
  featureIds: string[];
}

function registerUploadedDataSource(opts: RegisterUploadOptions): DataSourceDef;
```

A real parser (CSV → GeoJSON, Shapefile → GeoJSON, binary raster → tile
pyramid) lands here in a later iteration. The current shape exists so
downstream code can already be written against the contract:

```ts
import { registerDataSource } from '@catshark/core';
import { registerUploadedDataSource } from '@catshark/client';

const def = registerUploadedDataSource({
  id: 'csv-1',
  name: 'Field survey CSV',
  featureIds: parsedFeatureIds,
});
registerDataSource(def);
```

## What's coming

- A `TileProvider` abstraction — raster XYZ, vector tiles (MVT), WMTS —
  returning a `StyleSpecification` fragment the renderer consumes.
- An `UploadProvider` async pipeline — `File` → parsed features → feature
  ids → `registerDataSource`.
- A `ModelOutputProvider` — fetches simulation results from a remote
  service and feeds them back as engine state (model run results).

## Why this is a package, not in `core`

If `core` imported `fetch`, it would no longer be usable in pure-Node
contexts that don't have a network (or that require a custom HTTP agent).
Keeping the engine headless means it has **no URL strings, no API keys,
no parsers** anywhere in its source tree. The engine only knows about
the registry; the registry knows about ids and `DataSourceDef` shapes;
the providers in this package know how to populate them.

## Boundary rule

`@catshark/client` may import from `@catshark/core`. Nothing the other way
around. There is no `import { fetchTiles } from '@catshark/client'` inside
`packages/core/src/`.