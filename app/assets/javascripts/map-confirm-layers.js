//
// Map Preview for Confirm Layers Page
// Displays uploaded boundary and habitat parcels using OpenLayers
//

(function() {
  'use strict';

  // Wait for DOM to be ready
  document.addEventListener('DOMContentLoaded', function() {
    initMapPreview();
  });

  function initMapPreview() {
    const mapContainer = document.getElementById('map-preview');
    if (!mapContainer) {
      console.warn('Map preview container not found');
      return;
    }

    // Get geometry data from the page
    const geometriesDataEl = document.getElementById('geometries-data');
    const boundaryLayerNameEl = document.getElementById('boundary-layer-name');
    const parcelsLayerNameEl = document.getElementById('parcels-layer-name');

    if (!geometriesDataEl) {
      console.warn('Geometries data not found');
      showMapPlaceholder(mapContainer, 'No geometry data available');
      return;
    }

    let geometries;
    try {
      geometries = JSON.parse(geometriesDataEl.textContent);
    } catch (e) {
      console.error('Failed to parse geometries:', e);
      showMapPlaceholder(mapContainer, 'Could not load geometry data');
      return;
    }

    const boundaryLayerName = boundaryLayerNameEl ? boundaryLayerNameEl.textContent.trim() : null;
    const parcelsLayerName = parcelsLayerNameEl ? parcelsLayerNameEl.textContent.trim() : null;

    // Get the boundary and parcels feature collections
    const boundaryGeoJson = boundaryLayerName && geometries[boundaryLayerName] ? geometries[boundaryLayerName] : null;
    const parcelsGeoJson = parcelsLayerName && geometries[parcelsLayerName] ? geometries[parcelsLayerName] : null;

    if (!boundaryGeoJson && !parcelsGeoJson) {
      showMapPlaceholder(mapContainer, 'No valid layers to display');
      return;
    }

    // Create the map
    createMap(mapContainer, boundaryGeoJson, parcelsGeoJson);
  }

  function showMapPlaceholder(container, message) {
    container.innerHTML = '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #505a5f;">' +
      '<p>' + message + '</p></div>';
  }

  function createMap(container, boundaryGeoJson, parcelsGeoJson) {
    // Determine projection - check if coordinates look like British National Grid
    // BNG coordinates are typically 6-digit easting/northing (100000-700000)
    const sampleCoord = getSampleCoordinate(boundaryGeoJson || parcelsGeoJson);
    const isLikelyBNG = sampleCoord && Math.abs(sampleCoord[0]) > 1000 && Math.abs(sampleCoord[0]) < 800000;
    
    // For prototype, assume coordinates are in EPSG:27700 (British National Grid)
    // If they look like lat/lon (small values), use EPSG:4326
    const dataProjection = isLikelyBNG ? 'EPSG:27700' : 'EPSG:4326';
    
    // Create vector sources for boundary and parcels
    const format = new ol.format.GeoJSON();
    
    const layers = [];
    let allFeatures = [];

    // OSM base layer for context (optional - can be removed if not needed)
    const osmLayer = new ol.layer.Tile({
      source: new ol.source.OSM(),
      opacity: 0.5
    });
    layers.push(osmLayer);

    // Parcels layer (rendered below boundary for visual hierarchy)
    if (parcelsGeoJson && parcelsGeoJson.features && parcelsGeoJson.features.length > 0) {
      const parcelsSource = new ol.source.Vector({
        features: format.readFeatures(parcelsGeoJson, {
          dataProjection: dataProjection,
          featureProjection: 'EPSG:3857'
        })
      });

      const parcelsLayer = new ol.layer.Vector({
        source: parcelsSource,
        style: new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: '#1d70b8',
            width: 2
          }),
          fill: new ol.style.Fill({
            color: 'rgba(29, 112, 184, 0.3)'
          })
        })
      });

      layers.push(parcelsLayer);
      allFeatures = allFeatures.concat(parcelsSource.getFeatures());
    }

    // Boundary layer (rendered on top with dashed line)
    if (boundaryGeoJson && boundaryGeoJson.features && boundaryGeoJson.features.length > 0) {
      const boundarySource = new ol.source.Vector({
        features: format.readFeatures(boundaryGeoJson, {
          dataProjection: dataProjection,
          featureProjection: 'EPSG:3857'
        })
      });

      const boundaryLayer = new ol.layer.Vector({
        source: boundarySource,
        style: new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: '#d4351c',
            width: 3,
            lineDash: [10, 5]
          }),
          fill: null
        })
      });

      layers.push(boundaryLayer);
      allFeatures = allFeatures.concat(boundarySource.getFeatures());
    }

    // Create the map
    const map = new ol.Map({
      target: container,
      layers: layers,
      view: new ol.View({
        center: [0, 0],
        zoom: 2,
        projection: 'EPSG:3857'
      }),
      controls: ol.control.defaults.defaults({
        attribution: false,
        rotate: false
      }).extend([
        new ol.control.Zoom()
      ])
    });

    // Fit to features extent
    if (allFeatures.length > 0) {
      const extent = ol.extent.createEmpty();
      allFeatures.forEach(function(feature) {
        ol.extent.extend(extent, feature.getGeometry().getExtent());
      });

      // Add some padding
      map.getView().fit(extent, {
        padding: [40, 40, 40, 40],
        maxZoom: 18
      });
    }

    // Store map reference on window for debugging
    window.confirmLayersMap = map;
  }

  function getSampleCoordinate(geoJson) {
    if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
      return null;
    }

    const feature = geoJson.features[0];
    if (!feature.geometry || !feature.geometry.coordinates) {
      return null;
    }

    // Navigate to the first coordinate
    let coords = feature.geometry.coordinates;
    while (Array.isArray(coords) && Array.isArray(coords[0]) && Array.isArray(coords[0][0])) {
      coords = coords[0];
    }

    if (Array.isArray(coords) && coords.length >= 2 && typeof coords[0] === 'number') {
      return coords;
    }

    if (Array.isArray(coords) && Array.isArray(coords[0]) && coords[0].length >= 2) {
      return coords[0];
    }

    return null;
  }

})();
