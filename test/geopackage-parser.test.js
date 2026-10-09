const test = require('node:test')
const assert = require('node:assert/strict')
const { parseGeoPackage } = require('../app/lib/geopackage-parser')

// parseGeoPackage delegates the GeoPackage-Binary + WKB decode to
// bng-library/gpkg-io. This guards the integration boundary: the CJS→ESM
// bridge, the async contract, and the { layers, geometries } shape the
// on-site-baseline / on-site-post-intervention routes consume.
test('parseGeoPackage decodes a generated GeoPackage into layers and GeoJSON', async () => {
  // Build a realistic upload buffer with the same library API the gen-gpkg
  // route uses, so the test exercises the real feature layers and SRS 27700.
  const { generateSyntheticGpkg } = await import('bng-library')
  const out = generateSyntheticGpkg({ centre: [530000, 180000], numParcels: 5 })
  const buffer = Buffer.isBuffer(out) ? out : out.buffer

  const { layers, geometries } = await parseGeoPackage(buffer)

  assert.ok(layers.length > 0, 'at least one layer is returned')

  const boundary = layers.find((l) => l.name === 'Red Line Boundary')
  assert.ok(boundary, 'Red Line Boundary layer is present')
  assert.equal(boundary.geometryType, 'POLYGON')
  assert.equal(boundary.srsId, 27700)
  assert.ok(boundary.totalAreaSqm > 0, 'boundary has a positive area')

  const collection = geometries['Red Line Boundary']
  assert.equal(collection.type, 'FeatureCollection')
  assert.ok(collection.features.length > 0, 'boundary has features')

  const feature = collection.features[0]
  assert.equal(feature.type, 'Feature')
  assert.ok(feature.geometry.type, 'feature has a decoded geometry type')
  assert.ok(
    Array.isArray(feature.geometry.coordinates),
    'geometry has coordinates'
  )
  assert.ok('index' in feature.properties, 'feature properties include index')
})
