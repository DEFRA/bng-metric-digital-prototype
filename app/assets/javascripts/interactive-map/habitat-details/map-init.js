(function () {
  'use strict';

  var HABITAT_DETAILS_PANEL_ID = 'habitatDetailsPanel';
  var cachedHabitatDetails = null;

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
      !window.defra.datasetsPlugin ||
      !window.defra.mapKeyPlugin
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

    var panelDataEl = document.getElementById('selected-habitat-panel-data');
    var panelData = {};

    if (panelDataEl) {
      try {
        panelData = JSON.parse(panelDataEl.textContent);
      } catch (error) {
        console.warn('Failed to parse selected habitat panel data:', error);
      }
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
    var hedgerows = mapData.hedgerows || null;
    var watercourses = mapData.watercourses || null;

    if (!hasFeatures(selectedParcel)) {
      showMapPlaceholder(mapContainer, 'No parcel geometry available');
      return;
    }

    var datasets = [];

    if (hasFeatures(siteBoundary)) {
      datasets.push({
        id: 'site-boundary-im',
        label: 'Site boundary',
        geojson: normalizeToWgs84(siteBoundary),
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

    if (hasFeatures(allParcels)) {
      datasets.push({
        id: 'habitat-parcels-im',
        label: 'Habitat parcels',
        geojson: normalizeToWgs84(allParcels),
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

    if (hasFeatures(hedgerows)) {
      datasets.push({
        id: 'hedgerows-im',
        label: 'Hedgerows',
        geojson: normalizeToWgs84(hedgerows),
        style: {
          stroke: '#00703c',
          strokeWidth: 3,
          keySymbolShape: 'line'
        },
        showInMenu: true,
        showInKey: true
      });
    }

    if (hasFeatures(watercourses)) {
      datasets.push({
        id: 'watercourses-im',
        label: 'Watercourses',
        geojson: normalizeToWgs84(watercourses),
        style: {
          stroke: '#1d70b8',
          strokeWidth: 3,
          keySymbolShape: 'line'
        },
        showInMenu: true,
        showInKey: true
      });
    }

    datasets.push({
      id: 'selected-parcel-im',
      label: 'Selected parcel',
      geojson: normalizeToWgs84(selectedParcel),
      style: {
        fill: 'rgba(255, 221, 0, 0.35)',
        stroke: '#ffdd00',
        strokeWidth: 4
      },
      showInMenu: true,
      showInKey: false
    });

    var mapBounds = getCombinedBounds(datasets);

    try {
      window.habitatDetailsInteractiveMap = new window.defra.InteractiveMap(
        mapContainer.id,
        {
          mapProvider: window.defra.maplibreProvider(),
          behaviour: 'inline',
          mapLabel: 'Habitat parcel map preview',
          containerHeight: '540px',
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

      if (typeof window.habitatDetailsInteractiveMap.on === 'function') {
        window.habitatDetailsInteractiveMap.on('map:ready', function () {
          window.habitatDetailsInteractiveMap.addButton('fitToExtent', {
            group: 'zoom',
            label: 'Fit to full extent',
            iconSvgContent:
              '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
            onClick: function (event, context) {
              if (mapBounds && context && context.mapProvider) {
                context.mapProvider.fitToBounds(mapBounds);
              }
            },
            mobile: { slot: 'right-top', showLabel: false },
            tablet: { slot: 'right-top', showLabel: false },
            desktop: { slot: 'right-top', showLabel: false }
          });

          cachedHabitatDetails = buildSelectedHabitatDetails(
            selectedParcel.features[0],
            panelData
          );

          showHabitatDetailsPanel(cachedHabitatDetails);
        });

        window.habitatDetailsInteractiveMap.on(
          'app:panelclosed',
          function (event) {
            if (
              event &&
              event.panelId &&
              event.panelId !== HABITAT_DETAILS_PANEL_ID
            ) {
              if (cachedHabitatDetails) {
                showHabitatDetailsPanel(cachedHabitatDetails);
              }
            }
          }
        );

        var hideDetailsWhenOtherPanelOpens = function (event) {
          if (
            event &&
            event.panelId &&
            event.panelId !== HABITAT_DETAILS_PANEL_ID &&
            typeof window.habitatDetailsInteractiveMap.hidePanel === 'function'
          ) {
            window.habitatDetailsInteractiveMap.hidePanel(
              HABITAT_DETAILS_PANEL_ID
            );
          }
        };

        window.habitatDetailsInteractiveMap.on(
          'app:panelopened',
          hideDetailsWhenOtherPanelOpens
        );
        window.habitatDetailsInteractiveMap.on(
          'app:panelopen',
          hideDetailsWhenOtherPanelOpens
        );
      }
    } catch (error) {
      console.error(
        'Failed to initialize habitat details interactive map:',
        error
      );
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

  function buildSelectedHabitatDetails(feature, panelData) {
    var properties = feature && feature.properties ? feature.properties : {};

    return {
      reference:
        firstDefinedValue([panelData.reference, properties['Parcel Ref']]) ||
        'Habitat',
      habitatType:
        firstDefinedValue([
          panelData.habitatType,
          properties['Baseline Habitat Type'],
          properties['Proposed Habitat Type'],
          properties.habitatType
        ]) || '-',
      metricLabel: 'Area',
      metricValue: firstDefinedValue([panelData.area]) || '-',
      position: toSentenceCase(
        firstDefinedValue([
          properties.Position,
          properties.position,
          properties.positionType,
          properties.position_type,
          properties['Baseline Position'],
          properties['Baseline position'],
          properties['Proposed Position'],
          properties['Proposed position']
        ]) || '-'
      ),
      adjacentTo:
        firstDefinedValue([
          properties['Adjacent To'],
          properties['Adjacent to'],
          properties.adjacentTo,
          properties.adjacent_to,
          properties.AdjacentTo,
          properties['Adjent To'],
          properties['Baseline Adjacent To'],
          properties['Baseline Adjacent to'],
          properties['Proposed Adjacent To'],
          properties['Proposed Adjacent to']
        ]) || '-',
      boundaryEdge:
        firstDefinedValue([
          properties['Boundary edge'],
          properties['Boundary Edge'],
          properties['Boundary-edge'],
          properties.boundaryEdge,
          properties.boundary_edge,
          properties.BoundaryEdge,
          properties['On boundary edge'],
          properties['Baseline Boundary edge'],
          properties['Baseline Boundary Edge'],
          properties['Proposed Boundary edge'],
          properties['Proposed Boundary Edge']
        ]) || '-'
    };
  }

  function showHabitatDetailsPanel(details) {
    var mapApp = window.habitatDetailsInteractiveMap;
    if (
      !mapApp ||
      typeof mapApp.addPanel !== 'function' ||
      typeof mapApp.showPanel !== 'function'
    ) {
      return;
    }

    mapApp.addPanel(HABITAT_DETAILS_PANEL_ID, {
      label: escapeHtml('Habitat ' + (details.reference || '')),
      mobile: {
        slot: 'inset',
        dismissable: false,
        exclusive: false,
        width: '340px'
      },
      tablet: {
        slot: 'inset',
        dismissable: false,
        exclusive: false,
        width: '380px'
      },
      desktop: {
        slot: 'inset',
        dismissable: false,
        exclusive: false,
        width: '420px'
      },
      html: buildHabitatDetailsPanelHtml(details)
    });

    mapApp.showPanel(HABITAT_DETAILS_PANEL_ID);
  }

  function buildHabitatDetailsPanelHtml(details) {
    var safeHabitatType = escapeHtml(details.habitatType || '-');
    var safeMetricLabel = escapeHtml(details.metricLabel || 'Area');
    var safeMetricValue = escapeHtml(details.metricValue || '-');
    var safePosition = escapeHtml(details.position || '-');
    var safeAdjacentTo = escapeHtml(details.adjacentTo || '-');
    var safeBoundaryEdge = escapeHtml(details.boundaryEdge || '-');

    return (
      '<p class="govuk-body govuk-!-margin-bottom-4">' +
      safeHabitatType +
      '</p>' +
      '<table class="govuk-table govuk-!-margin-bottom-0">' +
      '<tbody class="govuk-table__body">' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Position</th><td class="govuk-table__cell">' +
      safePosition +
      '</td></tr>' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">' +
      safeMetricLabel +
      '</th><td class="govuk-table__cell">' +
      safeMetricValue +
      '</td></tr>' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Adjacent to</th><td class="govuk-table__cell">' +
      safeAdjacentTo +
      '</td></tr>' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Boundary edge</th><td class="govuk-table__cell">' +
      safeBoundaryEdge +
      '</td></tr>' +
      '</tbody>' +
      '</table>'
    );
  }

  function firstDefinedValue(values) {
    if (!Array.isArray(values)) {
      return '';
    }

    for (var i = 0; i < values.length; i++) {
      var value = values[i];
      if (value === null || value === undefined) {
        continue;
      }

      var text = getTrimmedText(String(value));
      if (text) {
        return text;
      }
    }

    return '';
  }

  function toSentenceCase(value) {
    var text = getTrimmedText(value || '');
    if (!text) {
      return '';
    }

    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  function getTrimmedText(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
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

      feature.geometry.coordinates = transformCoordinates(
        feature.geometry.coordinates
      );
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
})();
