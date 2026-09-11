/**
 * The OS tile source, against a stub standing in for api.os.uk.
 *
 * The stub is the spike's own — it serves real Mapbox Vector Tile bytes over
 * the same URL shapes OS uses, so the decode path is exercised rather than
 * mocked away. What it cannot prove is that Ordnance Survey behaves the way
 * the stub does; the live path has never been run against a real key here.
 *
 * The assertion that earns its place is the ROW/COLUMN order. OGC API – Tiles
 * is {tileMatrix}/{tileRow}/{tileCol} while the browser-side map speaks
 * {z}/{x}/{y}, so getting it backwards produces a map that looks plausible and
 * is transposed — the kind of bug that survives a visual check.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clearTileCache,
  fetchOsGrid,
  osVectorTileSource
} from '../../app/lib/pdf-report/os-tiles.mjs'
import { SYNTHETIC_GRID, resolveBasemap } from '../../app/lib/pdf-report/basemap.mjs'
import { stubOsFetch } from './stub-upstream.mjs'

const KEY = 'test-key'

test('the tile grid is read from OS rather than hard-coded', async () => {
  clearTileCache()
  const stub = stubOsFetch(SYNTHETIC_GRID)

  const grid = await fetchOsGrid(KEY, { fetchImpl: stub.fetch })

  assert.equal(grid.tileSize, SYNTHETIC_GRID.tileSize)
  assert.equal(grid.originX, SYNTHETIC_GRID.originX)
  assert.deepEqual(grid.resolutions, SYNTHETIC_GRID.resolutions)
  assert.ok(
    stub.calls.some((call) => call.includes('/tilematrixsets/27700')),
    'expected the tile matrix set to be requested'
  )
})

test('a tile is requested as row-then-column, and carries the key', async () => {
  clearTileCache()
  const stub = stubOsFetch(SYNTHETIC_GRID, { expectKey: KEY })
  const source = osVectorTileSource(KEY, { fetchImpl: stub.fetch })

  const tile = await source(SYNTHETIC_GRID, 9, 17, 42)

  assert.ok(tile.layers, 'expected decoded vector tile layers')
  const [call] = stub.calls
  // z / row / col — 9/42/17, NOT 9/17/42.
  assert.match(call, /\/tiles\/27700\/9\/42\/17\?/)
  assert.match(call, /key=test-key/)
})

test('a tile is fetched once and then served from the cache', async () => {
  clearTileCache()
  const stub = stubOsFetch(SYNTHETIC_GRID)
  const source = osVectorTileSource(KEY, { fetchImpl: stub.fetch })

  await source(SYNTHETIC_GRID, 9, 1, 1)
  await source(SYNTHETIC_GRID, 9, 1, 1)
  await source(SYNTHETIC_GRID, 9, 1, 2)

  assert.equal(stub.calls.length, 2, 'the repeat request should not reach OS')
})

test('a rejected key names the OS product that is missing', async () => {
  clearTileCache()
  const stub = stubOsFetch(SYNTHETIC_GRID, { expectKey: 'the-right-key' })
  const source = osVectorTileSource('the-wrong-key', { fetchImpl: stub.fetch })

  await assert.rejects(
    () => source(SYNTHETIC_GRID, 9, 1, 1),
    /OS NGD API – Tiles/,
    'a 401 should say which Data Hub product the key needs'
  )
})

test('204 is an empty tile, not a failure', async () => {
  clearTileCache()
  const source = osVectorTileSource(KEY, {
    fetchImpl: async () => new Response(null, { status: 204 })
  })

  const tile = await source(SYNTHETIC_GRID, 9, 1, 1)

  assert.deepEqual(tile.layers, {}, 'outside the data extent is empty, not an error')
})

test('a failed grid read is not memoised', async () => {
  clearTileCache()
  let attempts = 0
  const failing = async () => {
    attempts += 1
    return new Response('nope', { status: 500, statusText: 'Server Error' })
  }

  await assert.rejects(() => fetchOsGrid(KEY, { fetchImpl: failing }))
  await assert.rejects(() => fetchOsGrid(KEY, { fetchImpl: failing }))

  assert.equal(attempts, 2, 'the second call should retry rather than replay the failure')
})

test('resolveBasemap degrades to the generated grid when OS cannot be reached', async () => {
  clearTileCache()
  const warnings = []
  const basemap = await resolveBasemap({
    source: 'os',
    apiKey: KEY,
    log: { warn: (message) => warnings.push(message) },
    fetchImpl: async () => new Response('down', { status: 503, statusText: 'Unavailable' })
  })

  assert.equal(basemap.degraded, true)
  assert.equal(basemap.grid, SYNTHETIC_GRID)
  assert.match(basemap.reason, /503/)
  assert.equal(warnings.length, 1, 'the substitution must be logged, not silent')
})

test('resolveBasemap degrades when no key is configured, without calling out', async () => {
  clearTileCache()
  let called = false
  const basemap = await resolveBasemap({
    source: 'os',
    apiKey: '',
    log: { warn: () => {} },
    fetchImpl: async () => {
      called = true
      return new Response('{}', { status: 200 })
    }
  })

  assert.equal(basemap.degraded, true)
  assert.match(basemap.reason, /OS_API_KEY is not set/)
  assert.equal(called, false, 'no point calling OS without a key')
})

test('resolveBasemap returns the real source when OS answers', async () => {
  clearTileCache()
  const stub = stubOsFetch(SYNTHETIC_GRID)

  const basemap = await resolveBasemap({
    source: 'os',
    apiKey: KEY,
    fetchImpl: stub.fetch
  })

  assert.equal(basemap.degraded, false)
  assert.match(basemap.kind, /Ordnance Survey/)
  const tile = await basemap.tileSource(basemap.grid, 9, 3, 4)
  assert.ok(tile.layers)
})
