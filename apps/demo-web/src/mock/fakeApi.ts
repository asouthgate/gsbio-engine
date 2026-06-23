/**
 * Mock API server — a Vite dev-server middleware plugin.
 *
 * Provides the network-transport surface that the `corridorConnect`
 * executor's `submit` glue talks to — without requiring the dev to run a
 * separate backend process. `pnpm dev` spins it up on the same port as
 * Vite (5180); no orchestrator changes, no new runtime deps.
 *
 * Endpoints:
 *
 *   POST /api/corridors/run
 *     body: { patches: PatchPoint[], params: Record<string, number> }
 *     returns { runId }
 *   GET /api/corridors/run/:id
 *     returns { status: 'pending'|'completed'|'cancelled',
 *               progress: 0..1,
 *               result?: CorridorFeature[],
 *               tilesUrl?: string }
 *   POST /api/corridors/run/:id/cancel
 *     best-effort; status becomes 'cancelled'
 *   GET /tiles/corridors/:runId/:z/:x/:y.png
 *     procedural XYZ raster tile (256×256 RGBA PNG, ~80-line inline
 *     encoder + per-tile shading of the run's corridors)
 *
 * The "compute" is deliberately trivial (`buildCorridors` from
 * `../models/corridorConnect/corridors.ts` runs synchronously on POST);
 * the simulated multi-second latency between progress ticks exercises the
 * poll-and-progress loop without doing meaningful work. Replace this server
 * with a real backend and the executor's contract stays the same.
 */

import type { Plugin } from 'vite';
import { deflateSync } from 'node:zlib';
import {
  buildCorridors,
  pointSegDist,
  type CorridorFeature,
  type PatchPoint,
} from '../models/corridorConnect/corridors';

interface RunState {
  status: 'pending' | 'completed' | 'cancelled';
  progress: number;
  result: CorridorFeature[] | null;
  tilesUrl: string | null;
  startedAt: number;
  completedAt: number | null;
  durationMs: number;
  corridors: CorridorFeature[];
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
      cur.completedAt = Date.now();
      return;
    }
    setTimeout(tick, PROGRESS_TICK_MS);
  };
  setTimeout(tick, PROGRESS_TICK_MS);
}

async function readBody(req: import('http').IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) {
    chunks.push(c as Buffer);
  }
  return Buffer.concat(chunks).toString('utf-8');
}

function json(res: import('http').ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

/* ------------------------------- PNG encoder ----------------------------- */
// Tiny standalone RGBA PNG encoder. zlib provides deflate (built into Node).
// CRC32 is hand-rolled because the baby bite doesn't deserve a dep.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n >>> 0;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) >>> 0 : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff >>> 0;
  for (let i = 0; i < buf.length; i++) c = (CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)) >>> 0;
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgba: Buffer): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter = none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const idat = deflateSync(raw);
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ----------------------- XYZ tile procedural shading --------------------- */

interface TileBounds {
  wLng: number;
  eLng: number;
  nLat: number;
  sLat: number;
}

function tileBounds(z: number, x: number, y: number): TileBounds {
  const n = 2 ** z;
  const wLng = (x / n) * 360 - 180;
  const eLng = ((x + 1) / n) * 360 - 180;
  const nLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const sLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return { wLng, eLng, nLat, sLat };
}

const TILE_SIZE = 256;
const BLOCK = 8; // sample BLOCK×BLOCK blocks of pixels per tile (chunks rendering)
const STEP = TILE_SIZE / BLOCK;
const CORRIDOR_THRESHOLD_DEG = 0.01; // ~1km — pixels inside 1km of a corridor → orange

function shadeTile(corridors: CorridorFeature[], z: number, x: number, y: number): Buffer {
  const { wLng, eLng, nLat, sLat } = tileBounds(z, x, y);
  const pixels = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
  // Pre-extract corridor segments as flat arrays for cheap iteration.
  const segs: number[][] = [];
  for (const f of corridors) {
    if (f.geometry.type !== 'LineString') continue;
    const coords = f.geometry.coordinates as number[][];
    for (let i = 0; i < coords.length - 1; i++) {
      segs.push([coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]]);
    }
  }
  for (let by = 0; by < BLOCK; by++) {
    for (let bx = 0; bx < BLOCK; bx++) {
      const lon = wLng + ((bx + 0.5) / BLOCK) * (eLng - wLng);
      const lat = nLat + ((by + 0.5) / BLOCK) * (sLat - nLat);
      let best = Infinity;
      for (const s of segs) {
        const d = pointSegDist(lon, lat, s[0], s[1], s[2], s[3]);
        if (d < best) best = d;
      }
      const inside = best < CORRIDOR_THRESHOLD_DEG;
      const baseRow = by * STEP;
      const baseCol = bx * STEP;
      const r = inside ? 255 : 0;
      const g = inside ? 136 : 0;
      const b = inside ? 0 : 0;
      const a = inside ? 200 : 0;
      for (let dy = 0; dy < STEP; dy++) {
        for (let dx = 0; dx < STEP; dx++) {
          const idx = ((baseRow + dy) * TILE_SIZE + (baseCol + dx)) * 4;
          pixels[idx + 0] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }
      }
    }
  }
  return encodePng(TILE_SIZE, TILE_SIZE, pixels);
}

/* ------------------------------- Routing ------------------------------- */

function matchRunRoute(url: string): { kind: 'create' } | { kind: 'poll'; id: string } | { kind: 'cancel'; id: string } | null {
  const u = new URL(url, 'http://localhost');
  if (u.pathname === '/api/corridors/run') return { kind: 'create' };
  const poll = u.pathname.match(/^\/api\/corridors\/run\/([^/]+)$/);
  if (poll) return { kind: 'poll', id: poll[1] };
  const cancel = u.pathname.match(/^\/api\/corridors\/run\/([^/]+)\/cancel$/);
  if (cancel) return { kind: 'cancel', id: cancel[1] };
  return null;
}

function matchTileRoute(url: string): { runId: string; z: number; x: number; y: number } | null {
  const u = new URL(url, 'http://localhost');
  const m = u.pathname.match(/^\/tiles\/corridors\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!m) return null;
  return { runId: m[1], z: parseInt(m[2], 10), x: parseInt(m[3], 10), y: parseInt(m[4], 10) };
}

export function fakeApiServerPlugin(): Plugin {
  return {
    name: 'gsbio-fake-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        try {
          const tile = matchTileRoute(url);
          if (tile) {
            const r = runs.get(tile.runId);
            if (!r || !r.corridors.length) {
              res.statusCode = 404;
              res.end();
              return;
            }
            const png = shadeTile(r.corridors, tile.z, tile.x, tile.y);
            res.statusCode = 200;
            res.setHeader('Content-Type', 'image/png');
            res.end(png);
            return;
          }
          const route = matchRunRoute(url);
          if (route) {
            if (route.kind === 'create') {
              if (req.method !== 'POST') {
                json(res, 405, { error: 'method not allowed' });
                return;
              }
              const body = await readBody(req);
              const data = JSON.parse(body || '{}') as { patches?: PatchPoint[] };
              const patches = (data.patches ?? []).filter(
                (p): p is PatchPoint => typeof p.lng === 'number' && typeof p.lat === 'number' && typeof p.id === 'string',
              );
              const corridors = buildCorridors(patches);
              const id = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              const baseUrl = `/tiles/corridors/${id}/{z}/{x}/{y}.png`;
              runs.set(id, {
                status: 'pending',
                progress: 0,
                result: corridors,
                tilesUrl: baseUrl,
                startedAt: Date.now(),
                completedAt: null,
                durationMs: RUN_DURATION_MS,
                corridors,
              });
              scheduleRun(id);
              json(res, 200, { runId: id });
              return;
            }
            if (route.kind === 'cancel') {
              if (req.method !== 'POST') {
                json(res, 405, { error: 'method not allowed' });
                return;
              }
              const r = runs.get(route.id);
              if (!r) {
                json(res, 404, { error: 'unknown run' });
                return;
              }
              r.status = 'cancelled';
              json(res, 200, { ok: true });
              return;
            }
            // poll
            if (req.method !== 'GET') {
              json(res, 405, { error: 'method not allowed' });
              return;
            }
            const r = runs.get(route.id);
            if (!r) {
              json(res, 404, { error: 'unknown run' });
              return;
            }
            if (r.status === 'completed') {
              json(res, 200, {
                status: 'completed',
                progress: 1,
                result: r.result,
                tilesUrl: r.tilesUrl,
              });
            } else if (r.status === 'cancelled') {
              json(res, 200, { status: 'cancelled', progress: r.progress });
            } else {
              json(res, 200, { status: 'pending', progress: r.progress });
            }
            return;
          }
        } catch (err) {
          json(res, 500, { error: (err as Error).message });
          return;
        }
        next();
      });
    },
  };
}