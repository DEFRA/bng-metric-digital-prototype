const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectDashboardMapData,
  resolveMapView
} = require('../app/routes/project-dashboard');

const BOTH_UPLOADED = {
  hasBaseline: true,
  hasPostIntervention: true
};

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

test('resolveMapView defaults to baseline when no view is requested', () => {
  assert.equal(resolveMapView(undefined, BOTH_UPLOADED), 'baseline');
});

test('resolveMapView selects an explicit baseline view', () => {
  assert.equal(resolveMapView('baseline', BOTH_UPLOADED), 'baseline');
});

test('resolveMapView selects an available post-intervention view', () => {
  assert.equal(
    resolveMapView('post-intervention', BOTH_UPLOADED),
    'post-intervention'
  );
});

test('resolveMapView falls back when post-intervention is unavailable', () => {
  assert.equal(
    resolveMapView('post-intervention', {
      hasBaseline: true,
      hasPostIntervention: false
    }),
    'baseline'
  );
});

test('resolveMapView selects post-intervention when baseline is unavailable', () => {
  assert.equal(
    resolveMapView(undefined, {
      hasBaseline: false,
      hasPostIntervention: true
    }),
    'post-intervention'
  );
});

test('resolveMapView falls back to baseline for the retired both view', () => {
  assert.equal(resolveMapView('both', BOTH_UPLOADED), 'baseline');
});
