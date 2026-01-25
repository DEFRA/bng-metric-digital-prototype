//
// DefraMapClient slice (prototype augmentation)
// Not a module: extends `window.DefraMapClient.prototype`.
//

;(function (window) {
  'use strict'

  const DefraMapClient = window.DefraMapClient
  if (!DefraMapClient) {
    throw new Error(
      'defra-map-client.slice.js requires window.DefraMapClient to be loaded first.'
    )
  }

  // ============================
  // Public API (slice)
  // ============================

  DefraMapClient.prototype.startSlice = function () {
    if (this._sliceActive) return
    if (this._mode !== 'habitat-parcels') return
    if (!this._boundaryPolygon) {
      this._emitter.emit('validation:error', {
        message: 'No boundary loaded. Define a red line boundary first.'
      })
      return
    }
    this._sliceActive = true
    this._sliceStart = null
    this._sliceSourceType = null
    this._sliceSourceParcelIndex = -1
    this._sliceSourceCoords = null
    this._clearSliceVisuals()
    this._map.getTargetElement().style.cursor = 'crosshair'
    this._emitter.emit('slice:started', {})
  }

  DefraMapClient.prototype.cancelSlice = function () {
    if (!this._sliceActive) return
    this._sliceActive = false
    this._sliceStart = null
    this._sliceSourceType = null
    this._sliceSourceParcelIndex = -1
    this._sliceSourceCoords = null
    this._clearSliceVisuals()
    this._map.getTargetElement().style.cursor = 'default'
    this._emitter.emit('slice:cancelled', {})
  }

  // ============================
  // Internal slice
  // ============================

  DefraMapClient.prototype._clearSliceVisuals = function () {
    if (this._sliceSource) this._sliceSource.clear()
    this._sliceHover = null
    this._sliceStartMarker = null
    this._slicePreviewLine = null
  }

  DefraMapClient.prototype._handleSlicePointerMove = function (evt) {
    if (!this._sliceActive) return
    const coordinate = evt.coordinate
    const snapInfo = this._sliceStart
      ? this._findSliceSnapPointOnSourcePolygon(coordinate)
      : this._findSliceSnapPoint(coordinate)

    if (this._sliceHover) {
      this._sliceSource.removeFeature(this._sliceHover)
      this._sliceHover = null
    }

    if (snapInfo) {
      let featureType
      if (snapInfo.isVertex) {
        featureType =
          snapInfo.sourceType === 'parcel'
            ? 'parcel-vertex-hover'
            : 'boundary-vertex-hover'
      } else {
        featureType = 'edge-hover'
      }
      this._sliceHover = new ol.Feature({
        geometry: new ol.geom.Point(snapInfo.coordinate),
        featureType: featureType
      })
      this._sliceSource.addFeature(this._sliceHover)
      this._map.getTargetElement().style.cursor = 'pointer'
    } else {
      this._map.getTargetElement().style.cursor = 'crosshair'
    }

    if (this._sliceStart) {
      if (this._slicePreviewLine) {
        this._sliceSource.removeFeature(this._slicePreviewLine)
      }
      const endCoord = snapInfo ? snapInfo.coordinate : coordinate
      this._slicePreviewLine = new ol.Feature({
        geometry: new ol.geom.LineString([
          this._sliceStart.coordinate,
          endCoord
        ]),
        featureType: 'line'
      })
      this._sliceSource.addFeature(this._slicePreviewLine)
    }
  }

  DefraMapClient.prototype._handleSliceClick = function (evt) {
    if (!this._sliceActive) return
    const coordinate = evt.coordinate

    if (!this._sliceStart) {
      const snapInfo = this._findSliceSnapPoint(coordinate)
      if (!snapInfo) {
        this._emitter.emit('slice:message', {
          type: 'warning',
          message: 'Please click on a boundary or parcel edge.'
        })
        return
      }

      this._sliceStart = snapInfo
      this._sliceSourceType = snapInfo.sourceType
      this._sliceSourceParcelIndex = snapInfo.parcelIndex
      this._sliceSourceCoords = snapInfo.polygonCoords.slice()

      this._sliceStartMarker = new ol.Feature({
        geometry: new ol.geom.Point(this._sliceStart.coordinate),
        featureType: 'start'
      })
      this._sliceSource.addFeature(this._sliceStartMarker)

      this._emitter.emit('slice:pointSelected', {
        stage: 'start',
        sourceType: this._sliceSourceType,
        parcelIndex: this._sliceSourceParcelIndex
      })
      return
    }

    const snapInfo = this._findSliceSnapPointOnSourcePolygon(coordinate)
    if (!snapInfo) {
      this._emitter.emit('slice:message', {
        type: 'warning',
        message: 'Please click on the same polygon to complete the slice.'
      })
      return
    }

    const dist = this._getDistance(
      this._sliceStart.coordinate,
      snapInfo.coordinate
    )
    if (dist < 1) {
      this._emitter.emit('slice:message', {
        type: 'warning',
        message: 'Please select a different point.'
      })
      return
    }

    this._executeSlice(this._sliceStart, snapInfo)
  }

  DefraMapClient.prototype._findSliceSnapPointOnSourcePolygon = function (
    coordinate
  ) {
    const resolution = this._map.getView().getResolution()
    const tolerance = this._snapTolerancePx * resolution

    let result = null
    let minDist = Infinity

    const coords = this._sliceSourceCoords
    if (!coords || coords.length < 3) return null

    for (let i = 0; i < coords.length - 1; i++) {
      const dist = this._getDistance(coordinate, coords[i])
      if (dist < tolerance && dist < minDist) {
        minDist = dist
        result = {
          coordinate: coords[i],
          edgeIndex: i,
          isVertex: true,
          sourceType: this._sliceSourceType,
          parcelIndex: this._sliceSourceParcelIndex,
          polygonCoords: coords
        }
      }
    }

    for (let i = 0; i < coords.length - 1; i++) {
      const closest = this._closestPointOnSegment(
        coordinate,
        coords[i],
        coords[i + 1]
      )
      const dist = this._getDistance(coordinate, closest)
      if (dist < tolerance && dist < minDist) {
        minDist = dist
        result = {
          coordinate: closest,
          edgeIndex: i,
          isVertex: false,
          sourceType: this._sliceSourceType,
          parcelIndex: this._sliceSourceParcelIndex,
          polygonCoords: coords
        }
      }
    }

    return result
  }

  DefraMapClient.prototype._findSliceSnapPoint = function (coordinate) {
    const resolution = this._map.getView().getResolution()
    const tolerance = this._snapTolerancePx * resolution

    let result = null
    let minDist = Infinity

    // Parcels first
    if (this._habitatParcels.length > 0) {
      for (let p = 0; p < this._habitatParcels.length; p++) {
        const geom = this._habitatParcels[p].feature.getGeometry()
        const coords = geom.getCoordinates()[0]

        for (let i = 0; i < coords.length - 1; i++) {
          const dist = this._getDistance(coordinate, coords[i])
          if (dist < tolerance && dist < minDist) {
            minDist = dist
            result = {
              coordinate: coords[i],
              edgeIndex: i,
              isVertex: true,
              sourceType: 'parcel',
              parcelIndex: p,
              polygonCoords: coords
            }
          }
        }

        if (
          !result ||
          result.sourceType !== 'parcel' ||
          result.parcelIndex !== p
        ) {
          for (let i = 0; i < coords.length - 1; i++) {
            const closest = this._closestPointOnSegment(
              coordinate,
              coords[i],
              coords[i + 1]
            )
            const dist = this._getDistance(coordinate, closest)
            if (dist < tolerance && dist < minDist) {
              minDist = dist
              result = {
                coordinate: closest,
                edgeIndex: i,
                isVertex: false,
                sourceType: 'parcel',
                parcelIndex: p,
                polygonCoords: coords
              }
            }
          }
        }
      }
    }

    if (result && result.sourceType === 'parcel') return result

    // Boundary
    if (this._boundaryPolygon) {
      const coords = this._boundaryPolygon.getCoordinates()[0]
      for (let i = 0; i < coords.length - 1; i++) {
        const dist = this._getDistance(coordinate, coords[i])
        if (dist < tolerance && dist < minDist) {
          minDist = dist
          result = {
            coordinate: coords[i],
            edgeIndex: i,
            isVertex: true,
            sourceType: 'boundary',
            parcelIndex: -1,
            polygonCoords: coords
          }
        }
      }

      if (!result) {
        for (let i = 0; i < coords.length - 1; i++) {
          const closest = this._closestPointOnSegment(
            coordinate,
            coords[i],
            coords[i + 1]
          )
          const dist = this._getDistance(coordinate, closest)
          if (dist < tolerance && dist < minDist) {
            minDist = dist
            result = {
              coordinate: closest,
              edgeIndex: i,
              isVertex: false,
              sourceType: 'boundary',
              parcelIndex: -1,
              polygonCoords: coords
            }
          }
        }
      }
    }

    return result
  }

  DefraMapClient.prototype._closestPointOnSegment = function (
    point,
    segStart,
    segEnd
  ) {
    const dx = segEnd[0] - segStart[0]
    const dy = segEnd[1] - segStart[1]
    if (dx === 0 && dy === 0) return [...segStart]

    const t = Math.max(
      0,
      Math.min(
        1,
        ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) /
          (dx * dx + dy * dy)
      )
    )
    return [segStart[0] + t * dx, segStart[1] + t * dy]
  }

  DefraMapClient.prototype._executeSlice = function (start, end) {
    const originalCoords = this._sliceSourceCoords.slice(0, -1)
    const newCoords = []
    let startInserted = false
    let endInserted = false
    let startIdx = -1
    let endIdx = -1

    for (let i = 0; i < originalCoords.length; i++) {
      const currentCoord = originalCoords[i]
      newCoords.push([...currentCoord])

      if (!startInserted && start.isVertex && start.edgeIndex === i) {
        startIdx = newCoords.length - 1
        startInserted = true
      }
      if (!endInserted && end.isVertex && end.edgeIndex === i) {
        endIdx = newCoords.length - 1
        endInserted = true
      }

      if (!startInserted && !start.isVertex && start.edgeIndex === i) {
        newCoords.push([...start.coordinate])
        startIdx = newCoords.length - 1
        startInserted = true
      }
      if (!endInserted && !end.isVertex && end.edgeIndex === i) {
        newCoords.push([...end.coordinate])
        endIdx = newCoords.length - 1
        endInserted = true
      }
    }

    if (startIdx === -1 || endIdx === -1) {
      this._emitter.emit('slice:message', {
        type: 'error',
        message: 'Error creating slice. Please try again.'
      })
      return
    }

    const i = Math.min(startIdx, endIdx)
    const j = Math.max(startIdx, endIdx)

    const polyA = []
    for (let idx = i; idx <= j; idx++) polyA.push([...newCoords[idx]])
    polyA.push([...newCoords[i]])

    const polyB = []
    for (let idx = j; idx < newCoords.length; idx++)
      polyB.push([...newCoords[idx]])
    for (let idx = 0; idx <= i; idx++) polyB.push([...newCoords[idx]])
    polyB.push([...newCoords[j]])

    if (polyA.length < 4 || polyB.length < 4) {
      this._emitter.emit('slice:message', {
        type: 'warning',
        message: 'Cannot create valid polygons from this slice.'
      })
      return
    }

    if (this._sliceSourceType === 'boundary') {
      this.addParcelFromCoordinates(polyA)
      this.addParcelFromCoordinates(polyB)
    } else {
      this._replaceParcelWithSlice(this._sliceSourceParcelIndex, polyA, polyB)
    }

    this._finishSlice()
  }

  DefraMapClient.prototype._replaceParcelWithSlice = function (
    parcelIndex,
    coordsA,
    coordsB
  ) {
    if (parcelIndex < 0 || parcelIndex >= this._habitatParcels.length) return
    const original = this._habitatParcels[parcelIndex]
    this._drawSource.removeFeature(original.feature)
    original.vertices.forEach((v) => this._drawSource.removeFeature(v))
    this._habitatParcels.splice(parcelIndex, 1)

    this.addParcelFromCoordinates(coordsA)
    this.addParcelFromCoordinates(coordsB)
  }

  DefraMapClient.prototype._finishSlice = function () {
    this._sliceActive = false
    this._sliceStart = null
    this._sliceSourceType = null
    this._sliceSourceParcelIndex = -1
    this._sliceSourceCoords = null
    this._clearSliceVisuals()
    this._map.getTargetElement().style.cursor = 'default'
    this._emitter.emit('slice:completed', {})
  }
})(window)
