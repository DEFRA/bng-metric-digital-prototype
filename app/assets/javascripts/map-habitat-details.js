//
// Map for Habitat Details Page – display single parcel highlighted
// Uses DefraMapClient; read-only, no drawing or table interactions.
//

;(function () {
  'use strict'

  document.addEventListener('DOMContentLoaded', function () {
    initMap()
  })

  function getSampleCoordinate(geoJson) {
    if (!geoJson || !geoJson.features || geoJson.features.length === 0) {
      return null
    }
    const feature = geoJson.features[0]
    if (!feature.geometry || !feature.geometry.coordinates) {
      return null
    }
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

  function initMap() {
    const container = document.getElementById('map-habitat-details')
    if (!container) {
      return
    }

    const dataEl = document.getElementById('geometries-data')
    if (!dataEl) {
      return
    }

    let mapData
    try {
      mapData = JSON.parse(dataEl.textContent)
    } catch (e) {
      console.error('Failed to parse geometries-data:', e)
      return
    }

    const parcel = mapData.parcel || null
    const parcels = mapData.parcels || null
    const siteBoundary = mapData.siteBoundary || null

    if (!parcel || !parcel.features || parcel.features.length === 0) {
      return
    }

    const currentParcelRef = parcel.features[0].properties &&
      (parcel.features[0].properties['Parcel Ref'] ||
        parcel.features[0].properties['parcelRef'])
      ? (parcel.features[0].properties['Parcel Ref'] || parcel.features[0].properties['parcelRef'])
      : null

    if (!window.DefraMapClient) {
      console.error('DefraMapClient not loaded')
      return
    }

    const format = new ol.format.GeoJSON()
    const sampleCoord = getSampleCoordinate(parcel)
    const isLikelyBNG =
      sampleCoord &&
      Math.abs(sampleCoord[0]) > 1000 &&
      Math.abs(sampleCoord[0]) < 800000
    const dataProjection = isLikelyBNG ? 'EPSG:27700' : 'EPSG:4326'

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

    client.init().then(function () {
      const map = client.getMap()

      // All parcels layer (feint) – other parcels only; current parcel drawn by highlight layer
      const feintParcelStyle = new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: '#6b7280',
          width: 1.5
        }),
        fill: new ol.style.Fill({ color: 'rgba(107, 114, 128, 0.08)' })
      })
      if (
        parcels &&
        parcels.features &&
        parcels.features.length > 0
      ) {
        const allParcelsSource = new ol.source.Vector({
          features: format.readFeatures(parcels, {
            dataProjection: dataProjection,
            featureProjection: 'EPSG:27700'
          })
        })
        const allParcelsLayer = new ol.layer.Vector({
          source: allParcelsSource,
          style: function (feature) {
            const ref = feature.get('Parcel Ref') || null
            if (currentParcelRef != null && ref === currentParcelRef) {
              return null
            }
            return feintParcelStyle
          },
          zIndex: 20
        })
        map.addLayer(allParcelsLayer)
      }

      // Boundary layer (context)
      if (
        siteBoundary &&
        siteBoundary.features &&
        siteBoundary.features.length > 0
      ) {
        const boundarySource = new ol.source.Vector({
          features: format.readFeatures(siteBoundary, {
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
      }

      // Parcel layer – single feature, highlighted style
      const parcelSource = new ol.source.Vector({
        features: format.readFeatures(parcel, {
          dataProjection: dataProjection,
          featureProjection: 'EPSG:27700'
        })
      })
      const parcelLayer = new ol.layer.Vector({
        source: parcelSource,
        style: new ol.style.Style({
          stroke: new ol.style.Stroke({ color: '#ffdd00', width: 4 }),
          fill: new ol.style.Fill({ color: 'rgba(255, 221, 0, 0.35)' })
        }),
        zIndex: 31
      })
      map.addLayer(parcelLayer)

      // Fit view to parcel extent
      const features = parcelSource.getFeatures()
      if (features.length > 0) {
        const extent = ol.extent.createEmpty()
        features.forEach(function (feature) {
          const geom = feature.getGeometry()
          if (geom) {
            ol.extent.extend(extent, geom.getExtent())
          }
        })
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
          map.getView().fit(extent, {
            padding: [60, 60, 60, 60],
            maxZoom: 17,
            duration: 0
          })
        } else {
          map.getView().setCenter([400000, 310000])
          map.getView().setZoom(7)
        }
      } else {
        map.getView().setCenter([400000, 310000])
        map.getView().setZoom(7)
      }
    }).catch(function (err) {
      console.error('Failed to initialize habitat details map:', err)
    })
  }
})()
