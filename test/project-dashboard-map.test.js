const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildProjectDashboardMapData,
  getAvailableProjectDashboardMapLayers,
  getProjectDashboardMapDataByKind,
  resolveMapView,
  sendProjectDashboardMapData
} = require('../app/routes/project-dashboard');

const BOTH_UPLOADED = {
  hasBaseline: true,
  hasPostIntervention: true
};
const EMPTY_FEATURE_COLLECTION = {
  type: 'FeatureCollection',
  features: []
};

function makeMapData(source, overrides = {}) {
  const featureCollection = {
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { source }, geometry: null }]
  };

  return {
    siteBoundary: featureCollection,
    parcels: featureCollection,
    hedgerows: EMPTY_FEATURE_COLLECTION,
    watercourses: EMPTY_FEATURE_COLLECTION,
    trees: EMPTY_FEATURE_COLLECTION,
    ...overrides
  };
}

function makeJsonResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    }
  };
}

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

test('getProjectDashboardMapDataByKind supports legacy session map data', () => {
  const baseline = makeMapData('baseline');

  assert.deepEqual(
    getProjectDashboardMapDataByKind({
      projectDashboardMapData: baseline,
      projectDashboardUploadedFile: { kind: 'baseline' }
    }),
    { baseline }
  );
});

test('getAvailableProjectDashboardMapLayers returns layers used by either view', () => {
  const hedgerows = makeMapData('hedgerow').parcels;
  const trees = makeMapData('tree').parcels;

  assert.deepEqual(
    getAvailableProjectDashboardMapLayers({
      baseline: makeMapData('baseline', { hedgerows }),
      'post-intervention': makeMapData('post-intervention', { trees })
    }),
    ['siteBoundary', 'parcels', 'hedgerows', 'trees']
  );
});

test('sendProjectDashboardMapData returns the requested available view', () => {
  const postIntervention = makeMapData('post-intervention');
  const response = makeJsonResponse();

  sendProjectDashboardMapData(
    {
      query: { view: 'post-intervention' },
      session: {
        data: {
          projectDashboardMapDataByKind: {
            baseline: makeMapData('baseline'),
            'post-intervention': postIntervention
          }
        }
      }
    },
    response
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.payload, {
    mapView: 'post-intervention',
    mapData: postIntervention
  });
});

test('sendProjectDashboardMapData rejects an unavailable view', () => {
  const response = makeJsonResponse();

  sendProjectDashboardMapData(
    {
      query: { view: 'post-intervention' },
      session: {
        data: {
          projectDashboardMapDataByKind: {
            baseline: makeMapData('baseline')
          }
        }
      }
    },
    response
  );

  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.payload, { error: 'Map view is not available' });
});

test('sendProjectDashboardMapData rejects an invalid view', () => {
  const response = makeJsonResponse();

  sendProjectDashboardMapData(
    {
      query: { view: 'both' },
      session: { data: {} }
    },
    response
  );

  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.payload, { error: 'Select a valid map view' });
});
