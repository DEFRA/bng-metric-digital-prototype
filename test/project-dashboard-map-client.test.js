const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DASHBOARD_DATASET_CONFIG,
  interactiveMapState,
  switchDashboardMapView
} = require('../app/assets/javascripts/interactive-map/habitats-summary/map-init');

function makeFeatureCollection(source) {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { source },
        geometry: { type: 'Point', coordinates: [-1, 52] }
      }
    ]
  };
}

function emptyFeatureCollection() {
  return { type: 'FeatureCollection', features: [] };
}

function makeMapData(source, availableLayers) {
  return Object.fromEntries(
    DASHBOARD_DATASET_CONFIG.map(function (datasetConfig) {
      return [
        datasetConfig.mapDataKey,
        availableLayers.includes(datasetConfig.mapDataKey)
          ? makeFeatureCollection(source)
          : emptyFeatureCollection()
      ];
    })
  );
}

function makeMapContainer(currentView) {
  const attributes = {
    'data-map-view': currentView,
    'data-has-baseline': 'true',
    'data-has-post-intervention': 'true'
  };

  return {
    attributes,
    getAttribute(name) {
      return attributes[name] ?? null;
    },
    setAttribute(name, value) {
      attributes[name] = value;
    }
  };
}

function makePanel() {
  const baselineRadio = {
    checked: true,
    disabled: false,
    value: 'baseline'
  };
  const postInterventionRadio = {
    checked: false,
    disabled: false,
    value: 'post-intervention'
  };
  const title = { textContent: '' };
  const interventionSection = { hidden: true };
  const error = { hidden: true, textContent: '' };
  const status = { textContent: '' };
  const description = { textContent: '' };
  const layerControls = Object.fromEntries(
    DASHBOARD_DATASET_CONFIG.map(function (datasetConfig) {
      const input = { checked: true, value: datasetConfig.datasetId };
      return [
        datasetConfig.datasetId,
        {
          hidden: false,
          input,
          querySelector() {
            return input;
          }
        }
      ];
    })
  );

  return {
    baselineRadio,
    description,
    error,
    interventionSection,
    layerControls,
    postInterventionRadio,
    status,
    title,
    querySelector(selector) {
      if (selector === '[data-dashboard-map-title]') {
        return title;
      }
      if (selector === '[data-dashboard-intervention-section]') {
        return interventionSection;
      }
      if (selector === '[data-dashboard-map-view-error]') {
        return error;
      }
      if (selector === '[data-dashboard-map-view-status]') {
        return status;
      }
      if (selector === '[data-dashboard-map-layer-description]') {
        return description;
      }

      const layerMatch = selector.match(
        /^\[data-dashboard-map-layer="([^"]+)"\]$/
      );
      return layerMatch ? layerControls[layerMatch[1]] || null : null;
    },
    querySelectorAll(selector) {
      if (selector === 'input[name="dashboard-map-title"]') {
        return [baselineRadio, postInterventionRadio];
      }
      if (selector === '.dashboard-map-panel__intervention-input:checked') {
        return [];
      }
      return [];
    }
  };
}

function setUpClient(response) {
  const panel = makePanel();
  const mapContainer = makeMapContainer('baseline');
  const setDataCalls = [];
  const visibilityCalls = [];
  const historyCalls = [];

  interactiveMapState.fullBounds = null;
  interactiveMapState.map = null;
  interactiveMapState.interactPlugin = null;
  interactiveMapState.dashboardDatasetIds = DASHBOARD_DATASET_CONFIG.map(
    function (datasetConfig) {
      return datasetConfig.datasetId;
    }
  );
  interactiveMapState.dashboardLayerVisibility = Object.fromEntries(
    interactiveMapState.dashboardDatasetIds.map(function (datasetId) {
      return [datasetId, true];
    })
  );
  interactiveMapState.dashboardViewRequestId = 0;
  interactiveMapState.selectedLink = null;
  interactiveMapState.selectedFeatureKey = null;
  interactiveMapState.datasetsByType = {
    parcel: [],
    hedgerow: [],
    watercourse: [],
    tree: []
  };
  interactiveMapState.datasetsPlugin = {
    setData(data, options) {
      setDataCalls.push({ data, options });
    },
    setDatasetVisibility(visible, options) {
      visibilityCalls.push({ visible, options });
    },
    setFeatureVisibility() {}
  };

  global.document = {
    querySelector() {
      return panel;
    }
  };
  global.window = {
    fetch() {
      return Promise.resolve(response);
    },
    habitatsSummaryInteractiveMap: null,
    history: {
      state: null,
      pushState(state, title, url) {
        historyCalls.push({ mode: 'push', state, title, url });
      },
      replaceState(state, title, url) {
        historyCalls.push({ mode: 'replace', state, title, url });
      }
    },
    location: {
      href: 'http://localhost/project-dashboard/map?view=baseline',
      search: '?view=baseline'
    }
  };

  return {
    historyCalls,
    mapContainer,
    panel,
    setDataCalls,
    visibilityCalls
  };
}

test.afterEach(function () {
  delete global.document;
  delete global.window;
});

test('switchDashboardMapView updates data, active layers, UI and history in place', async () => {
  const postIntervention = makeMapData('post-intervention', [
    'siteBoundary',
    'parcels',
    'trees'
  ]);
  const client = setUpClient({
    ok: true,
    json() {
      return Promise.resolve({
        mapView: 'post-intervention',
        mapData: postIntervention
      });
    }
  });
  interactiveMapState.dashboardLayerVisibility['trees-im'] = false;

  await switchDashboardMapView(client.mapContainer, 'post-intervention', {
    updateHistory: true
  });

  assert.equal(client.setDataCalls.length, 5);
  assert.deepEqual(
    client.setDataCalls.map(function (call) {
      return call.options.datasetId;
    }),
    DASHBOARD_DATASET_CONFIG.map(function (datasetConfig) {
      return datasetConfig.datasetId;
    })
  );
  assert.deepEqual(client.visibilityCalls, [
    { visible: true, options: { datasetId: 'site-boundary-im' } },
    { visible: true, options: { datasetId: 'habitat-parcels-im' } },
    { visible: false, options: { datasetId: 'hedgerows-im' } },
    { visible: false, options: { datasetId: 'watercourses-im' } },
    { visible: false, options: { datasetId: 'trees-im' } }
  ]);
  assert.equal(client.panel.layerControls['hedgerows-im'].hidden, true);
  assert.equal(client.panel.layerControls['watercourses-im'].hidden, true);
  assert.equal(client.panel.layerControls['trees-im'].hidden, false);
  assert.equal(client.panel.layerControls['trees-im'].input.checked, false);
  assert.equal(
    client.panel.description.textContent,
    'Red line boundary, Area habitats, Trees'
  );
  assert.equal(
    client.mapContainer.getAttribute('data-map-view'),
    'post-intervention'
  );
  assert.equal(client.mapContainer.getAttribute('aria-busy'), 'false');
  assert.equal(client.panel.title.textContent, 'Post intervention');
  assert.equal(client.panel.baselineRadio.checked, false);
  assert.equal(client.panel.postInterventionRadio.checked, true);
  assert.equal(client.panel.interventionSection.hidden, false);
  assert.equal(client.panel.status.textContent, 'Post intervention map loaded');
  assert.equal(client.panel.error.hidden, true);
  assert.equal(client.historyCalls.length, 1);
  assert.equal(client.historyCalls[0].mode, 'push');
  assert.equal(
    client.historyCalls[0].url,
    '/project-dashboard/map?view=post-intervention'
  );
});

test('switchDashboardMapView retains the current view when loading fails', async () => {
  const client = setUpClient({ ok: false, status: 500 });
  const originalConsoleError = console.error;
  console.error = function () {};

  try {
    await switchDashboardMapView(client.mapContainer, 'post-intervention', {
      updateHistory: true
    });
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(client.setDataCalls.length, 0);
  assert.equal(client.mapContainer.getAttribute('data-map-view'), 'baseline');
  assert.equal(client.mapContainer.getAttribute('aria-busy'), 'false');
  assert.equal(client.panel.baselineRadio.checked, true);
  assert.equal(client.panel.postInterventionRadio.checked, false);
  assert.equal(client.panel.error.hidden, false);
  assert.equal(
    client.panel.error.textContent,
    'The selected map view could not be loaded. Try again.'
  );
  assert.equal(client.historyCalls.length, 0);
});
