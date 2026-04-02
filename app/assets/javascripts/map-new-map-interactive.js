;(function () {
  'use strict'

  var MAP_READY_EVENT = 'map:ready'
  var MAP_LOADED_EVENT = 'map:loaded'
  var SOURCE_PREFIX = 'new-map-layer-'

  document.addEventListener('DOMContentLoaded', function () {
    if (
      !window.defra ||
      !window.defra.InteractiveMap ||
      !window.defra.maplibreProvider
    ) {
      console.warn('Interactive Map libraries are not available')
      return
    }

    if (!window.proj4) {
      console.warn('proj4 is not available')
      return
    }

    window.proj4.defs(
      'EPSG:27700',
      '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 +units=m +no_defs'
    )

    var provider = window.defra.maplibreProvider()
    var interactiveMap = new window.defra.InteractiveMap('my-map', {
      mapProvider: provider,
      behaviour: 'inline',
      mapLabel: 'Site map',
      center: [-1.6, 53.1],
      zoom: 6,
      containerHeight: '500px',
      mapStyle: {
        url: '/api/os/tiles/style/3857'
      }
    })

    var mapInstance = null

    interactiveMap.on(MAP_READY_EVENT, function (payload) {
      mapInstance = payload && payload.map ? payload.map : null
    })

    interactiveMap.on(MAP_LOADED_EVENT, function () {
      if (!mapInstance) {
        return
      }

      var layerData = getLayerData()
      if (!layerData.length) {
        console.warn('No geometry layers available for the interactive map')
        return
      }

      addLayersToMap(mapInstance, layerData)
      fitMapToLayers(mapInstance, layerData)
    })
  })

  function getLayerData() {
    var geometriesEl = document.getElementById('geometries-data')
    if (!geometriesEl) {
      return []
    }

    var geometries
    try {
      geometries = JSON.parse(geometriesEl.textContent)
    } catch (error) {
      console.error('Failed to parse geometries data', error)
      return []
    }

    var boundaryLayerName = getTextContent('boundary-layer-name')
    var parcelsLayerName = getTextContent('parcels-layer-name')
    var hedgerowsLayerName = getTextContent('hedgerows-layer-name')
    var watercoursesLayerName = getTextContent('watercourses-layer-name')

    return [
      buildLayerConfig('boundary', boundaryLayerName, geometries, {
        type: 'line',
        paint: {
          'line-color': '#d4351c',
          'line-width': 3,
          'line-dasharray': [3, 2]
        }
      }),
      buildLayerConfig('parcels', parcelsLayerName, geometries, {
        type: 'fill',
        paint: {
          'fill-color': '#1d70b8',
          'fill-opacity': 0.3
        },
        outlinePaint: {
          'line-color': '#1d70b8',
          'line-width': 2
        }
      }),
      buildLayerConfig('hedgerows', hedgerowsLayerName, geometries, {
        type: 'line',
        paint: {
          'line-color': '#00703c',
          'line-width': 3
        }
      }),
      buildLayerConfig('watercourses', watercoursesLayerName, geometries, {
        type: 'line',
        paint: {
          'line-color': '#1d70b8',
          'line-width': 3
        }
      })
    ].filter(Boolean)
  }

  function buildLayerConfig(key, layerName, geometries, style) {
    if (!layerName || layerName === 'null' || !geometries[layerName]) {
      return null
    }

    var sourceData = normaliseGeoJson(geometries[layerName])
    if (!sourceData.features.length) {
      return null
    }

    return {
      key: key,
      sourceId: SOURCE_PREFIX + key,
      layerId: SOURCE_PREFIX + key,
      outlineLayerId: SOURCE_PREFIX + key + '-outline',
      data: sourceData,
      style: style
    }
  }

  function normaliseGeoJson(geoJson) {
    var cloned = JSON.parse(JSON.stringify(geoJson))
    var sampleCoordinate = getSampleCoordinate(cloned)
    var isLikelyBng =
      sampleCoordinate &&
      Math.abs(sampleCoordinate[0]) > 1000 &&
      Math.abs(sampleCoordinate[0]) < 800000

    if (!isLikelyBng) {
      return cloned
    }

    cloned.features = (cloned.features || []).map(function (feature) {
      if (!feature.geometry) {
        return feature
      }

      feature.geometry.coordinates = transformCoordinates(
        feature.geometry.coordinates
      )
      return feature
    })

    return cloned
  }

  function transformCoordinates(coordinates) {
    if (!Array.isArray(coordinates)) {
      return coordinates
    }

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      return window.proj4('EPSG:27700', 'EPSG:4326', coordinates)
    }

    return coordinates.map(transformCoordinates)
  }

  function addLayersToMap(map, layerData) {
    layerData.forEach(function (layer) {
      if (map.getLayer(layer.layerId)) {
        map.removeLayer(layer.layerId)
      }

      if (layer.style.outlinePaint && map.getLayer(layer.outlineLayerId)) {
        map.removeLayer(layer.outlineLayerId)
      }

      if (map.getSource(layer.sourceId)) {
        map.removeSource(layer.sourceId)
      }

      map.addSource(layer.sourceId, {
        type: 'geojson',
        data: layer.data
      })

      map.addLayer({
        id: layer.layerId,
        type: layer.style.type,
        source: layer.sourceId,
        paint: layer.style.paint
      })

      if (layer.style.outlinePaint) {
        map.addLayer({
          id: layer.outlineLayerId,
          type: 'line',
          source: layer.sourceId,
          paint: layer.style.outlinePaint
        })
      }
    })
  }

  function fitMapToLayers(map, layerData) {
    var bounds = null

    layerData.forEach(function (layer) {
      ;(layer.data.features || []).forEach(function (feature) {
        extendBoundsFromCoordinates(
          feature.geometry && feature.geometry.coordinates,
          function (lng, lat) {
            if (!bounds) {
              bounds = [
                [lng, lat],
                [lng, lat]
              ]
              return
            }

            bounds[0][0] = Math.min(bounds[0][0], lng)
            bounds[0][1] = Math.min(bounds[0][1], lat)
            bounds[1][0] = Math.max(bounds[1][0], lng)
            bounds[1][1] = Math.max(bounds[1][1], lat)
          }
        )
      })
    })

    if (!bounds) {
      return
    }

    map.fitBounds(bounds, {
      padding: 40,
      maxZoom: 16,
      duration: 500
    })
  }

  function extendBoundsFromCoordinates(coordinates, callback) {
    if (!Array.isArray(coordinates)) {
      return
    }

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      callback(coordinates[0], coordinates[1])
      return
    }

    coordinates.forEach(function (item) {
      extendBoundsFromCoordinates(item, callback)
    })
  }

  function getSampleCoordinate(geoJson) {
    if (!geoJson || !geoJson.features || !geoJson.features.length) {
      return null
    }

    var geometry = geoJson.features[0].geometry
    if (!geometry || !geometry.coordinates) {
      return null
    }

    return findCoordinatePair(geometry.coordinates)
  }

  function findCoordinatePair(coordinates) {
    if (!Array.isArray(coordinates)) {
      return null
    }

    if (
      coordinates.length >= 2 &&
      typeof coordinates[0] === 'number' &&
      typeof coordinates[1] === 'number'
    ) {
      return coordinates
    }

    for (var i = 0; i < coordinates.length; i += 1) {
      var pair = findCoordinatePair(coordinates[i])
      if (pair) {
        return pair
      }
    }

    return null
  }

  function getTextContent(id) {
    var element = document.getElementById(id)
    return element ? element.textContent.trim() : null
  }
})()
