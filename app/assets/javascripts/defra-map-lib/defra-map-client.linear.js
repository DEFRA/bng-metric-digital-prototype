//
// DefraMapClient linear (prototype augmentation)
// Not a module: extends `window.DefraMapClient.prototype`.
// Adds hedgerow and watercourse drawing functionality.
//

;(function (window) {
  'use strict'

  const DefraMapClient = window.DefraMapClient
  if (!DefraMapClient) {
    throw new Error(
      'defra-map-client.linear.js requires window.DefraMapClient to be loaded first.'
    )
  }

  // ============================
  // Public API (linear features)
  // ============================

  DefraMapClient.prototype.startDrawHedgerow = function () {
    this._startLineDraw('hedgerow')
  }

  DefraMapClient.prototype.startDrawWatercourse = function () {
    this._startLineDraw('watercourse')
  }

  DefraMapClient.prototype.cancelLineDraw = function () {
    if (!this._isLineDrawing) return
    this._isLineDrawing = false
    this._currentLineType = null
    this._currentLineCoords = []

    // Remove placed vertices
    this._placedLineVertices.forEach((v) => this._drawSource.removeFeature(v))
    this._placedLineVertices = []

    // Remove line feature
    if (this._lineFeature) {
      this._drawSource.removeFeature(this._lineFeature)
      this._lineFeature = null
    }

    this._hoverSource.clear()
    if (this._dragPanInteraction && !this._dragPanInteraction.getActive()) {
      this._dragPanInteraction.setActive(true)
    }

    this._map.getTargetElement().style.cursor = 'default'
    this._emitter.emit('linedraw:cancelled', {})
  }

  DefraMapClient.prototype.finishLineDraw = function () {
    if (!this._isLineDrawing) return

    // Need at least 2 points to form a valid line
    if (this._currentLineCoords.length < 2) {
      this._emitter.emit('validation:error', {
        message: 'Need at least 2 points to complete a line.'
      })
      return
    }

    this._completeLine()
  }

  DefraMapClient.prototype.removeHedgerow = function (index) {
    if (index < 0 || index >= this._hedgerows.length) return

    const hedgerow = this._hedgerows[index]
    this._drawSource.removeFeature(hedgerow.feature)
    hedgerow.vertices.forEach((v) => this._drawSource.removeFeature(v))
    this._hedgerows.splice(index, 1)

    this._emitter.emit('hedgerow:removed', { index })
    this._emitter.emit('linearfeatures:changed', {
      hedgerowCount: this._hedgerows.length,
      watercourseCount: this._watercourses.length
    })
  }

  DefraMapClient.prototype.removeWatercourse = function (index) {
    if (index < 0 || index >= this._watercourses.length) return

    const watercourse = this._watercourses[index]
    this._drawSource.removeFeature(watercourse.feature)
    watercourse.vertices.forEach((v) => this._drawSource.removeFeature(v))
    this._watercourses.splice(index, 1)

    this._emitter.emit('watercourse:removed', { index })
    this._emitter.emit('linearfeatures:changed', {
      hedgerowCount: this._hedgerows.length,
      watercourseCount: this._watercourses.length
    })
  }

  DefraMapClient.prototype.getHedgerowCount = function () {
    return this._hedgerows.length
  }

  DefraMapClient.prototype.getWatercourseCount = function () {
    return this._watercourses.length
  }

  DefraMapClient.prototype.getTotalHedgerowLengthM = function () {
    return this._hedgerows.reduce((sum, h) => {
      return sum + this._getLineLength(h.coords)
    }, 0)
  }

  DefraMapClient.prototype.getTotalWatercourseLengthM = function () {
    return this._watercourses.reduce((sum, w) => {
      return sum + this._getLineLength(w.coords)
    }, 0)
  }

  DefraMapClient.prototype.exportLinearFeaturesGeoJSON = function (options) {
    const opts = options || {}
    const dataProjection = opts.dataProjection || 'EPSG:4326'
    const featureProjection = this._projection
    const format = new ol.format.GeoJSON()

    const hedgerowFeatures = this._hedgerows.map((h, index) => {
      const featureObj = format.writeFeatureObject(h.feature, {
        dataProjection: dataProjection,
        featureProjection: featureProjection
      })
      featureObj.properties = featureObj.properties || {}
      featureObj.properties.linearIndex = index
      featureObj.properties.linearType = 'hedgerow'
      featureObj.properties.lengthM = this._getLineLength(h.coords)
      return featureObj
    })

    const watercourseFeatures = this._watercourses.map((w, index) => {
      const featureObj = format.writeFeatureObject(w.feature, {
        dataProjection: dataProjection,
        featureProjection: featureProjection
      })
      featureObj.properties = featureObj.properties || {}
      featureObj.properties.linearIndex = index
      featureObj.properties.linearType = 'watercourse'
      featureObj.properties.lengthM = this._getLineLength(w.coords)
      return featureObj
    })

    return {
      hedgerows: { type: 'FeatureCollection', features: hedgerowFeatures },
      watercourses: {
        type: 'FeatureCollection',
        features: watercourseFeatures
      }
    }
  }

  DefraMapClient.prototype.loadLinearFeaturesGeoJSON = function (data) {
    if (!data) return false

    const format = new ol.format.GeoJSON()
    const mapCrs = this._projection

    // Load hedgerows
    if (data.hedgerows && data.hedgerows.features) {
      data.hedgerows.features.forEach((featureObj) => {
        let dataProjection = mapCrs
        if (
          data.hedgerows.crs &&
          data.hedgerows.crs.properties &&
          data.hedgerows.crs.properties.name
        ) {
          dataProjection = data.hedgerows.crs.properties.name
        }

        const feature = format.readFeature(featureObj, {
          dataProjection: dataProjection,
          featureProjection: mapCrs
        })

        const coords = feature.getGeometry().getCoordinates()
        this._addLinearFeatureFromCoords('hedgerow', coords)
      })
    }

    // Load watercourses
    if (data.watercourses && data.watercourses.features) {
      data.watercourses.features.forEach((featureObj) => {
        let dataProjection = mapCrs
        if (
          data.watercourses.crs &&
          data.watercourses.crs.properties &&
          data.watercourses.crs.properties.name
        ) {
          dataProjection = data.watercourses.crs.properties.name
        }

        const feature = format.readFeature(featureObj, {
          dataProjection: dataProjection,
          featureProjection: mapCrs
        })

        const coords = feature.getGeometry().getCoordinates()
        this._addLinearFeatureFromCoords('watercourse', coords)
      })
    }

    return true
  }

  // ============================
  // Internal line drawing
  // ============================

  DefraMapClient.prototype._startLineDraw = function (lineType) {
    if (this._isLineDrawing) return
    if (this._mode !== 'habitat-parcels') return

    // Cancel other active tools
    if (this._isDrawing) this.cancelDrawing()
    if (this._fillActive) this.cancelFill()
    if (this._sliceActive) this.cancelSlice()
    if (this._removeActive) this.cancelRemove()

    this._isLineDrawing = true
    this._currentLineType = lineType
    this._currentLineCoords = []
    this._placedLineVertices = []
    this._lineFeature = null

    this._map.getTargetElement().style.cursor = 'crosshair'
    this._emitter.emit('linedraw:started', { lineType: lineType })
  }

  DefraMapClient.prototype._placeLineVertex = function (coordinate) {
    this._currentLineCoords.push([...coordinate])

    const colors = this._linearColors[this._currentLineType]
    const vertexFeature = new ol.Feature({
      geometry: new ol.geom.Point(coordinate),
      type: 'linear-vertex',
      lineType: this._currentLineType,
      isFirst: this._currentLineCoords.length === 1
    })

    this._placedLineVertices.push(vertexFeature)
    this._drawSource.addFeature(vertexFeature)
  }

  DefraMapClient.prototype._updateLiveLine = function (snapCoord) {
    const tempCoords = [...this._currentLineCoords, snapCoord]
    if (tempCoords.length < 2) return

    if (this._lineFeature) {
      this._drawSource.removeFeature(this._lineFeature)
    }

    const geom = new ol.geom.LineString(tempCoords)
    this._lineFeature = new ol.Feature({
      geometry: geom,
      type: 'linear-feature',
      lineType: this._currentLineType
    })
    this._drawSource.addFeature(this._lineFeature)

    // Emit length update
    const lengthM = this._getLineLength(tempCoords)
    this._emitter.emit('linedraw:lengthChanged', { lengthM: lengthM })
  }

  DefraMapClient.prototype._completeLine = function () {
    if (this._currentLineCoords.length < 2) return

    let finalCoords = this._currentLineCoords

    // Correct and validate line within boundary (only in habitat-parcels mode)
    if (this._mode === 'habitat-parcels' && this._boundaryPolygon) {
      const GeometryValidation =
        window.DefraMapLib && window.DefraMapLib.GeometryValidation
      if (GeometryValidation) {
        // First, correct the line to fit within the boundary
        // (snaps vertices, inserts corner vertices where needed)
        finalCoords = GeometryValidation.correctLineToBoundary(
          this._currentLineCoords,
          this._boundaryPolygon
        )

        // Then validate the corrected line
        const featureTypeName =
          this._currentLineType === 'hedgerow' ? 'Hedgerow' : 'Watercourse'
        const validation = GeometryValidation.validateLinearFeature(
          finalCoords,
          this._boundaryPolygon,
          featureTypeName
        )
        if (!validation.valid) {
          this._emitter.emit('validation:error', { message: validation.error })
          return
        }
      }
    }

    // Remove temporary line feature
    if (this._lineFeature) {
      this._drawSource.removeFeature(this._lineFeature)
    }

    // Create final line feature
    const geom = new ol.geom.LineString(finalCoords)
    const finalFeature = new ol.Feature({
      geometry: geom,
      type: 'linear-feature',
      lineType: this._currentLineType
    })
    this._drawSource.addFeature(finalFeature)

    const id = `${this._currentLineType}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const lengthM = this._getLineLength(finalCoords)

    const linearObj = {
      id: id,
      feature: finalFeature,
      coords: finalCoords.map((c) => [...c]),
      vertices: [...this._placedLineVertices],
      meta: {}
    }

    if (this._currentLineType === 'hedgerow') {
      this._hedgerows.push(linearObj)
      this._emitter.emit('hedgerow:added', {
        index: this._hedgerows.length - 1,
        id: id,
        lengthM: lengthM
      })
    } else {
      this._watercourses.push(linearObj)
      this._emitter.emit('watercourse:added', {
        index: this._watercourses.length - 1,
        id: id,
        lengthM: lengthM
      })
    }

    this._emitter.emit('linedraw:completed', {
      lineType: this._currentLineType,
      lengthM: lengthM
    })
    this._emitter.emit('linearfeatures:changed', {
      hedgerowCount: this._hedgerows.length,
      watercourseCount: this._watercourses.length
    })

    // Reset state
    this._isLineDrawing = false
    this._currentLineType = null
    this._currentLineCoords = []
    this._placedLineVertices = []
    this._lineFeature = null
    this._hoverSource.clear()
    this._map.getTargetElement().style.cursor = 'default'
  }

  DefraMapClient.prototype._getLineLength = function (coords) {
    if (!coords || coords.length < 2) return 0
    let length = 0
    for (let i = 0; i < coords.length - 1; i++) {
      const dx = coords[i + 1][0] - coords[i][0]
      const dy = coords[i + 1][1] - coords[i][1]
      length += Math.sqrt(dx * dx + dy * dy)
    }
    return length
  }

  DefraMapClient.prototype._addLinearFeatureFromCoords = function (
    lineType,
    coords
  ) {
    if (!coords || coords.length < 2) return false

    const geom = new ol.geom.LineString(coords)
    const feature = new ol.Feature({
      geometry: geom,
      type: 'linear-feature',
      lineType: lineType
    })
    this._drawSource.addFeature(feature)

    // Create vertex features
    const vertexFeatures = []
    for (let i = 0; i < coords.length; i++) {
      const vertexFeature = new ol.Feature({
        geometry: new ol.geom.Point(coords[i]),
        type: 'linear-vertex',
        lineType: lineType,
        isFirst: i === 0
      })
      vertexFeatures.push(vertexFeature)
      this._drawSource.addFeature(vertexFeature)
    }

    const id = `${lineType}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const linearObj = {
      id: id,
      feature: feature,
      coords: coords.map((c) => [...c]),
      vertices: vertexFeatures,
      meta: {}
    }

    if (lineType === 'hedgerow') {
      this._hedgerows.push(linearObj)
    } else {
      this._watercourses.push(linearObj)
    }

    return true
  }

  // ============================
  // Styling for linear features
  // ============================

  // Store original style function reference
  const originalStyleDrawFeature =
    DefraMapClient.prototype._styleDrawFeature.bind

  // Override the styling function to add linear feature styles
  const origStyle = DefraMapClient.prototype._styleDrawFeature
  DefraMapClient.prototype._styleDrawFeature = function (feature) {
    const type = feature.get('type')

    if (type === 'linear-feature') {
      const lineType = feature.get('lineType')
      const colors = this._linearColors[lineType] || this._linearColors.hedgerow

      // Check for remove hover state
      if (feature.get('removeHover')) {
        return new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: '#d4351c',
            width: colors.strokeWidth + 2,
            lineDash: [8, 4]
          })
        })
      }

      return new ol.style.Style({
        stroke: new ol.style.Stroke({
          color: colors.stroke,
          width: colors.strokeWidth,
          lineDash: colors.lineDash || undefined
        })
      })
    }

    if (type === 'linear-vertex') {
      const lineType = feature.get('lineType')
      const colors = this._linearColors[lineType] || this._linearColors.hedgerow

      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 4,
          fill: new ol.style.Fill({ color: colors.stroke }),
          stroke: new ol.style.Stroke({ color: 'white', width: 2 })
        }),
        zIndex: 100
      })
    }

    // Fall back to original style for other features
    return origStyle.call(this, feature)
  }

  // ============================
  // Extend pointer handlers for line drawing
  // ============================

  const origHandlePointerMove = DefraMapClient.prototype._handlePointerMove
  DefraMapClient.prototype._handlePointerMove = function (evt) {
    if (this._isLineDrawing) {
      const coordinate = evt.coordinate
      const snapResult = this._findSnapPoint(coordinate)
      let snapCoord = snapResult.coordinate
      let snapType = snapResult.snapType

      // Clamp to boundary if outside (same as polygon drawing)
      if (
        (this._snapToBoundaryVertices || this._snapToBoundaryEdges) &&
        this._mode === 'habitat-parcels' &&
        this._boundaryPolygon
      ) {
        const clamped = this._clampToBoundary(snapCoord)
        if (clamped[0] !== snapCoord[0] || clamped[1] !== snapCoord[1]) {
          snapCoord = clamped
          snapType = this._snapType.BOUNDARY_EDGE
        }
      }

      this._lastSnapCoord = snapCoord
      this._lastSnapType = snapType

      // Update hover marker
      this._hoverSource.clear()
      this._hoverFeature = new ol.Feature({
        geometry: new ol.geom.Point(snapCoord),
        snapType: snapType || this._snapType.NONE
      })
      this._hoverSource.addFeature(this._hoverFeature)

      // Update live line preview
      if (this._currentLineCoords.length > 0) {
        this._updateLiveLine(snapCoord)
      }
      return
    }

    origHandlePointerMove.call(this, evt)
  }

  const origHandleClick = DefraMapClient.prototype._handleClick
  DefraMapClient.prototype._handleClick = function (evt) {
    if (this._isLineDrawing) {
      // Ignore click if we just completed via double-click
      if (this._justCompletedLineDraw) return

      const snapCoord = this._lastSnapCoord || evt.coordinate
      this._placeLineVertex(snapCoord)
      return
    }

    origHandleClick.call(this, evt)
  }

  // Double-click to complete line drawing
  const origHandleDblClick = DefraMapClient.prototype._handleDblClick
  DefraMapClient.prototype._handleDblClick = function (evt) {
    if (this._isLineDrawing) {
      // Need at least 2 points to complete a line
      if (this._currentLineCoords.length < 2) return

      evt.preventDefault()
      evt.stopPropagation()

      // Set flag to prevent the second single-click from placing a vertex
      this._justCompletedLineDraw = true
      setTimeout(() => {
        this._justCompletedLineDraw = false
      }, 100)

      this._completeLine()
      return
    }

    if (origHandleDblClick) {
      origHandleDblClick.call(this, evt)
    }
  }

  // ============================
  // Extend remove handling for linear features
  // ============================

  const origHandleRemoveClick = DefraMapClient.prototype._handleRemoveClick
  DefraMapClient.prototype._handleRemoveClick = function (evt) {
    if (!this._removeActive) return

    // Check for linear feature click first
    const linearFeature = this._findLinearFeatureAtPixel(evt.pixel)
    if (linearFeature) {
      if (linearFeature.lineType === 'hedgerow') {
        this.removeHedgerow(linearFeature.index)
      } else {
        this.removeWatercourse(linearFeature.index)
      }
      // Clear hover state
      if (this._removeHoverFeature) {
        this._removeHoverFeature.set('removeHover', false)
        this._removeHoverFeature = null
      }

      // Check if there are still features to remove
      if (!this._hasRemovableFeatures()) {
        this._removeActive = false
        this._map.getTargetElement().style.cursor = 'default'
      }

      this._emitter.emit('remove:completed', {
        type: linearFeature.lineType,
        index: linearFeature.index
      })
      return
    }

    // For habitat-parcels mode, handle parcel removal with combined exit check
    if (this._mode === 'habitat-parcels') {
      const clickedIndex = this._findParcelAtPixel(evt.pixel)
      if (clickedIndex >= 0) {
        this.removeParcel(clickedIndex)

        // Check if there are still ANY features to remove (parcels OR linear)
        if (!this._hasRemovableFeatures()) {
          this._removeActive = false
          this._map.getTargetElement().style.cursor = 'default'
        }

        this._emitter.emit('remove:completed', {
          type: 'parcel',
          index: clickedIndex
        })
      }
      return
    }

    // For red-line-boundary mode, use original handler
    origHandleRemoveClick.call(this, evt)
  }

  const origHandleRemoveHover = DefraMapClient.prototype._handleRemoveHover
  DefraMapClient.prototype._handleRemoveHover = function (evt) {
    if (!this._removeActive || evt.dragging) return

    // Check for linear feature hover first
    const linearFeature = this._findLinearFeatureAtPixel(evt.pixel)
    if (linearFeature) {
      // Clear previous hover
      if (
        this._removeHoverFeature &&
        this._removeHoverFeature !== linearFeature.feature
      ) {
        this._removeHoverFeature.set('removeHover', false)
      }

      this._removeHoverFeature = linearFeature.feature
      linearFeature.feature.set('removeHover', true)
      this._map.getTargetElement().style.cursor = 'pointer'
      return
    }

    // Clear linear hover if we're not over a linear feature
    if (
      this._removeHoverFeature &&
      this._removeHoverFeature.get('type') === 'linear-feature'
    ) {
      this._removeHoverFeature.set('removeHover', false)
      this._removeHoverFeature = null
    }

    origHandleRemoveHover.call(this, evt)
  }

  DefraMapClient.prototype._findLinearFeatureAtPixel = function (pixel) {
    const tolerance = 10 // pixels
    let found = null

    this._map.forEachFeatureAtPixel(
      pixel,
      (feature) => {
        if (feature.get('type') === 'linear-feature') {
          const lineType = feature.get('lineType')

          // Find index
          let index = -1
          const collection =
            lineType === 'hedgerow' ? this._hedgerows : this._watercourses
          for (let i = 0; i < collection.length; i++) {
            if (collection[i].feature === feature) {
              index = i
              break
            }
          }

          if (index >= 0) {
            found = { feature, lineType, index }
            return true // Stop iteration
          }
        }
      },
      { layerFilter: (layer) => layer === this._drawLayer, hitTolerance: 10 }
    )

    return found
  }

  // Helper to check if there are any removable features (parcels or linear)
  DefraMapClient.prototype._hasRemovableFeatures = function () {
    if (this._mode === 'red-line-boundary') {
      return this._polygonComplete
    }
    if (this._mode === 'habitat-parcels') {
      return (
        this._habitatParcels.length > 0 ||
        this._hedgerows.length > 0 ||
        this._watercourses.length > 0
      )
    }
    return false
  }

  // Override startRemove to include linear features in validation
  const origStartRemove = DefraMapClient.prototype.startRemove
  DefraMapClient.prototype.startRemove = function () {
    if (this._removeActive) return
    if (this._isDrawing) this.cancelDrawing()
    if (this._isLineDrawing) this.cancelLineDraw()
    if (this._fillActive) this.cancelFill()
    if (this._sliceActive) this.cancelSlice()

    if (this._mode === 'red-line-boundary' && !this._polygonComplete) {
      this._emitter.emit('validation:error', {
        message: 'No boundary to remove.'
      })
      return
    }

    if (this._mode === 'habitat-parcels' && !this._hasRemovableFeatures()) {
      this._emitter.emit('validation:error', {
        message: 'No features to remove.'
      })
      return
    }

    this._removeActive = true
    this._map.getTargetElement().style.cursor = 'crosshair'
    this._emitter.emit('remove:started', {})
  }

  // ============================
  // Extend debug info
  // ============================

  const origGetDebugInfo = DefraMapClient.prototype.getDebugInfo
  DefraMapClient.prototype.getDebugInfo = function () {
    const info = origGetDebugInfo.call(this)
    info.linear = {
      hedgerowCount: this._hedgerows.length,
      watercourseCount: this._watercourses.length,
      totalHedgerowLengthM: this.getTotalHedgerowLengthM(),
      totalWatercourseLengthM: this.getTotalWatercourseLengthM(),
      isLineDrawing: this._isLineDrawing,
      currentLineType: this._currentLineType
    }
    return info
  }
})(window)
