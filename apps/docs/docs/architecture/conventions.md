# Conventions

How the workspace is built, type-checked, tested, and linted.

## Toolchain

- **pnpm 9** workspaces — required. Activate via
  `corepack enable && corepack prepare pnpm@9 --activate`.
- **TurboRepo 2** — drives `build`, `test`, `lint`, `typecheck`, `dev`
  across the workspace with caching and `^build` dependency ordering.
- **TypeScript 5.7** with composite project references.
- **Vitest 2** for tests, **Vite 6** for `apps/demo-web`, **ESLint 9**
  flat config across the workspace.

## Scripts (root)

```bash
pnpm install
pnpm dev          # start apps/demo-web Vite dev server
pnpm build       # turbo build — demo-web + docs bundles
pnpm test        # turbo test — vitest in @catshark/core (21 cases)
pnpm typecheck   # tsc -b across the composite package graph
pnpm lint        # eslint flat config across the whole workspace
```

Per-package scripts exist only where they add something turbo doesn't:

- `packages/core` has `test` / `test:watch` (vitest).
- `apps/demo-web` has `dev` Vite + `preview`.
- `apps/docs` has the Docusaurus commands (`dev`, `build`, `clear`,
  `serve`).

## `pnpm-workspace.yaml`

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

## TypeScript references

Each package's `tsconfig.json` `extends` from `packages/tsconfig-base` and
declares `references` to its dependencies:

```
packages/core         ← base
packages/react        ← react base + core
packages/renderer-2d  ← base + core
packages/renderer-3d  ← base + core
packages/client       ← base + core
apps/demo-web         ← react base + core + react + renderer-2d + client
apps/docs             ← @docusaurus/tsconfig (standalone)
```

The root `tsconfig.json` references every lib package so a single
`tsc -b tsconfig.json` builds the whole graph in dependency order with
incremental caching.

### Shared configs

- `packages/tsconfig-base/base.json` — strict mode, `moduleResolution:
  bundler`, `verbatimModuleSyntax`, `isolatedModules`, `composite`.
- `packages/tsconfig-base/react.json` — `base.json` + `jsx: react-jsx`
  + `lib: DOM`.

## Testing

- **`@catshark/core`** — Vitest in `environment: 'node'`. Pure reducer
  and registry tests. No jsdom, no React Testing Library. 21 cases.
- Future React-provider tests (none yet) belong in `@catshark/react` with
  `environment: 'jsdom'` and `@testing-library/react`.
- Renderer-2d integration tests (none yet) belong in `@catshark/renderer-2d`
  with `environment: 'jsdom'` + a mocked `maplibregl.Map` to avoid
  instantiating WebGL in CI.

The CI workflow (`.github/workflows/ci.yml`) uses pnpm + turbo and runs
`lint → typecheck → test → build`, then uploads `apps/demo-web/dist` as
an artifact.

## ESLint

Root flat config (`eslint.config.js`):

- One config block for all `.ts` / `.tsx` files: `@eslint/js`
  recommended + `typescript-eslint` recommended.
- A second block scoped to React files adds
  `eslint-plugin-react-hooks` (`recommended-latest`) and
  `eslint-plugin-react-refresh` (`vite` config).
- `no-unused-vars` configured to ignore `_`-prefixed names (constructor
  params, intentionally-ignored args).

`.gitignore` covers `dist/`, `build/`, `.docusaurus/`, `.turbo/`,
`*.tsbuildinfo`, `node_modules/`.

## Package-scoped dependencies

- A package may only `dependencies` / `peerDependencies` what it actually
  imports. Enforced by review; the lockfile reflects this.
- Cross-package references use `workspace:*` so pnpm symlinks them.
- React is a `peerDependency` of `@catshark/react`; consumers
  (`apps/demo-web`) provide a concrete version.
- `@catshark/renderer-2d` depends on `maplibre-gl`, `terra-draw`, and
  `terra-draw-maplibre-gl-adapter`. `@catshark/react` does **not** —
  you can swap renderers without changing the React package's deps.

## Naming

- Public packages are scoped `@catshark/*`.
- Apps are private (`"private": true`), unscoped
  (`@catshark/demo-web`, `@catshark/docs`).
- Source roots are `src/`. Tests sit next to the package they cover
  (`packages/core/__tests__/`).

## What never changes

- The engine's public state shape (`EngineState`) and the `Renderer`
  port interface are the two contracts everything else hangs off.
- `@catshark/core` imports nothing from React, maplibre, terra-draw, or
  the network. If a future change needs any of those, the change belongs
  in another package — not in `core`.