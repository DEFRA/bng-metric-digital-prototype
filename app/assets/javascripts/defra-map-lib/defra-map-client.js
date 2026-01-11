//
// DefraMapClient (public parent class) - reusable class-based mapping client.
// Not a module: exposes `window.DefraMapClient`.
//
// Dependencies (must be loaded before this script):
// - OpenLayers global `ol`
// - ol-mapbox-style global `olms`
// - window.DefraMapLib.DefraEventEmitter
// - window.DefraMapLib.GeometryValidation
//

(function(window) {
  'use strict';

  const DefraEventEmitter = window.DefraMapLib && window.DefraMapLib.DefraEventEmitter;
  const GeometryValidation = window.DefraMapLib && window.DefraMapLib.GeometryValidation;

  function assertDep(name, value) {
    if (!value) {
      throw new Error(`DefraMapClient missing dependency: ${name}`);
    }
  }

  function defaultUkExtent27700() {
    return [-238375.0, 0.0, 900000.0, 1376256.0];
  }

  function defaultEnglandCenter27700() {
    return [400000, 310000];
  }

  function normalizeTarget(target) {
    if (!target) return null;
    if (typeof target === 'string') {
      return document.getElementById(target);
    }
    if (target instanceof HTMLElement) {
      return target;
    }
    return null;
  }

  function DefraMapClient(options) {
    assertDep('ol', window.ol);
    assertDep('olms', window.olms);
    assertDep('DefraEventEmitter', DefraEventEmitter);
    assertDep('GeometryValidation', GeometryValidation);

    this._options = options || {};
    this._emitter = new DefraEventEmitter();

    this._targetEl = normalizeTarget(this._options.target);
    if (!this._targetEl) {
      throw new Error('DefraMapClient requires a target element (id or HTMLElement).');
    }

    this._mode = this._options.mode || 'red-line-boundary'; // 'red-line-boundary' | 'habitat-parcels'
    this._projection = this._options.projection || 'EPSG:27700';

    this._map = null;
    this._vectorTileLayer = null;
    this._tileGrid = null;

    // Overlay state
    this._drawLayer = null;
    this._drawSource = null;
    this._boundaryLayer = null;
    this._boundarySource = null;
    this._boundaryVerticesLayer = null;
    this._boundaryVerticesSource = null;

    // OS feature snapping index (WFS-derived)
    this._snapIndexLayer = null;
    this._snapIndexSource = null;
    this._isFetching = false;
    this._lastFetchExtent = null;
    this._fetchTimeout = null;

    // Interaction state
    this._dragPanInteraction = null;
    this._isDrawing = false;
    this._polygonComplete = false; // boundary polygon complete (red-line mode)
    this._currentPolygonCoords = [];
    this._placedVertices = [];
    this._polygonFeature = null;
    this._hoverLayer = null;
    this._hoverSource = null;
    this._hoverFeature = null;
    this._canClosePolygon = false;
    this._lastSnapCoord = null;
    this._lastSnapType = 'none';
    this._isDragging = false;
    this._draggedVertex = null;
    this._draggedVertexIndex = -1;
    this._justFinishedDragging = false;
    this._ghostVertex = null;
    this._ghostVertexCoord = null;
    this._ghostVertexInsertIndex = -1;

    // Habitat parcels mode
    this._boundaryPolygon = null;
    this._habitatParcels = []; // [{ id, feature, coords, vertices, colorIndex, meta }]
    this._editingParcelIndex = -1;
    this._selectedParcelIndex = -1;

    // Fill selection mode
    this._fillActive = false;
    this._fillMode = null; // 'boundary' | 'parcels'
    this._fillSelected = []; // [{ feature, geometry, layerType }]
    this._fillExistingBoundaryGeometry = null;
    this._fillConstraintBoundary = null;
    this._fillPreviewLayer = null;
    this._fillPreviewSource = null;

    // Slice mode
    this._sliceActive = false;
    this._sliceLayer = null;
    this._sliceSource = null;
    this._sliceStart = null; // { coordinate, edgeIndex, isVertex, sourceType, parcelIndex, polygonCoords }
    this._sliceSourceType = null; // 'boundary' | 'parcel'
    this._sliceSourceParcelIndex = -1;
    this._sliceSourceCoords = null;
    this._sliceHover = null;
    this._sliceStartMarker = null;
    this._slicePreviewLine = null;

    // Remove mode
    this._removeActive = false;
    this._removeHoverFeature = null;

    // Config: URLs and OS layers
    this._tiles = this._options.tiles || {};
    this._osFeatures = this._options.osFeatures || {};
    this._endpoints = this._options.endpoints || {};
    this._controls = this._options.controls || {};
    this._controlsContainer = null;

    // Snap controls
    this._minZoomForSnap = typeof this._osFeatures.minZoomForSnap === 'number' ? this._osFeatures.minZoomForSnap : 14;
    this._fetchThrottleMs = typeof this._osFeatures.fetchThrottleMs === 'number' ? this._osFeatures.fetchThrottleMs : 300;
    this._snapTolerancePx = typeof this._osFeatures.snapTolerancePx === 'number' ? this._osFeatures.snapTolerancePx : 25;
    this._closeTolerancePx = typeof this._osFeatures.closeTolerancePx === 'number' ? this._osFeatures.closeTolerancePx : 10;
    this._simplifyTolerance = typeof this._osFeatures.simplifyTolerance === 'number' ? this._osFeatures.simplifyTolerance : 0;
    this._maxFeaturesPerRequest = typeof this._osFeatures.maxFeaturesPerRequest === 'number' ? this._osFeatures.maxFeaturesPerRequest : 100;

    this._snappingEnabled = true; // OS features
    this._snapToBoundaryVertices = true;
    this._snapToBoundaryEdges = true;
    this._snapToParcelVertices = true;
    this._snapToParcelEdges = true;

    // Constants
    this._snapType = {
      NONE: 'none',
      OS_FEATURE: 'os-feature',
      BOUNDARY_VERTEX: 'boundary-vertex',
      BOUNDARY_EDGE: 'boundary-edge',
      PARCEL_VERTEX: 'parcel-vertex',
      PARCEL_EDGE: 'parcel-edge'
    };

    this._parcelColors = [
      { stroke: 'rgba(29, 112, 184, 1)', fill: 'rgba(29, 112, 184, 0.2)' },
      { stroke: 'rgba(0, 112, 60, 1)', fill: 'rgba(0, 112, 60, 0.2)' },
      { stroke: 'rgba(128, 51, 153, 1)', fill: 'rgba(128, 51, 153, 0.2)' },
      { stroke: 'rgba(212, 53, 28, 1)', fill: 'rgba(212, 53, 28, 0.2)' },
      { stroke: 'rgba(255, 152, 0, 1)', fill: 'rgba(255, 152, 0, 0.2)' },
      { stroke: 'rgba(0, 150, 136, 1)', fill: 'rgba(0, 150, 136, 0.2)' },
      { stroke: 'rgba(233, 30, 99, 1)', fill: 'rgba(233, 30, 99, 0.2)' },
      { stroke: 'rgba(63, 81, 181, 1)', fill: 'rgba(63, 81, 181, 0.2)' }
    ];

    // Expose CRS for existing pages (kept for compatibility)
    window.appMapCRS = this._projection;
  }

  // ============================
  // Public API (events)
  // ============================

  DefraMapClient.prototype.on = function(eventName, handler) {
    this._emitter.on(eventName, handler);
  };

  DefraMapClient.prototype.off = function(eventName, handler) {
    this._emitter.off(eventName, handler);
  };

  // ============================
  // Public API (init / access)
  // ============================

  DefraMapClient.prototype.init = async function() {
    const extent = this._options.extent || defaultUkExtent27700();
    const center = this._options.center || defaultEnglandCenter27700();
    const zoom = typeof this._options.zoom === 'number' ? this._options.zoom : 7;
    const minZoom = typeof this._options.minZoom === 'number' ? this._options.minZoom : 0;
    const maxZoom = typeof this._options.maxZoom === 'number' ? this._options.maxZoom : 16;

    const collectionId = this._tiles.collectionId;
    const crs = this._tiles.crs;
    const tileMatrixSetUrl = this._tiles.tileMatrixSetUrl;
    const styleUrl = this._tiles.styleUrl;
    const tilesUrlTemplate = this._tiles.tilesUrlTemplate;

    if (!collectionId || !crs || !tileMatrixSetUrl || !styleUrl || !tilesUrlTemplate) {
      throw new Error('DefraMapClient tiles config missing. Provide tiles.collectionId/crs/tileMatrixSetUrl/styleUrl/tilesUrlTemplate.');
    }

    const [tms, glStyle] = await Promise.all([
      fetch(tileMatrixSetUrl).then(r => r.json()),
      fetch(styleUrl).then(r => r.json())
    ]);

    this._tileGrid = new ol.tilegrid.TileGrid({
      resolutions: tms.tileMatrices.map(({ cellSize }) => cellSize),
      origin: tms.tileMatrices[0].pointOfOrigin,
      tileSize: [tms.tileMatrices[0].tileHeight, tms.tileMatrices[0].tileWidth]
    });

    const formatMvt = new ol.format.MVT();
    formatMvt.supportedMediaTypes.push('application/octet-stream');

    this._vectorTileLayer = new ol.layer.VectorTile({
      source: new ol.source.VectorTile({
        format: formatMvt,
        url: tilesUrlTemplate,
        projection: this._projection,
        tileGrid: this._tileGrid
      }),
      declutter: true
    });

    this._vectorTileLayer.getSource().on('tileloaderror', (event) => {
      this._emitter.emit('tiles:error', { event });
    });

    await olms.applyStyle(
      this._vectorTileLayer,
      glStyle,
      { source: collectionId, updateSource: false },
      { styleUrl: null },
      this._tileGrid.getResolutions()
    );

    this._map = new ol.Map({
      target: this._targetEl,
      layers: [this._vectorTileLayer],
      view: new ol.View({
        projection: this._projection,
        extent: extent,
        center: center,
        zoom: zoom,
        minZoom: minZoom,
        maxZoom: maxZoom,
        resolutions: this._tileGrid.getResolutions(),
        constrainResolution: true,
        smoothResolutionConstraint: true
      })
    });

    // Compatibility globals for legacy scripts (kept lightweight)
    window.appMap = this._map;
    window.appVectorTileLayer = this._vectorTileLayer;

    this._map.getInteractions().forEach(interaction => {
      if (interaction instanceof ol.interaction.DragPan) {
        this._dragPanInteraction = interaction;
      }
    });

    this._setupOverlayLayers();
    this._setupMapEventHandlers();

    // Optional: render in-map controls overlay (implemented in defra-map-client.controls.js)
    if (typeof this._setupInMapControls === 'function') {
      this._setupInMapControls();
    }

    this._emitter.emit('map:ready', { map: this._map, projection: this._projection });
    this._emitViewChanged();

    return this;
  };

  DefraMapClient.prototype.getMap = function() {
    return this._map;
  };

  DefraMapClient.prototype.getMode = function() {
    return this._mode;
  };

  DefraMapClient.prototype.getZoom = function() {
    if (!this._map) return null;
    return this._map.getView().getZoom();
  };

  DefraMapClient.prototype.zoomToExtent = function(extent, options) {
    if (!this._map || !extent) return;
    const opts = options || {};
    this._map.getView().fit(extent, {
      padding: opts.padding || [50, 50, 50, 50],
      duration: typeof opts.duration === 'number' ? opts.duration : 500,
      minZoom: typeof opts.minZoom === 'number' ? opts.minZoom : undefined,
      maxZoom: typeof opts.maxZoom === 'number' ? opts.maxZoom : undefined
    });
  };

  // ============================
  // Public API (areas in square meters)
  // ============================

  Object.defineProperty(DefraMapClient.prototype, 'boundaryAreaSqm', {
    get: function() {
      if (this._mode === 'habitat-parcels' && this._boundaryPolygon) {
        return this._boundaryPolygon.getArea();
      }
      if (this._mode === 'red-line-boundary' && this._polygonFeature && this._polygonComplete) {
        return this._polygonFeature.getGeometry().getArea();
      }
      return 0;
    }
  });

  Object.defineProperty(DefraMapClient.prototype, 'parcelsTotalAreaSqm', {
    get: function() {
      if (this._mode !== 'habitat-parcels') return 0;
      return this._habitatParcels.reduce((sum, p) => sum + p.feature.getGeometry().getArea(), 0);
    }
  });

  DefraMapClient.prototype.getParcelAreaSqm = function(index) {
    if (this._mode !== 'habitat-parcels') return 0;
    const parcel = this._habitatParcels[index];
    if (!parcel) return 0;
    return parcel.feature.getGeometry().getArea();
  };

  // ============================
  // Public API (state + metadata)
  // ============================

  DefraMapClient.prototype.getParcelCount = function() {
    return this._habitatParcels.length;
  };

  DefraMapClient.prototype.getSelectedParcelIndex = function() {
    return this._selectedParcelIndex;
  };

  DefraMapClient.prototype.setParcelMeta = function(index, meta) {
    const parcel = this._habitatParcels[index];
    if (!parcel) return;
    parcel.meta = meta || {};
    this._emitter.emit('parcel:metaChanged', { index, meta: parcel.meta });
  };

  DefraMapClient.prototype.getParcelMeta = function(index) {
    const parcel = this._habitatParcels[index];
    return parcel ? (parcel.meta || {}) : null;
  };

  // ============================
  // Public API (snapping settings)
  // Implemented in `defra-map-client.snapping.js`
  // ============================

  // ============================
  // Public API (boundary + parcels)
  // ============================

  DefraMapClient.prototype.loadBoundaryGeoJSON = function(geojson) {
    if (!geojson) return false;
    if (this._mode !== 'habitat-parcels') {
      return false;
    }

    try {
      const format = new ol.format.GeoJSON();
      const mapCrs = this._projection;

      let dataProjection = mapCrs;
      if (geojson.crs && geojson.crs.properties && geojson.crs.properties.name) {
        dataProjection = geojson.crs.properties.name;
      }

      const feature = format.readFeature(geojson, {
        dataProjection: dataProjection,
        featureProjection: mapCrs
      });

      feature.set('type', 'boundary');
      this._boundarySource.clear();
      this._boundarySource.addFeature(feature);
      this._boundaryPolygon = feature.getGeometry();

      this._boundaryVerticesSource.clear();
      const boundaryCoords = this._boundaryPolygon.getCoordinates()[0];
      boundaryCoords.forEach((coord, index) => {
        if (index < boundaryCoords.length - 1) {
          const vertexFeature = new ol.Feature({
            geometry: new ol.geom.Point(coord),
            type: 'boundary-vertex-marker'
          });
          this._boundaryVerticesSource.addFeature(vertexFeature);
        }
      });

      const extent = this._boundaryPolygon.getExtent();
      this.zoomToExtent(extent, { minZoom: this._minZoomForSnap, maxZoom: 16, duration: 500 });

      this._emitter.emit('boundary:loaded', {
        areaSqm: this._boundaryPolygon.getArea(),
        extent: extent
      });

      return true;
    } catch (e) {
      this._emitter.emit('boundary:error', { error: e });
      return false;
    }
  };

  DefraMapClient.prototype.setBoundaryFromCoordinates = function(coords) {
    if (!coords || coords.length < 4) return false;

    if (this._mode !== 'red-line-boundary') {
      return false;
    }

    // Clear any existing polygon.
    if (this._polygonComplete || this._isDrawing) {
      this.clearBoundary();
    }

    this._currentPolygonCoords = coords.map(c => [...c]);
    this._placedVertices = [];

    for (let i = 0; i < coords.length - 1; i++) {
      const vertexFeature = new ol.Feature({
        geometry: new ol.geom.Point(coords[i]),
        type: 'vertex',
        isFirst: i === 0,
        highlighted: false,
        colorIndex: 0
      });
      this._placedVertices.push(vertexFeature);
      this._drawSource.addFeature(vertexFeature);
    }

    const completedPolygon = new ol.geom.Polygon([this._currentPolygonCoords]);
    this._polygonFeature = new ol.Feature({
      geometry: completedPolygon,
      type: 'polygon',
      colorIndex: 0
    });
    this._drawSource.addFeature(this._polygonFeature);

    this._isDrawing = false;
    this._polygonComplete = true;
    this._canClosePolygon = false;

    this._emitter.emit('boundary:changed', { areaSqm: this.boundaryAreaSqm, source: 'setBoundaryFromCoordinates' });
    return true;
  };

  DefraMapClient.prototype.clearBoundary = function() {
    this._isDrawing = false;
    this._polygonComplete = false;
    this._canClosePolygon = false;
    this._currentPolygonCoords = [];
    this._placedVertices = [];
    this._isDragging = false;
    this._draggedVertex = null;
    this._draggedVertexIndex = -1;
    this._drawSource.clear();
    this._hoverSource.clear();
    this._clearGhostVertex();
    this._polygonFeature = null;

    this._emitter.emit('boundary:cleared', {});
    this._emitter.emit('boundary:changed', { areaSqm: 0, source: 'clearBoundary' });
  };

  // Parcels
  DefraMapClient.prototype.clearAllParcels = function() {
    this._habitatParcels.forEach(parcel => {
      this._drawSource.removeFeature(parcel.feature);
      parcel.vertices.forEach(v => {
        this._drawSource.removeFeature(v);
      });
    });
    this._habitatParcels = [];
    this._editingParcelIndex = -1;
    this._selectedParcelIndex = -1;
    this._emitter.emit('parcels:changed', { count: 0, totalAreaSqm: 0 });
  };

  DefraMapClient.prototype.removeParcel = function(index) {
    if (this._mode !== 'habitat-parcels') return;
    if (index < 0 || index >= this._habitatParcels.length) return;

    if (this._editingParcelIndex === index) {
      this.stopEditingParcel();
    } else if (this._editingParcelIndex > index) {
      this._editingParcelIndex--;
    }

    if (this._selectedParcelIndex === index) {
      this.deselectParcel();
    } else if (this._selectedParcelIndex > index) {
      this._selectedParcelIndex--;
    }

    const parcel = this._habitatParcels[index];
    this._drawSource.removeFeature(parcel.feature);
    parcel.vertices.forEach(v => this._drawSource.removeFeature(v));
    this._habitatParcels.splice(index, 1);

    this._emitter.emit('parcel:removed', { index });
    this._emitter.emit('parcels:changed', { count: this._habitatParcels.length, totalAreaSqm: this.parcelsTotalAreaSqm });
  };

  DefraMapClient.prototype.selectParcel = function(index) {
    if (this._mode !== 'habitat-parcels') return;
    if (index < 0 || index >= this._habitatParcels.length) return;

    if (this._selectedParcelIndex === index) {
      return;
    }

    if (this._selectedParcelIndex >= 0) {
      this._unhighlightParcel(this._selectedParcelIndex);
    }

    this._selectedParcelIndex = index;
    this._highlightParcel(index);
    this._emitter.emit('parcel:selected', { index });
  };

  DefraMapClient.prototype.deselectParcel = function() {
    if (this._mode !== 'habitat-parcels') return;
    if (this._selectedParcelIndex < 0) return;

    const prev = this._selectedParcelIndex;
    this._unhighlightParcel(prev);
    this._selectedParcelIndex = -1;
    this._emitter.emit('parcel:selected', { index: -1 });
  };

  // Editing parcels
  DefraMapClient.prototype.startEditingParcel = function(index) {
    if (this._mode !== 'habitat-parcels') return;
    if (index < 0 || index >= this._habitatParcels.length) return;
    if (this._isDrawing) return;

    if (this._editingParcelIndex >= 0) {
      this.stopEditingParcel();
    }

    this._editingParcelIndex = index;
    const parcel = this._habitatParcels[index];
    this._polygonFeature = parcel.feature;
    this._currentPolygonCoords = [...parcel.coords];
    this._placedVertices = [...parcel.vertices];
    this._polygonComplete = true;

    parcel.vertices.forEach(v => {
      v.set('editing', true);
      v.changed();
    });
    this._drawLayer.changed();

    this._emitter.emit('parcel:editStarted', { index });
  };

  DefraMapClient.prototype.stopEditingParcel = function() {
    if (this._mode !== 'habitat-parcels') return;
    if (this._editingParcelIndex < 0) return;

    const parcel = this._habitatParcels[this._editingParcelIndex];
    parcel.coords = [...this._currentPolygonCoords];
    parcel.feature.getGeometry().setCoordinates([this._currentPolygonCoords]);

    parcel.vertices.forEach(v => {
      v.set('editing', false);
      v.set('hovered', false);
      v.changed();
    });

    const idx = this._editingParcelIndex;
    this._editingParcelIndex = -1;
    this._polygonFeature = null;
    this._currentPolygonCoords = [];
    this._placedVertices = [];
    this._polygonComplete = false;
    this._clearGhostVertex();
    this._drawLayer.changed();

    this._emitter.emit('parcel:editStopped', { index: idx });
    this._emitter.emit('parcels:changed', { count: this._habitatParcels.length, totalAreaSqm: this.parcelsTotalAreaSqm });
  };

  // ============================
  // Public API (drawing / fill / slice)
  // ============================

  DefraMapClient.prototype.startDrawing = function() {
    if (this._isDrawing) return;

    if (this._editingParcelIndex >= 0) {
      this.stopEditingParcel();
    }

    if (this._mode === 'red-line-boundary' && this._polygonComplete) {
      this._emitter.emit('validation:error', { message: 'A boundary already exists. Clear it before drawing a new one.' });
      return;
    }

    if (this._mode === 'habitat-parcels' && !this._boundaryPolygon) {
      this._emitter.emit('validation:error', { message: 'No boundary loaded. Define a red line boundary first.' });
      return;
    }

    this._isDrawing = true;
    this._currentPolygonCoords = [];
    this._placedVertices = [];
    this._canClosePolygon = false;
    this._polygonComplete = false;
    this._polygonFeature = null;

    this._emitter.emit('drawing:started', { mode: this._mode });
  };

  DefraMapClient.prototype.cancelDrawing = function() {
    if (!this._isDrawing) return;

    this._isDrawing = false;
    this._canClosePolygon = false;

    this._placedVertices.forEach(v => this._drawSource.removeFeature(v));
    this._placedVertices = [];
    this._currentPolygonCoords = [];

    if (this._polygonFeature) {
      this._drawSource.removeFeature(this._polygonFeature);
      this._polygonFeature = null;
    }

    this._hoverSource.clear();
    if (this._dragPanInteraction && !this._dragPanInteraction.getActive()) {
      this._dragPanInteraction.setActive(true);
    }

    this._emitter.emit('drawing:cancelled', {});
  };

  /**
   * Finish drawing by auto-closing the polygon.
   * If the user has drawn at least 3 points, the polygon will be closed
   * by connecting the last point back to the first point.
   */
  DefraMapClient.prototype.finishDrawing = function() {
    if (!this._isDrawing) return;

    // Need at least 3 points to form a valid polygon
    if (this._currentPolygonCoords.length < 3) {
      this._emitter.emit('validation:error', { message: 'Need at least 3 points to complete a polygon.' });
      return;
    }

    // Auto-close the polygon
    this._closePolygon();
  };

  // Fill methods are implemented in `defra-map-client.fill.js`
  // Slice methods are implemented in `defra-map-client.slice.js`

  // ============================
  // Public API (export / save)
  // ============================

  DefraMapClient.prototype.exportBoundaryGeoJSON = function(options) {
    const opts = options || {};
    const dataProjection = opts.dataProjection || 'EPSG:4326';
    const featureProjection = this._projection;
    const format = new ol.format.GeoJSON();

    if (this._mode === 'red-line-boundary') {
      if (!this._polygonFeature || !this._polygonComplete) return null;
      const obj = format.writeFeatureObject(this._polygonFeature, {
        dataProjection: dataProjection,
        featureProjection: featureProjection
      });
      return obj;
    }

    if (this._mode === 'habitat-parcels') {
      if (!this._boundarySource) return null;
      const features = this._boundarySource.getFeatures();
      if (!features || !features.length) return null;
      return format.writeFeatureObject(features[0], {
        dataProjection: dataProjection,
        featureProjection: featureProjection
      });
    }

    return null;
  };

  DefraMapClient.prototype.exportParcelsGeoJSON = function(options) {
    if (this._mode !== 'habitat-parcels') return null;
    const opts = options || {};
    const dataProjection = opts.dataProjection || 'EPSG:4326';
    const featureProjection = this._projection;
    const format = new ol.format.GeoJSON();

    const features = this._habitatParcels.map((p, index) => {
      const featureObj = format.writeFeatureObject(p.feature, {
        dataProjection: dataProjection,
        featureProjection: featureProjection
      });
      featureObj.properties = featureObj.properties || {};
      featureObj.properties.parcelIndex = index;
      featureObj.properties.areaSqMeters = p.feature.getGeometry().getArea();
      return featureObj;
    });

    return { type: 'FeatureCollection', features };
  };

  DefraMapClient.prototype.saveBoundary = async function() {
    const url = this._endpoints.saveBoundaryUrl;
    if (!url) throw new Error('saveBoundaryUrl not configured');
    const payload = this.exportBoundaryGeoJSON({ dataProjection: this._projection });
    if (!payload) {
      return { ok: false, error: 'No boundary to save.' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await response.json().catch(() => ({}));
    this._emitter.emit('boundary:saved', { ok: response.ok, response: json });
    return { ok: response.ok, response: json };
  };

  DefraMapClient.prototype.saveParcels = async function() {
    const url = this._endpoints.saveParcelsUrl;
    if (!url) throw new Error('saveParcelsUrl not configured');
    const payload = this.exportParcelsGeoJSON({ dataProjection: this._projection });
    if (!payload || !payload.features || payload.features.length === 0) {
      return { ok: false, error: 'No parcels to save.' };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const json = await response.json().catch(() => ({}));
    this._emitter.emit('parcels:saved', { ok: response.ok, response: json });
    return { ok: response.ok, response: json };
  };

  // ============================
  // Internal setup
  // ============================

  DefraMapClient.prototype._setupOverlayLayers = function() {
    this._snapIndexSource = new ol.source.Vector();
    this._snapIndexLayer = new ol.layer.Vector({
      source: this._snapIndexSource,
      style: null,
      zIndex: 1
    });
    this._map.addLayer(this._snapIndexLayer);

    this._boundarySource = new ol.source.Vector();
    this._boundaryLayer = new ol.layer.Vector({
      source: this._boundarySource,
      style: () => new ol.style.Style({
        stroke: new ol.style.Stroke({ color: 'rgba(220, 0, 0, 1)', width: 2, lineDash: [10, 5] }),
        fill: null
      }),
      zIndex: 10
    });
    this._map.addLayer(this._boundaryLayer);

    this._boundaryVerticesSource = new ol.source.Vector();
    this._boundaryVerticesLayer = new ol.layer.Vector({
      source: this._boundaryVerticesSource,
      style: new ol.style.Style({
        image: new ol.style.Circle({
          radius: 4,
          fill: new ol.style.Fill({ color: 'rgba(212, 53, 28, 0.8)' }),
          stroke: new ol.style.Stroke({ color: 'white', width: 2 })
        })
      }),
      zIndex: 15
    });
    this._map.addLayer(this._boundaryVerticesLayer);

    this._hoverSource = new ol.source.Vector();
    this._hoverLayer = new ol.layer.Vector({
      source: this._hoverSource,
      style: (feature) => {
        const snapType = feature.get('snapType') || this._snapType.NONE;
        let radius = 4;
        let fillColor = 'rgba(0, 150, 255, 0.6)';
        let strokeWidth = 2;

        if (snapType === this._snapType.BOUNDARY_VERTEX) {
          radius = 6;
          fillColor = 'rgba(212, 53, 28, 0.8)';
        } else if (snapType === this._snapType.PARCEL_VERTEX) {
          radius = 6;
          fillColor = 'rgba(174, 37, 115, 0.8)';
        } else if (snapType === this._snapType.BOUNDARY_EDGE || snapType === this._snapType.PARCEL_EDGE) {
          radius = 5;
          fillColor = 'rgba(255, 140, 0, 0.8)';
        } else if (snapType === this._snapType.OS_FEATURE) {
          radius = 5;
          fillColor = 'rgba(255, 165, 0, 0.8)';
        }

        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: radius,
            fill: new ol.style.Fill({ color: fillColor }),
            stroke: new ol.style.Stroke({ color: 'white', width: strokeWidth })
          })
        });
      },
      zIndex: 100
    });
    this._map.addLayer(this._hoverLayer);

    this._drawSource = new ol.source.Vector();
    this._drawLayer = new ol.layer.Vector({
      source: this._drawSource,
      style: (feature) => this._styleDrawFeature(feature),
      zIndex: 50
    });
    this._map.addLayer(this._drawLayer);

    // Fill preview layer
    this._fillPreviewSource = new ol.source.Vector();
    this._fillPreviewLayer = new ol.layer.Vector({
      source: this._fillPreviewSource,
      style: new ol.style.Style({
        stroke: new ol.style.Stroke({ color: 'rgba(29, 112, 184, 1)', width: 2, lineDash: [8, 4] }),
        fill: new ol.style.Fill({ color: 'rgba(29, 112, 184, 0.3)' })
      }),
      zIndex: 60
    });
    this._map.addLayer(this._fillPreviewLayer);

    // Slice layer
    this._sliceSource = new ol.source.Vector();
    this._sliceLayer = new ol.layer.Vector({
      source: this._sliceSource,
      style: (feature) => this._styleSliceFeature(feature),
      zIndex: 1000
    });
    this._map.addLayer(this._sliceLayer);
  };

  DefraMapClient.prototype._setupMapEventHandlers = function() {
    const view = this._map.getView();
    view.on('change:center', () => this._throttledFetchSnapData());
    view.on('change:resolution', () => {
      this._throttledFetchSnapData();
      this._emitViewChanged();
    });

    this._map.on('pointermove', (evt) => this._handlePointerMove(evt));
    this._map.on('click', (evt) => this._handleClick(evt));
    this._map.on('pointerdown', (evt) => this._handlePointerDown(evt));
    this._map.on('pointerup', (evt) => this._handlePointerUp(evt));
    document.addEventListener('keydown', (evt) => {
      if (evt.key === 'Escape') {
        if (this._sliceActive) this.cancelSlice();
        if (this._fillActive) this.cancelFill();
        if (this._isDrawing) this.cancelDrawing();
      }
    });

    this._throttledFetchSnapData();
  };

  DefraMapClient.prototype._emitViewChanged = function() {
    const zoom = this.getZoom();
    this._emitter.emit('view:changed', {
      zoom: zoom,
      minZoomForSnap: this._minZoomForSnap,
      snappingAvailable: typeof zoom === 'number' ? zoom >= this._minZoomForSnap : false
    });
  };

  // ============================
  // Internal styling
  // ============================

  DefraMapClient.prototype._styleDrawFeature = function(feature) {
    const type = feature.get('type');
    if (type === 'vertex') {
      const isFirst = feature.get('isFirst');
      const isHighlighted = feature.get('highlighted');
      const isHovered = feature.get('hovered');
      const isBeingDragged = feature.get('dragging');
      const colorIndex = feature.get('colorIndex') || 0;

      if (this._mode === 'habitat-parcels') {
        let belongsToCompletedParcel = false;
        let belongsToEditingParcel = false;

        for (let i = 0; i < this._habitatParcels.length; i++) {
          if (this._habitatParcels[i].vertices.includes(feature)) {
            belongsToCompletedParcel = true;
            if (i === this._editingParcelIndex) {
              belongsToEditingParcel = true;
            }
            break;
          }
        }

        if (belongsToCompletedParcel && !belongsToEditingParcel) {
          return null;
        }
      }

      let radius = 3;
      let fillColor = this._mode === 'habitat-parcels'
        ? this._parcelColors[colorIndex % this._parcelColors.length].stroke
        : 'rgba(255, 100, 0, 0.8)';
      let strokeColor = 'white';
      let strokeWidth = 2;

      if (isBeingDragged) {
        radius = 5;
        fillColor = 'rgba(0, 150, 255, 0.9)';
        strokeColor = 'blue';
      } else if (isHighlighted) {
        radius = 6;
        fillColor = 'rgba(255, 0, 0, 0.9)';
        strokeColor = 'rgba(200, 0, 0, 1)';
      } else if (isHovered && (this._polygonComplete || this._editingParcelIndex >= 0)) {
        radius = 5;
        fillColor = 'rgba(255, 150, 0, 0.9)';
        strokeColor = 'rgba(255, 200, 0, 1)';
      }

      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: radius,
          fill: new ol.style.Fill({ color: fillColor }),
          stroke: new ol.style.Stroke({ color: strokeColor, width: strokeWidth })
        }),
        zIndex: isBeingDragged ? 300 : (isFirst ? 200 : 100)
      });
    }

    if (type === 'polygon' || type === 'parcel') {
      // Check for remove hover state first
      if (feature.get('removeHover')) {
        return new ol.style.Style({
          stroke: new ol.style.Stroke({
            color: '#d4351c',
            width: 3,
            lineDash: [8, 4]
          }),
          fill: new ol.style.Fill({
            color: 'rgba(212, 53, 28, 0.15)'
          })
        });
      }

      const colorIndex = feature.get('colorIndex') || 0;

      if (this._mode === 'habitat-parcels') {
        const colors = this._parcelColors[colorIndex % this._parcelColors.length];
        const isSelected = !!feature.get('selected');
        const strokeWidth = isSelected ? 4 : 2;
        const strokeColor = isSelected ? 'rgba(0, 0, 0, 0.8)' : colors.stroke;

        return new ol.style.Style({
          stroke: new ol.style.Stroke({ color: strokeColor, width: strokeWidth }),
          fill: new ol.style.Fill({ color: colors.fill })
        });
      }

      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: 'rgba(220, 0, 0, 1)', width: 2 }),
        fill: new ol.style.Fill({ color: 'rgba(220, 0, 0, 0.15)' })
      });
    }

    if (type === 'ghost-vertex') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 3,
          fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.8)' }),
          stroke: new ol.style.Stroke({
            color: this._mode === 'habitat-parcels' ? 'rgba(29, 112, 184, 1)' : 'rgba(220, 0, 0, 1)',
            width: 2
          })
        }),
        zIndex: 150
      });
    }

    return null;
  };

  DefraMapClient.prototype._styleSliceFeature = function(feature) {
    const ft = feature.get('featureType');
    if (ft === 'boundary-vertex-hover') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 8,
          fill: new ol.style.Fill({ color: 'rgba(212, 53, 28, 0.9)' }),
          stroke: new ol.style.Stroke({ color: 'white', width: 2 })
        })
      });
    }
    if (ft === 'parcel-vertex-hover') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 8,
          fill: new ol.style.Fill({ color: 'rgba(174, 37, 115, 0.9)' }),
          stroke: new ol.style.Stroke({ color: 'white', width: 2 })
        })
      });
    }
    if (ft === 'edge-hover') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 6,
          fill: new ol.style.Fill({ color: 'rgba(255, 140, 0, 0.9)' }),
          stroke: new ol.style.Stroke({ color: 'white', width: 2 })
        })
      });
    }
    if (ft === 'start') {
      return new ol.style.Style({
        image: new ol.style.Circle({
          radius: 9,
          fill: new ol.style.Fill({ color: 'rgba(0, 184, 255, 0.9)' }),
          stroke: new ol.style.Stroke({ color: 'white', width: 2 })
        })
      });
    }
    if (ft === 'line') {
      return new ol.style.Style({
        stroke: new ol.style.Stroke({ color: 'rgba(0, 184, 255, 1)', width: 2, lineDash: [12, 8] })
      });
    }
    return null;
  };

  // ============================
  // Internal pointer/click handling
  // ============================

  DefraMapClient.prototype._handlePointerMove = function(evt) {
    if (evt.dragging && !this._isDragging) {
      return;
    }

    if (this._removeActive) {
      this._handleRemoveHover(evt);
      return;
    }

    if (this._sliceActive) {
      this._handleSlicePointerMove(evt);
      return;
    }

    if (this._fillActive) {
      this._handleFillHover(evt);
      return;
    }

    const coordinate = evt.coordinate;
    const snapResult = this._findSnapPoint(coordinate);
    let snapCoord = snapResult.coordinate;
    let snapType = snapResult.snapType;

    if ((this._snapToBoundaryVertices || this._snapToBoundaryEdges) && this._mode === 'habitat-parcels' && this._boundaryPolygon) {
      const clamped = this._clampToBoundary(snapCoord);
      if (clamped[0] !== snapCoord[0] || clamped[1] !== snapCoord[1]) {
        snapCoord = clamped;
        snapType = this._snapType.BOUNDARY_EDGE;
      }
    }

    this._lastSnapCoord = snapCoord;
    this._lastSnapType = snapType;

    if (this._isDragging && this._draggedVertex) {
      this._updateDraggedVertex(snapCoord);
      return;
    }

    if (this._isDrawing) {
      this._updateHoverMarker(snapCoord, snapType);
    }

    if (this._isDrawing && this._currentPolygonCoords.length > 0) {
      this._updateLivePolygon(snapCoord);
    }

    if (this._isDrawing && this._currentPolygonCoords.length >= 3) {
      this._checkFirstVertexHover(evt.pixel);
    }

    const canEdit = (this._polygonComplete && !this._isDrawing) || (this._editingParcelIndex >= 0);
    if (canEdit) {
      this._checkVertexHover(evt.pixel);
      if (!this._isOverVertex(evt.pixel)) {
        this._checkPolygonEdgeHover(evt.pixel, snapCoord);
      } else {
        this._clearGhostVertex();
      }
    } else {
      this._clearGhostVertex();
    }

    let cursor = 'default';
    if (this._isDrawing) cursor = 'crosshair';
    else if (this._isDragging) cursor = 'grabbing';
    else if (canEdit && this._isOverVertex(evt.pixel)) cursor = 'grab';
    else if (canEdit && this._ghostVertex) cursor = 'copy';
    this._map.getTargetElement().style.cursor = cursor;
  };

  DefraMapClient.prototype._handleClick = function(evt) {
    if (this._isDragging || this._justFinishedDragging) return;

    if (this._removeActive) {
      this._handleRemoveClick(evt);
      return;
    }

    if (this._sliceActive) {
      this._handleSliceClick(evt);
      return;
    }

    if (this._fillActive) {
      this._handleFillClick(evt);
      return;
    }

    if (!this._isDrawing && this._mode === 'habitat-parcels' && this._editingParcelIndex < 0) {
      this._handleParcelSelectionClick(evt);
      return;
    }

    if (!this._isDrawing) return;

    // Allow closing polygon by clicking near first vertex OR using Finish button
    if (this._canClosePolygon && this._currentPolygonCoords.length >= 3) {
      this._closePolygon();
      return;
    }

    const snapCoord = this._lastSnapCoord || evt.coordinate;
    const isFirstVertex = this._currentPolygonCoords.length === 0;
    this._placeVertex(snapCoord, isFirstVertex);
  };

  DefraMapClient.prototype._handlePointerDown = function(evt) {
    if (this._sliceActive || this._fillActive) return;

    const canEdit = (this._polygonFeature && this._polygonComplete) || (this._editingParcelIndex >= 0);
    if (!canEdit) return;

    if (this._ghostVertex && this._ghostVertexCoord && this._ghostVertexInsertIndex >= 0) {
      this._insertNewVertex(this._ghostVertexCoord, this._ghostVertexInsertIndex);
      this._clearGhostVertex();
      evt.stopPropagation();
      evt.preventDefault();
      return;
    }

    const feature = this._map.forEachFeatureAtPixel(evt.pixel, (feat) => {
      if (feat.get('type') === 'vertex') {
        if (this._editingParcelIndex >= 0) {
          const parcel = this._habitatParcels[this._editingParcelIndex];
          if (parcel && parcel.vertices.includes(feat)) return feat;
        } else {
          return feat;
        }
      }
    }, { layerFilter: (layer) => layer === this._drawLayer, hitTolerance: 5 });

    if (feature) {
      this._draggedVertex = feature;
      this._draggedVertexIndex = this._placedVertices.indexOf(feature);
      this._isDragging = true;

      feature.set('dragging', true);
      feature.changed();

      if (this._dragPanInteraction) {
        this._dragPanInteraction.setActive(false);
      }

      evt.stopPropagation();
      evt.preventDefault();
    }
  };

  DefraMapClient.prototype._handlePointerUp = function() {
    if (!this._isDragging || !this._draggedVertex) return;

    this._draggedVertex.set('dragging', false);
    this._draggedVertex.changed();

    if (this._dragPanInteraction) {
      this._dragPanInteraction.setActive(true);
    }

    this._isDragging = false;
    this._draggedVertex = null;
    this._draggedVertexIndex = -1;

    this._justFinishedDragging = true;
    setTimeout(() => {
      this._justFinishedDragging = false;
    }, 50);
  };

  // ============================
  // Internal drawing helpers
  // ============================

  DefraMapClient.prototype._placeVertex = function(coordinate, isFirst) {
    this._currentPolygonCoords.push([...coordinate]);
    const colorIndex = this._mode === 'habitat-parcels' ? this._habitatParcels.length : 0;

    const vertexFeature = new ol.Feature({
      geometry: new ol.geom.Point(coordinate),
      type: 'vertex',
      isFirst: isFirst,
      highlighted: false,
      colorIndex: colorIndex
    });

    this._placedVertices.push(vertexFeature);
    this._drawSource.addFeature(vertexFeature);
  };

  DefraMapClient.prototype._updateHoverMarker = function(coordinate, snapType) {
    this._hoverSource.clear();
    if (this._isDrawing) {
      this._hoverFeature = new ol.Feature({
        geometry: new ol.geom.Point(coordinate),
        snapType: snapType || this._snapType.NONE
      });
      this._hoverSource.addFeature(this._hoverFeature);
    }
  };

  DefraMapClient.prototype._updateLivePolygon = function(snapCoord) {
    const tempCoords = [...this._currentPolygonCoords, snapCoord];
    if (tempCoords.length < 2) return;

    if (this._polygonFeature) {
      this._drawSource.removeFeature(this._polygonFeature);
    }

    let geom;
    if (tempCoords.length === 2) {
      geom = new ol.geom.LineString(tempCoords);
    } else {
      geom = new ol.geom.Polygon([tempCoords]);
    }

    const colorIndex = this._mode === 'habitat-parcels' ? this._habitatParcels.length : 0;
    this._polygonFeature = new ol.Feature({ geometry: geom, type: 'polygon', colorIndex: colorIndex });
    this._drawSource.addFeature(this._polygonFeature);

    if (tempCoords.length >= 3) {
      try {
        const tempPoly = new ol.geom.Polygon([[...this._currentPolygonCoords, this._currentPolygonCoords[0]]]);
        this._emitter.emit('sketch:area', { areaSqm: tempPoly.getArea() });
      } catch (e) {
        // ignore
      }
    }
  };

  DefraMapClient.prototype._checkFirstVertexHover = function(pixel) {
    if (this._placedVertices.length === 0) {
      this._canClosePolygon = false;
      return;
    }

    const firstVertex = this._placedVertices[0];
    const firstCoord = firstVertex.getGeometry().getCoordinates();
    const firstPixel = this._map.getPixelFromCoordinate(firstCoord);

    const distance = Math.sqrt(
      Math.pow(pixel[0] - firstPixel[0], 2) +
      Math.pow(pixel[1] - firstPixel[1], 2)
    );

    if (distance <= this._closeTolerancePx) {
      if (!this._canClosePolygon) {
        this._canClosePolygon = true;
        firstVertex.set('highlighted', true);
        firstVertex.changed();
      }
    } else {
      if (this._canClosePolygon) {
        this._canClosePolygon = false;
        firstVertex.set('highlighted', false);
        firstVertex.changed();
      }
    }
  };

  DefraMapClient.prototype._closePolygon = function() {
    if (this._currentPolygonCoords.length < 3) return;

    const firstCoord = this._currentPolygonCoords[0];
    this._currentPolygonCoords.push([...firstCoord]);

    const completedPolygon = new ol.geom.Polygon([this._currentPolygonCoords]);

    if (this._polygonFeature) {
      this._drawSource.removeFeature(this._polygonFeature);
    }

    const colorIndex = this._mode === 'habitat-parcels' ? this._habitatParcels.length : 0;
    this._polygonFeature = new ol.Feature({
      geometry: completedPolygon,
      type: this._mode === 'habitat-parcels' ? 'parcel' : 'polygon',
      colorIndex: colorIndex
    });
    this._drawSource.addFeature(this._polygonFeature);
    this._hoverSource.clear();

    if (this._placedVertices.length > 0) {
      this._placedVertices[0].set('highlighted', false);
      this._placedVertices[0].changed();
    }

    this._isDrawing = false;
    this._canClosePolygon = false;
    this._polygonComplete = true;

    if (this._mode === 'habitat-parcels') {
      const id = `parcel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const parcel = {
        id: id,
        feature: this._polygonFeature,
        coords: [...this._currentPolygonCoords],
        vertices: [...this._placedVertices],
        colorIndex: colorIndex,
        meta: {}
      };
      this._habitatParcels.push(parcel);

      const addedIndex = this._habitatParcels.length - 1;
      this._emitter.emit('parcel:added', { index: addedIndex, id: id, areaSqm: parcel.feature.getGeometry().getArea() });
      this._emitter.emit('parcels:changed', { count: this._habitatParcels.length, totalAreaSqm: this.parcelsTotalAreaSqm });

      // Reset for next parcel.
      this._polygonComplete = false;
      this._polygonFeature = null;
      this._currentPolygonCoords = [];
      this._placedVertices = [];
    } else {
      this._emitter.emit('boundary:changed', { areaSqm: this.boundaryAreaSqm, source: 'draw' });
      this._emitter.emit('drawing:completed', { mode: this._mode });
    }
  };

  DefraMapClient.prototype._checkVertexHover = function(pixel) {
    this._placedVertices.forEach(v => {
      if (v.get('hovered')) {
        v.set('hovered', false);
        v.changed();
      }
    });

    const feature = this._map.forEachFeatureAtPixel(pixel, (feat) => {
      if (feat.get('type') === 'vertex') {
        if (this._editingParcelIndex >= 0) {
          const parcel = this._habitatParcels[this._editingParcelIndex];
          if (parcel && parcel.vertices.includes(feat)) return feat;
        } else if (this._placedVertices.includes(feat)) {
          return feat;
        }
      }
    }, { layerFilter: (layer) => layer === this._drawLayer, hitTolerance: 5 });

    if (feature) {
      feature.set('hovered', true);
      feature.changed();
    }
  };

  DefraMapClient.prototype._isOverVertex = function(pixel) {
    const feature = this._map.forEachFeatureAtPixel(pixel, (feat) => {
      if (feat.get('type') === 'vertex') {
        if (this._editingParcelIndex >= 0) {
          const parcel = this._habitatParcels[this._editingParcelIndex];
          if (parcel && parcel.vertices.includes(feat)) return feat;
        } else if (this._placedVertices.includes(feat)) {
          return feat;
        }
      }
    }, { layerFilter: (layer) => layer === this._drawLayer, hitTolerance: 5 });
    return !!feature;
  };

  DefraMapClient.prototype._checkPolygonEdgeHover = function(pixel, snapCoord) {
    const canEdit = (this._polygonFeature && this._polygonComplete) || (this._editingParcelIndex >= 0);
    if (!canEdit) {
      this._clearGhostVertex();
      return;
    }

    const feature = this._map.forEachFeatureAtPixel(pixel, (feat) => {
      const ft = feat.get('type');
      if (ft === 'polygon' || ft === 'parcel') {
        if (this._editingParcelIndex >= 0) {
          const parcel = this._habitatParcels[this._editingParcelIndex];
          if (parcel && feat === parcel.feature) return feat;
        } else {
          return feat;
        }
      }
    }, { layerFilter: (layer) => layer === this._drawLayer, hitTolerance: 5 });

    if (!feature) {
      this._clearGhostVertex();
      return;
    }

    const geometry = feature.getGeometry();
    const ring = geometry.getCoordinates()[0];
    let minDistance = Infinity;
    let closestPoint = null;
    let insertIndex = -1;

    for (let i = 0; i < ring.length - 1; i++) {
      const start = ring[i];
      const end = ring[i + 1];
      const line = new ol.geom.LineString([start, end]);
      const closestOnSegment = line.getClosestPoint(snapCoord);
      const distance = this._getDistance(snapCoord, closestOnSegment);
      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = closestOnSegment;
        insertIndex = i + 1;
      }
    }

    if (closestPoint && minDistance < 50) {
      this._showGhostVertex(closestPoint, insertIndex);
    } else {
      this._clearGhostVertex();
    }
  };

  DefraMapClient.prototype._showGhostVertex = function(coordinate, insertIndex) {
    this._clearGhostVertex();
    this._ghostVertexCoord = coordinate;
    this._ghostVertexInsertIndex = insertIndex;

    this._ghostVertex = new ol.Feature({
      geometry: new ol.geom.Point(coordinate),
      type: 'ghost-vertex'
    });
    this._drawSource.addFeature(this._ghostVertex);
  };

  DefraMapClient.prototype._clearGhostVertex = function() {
    if (this._ghostVertex) {
      this._drawSource.removeFeature(this._ghostVertex);
      this._ghostVertex = null;
      this._ghostVertexCoord = null;
      this._ghostVertexInsertIndex = -1;
    }
  };

  DefraMapClient.prototype._insertNewVertex = function(coordinate, insertIndex) {
    this._currentPolygonCoords.splice(insertIndex, 0, [...coordinate]);
    const colorIndex = this._polygonFeature ? this._polygonFeature.get('colorIndex') : 0;

    const newVertexFeature = new ol.Feature({
      geometry: new ol.geom.Point(coordinate),
      type: 'vertex',
      isFirst: false,
      highlighted: false,
      hovered: false,
      colorIndex: colorIndex
    });

    this._placedVertices.splice(insertIndex, 0, newVertexFeature);
    this._drawSource.addFeature(newVertexFeature);

    this._placedVertices.forEach((v, idx) => {
      v.set('isFirst', idx === 0);
    });

    this._currentPolygonCoords[this._currentPolygonCoords.length - 1] = [...this._currentPolygonCoords[0]];
    if (this._polygonFeature) {
      this._polygonFeature.getGeometry().setCoordinates([this._currentPolygonCoords]);
    }

    if (this._editingParcelIndex >= 0) {
      const parcel = this._habitatParcels[this._editingParcelIndex];
      parcel.coords = [...this._currentPolygonCoords];
      parcel.vertices = [...this._placedVertices];
      this._emitter.emit('parcel:changed', { index: this._editingParcelIndex, areaSqm: parcel.feature.getGeometry().getArea() });
      this._emitter.emit('parcels:changed', { count: this._habitatParcels.length, totalAreaSqm: this.parcelsTotalAreaSqm });
    } else {
      this._emitter.emit('boundary:changed', { areaSqm: this.boundaryAreaSqm, source: 'edit' });
    }
  };

  DefraMapClient.prototype._updateDraggedVertex = function(snapCoord) {
    if (!this._draggedVertex || this._draggedVertexIndex < 0) return;

    this._draggedVertex.getGeometry().setCoordinates(snapCoord);
    this._currentPolygonCoords[this._draggedVertexIndex] = [...snapCoord];

    if (this._draggedVertexIndex === 0) {
      this._currentPolygonCoords[this._currentPolygonCoords.length - 1] = [...snapCoord];
    } else if (this._draggedVertexIndex === this._currentPolygonCoords.length - 1) {
      this._currentPolygonCoords[0] = [...snapCoord];
      this._placedVertices[0].getGeometry().setCoordinates(snapCoord);
    }

    if (this._polygonFeature) {
      this._polygonFeature.getGeometry().setCoordinates([this._currentPolygonCoords]);
    }

    if (this._editingParcelIndex >= 0) {
      const parcel = this._habitatParcels[this._editingParcelIndex];
      parcel.coords = [...this._currentPolygonCoords];
      this._emitter.emit('parcel:changed', { index: this._editingParcelIndex, areaSqm: parcel.feature.getGeometry().getArea() });
      this._emitter.emit('parcels:changed', { count: this._habitatParcels.length, totalAreaSqm: this.parcelsTotalAreaSqm });
    } else {
      this._emitter.emit('boundary:changed', { areaSqm: this.boundaryAreaSqm, source: 'edit' });
    }
  };

  // ============================
  // Internal snapping selection
  // Implemented in `defra-map-client.snapping.js`
  // ============================

  // ============================
  // Internal parcel selection
  // ============================

  DefraMapClient.prototype._handleParcelSelectionClick = function(evt) {
    const clickedIndex = this._findParcelAtPixel(evt.pixel);
    if (clickedIndex >= 0) {
      if (this._selectedParcelIndex === clickedIndex) {
        this.deselectParcel();
      } else {
        this.selectParcel(clickedIndex);
      }
    }
  };

  DefraMapClient.prototype._findParcelAtPixel = function(pixel) {
    let foundIndex = -1;
    this._map.forEachFeatureAtPixel(pixel, (feature, layer) => {
      const t = feature.get('type');
      if (t === 'polygon' || t === 'parcel') {
        for (let i = 0; i < this._habitatParcels.length; i++) {
          if (this._habitatParcels[i].feature === feature) {
            foundIndex = i;
            return true;
          }
        }
      }
    }, { layerFilter: (layer) => layer === this._drawLayer, hitTolerance: 3 });
    return foundIndex;
  };

  DefraMapClient.prototype._highlightParcel = function(index) {
    const parcel = this._habitatParcels[index];
    if (!parcel) return;
    parcel.feature.set('selected', true);
    parcel.feature.changed();
  };

  DefraMapClient.prototype._unhighlightParcel = function(index) {
    const parcel = this._habitatParcels[index];
    if (!parcel) return;
    parcel.feature.set('selected', false);
    parcel.feature.changed();
  };

  // ============================
  // Internal remove
  // ============================

  DefraMapClient.prototype._handleRemoveClick = function(evt) {
    if (!this._removeActive) return;
    
    if (this._mode === 'red-line-boundary') {
      // Click on boundary removes it
      const feature = this._map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === this._drawLayer,
        hitTolerance: 3
      });
      if (feature && (feature.get('type') === 'polygon' || feature === this._polygonFeature)) {
        this.clearBoundary();
        this._removeActive = false;
        this._map.getTargetElement().style.cursor = 'default';
        this._emitter.emit('remove:completed', { type: 'boundary' });
      }
    } else if (this._mode === 'habitat-parcels') {
      // Click on parcel removes it
      const clickedIndex = this._findParcelAtPixel(evt.pixel);
      if (clickedIndex >= 0) {
        this.removeParcel(clickedIndex);
        // Stay in remove mode to allow removing multiple parcels
        if (this._habitatParcels.length === 0) {
          this._removeActive = false;
          this._map.getTargetElement().style.cursor = 'default';
        }
        this._emitter.emit('remove:completed', { type: 'parcel', index: clickedIndex });
      }
    }
  };

  DefraMapClient.prototype._handleRemoveHover = function(evt) {
    if (!this._removeActive || evt.dragging) return;
    
    let hoveredFeature = null;
    let hoveredIndex = -1;
    
    if (this._mode === 'red-line-boundary') {
      // Check if hovering over the boundary polygon
      const feature = this._map.forEachFeatureAtPixel(evt.pixel, (f) => f, {
        layerFilter: (l) => l === this._drawLayer,
        hitTolerance: 3
      });
      if (feature && (feature.get('type') === 'polygon' || feature === this._polygonFeature)) {
        hoveredFeature = feature;
      }
    } else if (this._mode === 'habitat-parcels') {
      // Check if hovering over a parcel
      hoveredIndex = this._findParcelAtPixel(evt.pixel);
      if (hoveredIndex >= 0) {
        hoveredFeature = this._habitatParcels[hoveredIndex].feature;
      }
    }
    
    // Update hover state
    if (this._removeHoverFeature !== hoveredFeature) {
      // Clear previous hover highlight
      if (this._removeHoverFeature) {
        this._removeHoverFeature.set('removeHover', false);
      }
      // Set new hover highlight
      this._removeHoverFeature = hoveredFeature;
      if (hoveredFeature) {
        hoveredFeature.set('removeHover', true);
      }
    }
    
    // Update cursor
    this._map.getTargetElement().style.cursor = hoveredFeature ? 'pointer' : 'crosshair';
  };

  // ============================
  // Internal fill
  // Implemented in `defra-map-client.fill.js`
  // ============================

  // ============================
  // Internal slice
  // Implemented in `defra-map-client.slice.js`
  // ============================

  // ============================
  // Public API (validation convenience)
  // ============================

  DefraMapClient.prototype.validateAllParcels = function() {
    if (this._mode !== 'habitat-parcels') return { valid: true, errors: [] };
    if (!this._boundaryPolygon) return { valid: true, errors: [] };

    const errors = [];
    const corrected = this._habitatParcels.map(p => GeometryValidation.correctGeometryToBoundary(p.feature.getGeometry(), this._boundaryPolygon));

    for (let i = 0; i < corrected.length; i++) {
      if (!GeometryValidation.isPolygonWithinBoundary(corrected[i], this._boundaryPolygon)) {
        errors.push(`Parcel ${i + 1} extends outside the red line boundary.`);
      }
      for (let j = i + 1; j < corrected.length; j++) {
        if (GeometryValidation.doPolygonsOverlap(corrected[i], corrected[j])) {
          errors.push(`Parcel ${i + 1} overlaps with parcel ${j + 1}.`);
        }
      }
    }

    return { valid: errors.length === 0, errors: errors };
  };

  // ============================
  // Remove mode
  // ============================

  DefraMapClient.prototype.startRemove = function() {
    if (this._removeActive) return;
    if (this._isDrawing) this.cancelDrawing();
    if (this._fillActive) this.cancelFill();
    if (this._sliceActive) this.cancelSlice();
    
    // Check if there's something to remove
    if (this._mode === 'red-line-boundary' && !this._polygonComplete) {
      this._emitter.emit('validation:error', { message: 'No boundary to remove.' });
      return;
    }
    if (this._mode === 'habitat-parcels' && this._habitatParcels.length === 0) {
      this._emitter.emit('validation:error', { message: 'No parcels to remove.' });
      return;
    }
    
    this._removeActive = true;
    this._map.getTargetElement().style.cursor = 'crosshair';
    this._emitter.emit('remove:started', {});
  };

  DefraMapClient.prototype.cancelRemove = function() {
    if (!this._removeActive) return;
    // Clear hover highlight
    if (this._removeHoverFeature) {
      this._removeHoverFeature.set('removeHover', false);
      this._removeHoverFeature = null;
    }
    this._removeActive = false;
    this._map.getTargetElement().style.cursor = 'default';
    this._emitter.emit('remove:cancelled', {});
  };

  DefraMapClient.prototype.finishRemove = function() {
    if (!this._removeActive) return;
    // Clear hover highlight
    if (this._removeHoverFeature) {
      this._removeHoverFeature.set('removeHover', false);
      this._removeHoverFeature = null;
    }
    this._removeActive = false;
    this._map.getTargetElement().style.cursor = 'default';
    this._emitter.emit('remove:finished', {});
  };

  // ============================
  // Public API (library info)
  // ============================

  DefraMapClient.prototype.getDebugInfo = function() {
    return {
      mode: this._mode,
      projection: this._projection,
      zoom: this.getZoom(),
      osFeatures: { isFetching: this._isFetching, featureCount: this._snapIndexSource ? this._snapIndexSource.getFeatures().length : 0 },
      drawing: { isDrawing: this._isDrawing, polygonComplete: this._polygonComplete },
      parcels: { count: this._habitatParcels.length, editingIndex: this._editingParcelIndex, selectedIndex: this._selectedParcelIndex },
      fill: { active: this._fillActive, mode: this._fillMode, selectedCount: this._fillSelected.length },
      slice: { active: this._sliceActive },
      remove: { active: this._removeActive }
    };
  };

  // ============================
  // Stub implementations for snapping methods
  // These are overridden by defra-map-client.snapping.js when loaded
  // ============================

  DefraMapClient.prototype._throttledFetchSnapData = function() {
    // Stub: no-op when snapping module not loaded
  };

  DefraMapClient.prototype._findSnapPoint = function(coordinate) {
    // Stub: return coordinate unchanged when snapping module not loaded
    return { coordinate: coordinate, snapType: this._snapType.NONE };
  };

  DefraMapClient.prototype._clampToBoundary = function(coordinate) {
    // Stub: return coordinate unchanged when snapping module not loaded
    return coordinate;
  };

  DefraMapClient.prototype._getDistance = function(a, b) {
    // Stub: basic distance calculation
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  };

  // ============================
  // Export
  // ============================

  window.DefraMapClient = DefraMapClient;
})(window);

