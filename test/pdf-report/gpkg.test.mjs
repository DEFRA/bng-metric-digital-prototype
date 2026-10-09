/**
 * Reads this repo's own example GeoPackages — no fixtures written for the
 * test, so a decode bug cannot hide behind data produced by the same code
 * that reads it.
 *
 * Ported from the BMD-984 spike (bng-metric-harness,
 * spikes/bmd-984-pdf-export/test/gpkg.test.mjs) and repointed at
 * `example-files/`, which is a smaller site than the harness's fixtures: 3
 * habitat parcels rather than 20.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { readSite, assertBngSrs } from '../../app/lib/pdf-report/gpkg.mjs'
import { envelopeOf, polygonAreaSqm, lineLengthMetres } from '../../app/lib/pdf-report/geometry.mjs'

const EXAMPLES = path.resolve(import.meta.dirname, '..', '..', 'example-files')
const BASELINE = path.join(EXAMPLES, 'Baseline - complete with area refs.gpkg')

test('reads a real baseline GeoPackage', () => {
  const site = readSite(BASELINE)

  assert.ok(site.redLine, 'expected a red line boundary')
  assert.equal(site.layers.habitats.features.length, 3)
  assert.equal(site.layers.hedgerows.features.length, 2)
  assert.equal(site.layers.watercourses.features.length, 1)
})

test('every layer declares British National Grid', () => {
  const site = readSite(BASELINE)
  for (const layer of Object.values(site.layers)) {
    assert.equal(layer.srsId, 27700, `${layer.name} should be EPSG:27700`)
  }
})

test('habitat geometry decodes to plausible BNG coordinates', () => {
  const site = readSite(BASELINE)
  const envelope = envelopeOf(site.redLine.geometry)

  // Great Britain's national grid spans roughly 0..700000 E and 0..1300000 N.
  assert.ok(envelope.minX > 0 && envelope.maxX < 700000)
  assert.ok(envelope.minY > 0 && envelope.maxY < 1300000)
})

test('habitat parcels sit inside the red line boundary', () => {
  const site = readSite(BASELINE)
  const redLine = envelopeOf(site.redLine.geometry)

  for (const habitat of site.layers.habitats.features) {
    const envelope = envelopeOf(habitat.geometry)
    assert.ok(envelope.minX >= redLine.minX - 1)
    assert.ok(envelope.maxX <= redLine.maxX + 1)
    assert.ok(envelope.minY >= redLine.minY - 1)
    assert.ok(envelope.maxY <= redLine.maxY + 1)
  }
})

test('parcel geometry decodes to areas that tile the site', () => {
  const site = readSite(BASELINE)

  // The spike's version of this test compared each parcel's computed area
  // against the `Area` column, which is a strong independent check on the
  // hand-rolled WKB decoder. It does not survive the move to these fixtures:
  // `Baseline - complete with area refs.gpkg` records 2460 m² for parcel H2,
  // whose exterior ring is 13,608 m². H1 and H3 agree to within a square
  // metre, so the column is right for some rows and stale for others — which
  // makes it evidence about the file, not about the decoder.
  //
  // The invariant that holds regardless is that the parcels partition the red
  // line boundary. It needs no recorded attribute to be correct, so a decoder
  // that misplaced or mis-scaled a ring would still fail it.
  const boundary = polygonAreaSqm(site.redLine.geometry)
  const parcels = site.layers.habitats.features.reduce(
    (total, habitat) => total + polygonAreaSqm(habitat.geometry),
    0
  )

  assert.ok(boundary > 0, 'red line boundary has a positive area')
  assert.ok(
    Math.abs(parcels - boundary) <= 1,
    `parcels total ${parcels.toFixed(1)} m² against a ${boundary.toFixed(1)} m² boundary`
  )
})

test('the red line boundary computes the area the file records for it', () => {
  const site = readSite(BASELINE)
  const computed = polygonAreaSqm(site.redLine.geometry)
  const recorded = Number(site.redLine.properties.Area)

  // 0.1%: the boundary's recorded area is a real number rather than the
  // parcels' rounded integer, and the two are within 12 m² of each other on a
  // 1.5 ha site.
  assert.ok(
    Math.abs(computed - recorded) / recorded < 0.001,
    `computed ${computed.toFixed(1)} m² vs recorded ${recorded.toFixed(1)} m²`
  )
})

test('hedgerow lengths decode to a sensible magnitude', () => {
  const site = readSite(BASELINE)
  for (const hedgerow of site.layers.hedgerows.features) {
    assert.ok(lineLengthMetres(hedgerow.geometry) > 0)
  }
})

test('a non-BNG SRS is rejected loudly', () => {
  assert.throws(() => assertBngSrs(4326, 'test layer'), /expected EPSG:27700/)
})

test('reads a post-intervention GeoPackage too', () => {
  const site = readSite(path.join(EXAMPLES, 'Post-intervention - complete.gpkg'))
  assert.equal(site.layers.habitats.features.length, 12)
  assert.ok(site.layers.habitats.features[0].properties['Proposed Habitat Type'])
})
