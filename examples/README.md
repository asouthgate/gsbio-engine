# gsbio Engine docs

## Quick start

Requires Node 22+ and pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`).

```bash
pnpm install
pnpm dev          # start the demo-web Vite dev server
pnpm test         # vitest, via turbo
pnpm typecheck    # `tsc -b` across the composite package graph
pnpm lint         # eslint across the workspace
pnpm build        # build examples via turbo
```s