const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectDashboardMapData,
  combineProjectDashboardMapData
} = require('../app/routes/project-dashboard');

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

test('combineProjectDashboardMapData combines each baseline and post-intervention layer', () => {
  const baselineFeature = { type: 'Feature', properties: { source: 'baseline' } };
  const postFeature = {
    type: 'Feature',
    properties: { source: 'post-intervention' }
  };
  const layerNames = [
    'siteBoundary',
    'parcels',
    'hedgerows',
    'watercourses',
    'trees'
  ];
  const baseline = {};
  const postIntervention = {};

  layerNames.forEach((layerName) => {
    baseline[layerName] = {
      type: 'FeatureCollection',
      features: [baselineFeature]
    };
    postIntervention[layerName] = {
      type: 'FeatureCollection',
      features: [postFeature]
    };
  });

  const combined = combineProjectDashboardMapData(
    baseline,
    postIntervention
  );

  layerNames.forEach((layerName) => {
    assert.deepEqual(combined[layerName].features, [
      baselineFeature,
      postFeature
    ]);
  });
});
