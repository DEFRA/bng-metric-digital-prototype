const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProjectDashboardMapData } = require('../app/routes/project-dashboard');

test('buildProjectDashboardMapData selects uploaded habitat map layers', () => {
  const featureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: {}, geometry: null }]
  };
  const gpkgData = {
    layers: [
      { name: 'Red Line Boundary' },
      { name: 'Baseline Habitat Parcels' },
      { name: 'Hedgerows' },
      { name: 'Watercourses' },
      { name: 'Urban Trees' }
    ],
    geometries: {
      'Red Line Boundary': featureCollection,
      'Baseline Habitat Parcels': featureCollection,
      Hedgerows: featureCollection,
      Watercourses: featureCollection,
      'Urban Trees': featureCollection
    }
  };

  const mapData = buildProjectDashboardMapData(gpkgData);

  assert.equal(mapData.siteBoundary, featureCollection);
  assert.equal(mapData.parcels, featureCollection);
  assert.equal(mapData.hedgerows, featureCollection);
  assert.equal(mapData.watercourses, featureCollection);
  assert.equal(mapData.trees, featureCollection);
});

test('buildProjectDashboardMapData requires boundary and parcel layers', () => {
  assert.throws(
    () => buildProjectDashboardMapData({ layers: [], geometries: {} }),
    /boundary and habitat parcel layers/
  );
});
