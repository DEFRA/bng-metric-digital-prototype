(function () {
  'use strict';

  document.addEventListener('DOMContentLoaded', function () {
    initHabitatDetailsMap();
  });

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      if (
        window.habitatDetailsInteractiveMap &&
        typeof window.habitatDetailsInteractiveMap.unmount === 'function'
      ) {
        window.habitatDetailsInteractiveMap.unmount();
      }

      window.habitatDetailsInteractiveMap = null;
      initHabitatDetailsMap();
    }
  });

  function initHabitatDetailsMap() {
    var mapContainer = document.getElementById('map-habitat-details');
    if (!mapContainer) {
      return;
    }

    clearPersistedMapView(mapContainer.id);

    if (
      !window.defra ||
      !window.defra.InteractiveMap ||
      !window.defra.maplibreProvider ||
      !window.defra.datasetsPlugin
    ) {
      showMapPlaceholder(mapContainer, 'Interactive map library not available');
      return;
    }

    ensureProj4BritishNationalGrid();

    var dataEl = document.getElementById('geometries-data');
    if (!dataEl) {
      showMapPlaceholder(mapContainer, 'No geometry data available');
      return;
    }

    var mapData;
    try {
      mapData = JSON.parse(dataEl.textContent);
    } catch (error) {
      console.error('Failed to parse geometries-data:', error);
      showMapPlaceholder(mapContainer, 'Could not load geometry data');
      return;
    }

    var siteBoundary = mapData.siteBoundary || null;
    var allParcels = mapData.parcels || null;
    var selectedParcel = mapData.parcel || null;

    if (!hasFeatures(selectedParcel)) {
      showMapPlaceholder(mapContainer, 'No parcel geometry available');
      return;
    }

    var datasets = [];

    if (hasFeatures(siteBoundary)) {
      datasets.push({
        id: 'site-boundary-im',
        label: 'Site boundary',
        data: normalizeToWgs84(siteBoundary),
        fill: 'transparent',
        stroke: '#d4351c',
        strokeWidth: 3,
        strokeDashArray: [3, 2],
        showInLayers: true,
        showInKey: true
      });
    }

    if (hasFeatures(allParcels)) {
      datasets.push({
        id: 'all-parcels-im',
        label: 'Other parcels',
        data: normalizeToWgs84(allParcels),
        fill: 'rgba(107, 114, 128, 0.08)',
        stroke: '#6b7280',
        strokeWidth: 1.5,
        showInLayers: true,
        showInKey: true
      });
    }

    datasets.push({
      id: 'selected-parcel-im',
      label: 'Selected parcel',
      data: normalizeToWgs84(selectedParcel),
      fill: 'rgba(255, 221, 0, 0.35)',
      stroke: '#ffdd00',
      strokeWidth: 4,
      showInLayers: true,
      showInKey: true
    });

    var mapBounds = getCombinedBounds(datasets);

    try {
      window.habitatDetailsInteractiveMap = new window.defra.InteractiveMap(
        mapContainer.id,
        {
          mapProvider: window.defra.maplibreProvider(),
          behaviour: 'inline',
          mapLabel: 'Habitat parcel map preview',
          containerHeight: '400px',
          bounds: mapBounds || [[-7.57, 49.96], [1.68, 58.64]],
          minZoom: 5,
          maxZoom: 20,
          enableZoomControls: true,
          mapStyle: {
            url: '/api/os/tiles/style/3857'
          },
          plugins: [
            window.defra.datasetsPlugin({
              datasets: datasets
            })
          ]
        }
      );
    } catch (error) {
      console.error('Failed to initialize habitat details interactive map:', error);
      showMapPlaceholder(mapContainer, 'Could not load interactive map');
    }
  }

  function hasFeatures(geoJson) {
    return !!(
      geoJson &&
      geoJson.features &&
      Array.isArray(geoJson.features) &&
      geoJson.features.length > 0
    );
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

  function normalizeToWgs84(geoJson) {
    if (!geoJson || !geoJson.features || !geoJson.features.length) {
      return geoJson;
    }

    var cloned = JSON.parse(JSON.stringify(geoJson));
    cloned.features = cloned.features.map(function (feature) {
      if (!feature.geometry || !feature.geometry.coordinates) {
        return feature;
      }

      feature.geometry.coordinates = transformCoordinates(feature.geometry.coordinates);
      return feature;
    });

    return cloned;
  }

  function transformCoordinates(coords) {
    if (!Array.isArray(coords)) {
      return coords;
    }

    if (isCoordinatePair(coords)) {
      return transformCoordinate(coords);
    }

    return coords.map(transformCoordinates);
  }

  function transformCoordinate(coord) {
    if (!window.proj4 || !isCoordinatePair(coord)) {
      return coord;
    }

    if (!looksLikeBng(coord)) {
      return coord;
    }

    try {
      return window.proj4('EPSG:27700', 'EPSG:4326', coord);
    } catch (error) {
      console.warn('Coordinate transform failed:', error);
      return coord;
    }
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
    return (
      Math.abs(coord[0]) > 1000 &&
      Math.abs(coord[0]) < 800000 &&
      Math.abs(coord[1]) < 1400000
    );
  }

  function getCombinedBounds(datasets) {
    var bounds = null;

    datasets.forEach(function (dataset) {
      if (!dataset || !dataset.data || !dataset.data.features) {
        return;
      }

      dataset.data.features.forEach(function (feature) {
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

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      return includeCoordinate(bounds, coordinates[0], coordinates[1]);
    }

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
      return [[lng, lat], [lng, lat]];
    }

    return [
      [
        Math.min(bounds[0][0], lng),
        Math.min(bounds[0][1], lat)
      ],
      [
        Math.max(bounds[1][0], lng),
        Math.max(bounds[1][1], lat)
      ]
    ];
  }

  function clearPersistedMapView(mapId) {
    if (!mapId || !window.history || !window.history.replaceState || !window.location) {
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
    var nextUrl = url.pathname + (nextSearch ? '?' + nextSearch : '') + url.hash;

    window.history.replaceState(window.history.state, '', nextUrl);
  }

  function showMapPlaceholder(container, message) {
    container.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#505a5f;">' +
      '<p>' +
      message +
      '</p></div>';
  }
})();
