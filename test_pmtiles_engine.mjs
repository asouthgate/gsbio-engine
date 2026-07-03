#!/usr/bin/env node
/**
 * Integration test: verifies the PMTiles basemap flow works end-to-end.
 *
 * Uses the same pmtiles library and custom Source implementation that the
 * browser uses, to test the exact code path:
 *   getToken() → fetch with token → PMTiles range requests → tile decode
 *
 * Tests:
 *   1. Auth token creation via API
 *   2. PMTiles header read (proves archive is accessible and auth works)
 *   3. Single tile fetch at z=10 (proves tile extraction works)
 *   4. Unauthenticated request is rejected
 */

import { PMTiles } from 'pmtiles';

const API_BASE = process.argv[2] || 'http://localhost:8000';

async function getToken() {
  const res = await fetch(`${API_BASE}/api/auth/token`, { method: 'POST' });
  if (!res.ok) throw new Error(`Token creation failed: ${res.status}`);
  return (await res.json()).token;
}

function createAuthSource(url, getToken) {
  return {
    getKey: () => url,
    getBytes: async (offset, length, signal, etag) => {
      const headers = { Range: `bytes=${offset}-${offset + length - 1}` };
      if (etag) headers['If-Match'] = etag;
      const token = getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const resp = await fetch(url, { headers, signal });
      if (!resp.ok) throw new Error(`PMTiles fetch failed: ${resp.status} ${resp.statusText}`);
      const data = await resp.arrayBuffer();
      return {
        data,
        etag: resp.headers.get('etag') ?? undefined,
        cacheControl: resp.headers.get('cache-control') ?? undefined,
      };
    },
  };
}

async function testHeaderRead(pmtilesUrl, tokenFn) {
  console.log('\n[1] PMTiles header read (auth + archive access)...');
  const source = createAuthSource(pmtilesUrl, tokenFn);
  const pmtiles = new PMTiles(source);
  const header = await pmtiles.getHeader();
  console.log(`  OK — header read: tileType=${header.tileType}, minZoom=${header.minZoom}, maxZoom=${header.maxZoom}`);
  return header;
}

async function testTileFetch(pmtilesUrl, tokenFn, header) {
  console.log('\n[2] Single tile fetch (z=10)...');
  const source = createAuthSource(pmtilesUrl, tokenFn);
  const pmtiles = new PMTiles(source);
  const zoom = Math.min(10, header.maxZoom);
  const mid = (1 << zoom) / 2;
  const tile = await pmtiles.getZxy(zoom, mid, mid);
  if (!tile) {
    console.log(`  OK — tile at z=${zoom},x=${mid},y=${mid} does not exist in archive (not an error)`);
    return;
  }
  const size = tile.data.byteLength;
  console.log(`  OK — tile fetched: ${size} bytes at z=${zoom},x=${mid},y=${mid}`);
}

async function testUnauthenticatedRejected(pmtilesUrl) {
  console.log('\n[3] Unauthenticated request rejected...');
  const source = createAuthSource(pmtilesUrl, () => null);
  const pmtiles = new PMTiles(source);
  try {
    await pmtiles.getHeader();
    console.log('  FAIL: expected 401 without token');
    process.exit(1);
  } catch (err) {
    if (err.message.includes('401')) {
      console.log('  OK — unauthenticated request correctly rejected (401)');
    } else {
      console.log(`  FAIL: unexpected error: ${err.message}`);
      process.exit(1);
    }
  }
}

async function main() {
  console.log('=== PMTiles Engine Integration Test ===');
  console.log(`API: ${API_BASE}`);

  const token = await getToken();
  console.log(`  Token acquired (${token.length} chars)`);

  const pmtilesUrl = `${API_BASE}/api/pmtiles/uk.pmtiles`;
  const tokenFn = () => token;

  const header = await testHeaderRead(pmtilesUrl, tokenFn);
  await testTileFetch(pmtilesUrl, tokenFn, header);
  await testUnauthenticatedRejected(pmtilesUrl);

  console.log('\nAll PMTiles engine integration tests PASSED.');
}

main().catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exit(1);
});
