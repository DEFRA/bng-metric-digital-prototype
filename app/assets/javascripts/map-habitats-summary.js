//
// Map Preview for Habitats Summary Page
// Uses DefraMapClient library for consistency with other map pages
// Display-only mode - no drawing tools enabled
//

;(function () {
  'use strict'

  // Module-level layer references for highlight functionality
  let parcelsLayer = null
  let hedgerowsLayer = null
  let watercoursesLayer = null
  let highlightSource = null
  let highlightLayer = null
  let currentHighlightedLink = null

  // Wait for DOM to be ready
  document.addEventListener('DOMContentLoaded', function () {
    initMapPreview()
  })

  function initMapPreview() {
    const mapContainer = document.getElementById('map-preview')
    if (!mapContainer) {
      console.warn('Map preview container not found')
      return
    }

    // Get geometry data from the page
    const geometriesDataEl = document.getElementById('geometries-data')

    let boundaryGeoJson = null
    let parcelsGeoJson = null
    let hedgerowsGeoJson = null
    let watercoursesGeoJson = null

    if (geometriesDataEl) {
      try {
        const mapData = JSON.parse(geometriesDataEl.textContent)
        boundaryGeoJson = mapData.siteBoundary || null
        parcelsGeoJson = mapData.parcels || null
        hedgerowsGeoJson = mapData.hedgerows || null
        watercoursesGeoJson = mapData.watercourses || null
      } catch (e) {
        console.error('Failed to parse geometries:', e)
      }
    } else {
      console.warn('No geometries-data element found on page')
    }

    // Create the map using DefraMapClient (will show default England view if no data)
    createMap(
      mapContainer,
      boundaryGeoJson,
      parcelsGeoJson,
      hedgerowsGeoJson,
      watercoursesGeoJson
    )
  }

  function showMapPlaceholder(container, message) {
    container.innerHTML =
      '<div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #505a5f;">' +
      '<p>' +
      message +
      '</p></div>'
  }

  async function createMap(
    container,
    boundaryGeoJson,
    parcelsGeoJson,
    hedgerowsGeoJson,
    watercoursesGeoJson
  ) {
    // Check DefraMapClient is available
    if (!window.DefraMapClient) {
      console.error('DefraMapClient not loaded')
      showMapPlaceholder(container, 'Map library not available')
      return
    }

    try {
      // Initialize DefraMapClient with display-only configuration
      const client = new window.DefraMapClient({
        target: container,
        mode: 'red-line-boundary',
        projection: 'EPSG:27700',
        tiles: {
          collectionId: 'ngd-base',
          crs: '27700',
          tileMatrixSetUrl:
            'https://api.os.uk/maps/vector/ngd/ota/v1/tilematrixsets/27700',
          styleUrl: '/api/os/tiles/style/27700',
          tilesUrlTemplate: '/api/os/tiles/ngd-base/27700/{z}/{y}/{x}'
        },
        controls: {
          enabled: false
        }
      })

      // Initialize the map
      await client.init()

      const map = client.getMap()
      const format = new ol.format.GeoJSON()
      let allFeatures = []

      // Determine data projection - check if coordinates look like British National Grid
      const sampleCoord = getSampleCoordinate(boundaryGeoJson || parcelsGeoJson)
      const isLikelyBNG =
        sampleCoord &&
        Math.abs(sampleCoord[0]) > 1000 &&
        Math.abs(sampleCoord[0]) < 800000
      const dataProjection = isLikelyBNG ? 'EPSG:27700' : 'EPSG:4326'

      // Add parcels layer (rendered below boundary for visual hierarchy)
      if (
        parcelsGeoJson &&
        parcelsGeoJson.features &&
        parcelsGeoJson.features.length > 0
      ) {
        const parcelsSource = new ol.source.Vector({
          features: format.readFeatures(parcelsGeoJson, {
            dataProjection: dataProjection,
            featureProjection: 'EPSG:27700'
          })
        })

        parcelsLayer = new ol.layer.Vector({
          source: parcelsSource,
          style: new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: '#1d70b8',
              width: 2
            }),
            fill: new ol.style.Fill({
              color: 'rgba(29, 112, 184, 0.3)'
            })
          }),
          zIndex: 20
        })

        map.addLayer(parcelsLayer)
        allFeatures = allFeatures.concat(parcelsSource.getFeatures())
      }

      // Add hedgerows layer (green lines)
      if (
        hedgerowsGeoJson &&
        hedgerowsGeoJson.features &&
        hedgerowsGeoJson.features.length > 0
      ) {
        const hedgerowsSource = new ol.source.Vector({
          features: format.readFeatures(hedgerowsGeoJson, {
            dataProjection: dataProjection,
            featureProjection: 'EPSG:27700'
          })
        })

        hedgerowsLayer = new ol.layer.Vector({
          source: hedgerowsSource,
          style: new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: '#00703c',
              width: 4
            })
          }),
          zIndex: 25
        })

        map.addLayer(hedgerowsLayer)
        allFeatures = allFeatures.concat(hedgerowsSource.getFeatures())
      }

      // Add watercourses layer (blue dashed lines)
      if (
        watercoursesGeoJson &&
        watercoursesGeoJson.features &&
        watercoursesGeoJson.features.length > 0
      ) {
        const watercoursesSource = new ol.source.Vector({
          features: format.readFeatures(watercoursesGeoJson, {
            dataProjection: dataProjection,
            featureProjection: 'EPSG:27700'
          })
        })

        watercoursesLayer = new ol.layer.Vector({
          source: watercoursesSource,
          style: new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: '#1d70b8',
              width: 4,
              lineDash: [8, 4]
            })
          }),
          zIndex: 25
        })

        map.addLayer(watercoursesLayer)
        allFeatures = allFeatures.concat(watercoursesSource.getFeatures())
      }

      // Add boundary layer (rendered on top with dashed line)
      if (
        boundaryGeoJson &&
        boundaryGeoJson.features &&
        boundaryGeoJson.features.length > 0
      ) {
        const boundarySource = new ol.source.Vector({
          features: format.readFeatures(boundaryGeoJson, {
            dataProjection: dataProjection,
            featureProjection: 'EPSG:27700'
          })
        })

        const boundaryLayer = new ol.layer.Vector({
          source: boundarySource,
          style: new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: '#d4351c',
              width: 3,
              lineDash: [10, 5]
            }),
            fill: null
          }),
          zIndex: 30
        })

        map.addLayer(boundaryLayer)
        allFeatures = allFeatures.concat(boundarySource.getFeatures())
      }

      // Add highlight layer for table click interactions
      highlightSource = new ol.source.Vector()
      highlightLayer = new ol.layer.Vector({
        source: highlightSource,
        style: function (feature) {
          var geomType = feature.getGeometry().getType()
          if (geomType === 'LineString' || geomType === 'MultiLineString') {
            return new ol.style.Style({
              stroke: new ol.style.Stroke({ color: '#ffdd00', width: 8 })
            })
          }
          return new ol.style.Style({
            stroke: new ol.style.Stroke({ color: '#ffdd00', width: 4 }),
            fill: new ol.style.Fill({ color: 'rgba(255, 221, 0, 0.35)' })
          })
        },
        zIndex: 29
      })
      map.addLayer(highlightLayer)

      // Fit to features extent if we have features, otherwise show default England view
      if (allFeatures.length > 0) {
        const extent = ol.extent.createEmpty()
        allFeatures.forEach(function (feature) {
          const geom = feature.getGeometry()
          if (geom) {
            ol.extent.extend(extent, geom.getExtent())
          }
        })

        // Validate extent before zooming - ensure it's not empty or invalid
        const isValidExtent =
          !ol.extent.isEmpty(extent) &&
          isFinite(extent[0]) &&
          isFinite(extent[1]) &&
          isFinite(extent[2]) &&
          isFinite(extent[3]) &&
          extent[0] > -1000000 &&
          extent[1] > -1000000 &&
          extent[2] < 2000000 &&
          extent[3] < 2000000

        if (isValidExtent) {
          // Use DefraMapClient's zoomToExtent method
          client.zoomToExtent(extent, {
            padding: [40, 40, 40, 40],
            maxZoom: 16,
            minZoom: 7,
            duration: 500
          })
        } else {
          console.warn('Invalid extent calculated, using default view')
          // Set a sensible default view for England
          map.getView().setCenter([400000, 310000])
          map.getView().setZoom(7)
        }
      } else {
        // No features - set default view of central England
        map.getView().setCenter([400000, 310000])
        map.getView().setZoom(7)
      }

      // Store client reference for debugging
      window.habitatsSummaryMapClient = client

      // Set up table click handlers for feature highlighting
      setupTableClickHandlers()
    } catch (error) {
      console.error('Failed to initialize map:', error)
      showMapPlaceholder(container, 'Could not load map. Please try again.')
    }
  }

  function setupTableClickHandlers() {
    document.querySelectorAll('.habitat-ref-link').forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.preventDefault()
        handleFeatureClick(
          this.dataset.featureType,
          parseInt(this.dataset.featureIndex, 10),
          this
        )
      })
    })
  }

  function handleFeatureClick(featureType, featureIndex, linkElement) {
    // Clear previous highlight
    if (highlightSource) {
      highlightSource.clear()
    }
    if (currentHighlightedLink) {
      var prevRow = currentHighlightedLink.closest('tr')
      if (prevRow) {
        prevRow.classList.remove('habitat-row--highlighted')
      }
    }

    // Toggle off if same feature clicked again
    if (currentHighlightedLink === linkElement) {
      currentHighlightedLink = null
      return
    }

    // Get the appropriate layer based on feature type
    var layer = null
    if (featureType === 'parcel') {
      layer = parcelsLayer
    } else if (featureType === 'hedgerow') {
      layer = hedgerowsLayer
    } else if (featureType === 'watercourse') {
      layer = watercoursesLayer
    }

    if (!layer) {
      return
    }

    var features = layer.getSource().getFeatures()
    var feature = features[featureIndex]
    if (!feature) {
      return
    }

    // Add highlight
    highlightSource.addFeature(
      new ol.Feature({ geometry: feature.getGeometry().clone() })
    )

    // Highlight table row
    var row = linkElement.closest('tr')
    if (row) {
      row.classList.add('habitat-row--highlighted')
    }
    currentHighlightedLink = linkElement

    // Zoom to feature
    if (window.habitatsSummaryMapClient) {
      window.habitatsSummaryMapClient.zoomToExtent(
        feature.getGeometry().getExtent(),
        {
          padding: [80, 80, 80, 80],
          maxZoom: 17,
          minZoom: 14,
          duration: 500
        }
      )
    }
  }

  function getSampleCoordinate(geoJson) {
    if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
      return null
    }

    const feature = geoJson.features[0]
    if (!feature.geometry || !feature.geometry.coordinates) {
      return null
    }

    // Navigate to the first coordinate
    let coords = feature.geometry.coordinates
    while (
      Array.isArray(coords) &&
      Array.isArray(coords[0]) &&
      Array.isArray(coords[0][0])
    ) {
      coords = coords[0]
    }

    if (
      Array.isArray(coords) &&
      coords.length >= 2 &&
      typeof coords[0] === 'number'
    ) {
      return coords
    }

    if (
      Array.isArray(coords) &&
      Array.isArray(coords[0]) &&
      coords[0].length >= 2
    ) {
      return coords[0]
    }

    return null
  }
})()
