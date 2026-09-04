(function () {
  'use strict';

  var interactiveMapState = {
    fullBounds: null,
    map: null,
    hoverHandlersBound: false,
    interactPlugin: null,
    datasetsPlugin: null,
    dashboardPanelConfigured: false,
    selectedLink: null,
    selectedFeatureKey: null,
    preserveSelectionOnDetailsClose: false,
    pendingSelectionClearTimer: null,
    lastInteractionSource: null,
    datasetsByType: {
      parcel: [],
      hedgerow: [],
      watercourse: [],
      tree: []
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
    'watercourses-im',
    'trees-im'
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

    var isDashboardMap =
      mapContainer.getAttribute('data-map-layout') === 'dashboard';

    interactiveMapState.fullBounds = null;
    interactiveMapState.map = null;
    interactiveMapState.interactPlugin = null;
    interactiveMapState.datasetsPlugin = null;
    interactiveMapState.dashboardPanelConfigured = false;
    interactiveMapState.selectedLink = null;
    interactiveMapState.selectedFeatureKey = null;
    interactiveMapState.lastInteractionSource = null;
    interactiveMapState.datasetsByType = {
      parcel: [],
      hedgerow: [],
      watercourse: [],
      tree: []
    };

    clearPersistedMapView(mapContainer.id);

    if (
      !window.defra ||
      !window.defra.InteractiveMap ||
      !window.defra.maplibreProvider ||
      !window.defra.datasetsPlugin ||
      !window.defra.interactPlugin ||
      (!isDashboardMap && !window.defra.mapKeyPlugin)
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
    var treesGeoJson = mapData.trees || null;
    if (hasFeatures(boundaryGeoJson)) {
      datasets.push({
        id: 'site-boundary-im',
        label: isDashboardMap ? 'Red line boundary' : 'Site boundary',
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

    if (hasFeatures(parcelsGeoJson)) {
      var normalizedParcels = normalizeToWgs84(
        parcelsGeoJson,
        buildFeatureMetadataBuilder('parcel')
      );

      interactiveMapState.datasetsByType.parcel = normalizedParcels.features;

      datasets.push({
        id: 'habitat-parcels-im',
        label: isDashboardMap ? 'Vertical area habitats' : 'Habitat parcels',
        geojson: normalizedParcels,
        idProperty: '__imFeatureKey',
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

    if (hasFeatures(hedgerowsGeoJson)) {
      var normalizedHedgerows = normalizeToWgs84(
        hedgerowsGeoJson,
        buildFeatureMetadataBuilder('hedgerow')
      );

      interactiveMapState.datasetsByType.hedgerow =
        normalizedHedgerows.features;

      datasets.push({
        id: 'hedgerows-im',
        label: 'Hedgerows',
        geojson: normalizedHedgerows,
        idProperty: '__imFeatureKey',
        style: {
          stroke: '#00703c',
          strokeWidth: 3,
          keySymbolShape: 'line'
        },
        showInMenu: true,
        showInKey: true
      });
    }

    if (hasFeatures(watercoursesGeoJson)) {
      var normalizedWatercourses = normalizeToWgs84(
        watercoursesGeoJson,
        buildFeatureMetadataBuilder('watercourse')
      );

      interactiveMapState.datasetsByType.watercourse =
        normalizedWatercourses.features;

      datasets.push({
        id: 'watercourses-im',
        label: 'Watercourses',
        geojson: normalizedWatercourses,
        idProperty: '__imFeatureKey',
        style: {
          stroke: '#1d70b8',
          strokeWidth: 3,
          keySymbolShape: 'line'
        },
        showInMenu: true,
        showInKey: true
      });
    }

    if (hasFeatures(treesGeoJson)) {
      var normalizedTrees = normalizeToWgs84(
        treesGeoJson,
        buildFeatureMetadataBuilder('tree')
      );

      interactiveMapState.datasetsByType.tree = normalizedTrees.features;

      datasets.push({
        id: 'trees-im',
        label: 'Trees',
        geojson: normalizedTrees,
        idProperty: '__imFeatureKey',
        style: {
          symbol: 'circle',
          symbolBackgroundColor: '#00703c',
          symbolForegroundColor: '#004b29'
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
    interactiveMapState.fullBounds = mapBounds || [
      [-7.57, 49.96],
      [1.68, 58.64]
    ];

    var interactPlugin = window.defra.interactPlugin({
      interactionModes: ['selectFeature'],
      closeOnAction: false,
      layers: [
        {
          layerId: 'habitat-parcels-im',
          idProperty: '__imFeatureKey',
          labelProperty: '__imFeatureKey',
          selectedStroke: '#ffdd00',
          selectedFill: 'rgba(255, 221, 0, 0.35)',
          selectedStrokeWidth: 4
        },
        {
          layerId: 'hedgerows-im',
          idProperty: '__imFeatureKey',
          labelProperty: '__imFeatureKey',
          selectedStroke: '#ffdd00',
          selectedStrokeWidth: 6
        },
        {
          layerId: 'watercourses-im',
          idProperty: '__imFeatureKey',
          labelProperty: '__imFeatureKey',
          selectedStroke: '#ffdd00',
          selectedStrokeWidth: 6
        },
        {
          layerId: 'trees-im',
          idProperty: '__imFeatureKey',
          labelProperty: '__imFeatureKey',
          selectedStroke: '#ffdd00',
          selectedFill: '#ffdd00',
          selectedStrokeWidth: 4
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
          containerHeight: isDashboardMap ? '100%' : '540px',
          bounds: interactiveMapState.fullBounds,
          minZoom: 5,
          maxZoom: 20,
          enableZoomControls: true,
          mapStyle: {
            url: '/api/os/tiles/style/3857'
          },
          plugins: buildMapPlugins(datasets, mapContainer, interactPlugin)
        }
      );

      configureHabitatHelpBanner(window.habitatsSummaryInteractiveMap);
      if (typeof window.habitatsSummaryInteractiveMap.on === 'function') {
        window.habitatsSummaryInteractiveMap.on('map:ready', function (event) {
          configureHabitatHelpBanner(window.habitatsSummaryInteractiveMap);
          configureDashboardLayersPanel(
            window.habitatsSummaryInteractiveMap,
            mapContainer,
            datasets
          );

          window.habitatsSummaryInteractiveMap.addButton('fitToExtent', {
            group: 'zoom',
            label: 'Fit to full extent',
            iconSvgContent:
              '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
            onClick: function () {
              zoomToFullExtent();
            },
            mobile: { slot: 'right-top', showLabel: false },
            tablet: { slot: 'right-top', showLabel: false },
            desktop: { slot: 'right-top', showLabel: false }
          });

          interactiveMapState.map =
            event && event.map ? event.map : getMapInstance();

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

          restoreReturnSelection();
        });

        window.habitatsSummaryInteractiveMap.on('map:click', function (event) {
          interactiveMapState.lastInteractionSource = 'map';
        });

        var markDetailsAsTemporarilyHidden = function (event) {
          if (
            event &&
            event.panelId &&
            event.panelId !== HABITAT_DETAILS_PANEL_ID
          ) {
            interactiveMapState.preserveSelectionOnDetailsClose = true;
            if (interactiveMapState.pendingSelectionClearTimer) {
              window.clearTimeout(
                interactiveMapState.pendingSelectionClearTimer
              );
              interactiveMapState.pendingSelectionClearTimer = null;
            }
          }
        };

        window.habitatsSummaryInteractiveMap.on(
          'app:panelopened',
          markDetailsAsTemporarilyHidden
        );
        window.habitatsSummaryInteractiveMap.on(
          'app:panelopen',
          markDetailsAsTemporarilyHidden
        );

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

        window.habitatsSummaryInteractiveMap.on(
          'app:panelclosed',
          function (event) {
            if (event && event.panelId === HABITAT_DETAILS_PANEL_ID) {
              var featureKey = interactiveMapState.selectedFeatureKey;
              var parsed = featureKey
                ? parseFeatureKey(featureKey, null)
                : null;

              if (interactiveMapState.pendingSelectionClearTimer) {
                window.clearTimeout(
                  interactiveMapState.pendingSelectionClearTimer
                );
                interactiveMapState.pendingSelectionClearTimer = null;
              }

              interactiveMapState.pendingSelectionClearTimer =
                window.setTimeout(function () {
                  interactiveMapState.pendingSelectionClearTimer = null;

                  if (interactiveMapState.preserveSelectionOnDetailsClose) {
                    return;
                  }

                  clearSelectedRow();
                  if (parsed && interactiveMapState.interactPlugin) {
                    interactiveMapState.interactPlugin.unselectFeature({
                      featureId: featureKey,
                      layerId: getLayerIdForFeatureType(parsed.featureType),
                      idProperty: '__imFeatureKey'
                    });
                  }
                }, 0);

              return;
            }

            if (
              event &&
              event.panelId &&
              event.panelId !== HABITAT_DETAILS_PANEL_ID &&
              interactiveMapState.preserveSelectionOnDetailsClose
            ) {
              interactiveMapState.preserveSelectionOnDetailsClose = false;
              restoreSelectedDetailsPanel();
            }
          }
        );
      }
    } catch (error) {
      console.error('Failed to initialize interactive map:', error);
      showMapPlaceholder(mapContainer, 'Could not load interactive map');
    }
  }

  function buildMapPlugins(datasets, mapContainer, interactPlugin) {
    var plugins = [
      createDatasetsPlugin(datasets, mapContainer),
      interactPlugin
    ];

    if (mapContainer.getAttribute('data-map-layout') !== 'dashboard') {
      plugins.push(window.defra.mapKeyPlugin());
    }

    return plugins;
  }

  function createDatasetsPlugin(datasets, mapContainer) {
    var plugin = window.defra.datasetsPlugin({
      datasets: datasets
    });

    interactiveMapState.datasetsPlugin = plugin;

    if (
      !mapContainer ||
      mapContainer.getAttribute('data-map-layout') !== 'dashboard' ||
      typeof plugin.load !== 'function'
    ) {
      return plugin;
    }

    var loadPlugin = plugin.load;
    plugin.load = async function () {
      var manifest = await loadPlugin();
      var panels = (manifest.panels || []).filter(function (panel) {
        return panel.id !== 'datasetsLayers';
      });
      var buttons = (manifest.buttons || []).filter(function (button) {
        return button.id !== 'datasetsLayers';
      });

      return Object.assign({}, manifest, {
        panels: panels,
        buttons: buttons
      });
    };

    return plugin;
  }

  function configureDashboardLayersPanel(mapApp, mapContainer, datasets) {
    if (
      interactiveMapState.dashboardPanelConfigured ||
      !mapApp ||
      !mapContainer ||
      mapContainer.getAttribute('data-map-layout') !== 'dashboard' ||
      typeof mapApp.addPanel !== 'function'
    ) {
      return;
    }

    interactiveMapState.dashboardPanelConfigured = true;

    mapApp.addPanel('dashboardLayers', {
      label: 'Map information and layers',
      showLabel: false,
      mobile: {
        slot: 'bottom',
        initiallyOpen: false,
        dismissable: true,
        modal: true
      },
      tablet: {
        slot: 'side',
        initiallyOpen: true,
        dismissable: false,
        modal: false
      },
      desktop: {
        slot: 'side',
        initiallyOpen: true,
        dismissable: false,
        modal: false
      },
      html: buildDashboardLayersPanelHtml(mapContainer, datasets)
    });

    if (typeof mapApp.addButton === 'function') {
      mapApp.addButton('dashboardLayers', {
        label: 'Layers',
        panelId: 'dashboardLayers',
        iconId: 'layers',
        excludeWhen: function (context) {
          return context.appState.breakpoint !== 'mobile';
        },
        mobile: { slot: 'top-left', showLabel: true },
        tablet: { slot: 'top-left', showLabel: true },
        desktop: { slot: 'top-left', showLabel: true }
      });
    }

    if (typeof mapApp.on === 'function') {
      mapApp.on('app:panelopened', function (event) {
        if (event && event.panelId === 'dashboardLayers') {
          window.setTimeout(bindDashboardLayersPanel, 0);
        }
      });
    }

    if (
      typeof mapApp.showPanel === 'function' &&
      mapContainer.clientWidth > 640
    ) {
      mapApp.showPanel('dashboardLayers');
    }

    window.setTimeout(bindDashboardLayersPanel, 0);
  }

  function buildDashboardLayersPanelHtml(mapContainer, datasets) {
    var projectName =
      mapContainer.getAttribute('data-project-name') || 'Project name';
    var mapView = mapContainer.getAttribute('data-map-view') || 'baseline';
    var hasBaseline = mapContainer.getAttribute('data-has-baseline') === 'true';
    var hasPostIntervention =
      mapContainer.getAttribute('data-has-post-intervention') === 'true';
    var mapTitle =
      mapView === 'post-intervention'
        ? 'Post intervention'
        : mapView === 'both'
          ? 'Both'
          : 'Baseline';
    var layerDescription =
      'Red line boundary, Vertical area habitats, Hedgerows, Watercourses, Trees';
    var interventionSection =
      mapView === 'baseline' ? '' : buildDashboardInterventionSection();
    var layerControls = datasets
      .map(function (dataset) {
        var inputId = 'dashboard-map-layer-' + dataset.id;
        var style = dataset.style || {};
        var swatchStyle =
          style.keySymbolShape === 'line'
            ? 'background:linear-gradient(transparent 45%,' +
              style.stroke +
              ' 45%,' +
              style.stroke +
              ' 55%,transparent 55%)'
            : 'background:' +
              (style.fill || style.symbolBackgroundColor || 'transparent') +
              ';border-color:' +
              (style.stroke || style.symbolForegroundColor || 'transparent');

        return (
          '<div class="dashboard-map-panel__layer">' +
          '<div class="govuk-checkboxes govuk-checkboxes--small"><div class="govuk-checkboxes__item">' +
          '<input class="govuk-checkboxes__input dashboard-map-panel__layer-input" id="' +
          escapeAttribute(inputId) +
          '" type="checkbox" checked value="' +
          escapeAttribute(dataset.id) +
          '">' +
          '<label class="govuk-label govuk-checkboxes__label" for="' +
          escapeAttribute(inputId) +
          '">' +
          escapeHtml(dataset.label) +
          '</label>' +
          '</div></div>' +
          '<span class="dashboard-map-panel__swatch" style="' +
          escapeAttribute(swatchStyle) +
          '" aria-hidden="true"></span>' +
          '</div>'
        );
      })
      .join('');

    return (
      '<div class="dashboard-map-panel">' +
      '<div class="dashboard-map-panel__project">' +
      escapeHtml(projectName) +
      '</div>' +
      '<div class="dashboard-map-panel__section">' +
      '<p class="dashboard-map-panel__heading">Title</p>' +
      '<div class="dashboard-map-panel__title-value">' +
      escapeHtml(mapTitle) +
      '</div>' +
      '<button class="dashboard-map-panel__toggle" type="button" data-panel-toggle="dashboard-map-title-options" aria-expanded="true">' +
      '<span class="dashboard-map-panel__toggle-icon" aria-hidden="true"></span><span data-panel-toggle-label>Hide</span></button>' +
      '<div id="dashboard-map-title-options"><div class="govuk-radios govuk-radios--small" data-module="govuk-radios">' +
      buildDashboardMapRadio(
        'baseline',
        'Baseline',
        mapView === 'baseline',
        !hasBaseline
      ) +
      buildDashboardMapRadio(
        'post-intervention',
        'Post intervention',
        mapView === 'post-intervention',
        !hasPostIntervention
      ) +
      buildDashboardMapRadio(
        'both',
        'Both',
        mapView === 'both',
        !(hasBaseline && hasPostIntervention)
      ) +
      '</div>' +
      '</div></div>' +
      interventionSection +
      '<div class="dashboard-map-panel__section">' +
      '<p class="dashboard-map-panel__heading">Layers</p>' +
      '<div>' +
      escapeHtml(layerDescription) +
      '</div>' +
      '<button class="dashboard-map-panel__toggle" type="button" data-panel-toggle="dashboard-map-layer-options" aria-expanded="true">' +
      '<span class="dashboard-map-panel__toggle-icon" aria-hidden="true"></span><span data-panel-toggle-label>Hide</span></button>' +
      '<div id="dashboard-map-layer-options">' +
      layerControls +
      '</div>' +
      '</div>' +
      '</div>'
    );
  }

  function buildDashboardInterventionSection() {
    var interventionControls = ['Retained', 'Lost', 'Created']
      .map(function (label) {
        var id = 'dashboard-map-intervention-' + label.toLowerCase();

        return (
          '<div class="govuk-checkboxes govuk-checkboxes--small"><div class="govuk-checkboxes__item">' +
          '<input class="govuk-checkboxes__input dashboard-map-panel__intervention-input" id="' +
          escapeAttribute(id) +
          '" type="checkbox" checked value="' +
          escapeAttribute(label.toLowerCase()) +
          '">' +
          '<label class="govuk-label govuk-checkboxes__label" for="' +
          escapeAttribute(id) +
          '">' +
          escapeHtml(label) +
          '</label>' +
          '</div></div>'
        );
      })
      .join('');

    return (
      '<div class="dashboard-map-panel__section">' +
      '<p class="dashboard-map-panel__heading">Intervention</p>' +
      '<div>Retained, Lost, Created</div>' +
      '<button class="dashboard-map-panel__toggle" type="button" data-panel-toggle="dashboard-map-intervention-options" aria-expanded="true">' +
      '<span class="dashboard-map-panel__toggle-icon" aria-hidden="true"></span><span data-panel-toggle-label>Hide</span></button>' +
      '<div id="dashboard-map-intervention-options" class="dashboard-map-panel__interventions">' +
      interventionControls +
      '</div>' +
      '</div>'
    );
  }

  function buildDashboardMapRadio(value, label, checked, disabled) {
    var id = 'dashboard-map-title-' + value;
    return (
      '<div class="govuk-radios__item">' +
      '<input class="govuk-radios__input" id="' +
      escapeAttribute(id) +
      '" type="radio" name="dashboard-map-title" value="' +
      escapeAttribute(value) +
      '"' +
      (checked ? ' checked' : '') +
      (disabled ? ' disabled' : '') +
      '>' +
      '<label class="govuk-label govuk-radios__label" for="' +
      escapeAttribute(id) +
      '">' +
      escapeHtml(label) +
      '</label>' +
      '</div>'
    );
  }

  function bindDashboardLayersPanel() {
    var panel = document.querySelector('[id$="-panel-dashboard-layers"]');

    if (!panel || panel.getAttribute('data-dashboard-panel-bound') === 'true') {
      return;
    }

    panel.setAttribute('data-dashboard-panel-bound', 'true');

    panel.addEventListener('click', function (event) {
      var toggle = event.target.closest('[data-panel-toggle]');
      if (!toggle) {
        return;
      }

      var content = panel.querySelector(
        '#' + toggle.getAttribute('data-panel-toggle')
      );
      var isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      var label = toggle.querySelector('[data-panel-toggle-label]');
      toggle.setAttribute('aria-expanded', isExpanded ? 'false' : 'true');
      if (content) {
        content.hidden = isExpanded;
      }
      if (label) {
        label.textContent = isExpanded ? 'Show' : 'Hide';
      }
    });

    panel.addEventListener('change', function (event) {
      var viewInput = event.target.closest('input[name="dashboard-map-title"]');
      if (viewInput && viewInput.checked && !viewInput.disabled) {
        var url = new URL(window.location.href);
        url.searchParams.set('view', viewInput.value);
        window.location.assign(url.toString());
        return;
      }

      var interventionInput = event.target.closest(
        '.dashboard-map-panel__intervention-input'
      );
      if (interventionInput) {
        applyDashboardInterventionFilters(panel);
        return;
      }

      var input = event.target.closest('.dashboard-map-panel__layer-input');
      var plugin = interactiveMapState.datasetsPlugin;
      if (!input || !plugin) {
        return;
      }

      if (typeof plugin.setDatasetVisibility === 'function') {
        plugin.setDatasetVisibility(input.checked, {
          datasetId: input.value
        });
      }
    });
  }

  function applyDashboardInterventionFilters(panel) {
    var plugin = interactiveMapState.datasetsPlugin;
    if (!plugin) {
      return;
    }

    var selectedCategories = Array.prototype.slice
      .call(
        panel.querySelectorAll(
          '.dashboard-map-panel__intervention-input:checked'
        )
      )
      .map(function (input) {
        return input.value;
      });
    var datasets = {
      parcel: 'habitat-parcels-im',
      hedgerow: 'hedgerows-im',
      watercourse: 'watercourses-im',
      tree: 'trees-im'
    };

    Object.keys(datasets).forEach(function (featureType) {
      var featureIdsToShow = [];
      var featureIdsToHide = [];

      (interactiveMapState.datasetsByType[featureType] || []).forEach(
        function (feature) {
          var properties = feature.properties || {};
          var category = normalizeInterventionCategory(
            properties['Retention Category'] ||
              properties.retention_category ||
              properties.Intervention ||
              properties.intervention
          );
          var featureId = properties.__imFeatureKey;

          if (!category || !featureId) {
            return;
          }

          if (selectedCategories.includes(category)) {
            featureIdsToShow.push(featureId);
          } else {
            featureIdsToHide.push(featureId);
          }
        }
      );

      if (
        featureIdsToShow.length &&
        typeof plugin.setFeatureVisibility === 'function'
      ) {
        plugin.setFeatureVisibility(true, featureIdsToShow, {
          datasetId: datasets[featureType]
        });
      }
      if (
        featureIdsToHide.length &&
        typeof plugin.setFeatureVisibility === 'function'
      ) {
        plugin.setFeatureVisibility(false, featureIdsToHide, {
          datasetId: datasets[featureType]
        });
      }
    });
  }

  function normalizeInterventionCategory(value) {
    var category = String(value || '')
      .trim()
      .toLowerCase();

    if (category === 'enhanced' || category === 'enhancement') {
      return 'retained';
    }
    if (category === 'retain') {
      return 'retained';
    }
    if (category === 'create') {
      return 'created';
    }

    return ['retained', 'lost', 'created'].includes(category) ? category : null;
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

  function restoreReturnSelection() {
    var params = new URLSearchParams(window.location.search);
    var featureKey = params.get('selected');

    if (!featureKey) {
      return;
    }

    var parsed = parseFeatureKey(featureKey, null);
    if (!parsed) {
      return;
    }

    window.setTimeout(function () {
      var link = getTableLink(parsed.featureType, parsed.featureIndex);
      handleTableSelection(
        parsed.featureType,
        parsed.featureIndex,
        link || null,
        {
          skipScroll: true
        }
      );
    }, 100);
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
        console.warn(
          'Failed to setup hover layers, will retry on next style event:',
          error
        );
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

    var featureType = inferFeatureTypeFromLayer(
      feature.layer && feature.layer.id
    );
    var featureIndex = parseInt(
      properties.__imFeatureIndex != null
        ? properties.__imFeatureIndex
        : feature.id,
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
    if (
      layerId === 'habitat-parcels-im' ||
      layerId === 'habitat-parcels-im-stroke'
    ) {
      return 'parcel';
    }
    if (layerId === 'hedgerows-im') {
      return 'hedgerow';
    }
    if (layerId === 'watercourses-im') {
      return 'watercourse';
    }
    if (layerId === 'trees-im') {
      return 'tree';
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
    if (featureType === 'tree') {
      return 'trees-im';
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
      event && Array.isArray(event.selectedFeatures)
        ? event.selectedFeatures
        : [];

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

  function handleTableSelection(
    featureType,
    featureIndex,
    linkElement,
    options
  ) {
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
    if (!options || !options.skipScroll) {
      scrollToInteractiveMap();
    }
  }

  function configureHabitatHelpBanner(mapApp) {
    if (!mapApp || typeof mapApp.addPanel !== 'function') {
      return;
    }

    mapApp.addPanel(HABITAT_HELP_PANEL_ID, {
      label: 'Map help',
      showLabel: false,
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
        '<div class="habitat-help-banner-content" role="status">' +
        '<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" class="habitat-help-banner-icon" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"></circle>' +
        '<path d="M8.584 5.228h2.832v2.174L10.869 11H9.118l-.534-3.598V5.228zm.098 7.207h2.643v2.337H8.682v-2.337z" fill="currentColor"></path>' +
        '</svg>' +
        '<span><span class="im-u-visually-hidden">Alert: </span>Click on the habitats for information</span>' +
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

    var feature = getFeatureByTypeAndIndex(
      parsed.featureType,
      parsed.featureIndex
    );
    var properties = feature && feature.properties ? feature.properties : {};
    var row = link ? link.closest('tr') : null;
    var cells = row
      ? Array.prototype.slice.call(row.querySelectorAll('th, td'))
      : [];

    var metricLabel =
      parsed.featureType === 'parcel'
        ? 'Area'
        : parsed.featureType === 'tree'
          ? 'Size'
          : 'Length';
    var metricValue = getCellText(cells, 2) || '-';

    var habitatType = getCellText(cells, 1);
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
      } else if (parsed.featureType === 'tree') {
        habitatType = firstDefinedValue([
          properties['Baseline Tree Type'],
          properties['Proposed Tree Type'],
          properties['Baseline Habitat Type'],
          properties['Proposed Habitat Type']
        ]);
      }
    }

    return {
      featureType: parsed.featureType,
      reference:
        (link && getTrimmedText(link.textContent)) ||
        firstDefinedValue([properties['Parcel Ref']]) ||
        parsed.featureType + ' ' + (parsed.featureIndex + 1),
      titlePrefix:
        parsed.featureType === 'parcel'
          ? 'Habitat '
          : parsed.featureType === 'hedgerow'
            ? 'Hedgerow '
            : parsed.featureType === 'watercourse'
              ? 'Watercourse '
              : 'Tree ',
      habitatType: habitatType || '-',
      metricLabel: metricLabel,
      metricValue: metricValue,
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
        ]) || '-',
      editUrl:
        parsed.featureType === 'parcel' && row
          ? withQueryParam(getRowActionHref(row), 'returnSource', 'map')
          : row
            ? getRowActionHref(row)
            : '#'
    };
  }

  function withQueryParam(url, key, value) {
    if (!url || url === '#') {
      return '#';
    }

    var separator = url.indexOf('?') >= 0 ? '&' : '?';
    return url + separator + key + '=' + encodeURIComponent(value);
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
      label:
        escapeHtml(details.titlePrefix || 'Habitat ') +
        escapeHtml(details.reference || ''),
      mobile: {
        slot: 'inset',
        dismissable: true,
        exclusive: true,
        width: '340px'
      },
      tablet: {
        slot: 'inset',
        dismissable: true,
        exclusive: true,
        width: '380px'
      },
      desktop: {
        slot: 'inset',
        dismissable: true,
        exclusive: true,
        width: '420px'
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

  function restoreSelectedDetailsPanel() {
    var featureKey = interactiveMapState.selectedFeatureKey;
    var parsed = featureKey ? parseFeatureKey(featureKey, null) : null;

    if (!parsed) {
      return;
    }

    var link = getTableLink(parsed.featureType, parsed.featureIndex);
    var details = getSelectionDetails(parsed, link || null);

    if (details) {
      showHabitatDetailsPanel(details);
    }
  }

  function buildHabitatDetailsPanelHtml(details) {
    var safeHabitatType = escapeHtml(details.habitatType || '-');
    var safeMetricLabel = escapeHtml(details.metricLabel || 'Area');
    var safeMetricValue = escapeHtml(details.metricValue || '-');
    var safePosition = escapeHtml(details.position || '-');
    var safeAdjacentTo = escapeHtml(details.adjacentTo || '-');
    var safeBoundaryEdge = escapeHtml(details.boundaryEdge || '-');
    var safeEditUrl = escapeAttribute(details.editUrl || '#');
    var showEditButton = safeEditUrl !== '#';

    return (
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
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Adjacent to</th><td class="govuk-table__cell">' +
      safeAdjacentTo +
      '</td></tr>' +
      '<tr class="govuk-table__row"><th scope="row" class="govuk-table__header">Boundary edge</th><td class="govuk-table__cell">' +
      safeBoundaryEdge +
      '</td></tr>' +
      '</tbody>' +
      '</table>' +
      (showEditButton
        ? '<a class="govuk-button govuk-button--secondary" data-module="govuk-button" href="' +
          safeEditUrl +
          '">Add details</a>'
        : '')
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

  function toSentenceCase(value) {
    var text = getTrimmedText(value || '');
    if (!text) {
      return '';
    }

    return text.charAt(0).toUpperCase() + text.slice(1);
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
      (properties && properties.__imFeatureKey
        ? properties.__imFeatureKey
        : null);

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
    if (interactiveMapState.selectedLink) {
      var previousRow = interactiveMapState.selectedLink.closest('tr');
      if (previousRow) {
        previousRow.classList.remove('habitat-row--highlighted');
      }
    }

    interactiveMapState.selectedFeatureKey = featureKey || null;
    interactiveMapState.selectedLink = linkElement || null;

    if (interactiveMapState.selectedLink) {
      var selectedRow = interactiveMapState.selectedLink.closest('tr');
      if (selectedRow) {
        selectedRow.classList.add('habitat-row--highlighted');
      }
    }
  }

  function clearSelectedRow() {
    if (interactiveMapState.selectedLink) {
      var selectedRow = interactiveMapState.selectedLink.closest('tr');
      if (selectedRow) {
        selectedRow.classList.remove('habitat-row--highlighted');
      }
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

    if (
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
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
      if (!dataset.geojson || !dataset.geojson.features) {
        return;
      }

      dataset.geojson.features.forEach(function (feature) {
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

    if (
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
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
