//
// DefraMapClient fill (prototype augmentation)
// Not a module: extends `window.DefraMapClient.prototype`.
//

;(function (window) {
  'use strict'

  const DefraMapClient = window.DefraMapClient
  const GeometryValidation =
    window.DefraMapLib && window.DefraMapLib.GeometryValidation
  if (!DefraMapClient) {
    throw new Error(
      'defra-map-client.fill.js requires window.DefraMapClient to be loaded first.'
    )
  }
  if (!GeometryValidation) {
    throw new Error(
      'defra-map-client.fill.js requires window.DefraMapLib.GeometryValidation to be loaded first.'
    )
  }

  // ============================
  // Public API (fill)
  // ============================

  DefraMapClient.prototype.startFillBoundary = function () {
    this._startFill('boundary')
  }

  DefraMapClient.prototype.startFillParcels = function () {
    this._startFill('parcels')
  }

  DefraMapClient.prototype.confirmFill = function () {
    if (!this._fillActive) return false
    if (this._fillMode === 'boundary') {
      return this._confirmFillBoundary()
    }
    return false
  }

  DefraMapClient.prototype.cancelFill = function () {
    if (!this._fillActive) return
    this._fillActive = false
    this._fillMode = null
    this._fillSelected = []
    this._fillExistingBoundaryGeometry = null
    this._fillConstraintBoundary = null
    if (this._fillPreviewSource) this._fillPreviewSource.clear()
    this._map.getTargetElement().style.cursor = 'default'
    this._emitter.emit('fill:cancelled', {})
  }

  // ============================
  // Internal fill
  // ============================

  DefraMapClient.prototype._startFill = function (kind) {
    if (this._fillActive) return
    if (kind === 'parcels' && this._mode !== 'habitat-parcels') return

    if (kind === 'parcels') {
      if (!this._boundaryPolygon) {
        this._emitter.emit('validation:error', {
          message:
            'No red-line boundary defined. Please define a boundary first.'
        })
        return
      }
      this._fillConstraintBoundary = this._boundaryPolygon
    }

    this._fillActive = true
    this._fillMode = kind
    this._fillSelected = []
    this._fillExistingBoundaryGeometry = null
    this._fillPreviewSource.clear()

    if (kind === 'boundary') {
      if (
        this._mode === 'red-line-boundary' &&
        this._polygonComplete &&
        this._polygonFeature
      ) {
        const existingCoords = this._currentPolygonCoords
        if (existingCoords && existingCoords.length >= 4) {
          this._fillExistingBoundaryGeometry = new ol.geom.Polygon([
            existingCoords
          ])
          this._fillPreviewSource.addFeature(
            new ol.Feature({
              geometry: this._fillExistingBoundaryGeometry.clone(),
              layerType: 'existing-boundary',
              isExisting: true
            })
          )
        }
      }
    }

    this._map.getTargetElement().style.cursor = 'crosshair'
    this._emitter.emit('fill:started', { mode: kind })
    this._emitFillSelectionChanged()
  }

  DefraMapClient.prototype._handleFillHover = function (evt) {
    if (!this._fillActive || evt.dragging) return
    const polygon = this._findFillPolygonAtPixel(evt.pixel, true)
    this._map.getTargetElement().style.cursor = polygon
      ? 'pointer'
      : 'crosshair'
  }

  DefraMapClient.prototype._handleFillClick = function (evt) {
    if (!this._fillActive) return
    const clickedPolygon = this._findFillPolygonAtPixel(evt.pixel, false)
    if (!clickedPolygon) {
      this._emitter.emit('fill:message', {
        type: 'info',
        message: 'No OS polygon found at this location.'
      })
      return
    }

    if (this._fillMode === 'parcels') {
      const validation = this._validatePolygonWithinBoundary(
        clickedPolygon.geometry
      )
      if (!validation.valid) {
        this._emitter.emit('fill:message', {
          type: 'warning',
          message: validation.error
        })
        return
      }

      const overlapCheck = this._checkOverlapWithExistingParcels(
        clickedPolygon.geometry
      )
      if (!overlapCheck.valid) {
        this._emitter.emit('fill:message', {
          type: 'warning',
          message: overlapCheck.error
        })
        return
      }

      this._addFillPolygonAsParcel(clickedPolygon)
      return
    }

    this._toggleFillSelection(clickedPolygon)
  }

  DefraMapClient.prototype._findFillPolygonAtPixel = function (pixel, silent) {
    const coordinate = this._map.getCoordinateFromPixel(pixel)
    if (!coordinate) return null

    const features = this._snapIndexSource.getFeatures()
    let foundPolygon = null
    let smallestArea = Infinity

    const allowedLayers = this._osFeatures.fillPolygonLayers || []
    if (!allowedLayers.length) {
      return null
    }

    for (const feature of features) {
      const geometry = feature.getGeometry()
      if (!geometry) continue
      const geomType = geometry.getType()
      if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') continue

      const layerType = feature.get('layerType')
      if (!layerType || !allowedLayers.includes(layerType)) continue

      let containsPoint = false
      if (geomType === 'Polygon') {
        containsPoint = geometry.intersectsCoordinate(coordinate)
      } else {
        const polygons = geometry.getPolygons()
        for (const poly of polygons) {
          if (poly.intersectsCoordinate(coordinate)) {
            containsPoint = true
            break
          }
        }
      }

      if (containsPoint) {
        const area = this._getFillPolygonArea(geometry)
        if (area < smallestArea) {
          smallestArea = area
          foundPolygon = { feature, geometry, layerType }
        }
      }
    }

    if (!silent && foundPolygon) {
      this._emitter.emit('fill:hover', {
        layerType: foundPolygon.layerType,
        areaSqm: smallestArea
      })
    }

    return foundPolygon
  }

  DefraMapClient.prototype._getFillPolygonArea = function (geometry) {
    const type = geometry.getType()
    if (type === 'Polygon') return geometry.getArea()
    if (type === 'MultiPolygon') {
      let total = 0
      geometry.getPolygons().forEach((poly) => {
        total += poly.getArea()
      })
      return total
    }
    return 0
  }

  DefraMapClient.prototype._toggleFillSelection = function (polygonInfo) {
    const existingIndex = this._findFillSelectedIndex(polygonInfo)
    if (existingIndex >= 0) {
      this._fillSelected.splice(existingIndex, 1)
    } else {
      if (this._fillSelected.length > 0 || this._fillExistingBoundaryGeometry) {
        const isAdjacent = this._checkAdjacencyWithSelection(
          polygonInfo.geometry
        )
        if (!isAdjacent) {
          this._fillSelected = []
          this._fillExistingBoundaryGeometry = null
          this._fillPreviewSource.clear()
          this._emitter.emit('fill:message', {
            type: 'info',
            message:
              'New polygon selected. Previous boundary cleared as it was not adjacent.'
          })
        }
      }
      this._fillSelected.push(polygonInfo)
    }

    this._updateFillPreviewLayer()
    this._emitFillSelectionChanged()
  }

  DefraMapClient.prototype._findFillSelectedIndex = function (polygonInfo) {
    const coords1 = this._getFillPolygonCoordinates(polygonInfo.geometry)
    for (let i = 0; i < this._fillSelected.length; i++) {
      const coords2 = this._getFillPolygonCoordinates(
        this._fillSelected[i].geometry
      )
      if (
        GeometryValidation.coordsNearlyEqual(coords1[0], coords2[0]) &&
        coords1.length === coords2.length
      ) {
        return i
      }
    }
    return -1
  }

  DefraMapClient.prototype._getFillPolygonCoordinates = function (geometry) {
    const type = geometry.getType()
    if (type === 'Polygon') return geometry.getCoordinates()[0]
    if (type === 'MultiPolygon') return geometry.getCoordinates()[0][0]
    return []
  }

  DefraMapClient.prototype._checkAdjacencyWithSelection = function (geometry) {
    if (this._fillSelected.length === 0 && !this._fillExistingBoundaryGeometry)
      return true

    const poly1 = this._geometryToPolygon(geometry)
    if (!poly1) return false

    if (this._fillExistingBoundaryGeometry) {
      if (
        GeometryValidation.arePolygonsAdjacent(
          poly1,
          this._fillExistingBoundaryGeometry
        )
      ) {
        return true
      }
    }

    for (const selected of this._fillSelected) {
      const poly2 = this._geometryToPolygon(selected.geometry)
      if (poly2 && GeometryValidation.arePolygonsAdjacent(poly1, poly2)) {
        return true
      }
    }

    return false
  }

  DefraMapClient.prototype._updateFillPreviewLayer = function () {
    this._fillPreviewSource.clear()
    if (this._fillExistingBoundaryGeometry) {
      this._fillPreviewSource.addFeature(
        new ol.Feature({
          geometry: this._fillExistingBoundaryGeometry.clone(),
          layerType: 'existing-boundary',
          isExisting: true
        })
      )
    }
    for (const selected of this._fillSelected) {
      const feature = new ol.Feature({
        geometry: selected.geometry.clone(),
        layerType: selected.layerType
      })
      this._fillPreviewSource.addFeature(feature)
    }

    this._fillPreviewSource.changed()
    this._fillPreviewLayer.changed()
    this._map.updateSize()
    this._map.renderSync()
  }

  DefraMapClient.prototype._emitFillSelectionChanged = function () {
    let totalArea = 0
    let count = this._fillSelected.length

    if (this._fillExistingBoundaryGeometry) {
      totalArea += this._fillExistingBoundaryGeometry.getArea()
      count++
    }

    for (const selected of this._fillSelected) {
      totalArea += this._getFillPolygonArea(selected.geometry)
    }

    this._emitter.emit('fill:selectionChanged', {
      count: count,
      selectedCount: this._fillSelected.length,
      totalAreaSqm: totalArea
    })
  }

  DefraMapClient.prototype._geometryToPolygon = function (geometry) {
    const type = geometry.getType()
    if (type === 'Polygon') return geometry
    if (type === 'MultiPolygon') {
      const coords = geometry.getCoordinates()[0]
      return new ol.geom.Polygon(coords)
    }
    return null
  }

  DefraMapClient.prototype._confirmFillBoundary = function () {
    if (this._fillSelected.length === 0) {
      this._emitter.emit('fill:message', {
        type: 'warning',
        message: 'No polygons selected.'
      })
      return false
    }

    if (this._fillSelected.length > 1) {
      const polygonGeoms = this._fillSelected
        .map((s) => this._geometryToPolygon(s.geometry))
        .filter(Boolean)
      if (!GeometryValidation.arePolygonsContiguous(polygonGeoms)) {
        this._emitter.emit('fill:message', {
          type: 'error',
          message: 'Selected polygons are not all connected.'
        })
        return false
      }
    }

    const merged = this._mergeFillSelectedPolygons()
    if (!merged) {
      this._emitter.emit('fill:message', {
        type: 'error',
        message: 'Failed to merge selected polygons.'
      })
      return false
    }

    const coords = merged.getCoordinates()[0]
    this.setBoundaryFromCoordinates(coords)
    this.cancelFill()

    this._emitter.emit('fill:confirmed', { areaSqm: merged.getArea() })
    return true
  }

  DefraMapClient.prototype._mergeFillSelectedPolygons = function () {
    const allPolygons = []
    if (this._fillExistingBoundaryGeometry)
      allPolygons.push(this._fillExistingBoundaryGeometry)
    for (const selected of this._fillSelected) {
      const poly = this._geometryToPolygon(selected.geometry)
      if (poly) allPolygons.push(poly)
    }
    if (!allPolygons.length) return null
    if (allPolygons.length === 1) return allPolygons[0].clone()

    // Simple “outer edges” merge from original prototype (approximate).
    try {
      const mergedCoords = this._mergePolygonCoordinates(allPolygons)
      if (!mergedCoords) return null
      return new ol.geom.Polygon([mergedCoords])
    } catch (e) {
      return null
    }
  }

  DefraMapClient.prototype._mergePolygonCoordinates = function (polygons) {
    if (polygons.length === 0) return null
    if (polygons.length === 1) return polygons[0].getCoordinates()[0]

    const allEdges = []
    const edgeMap = new Map()

    for (const polygon of polygons) {
      const coords = polygon.getCoordinates()[0]
      for (let i = 0; i < coords.length - 1; i++) {
        const edge = { start: coords[i], end: coords[i + 1] }
        const key = this._getEdgeKey(edge)
        const reverseKey = this._getEdgeKey({
          start: edge.end,
          end: edge.start
        })
        if (edgeMap.has(reverseKey)) {
          edgeMap.get(reverseKey).shared = true
          edge.shared = true
        }
        edgeMap.set(key, edge)
        allEdges.push(edge)
      }
    }

    const outerEdges = allEdges.filter((e) => !e.shared)
    const outerBoundary = this._walkEdges(outerEdges)
    if (outerBoundary && outerBoundary.length >= 3) {
      outerBoundary.push(outerBoundary[0].slice())
      return outerBoundary
    }

    return null
  }

  DefraMapClient.prototype._getEdgeKey = function (edge) {
    return `${edge.start[0].toFixed(6)},${edge.start[1].toFixed(6)}-${edge.end[0].toFixed(6)},${edge.end[1].toFixed(6)}`
  }

  DefraMapClient.prototype._walkEdges = function (edges) {
    if (!edges.length) return null

    const adjacency = new Map()
    for (const edge of edges) {
      const startKey = `${edge.start[0].toFixed(6)},${edge.start[1].toFixed(6)}`
      if (!adjacency.has(startKey)) adjacency.set(startKey, [])
      adjacency.get(startKey).push(edge)
    }

    const result = [edges[0].start.slice()]
    let current = edges[0].end.slice()
    const used = new Set()
    used.add(this._getEdgeKey(edges[0]))

    const maxIterations = edges.length * 2
    let iterations = 0

    while (iterations < maxIterations) {
      iterations++
      result.push(current.slice())
      if (
        GeometryValidation.coordsNearlyEqual(current, result[0]) &&
        result.length > 3
      )
        break

      const currentKey = `${current[0].toFixed(6)},${current[1].toFixed(6)}`
      const candidates = adjacency.get(currentKey) || []
      let foundNext = false
      for (const candidate of candidates) {
        const key = this._getEdgeKey(candidate)
        if (!used.has(key)) {
          used.add(key)
          current = candidate.end.slice()
          foundNext = true
          break
        }
      }
      if (!foundNext) break
    }

    return result.length >= 3 ? result : null
  }

  // Parcel fill: convert OS polygon to parcel and add directly.
  DefraMapClient.prototype._validatePolygonWithinBoundary = function (
    geometry
  ) {
    const poly = this._geometryToPolygon(geometry)
    if (!poly) return { valid: false, error: 'Invalid polygon geometry.' }
    if (!this._fillConstraintBoundary)
      return { valid: false, error: 'No boundary defined for validation.' }

    if (
      GeometryValidation.isPolygonWithinBoundary(
        poly,
        this._fillConstraintBoundary
      )
    ) {
      return { valid: true, error: null }
    }
    return {
      valid: false,
      error: 'This polygon extends outside the red-line boundary.'
    }
  }

  DefraMapClient.prototype._checkOverlapWithExistingParcels = function (
    geometry
  ) {
    const poly = this._geometryToPolygon(geometry)
    if (!poly) return { valid: false, error: 'Invalid polygon geometry.' }
    for (let i = 0; i < this._habitatParcels.length; i++) {
      const parcelGeom = this._habitatParcels[i].feature.getGeometry()
      if (GeometryValidation.doPolygonsOverlap(poly, parcelGeom)) {
        return {
          valid: false,
          error: `This polygon overlaps with parcel ${i + 1}.`
        }
      }
    }
    return { valid: true, error: null }
  }

  DefraMapClient.prototype._addFillPolygonAsParcel = function (polygonInfo) {
    const poly = this._geometryToPolygon(polygonInfo.geometry)
    if (!poly) return false

    const coords = poly.getCoordinates()[0]
    return this.addParcelFromCoordinates(coords)
  }

  DefraMapClient.prototype.addParcelFromCoordinates = function (coords) {
    if (this._mode !== 'habitat-parcels') return false
    if (!coords || coords.length < 4) return false

    const parcelCoords = coords.map((c) => [...c])
    const first = parcelCoords[0]
    const last = parcelCoords[parcelCoords.length - 1]
    if (first[0] !== last[0] || first[1] !== last[1]) {
      parcelCoords.push([...first])
    }

    const completedPolygon = new ol.geom.Polygon([parcelCoords])
    const colorIndex = this._habitatParcels.length % this._parcelColors.length

    const parcelFeature = new ol.Feature({
      geometry: completedPolygon,
      type: 'parcel',
      colorIndex: colorIndex
    })
    this._drawSource.addFeature(parcelFeature)

    const vertexFeatures = []
    for (let i = 0; i < parcelCoords.length - 1; i++) {
      const vertexFeature = new ol.Feature({
        geometry: new ol.geom.Point(parcelCoords[i]),
        type: 'vertex',
        isFirst: i === 0,
        highlighted: false,
        colorIndex: colorIndex
      })
      vertexFeatures.push(vertexFeature)
      this._drawSource.addFeature(vertexFeature)
    }

    const id = `parcel-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const parcel = {
      id,
      feature: parcelFeature,
      coords: parcelCoords,
      vertices: vertexFeatures,
      colorIndex,
      meta: {}
    }
    this._habitatParcels.push(parcel)

    const index = this._habitatParcels.length - 1
    this._emitter.emit('parcel:added', {
      index,
      id,
      areaSqm: completedPolygon.getArea(),
      source: 'fill'
    })
    this._emitter.emit('parcels:changed', {
      count: this._habitatParcels.length,
      totalAreaSqm: this.parcelsTotalAreaSqm
    })
    return true
  }
})(window)
