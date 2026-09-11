/**
 * What happens when Ordnance Survey goes away part-way through drawing.
 *
 * resolveBasemap() covers OS failing before any drawing starts — no key, or a
 * tile matrix set that will not load. It cannot cover a tile that times out on
 * the fortieth request, because by then the report is already being written.
 *
 * The form promises "falls back to the grid below if OS cannot be reached", so
 * a report must degrade to the generated grid there too, and say that it did.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'

import { readSite } from '../../app/lib/pdf-report/gpkg.mjs'
import * as documentModule from '../../app/lib/pdf-report/document.mjs'
import * as fontsModule from '../../app/lib/pdf-report/fonts.mjs'
import * as basemapModule from '../../app/lib/pdf-report/basemap.mjs'
import { OsTileError } from '../../app/lib/pdf-report/os-tiles.mjs'
import { syntheticTileSource } from '../../app/lib/pdf-report/tiles.mjs'

const require = createRequire(import.meta.url)
const { buildReport } = require('../../app/routes/pdf-report.js')

const EXAMPLES = path.resolve(import.meta.dirname, '..', '..', 'example-files')
const BASELINE = path.join(EXAMPLES, 'Baseline - complete with area refs.gpkg')

const PDF_MAGIC = '%PDF-'

/**
 * An engine whose basemap module hands back OS-flavoured tiles from
 * `tileSource`, so the report believes it is drawing on real OS data. The
 * grid is the synthetic one either way — the geometry is not what is under
 * test here, the failure path is.
 */
function engineWith(tileSource) {
  const resolved = {
    grid: basemapModule.SYNTHETIC_GRID,
    tileSource,
    kind: 'Ordnance Survey NGD (ngd-base, EPSG:27700)',
    requested: 'os',
    degraded: false,
    reason: null
  }

  return {
    fonts: fontsModule,
    document: documentModule,
    basemap: {
      ...basemapModule,
      resolveBasemap: async () => resolved
    }
  }
}

/** A tile source that serves `before` tiles and then fails the way OS does. */
function failsAfter(before, error) {
  const good = syntheticTileSource()
  let served = 0
  return async (grid, z, col, row) => {
    served += 1
    if (served > before) {
      throw error
    }
    return good(grid, z, col, row)
  }
}

const report = (engine) =>
  buildReport(engine, {
    baseline: readSite(BASELINE),
    postIntervention: null,
    font: 'noto-sans',
    basemapSource: 'os',
    layout: 'table'
  })

test('a tile timing out mid-render degrades to the generated grid', async () => {
  const timeout = new OsTileError(
    'Tile 9/1/2: The operation was aborted due to timeout'
  )
  const built = await report(engineWith(failsAfter(5, timeout)))

  assert.ok(built.buffer.length > 0)
  assert.equal(built.buffer.subarray(0, PDF_MAGIC.length).toString(), PDF_MAGIC)
  assert.equal(built.basemap.degraded, true)
  assert.match(built.basemap.reason, /aborted due to timeout/)
  assert.equal(built.basemap.kind, 'Generated grid (no OS data)')
})

test('a tile answering 5xx mid-render degrades too', async () => {
  const serverError = new OsTileError('Tile 9/1/2: 503 Service Unavailable')
  const built = await report(engineWith(failsAfter(5, serverError)))

  assert.equal(built.basemap.degraded, true)
  assert.match(built.basemap.reason, /503/)
})

test('the degraded report is whole, not half OS and half grid', async () => {
  // The retry has to start a new document: a PDF already part-written against
  // OS tiles cannot have the rest of its basemap swapped.
  const onOs = await report(engineWith(syntheticTileSource()))
  const degraded = await report(
    engineWith(
      failsAfter(5, new OsTileError('Tile 9/1/2: 503 Service Unavailable'))
    )
  )

  assert.equal(onOs.stats.maps, degraded.stats.maps)
  assert.equal(onOs.stats.habitats, degraded.stats.habitats)
  assert.equal(onOs.stats.tiles, degraded.stats.tiles)
})

test('a fault in the drawing still fails the report', async () => {
  // Not a tile failure, so it must not be hidden behind a substituted
  // basemap - that would turn a real bug into a silent cosmetic downgrade.
  const bug = new TypeError('features.map is not a function')
  await assert.rejects(
    () => report(engineWith(failsAfter(5, bug))),
    /features\.map is not a function/
  )
})

test('a failure on the generated grid is not retried', async () => {
  const engine = engineWith(syntheticTileSource())
  engine.basemap = {
    ...basemapModule,
    resolveBasemap: async () => ({
      grid: basemapModule.SYNTHETIC_GRID,
      tileSource: failsAfter(5, new OsTileError('Tile 9/1/2: 503')),
      kind: 'Generated grid (no OS data)',
      requested: 'synthetic',
      degraded: false,
      reason: null
    })
  }

  // Nothing to fall back to, so the error is the answer.
  await assert.rejects(() => report(engine), /503/)
})

test('a report that needs no fallback is not marked degraded', async () => {
  const built = await report(engineWith(syntheticTileSource()))

  assert.equal(built.basemap.degraded, false)
  assert.equal(built.basemap.reason, null)
  assert.equal(built.basemap.kind, 'Ordnance Survey NGD (ngd-base, EPSG:27700)')
})
