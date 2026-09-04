(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    initInteractiveMapPreview();
  });

  // When navigating back/forward the browser restores the page from bfcache.
  // The cached MapLibre instance keeps the last pan/zoom, so we must reinit.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      if (
        window.confirmLayersInteractiveMap &&
        typeof window.confirmLayersInteractiveMap.unmount === 'function'
      ) {
        window.confirmLayersInteractiveMap.unmount();
      }
      window.confirmLayersInteractiveMap = null;
      initInteractiveMapPreview();
    }
  });

  function initInteractiveMapPreview() {
    var mapContainer = document.getElementById('map-preview-im');
    if (!mapContainer) {
      return;
    }

    clearPersistedMapView(mapContainer.id);

    if (
      !window.defra ||
      !window.defra.InteractiveMap ||
      !window.defra.maplibreProvider ||
      !window.defra.datasetsPlugin ||
      !window.defra.mapKeyPlugin
    ) {
      showMapPlaceholder(mapContainer, 'Interactive map library not available');
      return;
    }

    ensureProj4BritishNationalGrid();

    var geometriesDataEl = document.getElementById('geometries-data');
    if (!geometriesDataEl) {
      showMapPlaceholder(mapContainer, 'No geometry data available');
      return;
    }

    var geometries;
    try {
      geometries = JSON.parse(geometriesDataEl.textContent);
    } catch (error) {
      console.error('Failed to parse geometries:', error);
      showMapPlaceholder(mapContainer, 'Could not load geometry data');
      return;
    }

    var boundaryLayerName = readLayerName('boundary-layer-name');
    var parcelsLayerName = readLayerName('parcels-layer-name');
    var hedgerowsLayerName = readLayerName('hedgerows-layer-name');
    var watercoursesLayerName = readLayerName('watercourses-layer-name');

    var boundaryGeoJson = getLayerGeoJson(geometries, boundaryLayerName);
    var parcelsGeoJson = getLayerGeoJson(geometries, parcelsLayerName);
    var hedgerowsGeoJson = getLayerGeoJson(geometries, hedgerowsLayerName);
    var watercoursesGeoJson = getLayerGeoJson(
      geometries,
      watercoursesLayerName
    );

    var datasets = [];

    if (boundaryGeoJson) {
      datasets.push({
        id: 'site-boundary-im',
        label: 'Site boundary',
        geojson: normalizeToWgs84(boundaryGeoJson),
        style: {
          fill: 'transparent',
          stroke: '#d4351c',
          strokeWidth: 3,
          strokeDashArray: [3, 2]
        },
        showInMenu: true,
        showInKey: true
      });
    }

    if (parcelsGeoJson) {
      datasets.push({
        id: 'habitat-parcels-im',
        label: 'Habitat parcels',
        geojson: normalizeToWgs84(parcelsGeoJson),
        style: {
          fill: '#1d70b8',
          stroke: '#1d70b8',
          strokeWidth: 2,
          opacity: 0.3
        },
        showInMenu: true,
        showInKey: true
      });
    }

    if (hedgerowsGeoJson) {
      datasets.push({
        id: 'hedgerows-im',
        label: 'Hedgerows',
        geojson: normalizeToWgs84(hedgerowsGeoJson),
        style: {
          stroke: '#00703c',
          strokeWidth: 3,
          keySymbolShape: 'line'
        },
        showInMenu: true,
        showInKey: true
      });
    }

    if (watercoursesGeoJson) {
      datasets.push({
        id: 'watercourses-im',
        label: 'Watercourses',
        geojson: normalizeToWgs84(watercoursesGeoJson),
        style: {
          stroke: '#1d70b8',
          strokeWidth: 3,
          keySymbolShape: 'line'
        },
        showInMenu: true,
        showInKey: true
      });
    }

    if (!datasets.length) {
      showMapPlaceholder(mapContainer, 'No valid layers to display');
      return;
    }

    var mapBounds = getCombinedBounds(datasets);

    try {
      window.confirmLayersInteractiveMap = new window.defra.InteractiveMap(
        mapContainer.id,
        {
          mapProvider: window.defra.maplibreProvider(),
          behaviour: 'inline',
          mapLabel: 'Interactive map preview',
          containerHeight: '400px',
          bounds: mapBounds || [
            [-7.57, 49.96],
            [1.68, 58.64]
          ],
          minZoom: 5,
          maxZoom: 20,
          enableZoomControls: true,
          mapStyle: {
            url: '/api/os/tiles/style/3857'
          },
          plugins: [
            window.defra.datasetsPlugin({
              datasets: datasets
            }),
            window.defra.mapKeyPlugin()
          ]
        }
      );
    } catch (error) {
      console.error('Failed to initialize interactive map:', error);
      showMapPlaceholder(mapContainer, 'Could not load interactive map');
    }
  }

  function clearPersistedMapView(mapId) {
    if (
      !mapId ||
      !window.history ||
      !window.history.replaceState ||
      !window.location
    ) {
      return;
    }

    var url = new URL(window.location.href);
    var searchParams = url.searchParams;
    var hasChanged = false;

    ['mv', mapId + ':center', mapId + ':zoom'].forEach(function (key) {
      if (searchParams.has(key)) {
        searchParams.delete(key);
        hasChanged = true;
      }
    });

    if (!hasChanged) {
      return;
    }

    var nextSearch = searchParams.toString();
    var nextUrl =
      url.pathname + (nextSearch ? '?' + nextSearch : '') + url.hash;

    window.history.replaceState(window.history.state, '', nextUrl);
  }

  function showMapPlaceholder(container, message) {
    container.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#505a5f;">' +
      '<p>' +
      message +
      '</p></div>';
  }

  function readLayerName(elementId) {
    var element = document.getElementById(elementId);
    if (!element) {
      return null;
    }

    var value = element.textContent.trim();
    return value && value !== 'null' ? value : null;
  }

  function getLayerGeoJson(geometries, layerName) {
    if (!layerName || !geometries[layerName]) {
      return null;
    }

    return geometries[layerName];
  }

  function normalizeToWgs84(geoJson) {
    if (!geoJson || !geoJson.features || !geoJson.features.length) {
      return geoJson;
    }

    var sampleCoord = getSampleCoordinate(geoJson);
    if (!looksLikeBng(sampleCoord)) {
      return geoJson;
    }

    if (!window.proj4) {
      console.warn('proj4 is unavailable; unable to transform BNG coordinates');
      return geoJson;
    }

    var cloned = JSON.parse(JSON.stringify(geoJson));
    cloned.features = cloned.features.map(function (feature) {
      if (!feature.geometry || !feature.geometry.coordinates) {
        return feature;
      }

      feature.geometry.coordinates = transformCoordinates(
        feature.geometry.coordinates
      );
      return feature;
    });

    return cloned;
  }

  function ensureProj4BritishNationalGrid() {
    if (!window.proj4 || typeof window.proj4.defs !== 'function') {
      return;
    }

    window.proj4.defs(
      'EPSG:27700',
      '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
    );
  }

  function transformCoordinates(coords) {
    if (!Array.isArray(coords)) {
      return coords;
    }

    if (isCoordinatePair(coords)) {
      return window.proj4('EPSG:27700', 'EPSG:4326', coords);
    }

    return coords.map(transformCoordinates);
  }

  function isCoordinatePair(value) {
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    );
  }

  function looksLikeBng(coord) {
    if (!coord || coord.length < 2) {
      return false;
    }

    return Math.abs(coord[0]) > 1000 && Math.abs(coord[0]) < 800000;
  }

  function getSampleCoordinate(geoJson) {
    if (!geoJson || !geoJson.features || !geoJson.features.length) {
      return null;
    }

    var feature = geoJson.features[0];
    if (!feature.geometry || !feature.geometry.coordinates) {
      return null;
    }

    var coords = feature.geometry.coordinates;
    while (
      Array.isArray(coords) &&
      Array.isArray(coords[0]) &&
      Array.isArray(coords[0][0])
    ) {
      coords = coords[0];
    }

    if (isCoordinatePair(coords)) {
      return coords;
    }

    if (Array.isArray(coords) && isCoordinatePair(coords[0])) {
      return coords[0];
    }

    return null;
  }

  function getCombinedBounds(datasets) {
    var bounds = null;

    datasets.forEach(function (dataset) {
      if (!dataset || !dataset.geojson || !dataset.geojson.features) {
        return;
      }

      dataset.geojson.features.forEach(function (feature) {
        if (!feature || !feature.geometry) {
          return;
        }

        bounds = walkCoordinates(bounds, feature.geometry.coordinates);
      });
    });

    return bounds;
  }

  function walkCoordinates(bounds, coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return bounds;
    }

    // A coordinate pair is two numbers: [lng, lat]
    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      return includeCoordinate(bounds, coordinates[0], coordinates[1]);
    }

    // Otherwise recurse into sub-arrays (rings, polygons, multipolygons, etc.)
    var next = bounds;
    for (var i = 0; i < coordinates.length; i++) {
      next = walkCoordinates(next, coordinates[i]);
    }

    return next;
  }

  function includeCoordinate(bounds, lng, lat) {
    if (!isFinite(lng) || !isFinite(lat)) {
      return bounds;
    }

    if (!bounds) {
      return [
        [lng, lat],
        [lng, lat]
      ];
    }

    return [
      [Math.min(bounds[0][0], lng), Math.min(bounds[0][1], lat)],
      [Math.max(bounds[1][0], lng), Math.max(bounds[1][1], lat)]
    ];
  }
})();
