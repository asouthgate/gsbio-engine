/**
 * Mock API server. A Vite dev-server middleware plugin.
 *
 * Provides the network-transport surface that the `radialSpreadApi`
 * executor's `submit` glue talks to without requiring a separate backend
 * process. `npm run dev` spins it up on the same port as Vite (5180).
 *
 * Endpoints:
 *
 *   POST /api/spread/run
 *     body: { zones: { id, center, radiusMeters }[] }
 *     returns { runId }
 *   GET /api/spread/run/:id
 *     returns { status: 'pending'|'completed'|'cancelled', progress: 0..1 }
 *   POST /api/spread/run/:id/cancel
 *     status becomes 'cancelled'
 *
 * The "compute" happens client-side (same renderRadialRaster as the WASM
 * archetype). This server only simulates network latency so the executor's
 * poll-and-progress loop has something to exercise. Replace with a real
 * backend API and the executor interface stays the same.
 */

import type { Plugin } from 'vite';

interface RunState {
  status: 'pending' | 'completed' | 'cancelled';
  progress: number;
  startedAt: number;
  durationMs: number;
}

const RUN_DURATION_MS = 3000;
const PROGRESS_TICK_MS = 250;

const runs = new Map<string, RunState>();

function scheduleRun(runId: string): void {
  const r = runs.get(runId);
  if (!r) return;
  const start = r.startedAt;
  const tick = () => {
    const cur = runs.get(runId);
    if (!cur || cur.status !== 'pending') return;
    const elapsed = Date.now() - start;
    cur.progress = Math.min(1, elapsed / cur.durationMs);
    if (elapsed >= cur.durationMs) {
      cur.status = 'completed';
      cur.progress = 1;
      return;
    }
    setTimeout(tick, PROGRESS_TICK_MS);
  };
  setTimeout(tick, PROGRESS_TICK_MS);
}

async function readBody(req: import('http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString('utf-8');
}

function json(res: import('http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function matchRoute(url: string): { kind: 'create' } | { kind: 'poll'; id: string } | { kind: 'cancel'; id: string } | null {
  const u = new URL(url, 'http://localhost');
  if (u.pathname === '/api/spread/run') return { kind: 'create' };
  const poll = u.pathname.match(/^\/api\/spread\/run\/([^/]+)$/);
  if (poll) return { kind: 'poll', id: poll[1] };
  const cancel = u.pathname.match(/^\/api\/spread\/run\/([^/]+)\/cancel$/);
  if (cancel) return { kind: 'cancel', id: cancel[1] };
  return null;
}

export function fakeApiServerPlugin(): Plugin {
  return {
    name: 'gsbio-fake-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        const route = matchRoute(url);
        if (!route) { next(); return; }

        try {
          if (route.kind === 'create') {
            if (req.method !== 'POST') { json(res, 405, { error: 'method not allowed' }); return; }
            await readBody(req);
            const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            runs.set(id, {
              status: 'pending',
              progress: 0,
              startedAt: Date.now(),
              durationMs: RUN_DURATION_MS,
            });
            scheduleRun(id);
            json(res, 200, { runId: id });
            return;
          }
          if (route.kind === 'cancel') {
            if (req.method !== 'POST') { json(res, 405, { error: 'method not allowed' }); return; }
            const r = runs.get(route.id);
            if (!r) { json(res, 404, { error: 'unknown run' }); return; }
            r.status = 'cancelled';
            json(res, 200, { ok: true });
            return;
          }
          if (req.method !== 'GET') { json(res, 405, { error: 'method not allowed' }); return; }
          const r = runs.get(route.id);
          if (!r) { json(res, 404, { error: 'unknown run' }); return; }
          json(res, 200, { status: r.status, progress: r.progress });
        } catch (err) {
          json(res, 500, { error: (err as Error).message });
        }
      });
    },
  };
}
