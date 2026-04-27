(function () {
  'use strict';

  var interactiveMapState = {
    fullBounds: null,
    map: null,
    hoverHandlersBound: false,
    interactPlugin: null,
    selectedLink: null,
    selectedFeatureKey: null,
    lastInteractionSource: null,
    datasetsByType: {
      parcel: [],
      hedgerow: [],
      watercourse: []
    }
  };

  var HOVER_SOURCE_ID = 'habitats-summary-hover-source';
  var HOVER_FILL_LAYER_ID = 'habitats-summary-hover-fill';
  var HOVER_LINE_LAYER_ID = 'habitats-summary-hover-line';
  var HABITAT_DETAILS_PANEL_ID = 'habitatDetailsPanel';
  var HABITAT_HELP_PANEL_ID = 'habitatHelpBanner';
  var HOVERABLE_LAYER_IDS = [
    'habitat-parcels-im',
    'habitat-parcels-im-stroke',
    'hedgerows-im',
    'watercourses-im'
  ];

  document.addEventListener('DOMContentLoaded', function () {
    initInteractiveMapPreview();
  });

  window.addEventListener('pageshow', function (event) {
    if (event.persisted) {
      if (
        window.habitatsSummaryInteractiveMap &&
        typeof window.habitatsSummaryInteractiveMap.unmount === 'function'
      ) {
        window.habitatsSummaryInteractiveMap.unmount();
      }

      window.habitatsSummaryInteractiveMap = null;
      initInteractiveMapPreview();
    }
  });

  function initInteractiveMapPreview() {
    var mapContainer = document.getElementById('map-preview-im');
    if (!mapContainer) {
      return;
    }

    interactiveMapState.fullBounds = null;
    interactiveMapState.map = null;
    interactiveMapState.interactPlugin = null;
    interactiveMapState.selectedLink = null;
    interactiveMapState.selectedFeatureKey = null;
    interactiveMapState.lastInteractionSource = null;
    interactiveMapState.datasetsByType = {
      parcel: [],
      hedgerow: [],
      watercourse: []
    };

    clearPersistedMapView(mapContainer.id);

    if (
      !window.defra ||
      !window.defra.InteractiveMap ||
      !window.defra.maplibreProvider ||
      !window.defra.datasetsPlugin ||
      !window.defra.interactPlugin
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

    var mapData;
    try {
      mapData = JSON.parse(geometriesDataEl.textContent);
    } catch (error) {
      console.error('Failed to parse geometries:', error);
      showMapPlaceholder(mapContainer, 'Could not load geometry data');
      return;
    }

    var datasets = [];
    var boundaryGeoJson = mapData.siteBoundary || null;
    var parcelsGeoJson = mapData.parcels || null;
    var hedgerowsGeoJson = mapData.hedgerows || null;
    var watercoursesGeoJson = mapData.watercourses || null;

    if (hasFeatures(boundaryGeoJson)) {
      datasets.push({
        id: 'site-boundary-im',
        label: 'Site boundary',
        data: normalizeToWgs84(boundaryGeoJson),
        fill: 'transparent',
        stroke: '#d4351c',
        strokeWidth: 3,
        strokeDashArray: [3, 2],
        showInLayers: true,
        showInKey: true
      });
    }

    if (hasFeatures(parcelsGeoJson)) {
      var normalizedParcels = normalizeToWgs84(
        parcelsGeoJson,
        buildFeatureMetadataBuilder('parcel')
      );

      interactiveMapState.datasetsByType.parcel = normalizedParcels.features;

      datasets.push({
        id: 'habitat-parcels-im',
        label: 'Habitat parcels',
        data: normalizedParcels,
        fill: '#1d70b8',
        stroke: '#1d70b8',
        strokeWidth: 2,
        opacity: 0.3,
        showInLayers: true,
        showInKey: true
      });
    }

    if (hasFeatures(hedgerowsGeoJson)) {
      var normalizedHedgerows = normalizeToWgs84(
        hedgerowsGeoJson,
        buildFeatureMetadataBuilder('hedgerow')
      );

      interactiveMapState.datasetsByType.hedgerow = normalizedHedgerows.features;

      datasets.push({
        id: 'hedgerows-im',
        label: 'Hedgerows',
        data: normalizedHedgerows,
        stroke: '#00703c',
        strokeWidth: 3,
        keySymbolShape: 'line',
        showInLayers: true,
        showInKey: true
      });
    }

    if (hasFeatures(watercoursesGeoJson)) {
      var normalizedWatercourses = normalizeToWgs84(
        watercoursesGeoJson,
        buildFeatureMetadataBuilder('watercourse')
      );

      interactiveMapState.datasetsByType.watercourse = normalizedWatercourses.features;

      datasets.push({
        id: 'watercourses-im',
        label: 'Watercourses',
        data: normalizedWatercourses,
        stroke: '#1d70b8',
        strokeWidth: 3,
        keySymbolShape: 'line',
        showInLayers: true,
        showInKey: true
      });
    }

    if (!datasets.length) {
      showMapPlaceholder(mapContainer, 'No valid layers to display');
      return;
    }

    var mapBounds = getCombinedBounds(datasets);
    interactiveMapState.fullBounds = mapBounds || [[-7.57, 49.96], [1.68, 58.64]];

    var interactPlugin = window.defra.interactPlugin({
      interactionMode: 'select',
      closeOnDone: false,
      closeOnCancel: false,
      dataLayers: [
        {
          layerId: 'habitat-parcels-im',
          idProperty: '__imFeatureKey',
          selectedFeatureStyle: {
            stroke: '#ffdd00',
            fill: 'rgba(255, 221, 0, 0.35)',
            strokeWidth: 4
          }
        },
        {
          layerId: 'hedgerows-im',
          idProperty: '__imFeatureKey',
          selectedFeatureStyle: {
            stroke: '#ffdd00',
            strokeWidth: 6
          }
        },
        {
          layerId: 'watercourses-im',
          idProperty: '__imFeatureKey',
          selectedFeatureStyle: {
            stroke: '#ffdd00',
            strokeWidth: 6
          }
        }
      ]
    });

    interactiveMapState.interactPlugin = interactPlugin;

    try {
      window.habitatsSummaryInteractiveMap = new window.defra.InteractiveMap(
        mapContainer.id,
        {
          mapProvider: window.defra.maplibreProvider(),
          behaviour: 'inline',
          mapLabel: 'Interactive map preview',
          containerHeight: '500px',
          bounds: interactiveMapState.fullBounds,
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
            interactPlugin
          ]
        }
      );

      configureHabitatHelpBanner(window.habitatsSummaryInteractiveMap);

      setupTableClickHandlers();

      if (typeof window.habitatsSummaryInteractiveMap.on === 'function') {
        window.habitatsSummaryInteractiveMap.on('map:ready', function (event) {
          configureHabitatHelpBanner(window.habitatsSummaryInteractiveMap);

          interactiveMapState.map = event && event.map ? event.map : getMapInstance();

          setupHoverInteractions(interactiveMapState.map);

          if (!interactiveMapState.map) {
            window.setTimeout(function () {
              interactiveMapState.map = getMapInstance();
              setupHoverInteractions(interactiveMapState.map);
            }, 0);
          }

          if (
            interactiveMapState.interactPlugin &&
            typeof interactiveMapState.interactPlugin.enable === 'function'
          ) {
            interactiveMapState.interactPlugin.enable();
          }
        });

        window.habitatsSummaryInteractiveMap.on('map:click', function (event) {
          interactiveMapState.lastInteractionSource = 'map';
        });

        window.habitatsSummaryInteractiveMap.on(
          'interact:selectionchange',
          function (event) {
            handleSelectionChange(event || {});
          }
        );

        window.habitatsSummaryInteractiveMap.on('interact:cancel', function () {
          clearSelectedRow();
          hideHabitatDetailsPanel();
          zoomToFullExtent();
        });
      }
    } catch (error) {
      console.error('Failed to initialize interactive map:', error);
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

  function buildFeatureMetadataBuilder(featureType) {
    return function (properties, index) {
      return {
        __imFeatureType: featureType,
        __imFeatureIndex: index,
        __imFeatureKey: featureType + ':' + index
      };
    };
  }

  function normalizeToWgs84(geoJson, metadataBuilder) {
    return {
      type: geoJson.type,
      features: geoJson.features.map(function (feature, index) {
        var baseProperties = feature.properties || {};
        var metadata =
          typeof metadataBuilder === 'function'
            ? metadataBuilder(baseProperties, index, feature)
            : null;

        return {
          type: feature.type,
          properties: metadata
            ? Object.assign({}, baseProperties, metadata)
            : baseProperties,
          geometry: {
            type: feature.geometry.type,
            coordinates: transformCoordinates(feature.geometry.coordinates)
          }
        };
      })
    };
  }

  function setupTableClickHandlers() {
    document.querySelectorAll('.habitat-ref-link').forEach(function (link) {
      if (link.dataset.imBound === 'true') {
        return;
      }

      link.dataset.imBound = 'true';
      link.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopImmediatePropagation();

        handleTableSelection(
          this.dataset.featureType,
          parseInt(this.dataset.featureIndex, 10),
          this
        );
      }, true);
    });
  }

  function getMapInstance() {
    return (
      window.habitatsSummaryInteractiveMap &&
      window.habitatsSummaryInteractiveMap.mapProvider &&
      window.habitatsSummaryInteractiveMap.mapProvider.map
    );
  }

  function setupHoverInteractions(map) {
    if (!map || interactiveMapState.hoverHandlersBound) {
      return;
    }

    function bindHoverHandlers() {
      if (interactiveMapState.hoverHandlersBound) {
        return;
      }

      try {
        ensureHoverLayers(map);
      } catch (error) {
        console.warn('Failed to setup hover layers, will retry on next style event:', error);
        return;
      }

      map.on('mousemove', function (event) {
        var hoveredFeature = getHoveredFeatureAtPoint(event && event.point);
        if (hoveredFeature) {
          setMapCursor('pointer');
          setHoverFeature(hoveredFeature);
        } else {
          setMapCursor('');
          clearHoverFeature();
        }
      });

      map.on('mouseleave', function () {
        setMapCursor('');
        clearHoverFeature();
      });

      interactiveMapState.hoverHandlersBound = true;
    }

    if (typeof map.isStyleLoaded === 'function' && map.isStyleLoaded()) {
      bindHoverHandlers();
      return;
    }

    if (typeof map.once === 'function') {
      map.once('styledata', bindHoverHandlers);
    } else {
      window.setTimeout(bindHoverHandlers, 0);
    }
  }

  function ensureHoverLayers(map) {
    if (!map.getSource(HOVER_SOURCE_ID)) {
      map.addSource(HOVER_SOURCE_ID, {
        type: 'geojson',
        data: emptyFeatureCollection()
      });
    }

    if (!map.getLayer(HOVER_FILL_LAYER_ID)) {
      map.addLayer({
        id: HOVER_FILL_LAYER_ID,
        type: 'fill',
        source: HOVER_SOURCE_ID,
        filter: ['==', ['geometry-type'], 'Polygon'],
        paint: {
          'fill-color': '#ffdd00',
          'fill-opacity': 0.2
        }
      });
    }

    if (!map.getLayer(HOVER_LINE_LAYER_ID)) {
      map.addLayer({
        id: HOVER_LINE_LAYER_ID,
        type: 'line',
        source: HOVER_SOURCE_ID,
        paint: {
          'line-color': '#ffdd00',
          'line-width': 5
        }
      });
    }
  }

  function getHoveredFeatureAtPoint(point) {
    var map = interactiveMapState.map;
    if (!map || !point || typeof map.queryRenderedFeatures !== 'function') {
      return null;
    }

    var hoverableLayers = getExistingHoverableLayerIds(map);
    var features = hoverableLayers.length
      ? map.queryRenderedFeatures(point, { layers: hoverableLayers })
      : map.queryRenderedFeatures(point);

    if (!features.length) {
      return null;
    }

    var first = features.find(function (feature) {
      return buildHoverFeatureIdentity(feature) !== null;
    });

    if (!first) {
      return null;
    }

    if (!first.geometry) {
      return null;
    }

    var identified = buildHoverFeatureIdentity(first);

    return {
      type: 'Feature',
      properties: identified ? identified.properties : first.properties || {},
      geometry: first.geometry
    };
  }

  function getExistingHoverableLayerIds(map) {
    if (!map || typeof map.getLayer !== 'function') {
      return [];
    }

    return HOVERABLE_LAYER_IDS.filter(function (layerId) {
      return !!map.getLayer(layerId);
    });
  }

  function buildHoverFeatureIdentity(feature) {
    if (!feature) {
      return null;
    }

    var properties = Object.assign({}, feature.properties || {});

    if (typeof properties.__imFeatureKey === 'string') {
      return {
        properties: properties
      };
    }

    var featureType = inferFeatureTypeFromLayer(feature.layer && feature.layer.id);
    var featureIndex = parseInt(
      properties.__imFeatureIndex != null ? properties.__imFeatureIndex : feature.id,
      10
    );

    if (!featureType || !isFinite(featureIndex)) {
      return null;
    }

    properties.__imFeatureType = featureType;
    properties.__imFeatureIndex = featureIndex;
    properties.__imFeatureKey = getFeatureKey(featureType, featureIndex);

    return {
      properties: properties
    };
  }

  function inferFeatureTypeFromLayer(layerId) {
    if (layerId === 'habitat-parcels-im' || layerId === 'habitat-parcels-im-stroke') {
      return 'parcel';
    }
    if (layerId === 'hedgerows-im') {
      return 'hedgerow';
    }
    if (layerId === 'watercourses-im') {
      return 'watercourse';
    }

    return null;
  }

  function getLayerIdForFeatureType(featureType) {
    if (featureType === 'parcel') {
      return 'habitat-parcels-im';
    }

    if (featureType === 'hedgerow') {
      return 'hedgerows-im';
    }

    if (featureType === 'watercourse') {
      return 'watercourses-im';
    }

    return null;
  }

  function setHoverFeature(feature) {
    var map = interactiveMapState.map;
    if (!map) {
      return;
    }

    var source = map.getSource(HOVER_SOURCE_ID);
    if (!source || typeof source.setData !== 'function') {
      return;
    }

    source.setData({
      type: 'FeatureCollection',
      features: [cloneFeature(feature)]
    });
  }

  function clearHoverFeature() {
    var map = interactiveMapState.map;
    if (!map) {
      return;
    }

    var source = map.getSource(HOVER_SOURCE_ID);
    if (!source || typeof source.setData !== 'function') {
      return;
    }

    source.setData(emptyFeatureCollection());
  }

  function emptyFeatureCollection() {
    return {
      type: 'FeatureCollection',
      features: []
    };
  }

  function cloneFeature(feature) {
    return JSON.parse(JSON.stringify(feature));
  }

  function handleSelectionChange(event) {
    var selectedFeatures =
      event && Array.isArray(event.selectedFeatures) ? event.selectedFeatures : [];

    if (!selectedFeatures.length) {
      clearSelectedRow();
      hideHabitatDetailsPanel();
      interactiveMapState.lastInteractionSource = null;
      return;
    }

    var selected = selectedFeatures[selectedFeatures.length - 1] || null;
    var parsed = selected
      ? parseFeatureKey(selected.featureId, selected.properties)
      : null;

    if (!parsed) {
      clearSelectedRow();
      hideHabitatDetailsPanel();
      interactiveMapState.lastInteractionSource = null;
      return;
    }

    var link = getTableLink(parsed.featureType, parsed.featureIndex);
    setSelectedRow(link || null, parsed.featureKey);

    var details = getSelectionDetails(parsed, link || null);
    if (details) {
      showHabitatDetailsPanel(details);
    } else {
      hideHabitatDetailsPanel();
    }

    interactiveMapState.lastInteractionSource = null;
  }

  function handleTableSelection(featureType, featureIndex, linkElement) {
    if (!featureType || !isFinite(featureIndex)) {
      return;
    }

    if (!interactiveMapState.interactPlugin) {
      return;
    }

    var featureKey = getFeatureKey(featureType, featureIndex);
    var parsed = {
      featureType: featureType,
      featureIndex: featureIndex
    };

    interactiveMapState.lastInteractionSource = 'table';
    interactiveMapState.interactPlugin.selectFeature({
      featureId: featureKey,
      layerId: getLayerIdForFeatureType(featureType),
      idProperty: '__imFeatureKey'
    });

    if (linkElement) {
      setSelectedRow(linkElement, featureKey);
    }

    var details = getSelectionDetails(parsed, linkElement || null);
    if (details) {
      showHabitatDetailsPanel(details);
    } else {
      hideHabitatDetailsPanel();
    }

    zoomToFeatureByTypeAndIndex(featureType, featureIndex);
    scrollToInteractiveMap();
  }

  function configureHabitatHelpBanner(mapApp) {
    if (!mapApp || typeof mapApp.addPanel !== 'function') {
      return;
    }

    mapApp.addPanel(HABITAT_HELP_PANEL_ID, {
      label: '',
      mobile: {
        slot: 'banner',
        dismissable: true,
        exclusive: false,
        initiallyOpen: true
      },
      tablet: {
        slot: 'banner',
        dismissable: true,
        exclusive: false,
        initiallyOpen: true
      },
      desktop: {
        slot: 'banner',
        dismissable: true,
        exclusive: false,
        initiallyOpen: true
      },
      html:
        '<div class="govuk-body govuk-!-margin-bottom-0" style="display:flex;align-items:center;gap:8px;">' +
        '<svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"></circle>' +
        '<line x1="12" y1="10" x2="12" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"></line>' +
        '<circle cx="12" cy="7" r="1.4" fill="currentColor"></circle>' +
        '</svg>' +
        '<span>Click on the habitats for information</span>' +
        '</div>'
    });

    if (typeof mapApp.showPanel === 'function') {
      mapApp.showPanel(HABITAT_HELP_PANEL_ID);
    }
  }

  function getSelectionDetails(parsed, link) {
    if (!parsed) {
      return null;
    }

    var feature = getFeatureByTypeAndIndex(parsed.featureType, parsed.featureIndex);
    var properties = feature && feature.properties ? feature.properties : {};
    var row = link ? link.closest('tr') : null;
    var cells = row
      ? Array.prototype.slice.call(row.querySelectorAll('th, td'))
      : [];

    var metricLabel = parsed.featureType === 'parcel' ? 'Area' : 'Length';
    var metricValue = getCellText(cells, 1) || '-';

    var habitatType = getCellText(cells, 2);
    if (!habitatType) {
      if (parsed.featureType === 'parcel') {
        habitatType = firstDefinedValue([
          properties['Baseline Habitat Type'],
          properties['Proposed Habitat Type'],
          properties.habitatType
        ]);
      } else if (parsed.featureType === 'hedgerow') {
        habitatType = firstDefinedValue([
          properties['Baseline Hedge Type'],
          properties['Proposed Hedge Type']
        ]);
      } else if (parsed.featureType === 'watercourse') {
        habitatType = firstDefinedValue([
          properties['Baseline River Type'],
          properties['Proposed River Type']
        ]);
      }
    }

    return {
      reference:
        (link && getTrimmedText(link.textContent)) ||
        firstDefinedValue([properties['Parcel Ref']]) ||
        parsed.featureType + ' ' + (parsed.featureIndex + 1),
      titlePrefix:
        parsed.featureType === 'parcel'
          ? 'Habitat '
          : parsed.featureType === 'hedgerow'
            ? 'Hedgerow '
            : 'Watercourse ',
      habitatType: habitatType || '-',
      metricLabel: metricLabel,
      metricValue: metricValue,
      position: firstDefinedValue([
        properties.Position,
        properties.position,
        properties['Baseline Position'],
        properties['Proposed Position']
      ]) || '-',
      adjacentTo: firstDefinedValue([
        properties['Adjacent To'],
        properties['Adjacent to'],
        properties['Adjent To'],
        properties['Baseline Adjacent To'],
        properties['Proposed Adjacent To']
      ]) || '-',
      boundaryEdge: firstDefinedValue([
        properties['Boundary edge'],
        properties['Boundary Edge'],
        properties['Boundary-edge'],
        properties['On boundary edge'],
        properties['Baseline Boundary edge'],
        properties['Proposed Boundary edge']
      ]) || '-',
      editUrl: row ? getRowActionHref(row) : '#'
    };
  }

  function showHabitatDetailsPanel(details) {
    var mapApp = window.habitatsSummaryInteractiveMap;
    if (
      !mapApp ||
      typeof mapApp.addPanel !== 'function' ||
      typeof mapApp.showPanel !== 'function'
    ) {
      return;
    }

    mapApp.addPanel(HABITAT_DETAILS_PANEL_ID, {
      label: 'Habitat details',
      mobile: {
        slot: 'inset',
        dismissable: true,
        exclusive: true,
        width: '320px'
      },
      tablet: {
        slot: 'inset',
        dismissable: true,
        exclusive: true,
        width: '340px'
      },
      desktop: {
        slot: 'inset',
        dismissable: true,
        exclusive: true,
        width: '360px'
      },
      html: buildHabitatDetailsPanelHtml(details)
    });

    mapApp.showPanel(HABITAT_DETAILS_PANEL_ID);
  }

  function hideHabitatDetailsPanel() {
    var mapApp = window.habitatsSummaryInteractiveMap;
    if (!mapApp || typeof mapApp.hidePanel !== 'function') {
      return;
    }

    mapApp.hidePanel(HABITAT_DETAILS_PANEL_ID);
  }

  function buildHabitatDetailsPanelHtml(details) {
    var safeTitlePrefix = escapeHtml(details.titlePrefix || 'Habitat ');
    var safeReference = escapeHtml(details.reference || '-');
    var safeHabitatType = escapeHtml(details.habitatType || '-');
    var safeMetricLabel = escapeHtml(details.metricLabel || 'Area');
    var safeMetricValue = escapeHtml(details.metricValue || '-');
    var safePosition = escapeHtml(details.position || '-');
    var safeAdjacentTo = escapeHtml(details.adjacentTo || '-');
    var safeBoundaryEdge = escapeHtml(details.boundaryEdge || '-');
    var safeEditUrl = escapeAttribute(details.editUrl || '#');

    return (
      '<h2 class="govuk-heading-m govuk-!-margin-bottom-2">' +
      safeTitlePrefix +
      safeReference +
      '</h2>' +
      '<p class="govuk-body govuk-!-margin-bottom-4">' +
      safeHabitatType +
      '</p>' +
      '<table class="govuk-table govuk-!-margin-bottom-4">' +
      '<tbody class="govuk-table__body">' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Position</th><td class="govuk-table__cell">' +
      safePosition +
      '</td></tr>' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">' +
      safeMetricLabel +
      '</th><td class="govuk-table__cell">' +
      safeMetricValue +
      '</td></tr>' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Adjacent To</th><td class="govuk-table__cell">' +
      safeAdjacentTo +
      '</td></tr>' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Boundary edge</th><td class="govuk-table__cell">' +
      safeBoundaryEdge +
      '</td></tr>' +
      '</tbody>' +
      '</table>' +
      '<a class="govuk-button govuk-button--secondary" data-module="govuk-button" href="' +
      safeEditUrl +
      '">Edit detail</a>'
    );
  }

  function getCellText(cells, index) {
    if (!cells || !cells[index]) {
      return '';
    }

    return getTrimmedText(cells[index].textContent);
  }

  function getTrimmedText(value) {
    if (typeof value !== 'string') {
      return '';
    }

    return value.replace(/\s+/g, ' ').trim();
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

  function getRowActionHref(row) {
    if (!row) {
      return '#';
    }

    var links = Array.prototype.slice.call(row.querySelectorAll('a[href]'));
    for (var i = links.length - 1; i >= 0; i--) {
      var href = links[i].getAttribute('href');
      if (href && href !== '#') {
        return href;
      }
    }

    return '#';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function parseFeatureKey(featureKey, properties) {
    var key =
      featureKey ||
      (properties && properties.__imFeatureKey ? properties.__imFeatureKey : null);

    if (!key || typeof key !== 'string') {
      return null;
    }

    var parts = key.split(':');
    if (parts.length !== 2) {
      return null;
    }

    var featureType = parts[0];
    var featureIndex = parseInt(parts[1], 10);
    if (!isFinite(featureIndex)) {
      return null;
    }

    return {
      featureType: featureType,
      featureIndex: featureIndex,
      featureKey: key
    };
  }

  function setSelectedRow(linkElement, featureKey) {
    if (
      interactiveMapState.selectedLink &&
      interactiveMapState.selectedLink !== linkElement
    ) {
      setRowHighlighted(interactiveMapState.selectedLink, false);
    }

    interactiveMapState.selectedFeatureKey = featureKey || null;
    interactiveMapState.selectedLink = linkElement || null;

    if (linkElement) {
      setRowHighlighted(linkElement, true);
    }
  }

  function clearSelectedRow() {
    if (interactiveMapState.selectedLink) {
      setRowHighlighted(interactiveMapState.selectedLink, false);
    }

    interactiveMapState.selectedLink = null;
    interactiveMapState.selectedFeatureKey = null;
  }

  function scrollToInteractiveMap() {
    var mapContainer = document.getElementById('map-preview-im');
    if (!mapContainer) {
      return;
    }

    mapContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function getFeatureByTypeAndIndex(featureType, featureIndex) {
    var features = interactiveMapState.datasetsByType[featureType] || [];
    return features[featureIndex] || null;
  }

  function getFeatureKey(featureType, featureIndex) {
    return featureType + ':' + featureIndex;
  }

  function zoomToFeatureByTypeAndIndex(featureType, featureIndex) {
    var feature = getFeatureByTypeAndIndex(featureType, featureIndex);
    if (!feature) {
      return;
    }

    zoomToFeature(feature);
  }

  function setRowHighlighted(linkElement, isHighlighted) {
    if (!linkElement) {
      return;
    }

    var row = linkElement.closest('tr');
    if (!row) {
      return;
    }

    row.classList.toggle('habitat-row--highlighted', !!isHighlighted);
  }

  function getTableLink(featureType, featureIndex) {
    return document.querySelector(
      '.habitat-ref-link[data-feature-type="' +
        featureType +
        '"][data-feature-index="' +
        featureIndex +
        '"]'
    );
  }

  function zoomToFeature(feature) {
    var bounds = getFeatureBounds(feature);
    if (!bounds) {
      return;
    }

    fitBounds(bounds, { padding: 80, maxZoom: 17 });
  }

  function zoomToFullExtent() {
    fitBounds(interactiveMapState.fullBounds, { padding: 40, maxZoom: 16 });
  }

  function fitBounds(bounds, options) {
    var map = interactiveMapState.map;
    if (!map || !bounds || typeof map.fitBounds !== 'function') {
      return;
    }

    map.fitBounds(bounds, {
      padding: options && options.padding ? options.padding : 40,
      duration: 500,
      maxZoom: options && options.maxZoom ? options.maxZoom : 16
    });
  }

  function getFeatureBounds(feature) {
    if (!feature || !feature.geometry) {
      return null;
    }

    var bounds = walkCoordinates(null, feature.geometry.coordinates);
    if (!bounds) {
      return null;
    }

    return [
      [bounds.minLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat]
    ];
  }

  function setMapCursor(cursor) {
    var map = interactiveMapState.map;
    if (!map || typeof map.getCanvas !== 'function') {
      return;
    }

    map.getCanvas().style.cursor = cursor || '';
  }

  function transformCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
      return coordinates;
    }

    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      return transformCoordinate(coordinates);
    }

    return coordinates.map(transformCoordinates);
  }

  function ensureProj4BritishNationalGrid() {
    if (!window.proj4 || typeof window.proj4.defs !== 'function') {
      return;
    }

    // Register EPSG:27700 so BNG geometry can be transformed to WGS84.
    window.proj4.defs(
      'EPSG:27700',
      '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
    );
  }

  function transformCoordinate(coordinate) {
    if (!window.proj4 || !Array.isArray(coordinate) || coordinate.length < 2) {
      return coordinate;
    }

    if (isLikelyBngCoordinate(coordinate)) {
      try {
        return window.proj4('EPSG:27700', 'EPSG:4326', coordinate);
      } catch (error) {
        console.warn('Failed to transform coordinate to WGS84:', error);
      }
    }

    return coordinate;
  }

  function isLikelyBngCoordinate(coordinate) {
    return (
      Math.abs(coordinate[0]) > 1000 &&
      Math.abs(coordinate[0]) < 800000 &&
      Math.abs(coordinate[1]) < 1400000
    );
  }

  function getCombinedBounds(datasets) {
    var bounds = null;

    datasets.forEach(function (dataset) {
      if (!dataset.data || !dataset.data.features) {
        return;
      }

      dataset.data.features.forEach(function (feature) {
        if (!feature.geometry) {
          return;
        }

        bounds = walkCoordinates(bounds, feature.geometry.coordinates);
      });
    });

    if (!bounds) {
      return null;
    }

    return [
      [bounds.minLng, bounds.minLat],
      [bounds.maxLng, bounds.maxLat]
    ];
  }

  function walkCoordinates(bounds, coordinates) {
    if (!Array.isArray(coordinates)) {
      return bounds;
    }

    if (typeof coordinates[0] === 'number' && typeof coordinates[1] === 'number') {
      return includeCoordinate(bounds, coordinates[0], coordinates[1]);
    }

    coordinates.forEach(function (childCoordinates) {
      bounds = walkCoordinates(bounds, childCoordinates);
    });

    return bounds;
  }

  function includeCoordinate(bounds, lng, lat) {
    if (!isFinite(lng) || !isFinite(lat)) {
      return bounds;
    }

    if (!bounds) {
      return {
        minLng: lng,
        minLat: lat,
        maxLng: lng,
        maxLat: lat
      };
    }

    if (lng < bounds.minLng) {
      bounds.minLng = lng;
    }
    if (lat < bounds.minLat) {
      bounds.minLat = lat;
    }
    if (lng > bounds.maxLng) {
      bounds.maxLng = lng;
    }
    if (lat > bounds.maxLat) {
      bounds.maxLat = lat;
    }

    return bounds;
  }
})();