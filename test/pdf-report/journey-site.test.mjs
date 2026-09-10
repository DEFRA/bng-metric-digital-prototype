/**
 * The summary page's data path: session state, or the committed demo site.
 *
 * The thing worth guarding is that this stays a re-keying rather than a
 * transformation. If the session's coordinates ever needed reprojecting, or
 * the demo data lost the BNG template's column names, the button would still
 * produce a PDF — just one showing the wrong place, or one whose cards are
 * mostly blank.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { demoSite, siteForJourney } from '../../app/lib/pdf-report/journey-site.mjs'
import { envelopeOf, polygonAreaSqm } from '../../app/lib/pdf-report/geometry.mjs'
import { cardValues } from '../../app/lib/pdf-report/habitat-cards.mjs'

/** A dashboard upload, in the shape buildProjectDashboardMapData stores. */
function mapData({ boundary, parcels = [], hedgerows = [] }) {
  return {
    siteBoundary: { type: 'FeatureCollection', features: boundary ? [boundary] : [] },
    parcels: { type: 'FeatureCollection', features: parcels },
    hedgerows: { type: 'FeatureCollection', features: hedgerows },
    watercourses: { type: 'FeatureCollection', features: [] },
    trees: { type: 'FeatureCollection', features: [] }
  }
}

function square(originX, originY, size, properties = {}) {
  return {
    type: 'Feature',
    properties,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [originX, originY],
          [originX + size, originY],
          [originX + size, originY + size],
          [originX, originY + size],
          [originX, originY]
        ]
      ]
    }
  }
}

test('an empty session falls back to the demo site', () => {
  const site = siteForJourney({})

  assert.equal(site.source, 'demo')
  assert.ok(site.baseline.redLine, 'the demo site has a red line boundary')
  assert.equal(site.baseline.layers.habitats.features.length, 3)
  assert.equal(site.postIntervention.layers.habitats.features.length, 6)
  assert.match(site.baseline.siteName, /demo/i, 'the name should admit what it is')
})

test('the demo geometry is British National Grid, in metres', () => {
  const { baseline } = demoSite()
  const envelope = envelopeOf(baseline.redLine.geometry)

  // Great Britain's national grid spans roughly 0..700000 E and 0..1300000 N.
  assert.ok(envelope.minX > 0 && envelope.maxX < 700_000, 'easting')
  assert.ok(envelope.minY > 0 && envelope.maxY < 1_300_000, 'northing')
  // A site, not a county: metres would put this at 1.5 ha, degrees at ~0.
  const hectares = polygonAreaSqm(baseline.redLine.geometry) / 10_000
  assert.ok(hectares > 0.5 && hectares < 100, `${hectares.toFixed(2)} ha`)
})

test('the demo parcels carry the attributes the cards render', () => {
  const { postIntervention } = demoSite()

  for (const parcel of postIntervention.layers.habitats.features) {
    const values = cardValues(parcel)
    const card = `${values.ref} — ${values.type}`
    assert.notEqual(values.ref, '—', 'every card is headed by a parcel reference')
    assert.notEqual(values.type, '—', `${card}: habitat type`)
    assert.ok(values.condition, `${card}: condition`)
    assert.ok(values.broadType, `${card}: broad habitat`)
    assert.match(values.area, /^\d+\.\d+ ha$/, `${card}: size`)
    // The post-intervention side of the demo pair, so each card should also
    // show what the parcel is changing FROM.
    assert.ok(values.baselineType, `${card}: baseline habitat`)
  }
})

test('an uploaded baseline and post-intervention pair is used over the demo data', () => {
  const site = siteForJourney({
    projectName: 'Riverside Meadows',
    projectDashboardMapDataByKind: {
      baseline: mapData({
        boundary: square(400_000, 300_000, 200),
        parcels: [square(400_000, 300_000, 100, { 'Parcel Ref': 'B1' })]
      }),
      'post-intervention': mapData({
        boundary: square(400_000, 300_000, 200),
        parcels: [
          square(400_000, 300_000, 100, { 'Parcel Ref': 'P1' }),
          square(400_100, 300_000, 100, { 'Parcel Ref': 'P2' })
        ]
      })
    }
  })

  assert.equal(site.source, 'session')
  assert.equal(site.baseline.siteName, 'Riverside Meadows')
  assert.equal(site.baseline.layers.habitats.features.length, 1)
  assert.equal(site.postIntervention.layers.habitats.features.length, 2)
})

test('a baseline on its own produces a baseline-only report', () => {
  const site = siteForJourney({
    projectDashboardMapDataByKind: {
      baseline: mapData({
        boundary: square(400_000, 300_000, 200),
        parcels: [square(400_000, 300_000, 100)]
      })
    }
  })

  assert.equal(site.source, 'session')
  assert.equal(site.postIntervention, null)
})

test('a post-intervention upload with no baseline is still reported on', () => {
  const site = siteForJourney({
    projectDashboardMapDataByKind: {
      'post-intervention': mapData({
        boundary: square(400_000, 300_000, 200),
        parcels: [square(400_000, 300_000, 100, { 'Parcel Ref': 'P1' })]
      })
    }
  })

  assert.equal(site.source, 'session')
  assert.equal(site.baseline.layers.habitats.features.length, 1)
  assert.equal(site.postIntervention, null, 'nothing to compare against')
})

test('an upload with neither boundary nor parcels is not treated as a site', () => {
  const site = siteForJourney({
    projectDashboardMapDataByKind: { baseline: mapData({}) }
  })

  assert.equal(site.source, 'demo', 'an empty upload should not blank the report')
})

test('layers with nothing in them are left out rather than left empty', () => {
  const site = siteForJourney({
    projectDashboardMapDataByKind: {
      baseline: mapData({
        boundary: square(400_000, 300_000, 200),
        parcels: [square(400_000, 300_000, 100)]
      })
    }
  })

  assert.ok(site.baseline.layers.habitats)
  assert.equal(site.baseline.layers.hedgerows, undefined)
  assert.equal(site.baseline.layers.trees, undefined)
})
