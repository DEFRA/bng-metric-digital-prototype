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

    // Config: URLs and OS layers
    this._tiles = this._options.tiles || {};
    this._osFeatures = this._options.osFeatures || {};
    this._endpoints = this._options.endpoints || {};

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
  // ============================

  DefraMapClient.prototype.setSnappingEnabled = function(enabled) {
    this._snappingEnabled = !!enabled;
    this._emitter.emit('snapping:osFeaturesChanged', { enabled: this._snappingEnabled });
  };

  DefraMapClient.prototype.setSnapToBoundaryVertices = function(enabled) {
    this._snapToBoundaryVertices = !!enabled;
    this._emitter.emit('snapping:boundaryVerticesChanged', { enabled: this._snapToBoundaryVertices });
  };

  DefraMapClient.prototype.setSnapToBoundaryEdges = function(enabled) {
    this._snapToBoundaryEdges = !!enabled;
    this._emitter.emit('snapping:boundaryEdgesChanged', { enabled: this._snapToBoundaryEdges });
  };

  DefraMapClient.prototype.setSnapToParcelVertices = function(enabled) {
    this._snapToParcelVertices = !!enabled;
    this._emitter.emit('snapping:parcelVerticesChanged', { enabled: this._snapToParcelVertices });
  };

  DefraMapClient.prototype.setSnapToParcelEdges = function(enabled) {
    this._snapToParcelEdges = !!enabled;
    this._emitter.emit('snapping:parcelEdgesChanged', { enabled: this._snapToParcelEdges });
  };

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

  DefraMapClient.prototype.startFillBoundary = function() {
    this._startFill('boundary');
  };

  DefraMapClient.prototype.startFillParcels = function() {
    this._startFill('parcels');
  };

  DefraMapClient.prototype.confirmFill = function() {
    if (!this._fillActive) return false;
    if (this._fillMode === 'boundary') {
      return this._confirmFillBoundary();
    }
    return false;
  };

  DefraMapClient.prototype.cancelFill = function() {
    if (!this._fillActive) return;
    this._fillActive = false;
    this._fillMode = null;
    this._fillSelected = [];
    this._fillExistingBoundaryGeometry = null;
    this._fillConstraintBoundary = null;
    if (this._fillPreviewSource) this._fillPreviewSource.clear();
    this._map.getTargetElement().style.cursor = 'default';
    this._emitter.emit('fill:cancelled', {});
  };

  DefraMapClient.prototype.startSlice = function() {
    if (this._sliceActive) return;
    if (this._mode !== 'habitat-parcels') return;
    if (!this._boundaryPolygon) {
      this._emitter.emit('validation:error', { message: 'No boundary loaded. Define a red line boundary first.' });
      return;
    }
    this._sliceActive = true;
    this._sliceStart = null;
    this._sliceSourceType = null;
    this._sliceSourceParcelIndex = -1;
    this._sliceSourceCoords = null;
    this._clearSliceVisuals();
    this._map.getTargetElement().style.cursor = 'crosshair';
    this._emitter.emit('slice:started', {});
  };

  DefraMapClient.prototype.cancelSlice = function() {
    if (!this._sliceActive) return;
    this._sliceActive = false;
    this._sliceStart = null;
    this._sliceSourceType = null;
    this._sliceSourceParcelIndex = -1;
    this._sliceSourceCoords = null;
    this._clearSliceVisuals();
    this._map.getTargetElement().style.cursor = 'default';
    this._emitter.emit('slice:cancelled', {});
  };

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
  // Internal snapping WFS fetch
  // ============================

  DefraMapClient.prototype._throttledFetchSnapData = function() {
    if (this._fetchTimeout) {
      clearTimeout(this._fetchTimeout);
    }
    this._fetchTimeout = setTimeout(() => {
      this._fetchSnapData();
    }, this._fetchThrottleMs);
  };

  DefraMapClient.prototype._fetchSnapData = async function() {
    const zoom = this.getZoom();
    if (typeof zoom === 'number' && zoom < this._minZoomForSnap) {
      this._snapIndexSource.clear();
      this._emitter.emit('osFeatures:loading', { loading: false, zoom: zoom });
      return;
    }

    if (this._isFetching) return;

    const extent = this._map.getView().calculateExtent(this._map.getSize());
    if (this._lastFetchExtent && ol.extent.equals(extent, this._lastFetchExtent)) {
      return;
    }

    const baseUrl = this._osFeatures.baseUrl;
    const layers = this._osFeatures.layers || [];
    if (!baseUrl || !layers.length) {
      return;
    }

    this._lastFetchExtent = extent;
    this._isFetching = true;
    this._emitter.emit('osFeatures:loading', { loading: true, zoom: zoom });

    try {
      this._snapIndexSource.clear();

      const results = await Promise.allSettled(layers.map(typeName => this._fetchLayerData(baseUrl, typeName, extent)));
      const allFeatures = [];
      results.forEach(r => {
        if (r.status === 'fulfilled' && r.value) {
          allFeatures.push(...r.value);
        }
      });

      if (allFeatures.length) {
        this._snapIndexSource.addFeatures(allFeatures);
      }

      this._emitter.emit('osFeatures:loaded', { count: allFeatures.length });
    } catch (e) {
      this._emitter.emit('osFeatures:error', { error: e });
    } finally {
      this._isFetching = false;
      this._emitter.emit('osFeatures:loading', { loading: false, zoom: zoom });
    }
  };

  DefraMapClient.prototype._fetchLayerData = async function(baseUrl, collectionId, extent) {
    const features = [];
    let offset = 0;
    let hasMore = true;

    const bbox = `${extent[0]},${extent[1]},${extent[2]},${extent[3]}`;

    while (hasMore && offset < 1000) {
      const url = `${baseUrl}/${collectionId}/items?` +
        `bbox=${bbox}` +
        `&bbox-crs=http://www.opengis.net/def/crs/EPSG/0/27700` +
        `&crs=http://www.opengis.net/def/crs/EPSG/0/27700` +
        `&limit=${this._maxFeaturesPerRequest}` +
        `&offset=${offset}`;

      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const geojson = await response.json();
        if (geojson.features && geojson.features.length > 0) {
          const format = new ol.format.GeoJSON();
          const olFeatures = format.readFeatures(geojson, {
            dataProjection: 'EPSG:27700',
            featureProjection: this._projection
          });

          olFeatures.forEach(feature => {
            const geom = feature.getGeometry();
            if (geom) {
              if (this._simplifyTolerance > 0) {
                const simplified = geom.simplify(this._simplifyTolerance);
                feature.setGeometry(simplified);
              }
              feature.set('layerType', collectionId);
            }
          });

          features.push(...olFeatures);

          if (geojson.features.length < this._maxFeaturesPerRequest) {
            hasMore = false;
          } else {
            offset += this._maxFeaturesPerRequest;
          }
        } else {
          hasMore = false;
        }
      } catch (e) {
        hasMore = false;
      }
    }

    return features;
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
  // ============================

  DefraMapClient.prototype._findSnapPoint = function(coordinate) {
    let minDistance = Infinity;
    let snapPoint = null;
    let snapType = this._snapType.NONE;

    const resolution = this._map.getView().getResolution();
    const tolerance = this._snapTolerancePx * resolution;
    const vertexTolerance = tolerance * 1.5;

    // Boundary vertices (highest)
    if (this._snapToBoundaryVertices && this._mode === 'habitat-parcels' && this._boundaryPolygon) {
      const boundaryCoords = this._boundaryPolygon.getCoordinates()[0];
      boundaryCoords.forEach(vertex => {
        const distance = this._getDistance(coordinate, vertex);
        if (distance < minDistance && distance < vertexTolerance) {
          minDistance = distance;
          snapPoint = vertex;
          snapType = this._snapType.BOUNDARY_VERTEX;
        }
      });
    }

    // Parcel vertices
    if (this._snapToParcelVertices && this._mode === 'habitat-parcels' && this._habitatParcels.length > 0) {
      this._habitatParcels.forEach((parcel, index) => {
        if (index === this._editingParcelIndex) return;
        const parcelGeom = parcel.feature.getGeometry();
        const coords = parcelGeom.getCoordinates()[0];
        coords.forEach(vertex => {
          const distance = this._getDistance(coordinate, vertex);
          if (distance < minDistance && distance < vertexTolerance) {
            minDistance = distance;
            snapPoint = vertex;
            snapType = this._snapType.PARCEL_VERTEX;
          }
        });
      });
    }

    // Boundary edges
    if (this._snapToBoundaryEdges && this._mode === 'habitat-parcels' && this._boundaryPolygon) {
      const ring = this._boundaryPolygon.getLinearRing(0);
      const pt = ring.getClosestPoint(coordinate);
      const dist = this._getDistance(coordinate, pt);
      if (dist < minDistance && dist < tolerance) {
        minDistance = dist;
        snapPoint = pt;
        snapType = this._snapType.BOUNDARY_EDGE;
      }
    }

    // Parcel edges
    if (this._snapToParcelEdges && this._mode === 'habitat-parcels' && this._habitatParcels.length > 0) {
      this._habitatParcels.forEach((parcel, index) => {
        if (index === this._editingParcelIndex) return;
        const ring = parcel.feature.getGeometry().getLinearRing(0);
        const pt = ring.getClosestPoint(coordinate);
        const dist = this._getDistance(coordinate, pt);
        if (dist < minDistance && dist < tolerance) {
          minDistance = dist;
          snapPoint = pt;
          snapType = this._snapType.PARCEL_EDGE;
        }
      });
    }

    // OS features
    if (this._snappingEnabled) {
      const features = this._snapIndexSource.getFeatures();

      features.forEach(feature => {
        const geom = feature.getGeometry();
        if (!geom) return;
        const type = geom.getType();
        const coords = geom.getCoordinates();
        const vertices = this._flattenCoordinates(coords, type);
        vertices.forEach(vertex => {
          const distance = this._getDistance(coordinate, vertex);
          if (distance < minDistance && distance < vertexTolerance) {
            minDistance = distance;
            snapPoint = vertex;
            snapType = this._snapType.OS_FEATURE;
          }
        });
      });

      features.forEach(feature => {
        const geom = feature.getGeometry();
        if (!geom) return;
        const type = geom.getType();

        const checkClosest = (g) => {
          const pt = g.getClosestPoint(coordinate);
          const dist = this._getDistance(coordinate, pt);
          if (dist < minDistance && dist < tolerance) {
            minDistance = dist;
            snapPoint = pt;
            snapType = this._snapType.OS_FEATURE;
          }
        };

        if (type === 'LineString') checkClosest(geom);
        else if (type === 'MultiLineString') geom.getLineStrings().forEach(ls => checkClosest(ls));
        else if (type === 'Polygon') checkClosest(geom.getLinearRing(0));
        else if (type === 'MultiPolygon') geom.getPolygons().forEach(poly => checkClosest(poly.getLinearRing(0)));
      });
    }

    const result = { coordinate: snapPoint || coordinate, snapType: snapPoint ? snapType : this._snapType.NONE };
    return result;
  };

  DefraMapClient.prototype._flattenCoordinates = function(coords, geomType) {
    const vertices = [];
    if (geomType === 'LineString') {
      return coords;
    }
    if (geomType === 'MultiLineString' || geomType === 'Polygon') {
      coords.forEach(ring => { vertices.push(...ring); });
    } else if (geomType === 'MultiPolygon') {
      coords.forEach(poly => { poly.forEach(ring => { vertices.push(...ring); }); });
    }
    return vertices;
  };

  DefraMapClient.prototype._getDistance = function(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    return Math.sqrt(dx * dx + dy * dy);
  };

  DefraMapClient.prototype._clampToBoundary = function(coordinate) {
    if (!this._boundaryPolygon) return coordinate;
    if (this._boundaryPolygon.intersectsCoordinate(coordinate)) return coordinate;
    const ring = this._boundaryPolygon.getLinearRing(0);
    return ring.getClosestPoint(coordinate);
  };

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
  // Internal fill (simplified port for boundary mode + parcel mode add)
  // ============================

  DefraMapClient.prototype._startFill = function(kind) {
    if (this._fillActive) return;
    if (kind === 'parcels' && this._mode !== 'habitat-parcels') return;

    if (kind === 'parcels') {
      if (!this._boundaryPolygon) {
        this._emitter.emit('validation:error', { message: 'No red-line boundary defined. Please define a boundary first.' });
        return;
      }
      this._fillConstraintBoundary = this._boundaryPolygon;
    }

    this._fillActive = true;
    this._fillMode = kind;
    this._fillSelected = [];
    this._fillExistingBoundaryGeometry = null;
    this._fillPreviewSource.clear();

    if (kind === 'boundary') {
      if (this._mode === 'red-line-boundary' && this._polygonComplete && this._polygonFeature) {
        const existingCoords = this._currentPolygonCoords;
        if (existingCoords && existingCoords.length >= 4) {
          this._fillExistingBoundaryGeometry = new ol.geom.Polygon([existingCoords]);
          this._fillPreviewSource.addFeature(new ol.Feature({
            geometry: this._fillExistingBoundaryGeometry.clone(),
            layerType: 'existing-boundary',
            isExisting: true
          }));
        }
      }
    }

    this._map.getTargetElement().style.cursor = 'crosshair';
    this._emitter.emit('fill:started', { mode: kind });
    this._emitFillSelectionChanged();
  };

  DefraMapClient.prototype._handleFillHover = function(evt) {
    if (!this._fillActive || evt.dragging) return;
    const polygon = this._findFillPolygonAtPixel(evt.pixel, true);
    this._map.getTargetElement().style.cursor = polygon ? 'pointer' : 'crosshair';
  };

  DefraMapClient.prototype._handleFillClick = function(evt) {
    if (!this._fillActive) return;
    const clickedPolygon = this._findFillPolygonAtPixel(evt.pixel, false);
    if (!clickedPolygon) {
      this._emitter.emit('fill:message', { type: 'info', message: 'No OS polygon found at this location.' });
      return;
    }

    if (this._fillMode === 'parcels') {
      const validation = this._validatePolygonWithinBoundary(clickedPolygon.geometry);
      if (!validation.valid) {
        this._emitter.emit('fill:message', { type: 'warning', message: validation.error });
        return;
      }

      const overlapCheck = this._checkOverlapWithExistingParcels(clickedPolygon.geometry);
      if (!overlapCheck.valid) {
        this._emitter.emit('fill:message', { type: 'warning', message: overlapCheck.error });
        return;
      }

      this._addFillPolygonAsParcel(clickedPolygon);
      return;
    }

    this._toggleFillSelection(clickedPolygon);
  };

  DefraMapClient.prototype._findFillPolygonAtPixel = function(pixel, silent) {
    const coordinate = this._map.getCoordinateFromPixel(pixel);
    if (!coordinate) return null;

    const features = this._snapIndexSource.getFeatures();
    let foundPolygon = null;
    let smallestArea = Infinity;

    const allowedLayers = this._osFeatures.fillPolygonLayers || [];
    if (!allowedLayers.length) {
      return null;
    }

    for (const feature of features) {
      const geometry = feature.getGeometry();
      if (!geometry) continue;
      const geomType = geometry.getType();
      if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') continue;

      const layerType = feature.get('layerType');
      if (!layerType || !allowedLayers.includes(layerType)) continue;

      let containsPoint = false;
      if (geomType === 'Polygon') {
        containsPoint = geometry.intersectsCoordinate(coordinate);
      } else {
        const polygons = geometry.getPolygons();
        for (const poly of polygons) {
          if (poly.intersectsCoordinate(coordinate)) {
            containsPoint = true;
            break;
          }
        }
      }

      if (containsPoint) {
        const area = this._getFillPolygonArea(geometry);
        if (area < smallestArea) {
          smallestArea = area;
          foundPolygon = { feature, geometry, layerType };
        }
      }
    }

    if (!silent && foundPolygon) {
      this._emitter.emit('fill:hover', { layerType: foundPolygon.layerType, areaSqm: smallestArea });
    }

    return foundPolygon;
  };

  DefraMapClient.prototype._getFillPolygonArea = function(geometry) {
    const type = geometry.getType();
    if (type === 'Polygon') return geometry.getArea();
    if (type === 'MultiPolygon') {
      let total = 0;
      geometry.getPolygons().forEach(poly => { total += poly.getArea(); });
      return total;
    }
    return 0;
  };

  DefraMapClient.prototype._toggleFillSelection = function(polygonInfo) {
    const existingIndex = this._findFillSelectedIndex(polygonInfo);
    if (existingIndex >= 0) {
      this._fillSelected.splice(existingIndex, 1);
    } else {
      if (this._fillSelected.length > 0 || this._fillExistingBoundaryGeometry) {
        const isAdjacent = this._checkAdjacencyWithSelection(polygonInfo.geometry);
        if (!isAdjacent) {
          this._fillSelected = [];
          this._fillExistingBoundaryGeometry = null;
          this._fillPreviewSource.clear();
          this._emitter.emit('fill:message', { type: 'info', message: 'New polygon selected. Previous boundary cleared as it was not adjacent.' });
        }
      }
      this._fillSelected.push(polygonInfo);
    }

    this._updateFillPreviewLayer();
    this._emitFillSelectionChanged();
  };

  DefraMapClient.prototype._findFillSelectedIndex = function(polygonInfo) {
    const coords1 = this._getFillPolygonCoordinates(polygonInfo.geometry);
    for (let i = 0; i < this._fillSelected.length; i++) {
      const coords2 = this._getFillPolygonCoordinates(this._fillSelected[i].geometry);
      if (GeometryValidation.coordsNearlyEqual(coords1[0], coords2[0]) && coords1.length === coords2.length) {
        return i;
      }
    }
    return -1;
  };

  DefraMapClient.prototype._getFillPolygonCoordinates = function(geometry) {
    const type = geometry.getType();
    if (type === 'Polygon') return geometry.getCoordinates()[0];
    if (type === 'MultiPolygon') return geometry.getCoordinates()[0][0];
    return [];
  };

  DefraMapClient.prototype._checkAdjacencyWithSelection = function(geometry) {
    if (this._fillSelected.length === 0 && !this._fillExistingBoundaryGeometry) return true;

    const poly1 = this._geometryToPolygon(geometry);
    if (!poly1) return false;

    if (this._fillExistingBoundaryGeometry) {
      if (GeometryValidation.arePolygonsAdjacent(poly1, this._fillExistingBoundaryGeometry)) {
        return true;
      }
    }

    for (const selected of this._fillSelected) {
      const poly2 = this._geometryToPolygon(selected.geometry);
      if (poly2 && GeometryValidation.arePolygonsAdjacent(poly1, poly2)) {
        return true;
      }
    }

    return false;
  };

  DefraMapClient.prototype._updateFillPreviewLayer = function() {
    this._fillPreviewSource.clear();
    if (this._fillExistingBoundaryGeometry) {
      this._fillPreviewSource.addFeature(new ol.Feature({
        geometry: this._fillExistingBoundaryGeometry.clone(),
        layerType: 'existing-boundary',
        isExisting: true
      }));
    }
    for (const selected of this._fillSelected) {
      this._fillPreviewSource.addFeature(new ol.Feature({
        geometry: selected.geometry.clone(),
        layerType: selected.layerType
      }));
    }
  };

  DefraMapClient.prototype._emitFillSelectionChanged = function() {
    let totalArea = 0;
    let count = this._fillSelected.length;

    if (this._fillExistingBoundaryGeometry) {
      totalArea += this._fillExistingBoundaryGeometry.getArea();
      count++;
    }

    for (const selected of this._fillSelected) {
      totalArea += this._getFillPolygonArea(selected.geometry);
    }

    this._emitter.emit('fill:selectionChanged', {
      count: count,
      selectedCount: this._fillSelected.length,
      totalAreaSqm: totalArea
    });
  };

  DefraMapClient.prototype._geometryToPolygon = function(geometry) {
    const type = geometry.getType();
    if (type === 'Polygon') return geometry;
    if (type === 'MultiPolygon') {
      const coords = geometry.getCoordinates()[0];
      return new ol.geom.Polygon(coords);
    }
    return null;
  };

  DefraMapClient.prototype._confirmFillBoundary = function() {
    if (this._fillSelected.length === 0) {
      this._emitter.emit('fill:message', { type: 'warning', message: 'No polygons selected.' });
      return false;
    }

    if (this._fillSelected.length > 1) {
      const polygonGeoms = this._fillSelected.map(s => this._geometryToPolygon(s.geometry)).filter(Boolean);
      if (!GeometryValidation.arePolygonsContiguous(polygonGeoms)) {
        this._emitter.emit('fill:message', { type: 'error', message: 'Selected polygons are not all connected.' });
        return false;
      }
    }

    const merged = this._mergeFillSelectedPolygons();
    if (!merged) {
      this._emitter.emit('fill:message', { type: 'error', message: 'Failed to merge selected polygons.' });
      return false;
    }

    const coords = merged.getCoordinates()[0];
    this.setBoundaryFromCoordinates(coords);
    this.cancelFill();

    this._emitter.emit('fill:confirmed', { areaSqm: merged.getArea() });
    return true;
  };

  DefraMapClient.prototype._mergeFillSelectedPolygons = function() {
    const allPolygons = [];
    if (this._fillExistingBoundaryGeometry) allPolygons.push(this._fillExistingBoundaryGeometry);
    for (const selected of this._fillSelected) {
      const poly = this._geometryToPolygon(selected.geometry);
      if (poly) allPolygons.push(poly);
    }
    if (!allPolygons.length) return null;
    if (allPolygons.length === 1) return allPolygons[0].clone();

    // Simple “outer edges” merge from original prototype (approximate).
    try {
      const mergedCoords = this._mergePolygonCoordinates(allPolygons);
      if (!mergedCoords) return null;
      return new ol.geom.Polygon([mergedCoords]);
    } catch (e) {
      return null;
    }
  };

  DefraMapClient.prototype._mergePolygonCoordinates = function(polygons) {
    if (polygons.length === 0) return null;
    if (polygons.length === 1) return polygons[0].getCoordinates()[0];

    const allEdges = [];
    const edgeMap = new Map();

    for (const polygon of polygons) {
      const coords = polygon.getCoordinates()[0];
      for (let i = 0; i < coords.length - 1; i++) {
        const edge = { start: coords[i], end: coords[i + 1] };
        const key = this._getEdgeKey(edge);
        const reverseKey = this._getEdgeKey({ start: edge.end, end: edge.start });
        if (edgeMap.has(reverseKey)) {
          edgeMap.get(reverseKey).shared = true;
          edge.shared = true;
        }
        edgeMap.set(key, edge);
        allEdges.push(edge);
      }
    }

    const outerEdges = allEdges.filter(e => !e.shared);
    const outerBoundary = this._walkEdges(outerEdges);
    if (outerBoundary && outerBoundary.length >= 3) {
      outerBoundary.push(outerBoundary[0].slice());
      return outerBoundary;
    }

    return null;
  };

  DefraMapClient.prototype._getEdgeKey = function(edge) {
    return `${edge.start[0].toFixed(6)},${edge.start[1].toFixed(6)}-${edge.end[0].toFixed(6)},${edge.end[1].toFixed(6)}`;
  };

  DefraMapClient.prototype._walkEdges = function(edges) {
    if (!edges.length) return null;

    const adjacency = new Map();
    for (const edge of edges) {
      const startKey = `${edge.start[0].toFixed(6)},${edge.start[1].toFixed(6)}`;
      if (!adjacency.has(startKey)) adjacency.set(startKey, []);
      adjacency.get(startKey).push(edge);
    }

    const result = [edges[0].start.slice()];
    let current = edges[0].end.slice();
    const used = new Set();
    used.add(this._getEdgeKey(edges[0]));

    const maxIterations = edges.length * 2;
    let iterations = 0;

    while (iterations < maxIterations) {
      iterations++;
      result.push(current.slice());
      if (GeometryValidation.coordsNearlyEqual(current, result[0]) && result.length > 3) break;

      const currentKey = `${current[0].toFixed(6)},${current[1].toFixed(6)}`;
      const candidates = adjacency.get(currentKey) || [];
      let foundNext = false;
      for (const candidate of candidates) {
        const key = this._getEdgeKey(candidate);
        if (!used.has(key)) {
          used.add(key);
          current = candidate.end.slice();
          foundNext = true;
          break;
        }
      }
      if (!foundNext) break;
    }

    return result.length >= 3 ? result : null;
  };

  // Parcel fill: convert OS polygon to parcel and add directly.
  DefraMapClient.prototype._validatePolygonWithinBoundary = function(geometry) {
    const poly = this._geometryToPolygon(geometry);
    if (!poly) return { valid: false, error: 'Invalid polygon geometry.' };
    if (!this._fillConstraintBoundary) return { valid: false, error: 'No boundary defined for validation.' };

    if (GeometryValidation.isPolygonWithinBoundary(poly, this._fillConstraintBoundary)) {
      return { valid: true, error: null };
    }
    return { valid: false, error: 'This polygon extends outside the red-line boundary.' };
  };

  DefraMapClient.prototype._checkOverlapWithExistingParcels = function(geometry) {
    const poly = this._geometryToPolygon(geometry);
    if (!poly) return { valid: false, error: 'Invalid polygon geometry.' };
    for (let i = 0; i < this._habitatParcels.length; i++) {
      const parcelGeom = this._habitatParcels[i].feature.getGeometry();
      if (GeometryValidation.doPolygonsOverlap(poly, parcelGeom)) {
        return { valid: false, error: `This polygon overlaps with parcel ${i + 1}.` };
      }
    }
    return { valid: true, error: null };
  };

  DefraMapClient.prototype._addFillPolygonAsParcel = function(polygonInfo) {
    const poly = this._geometryToPolygon(polygonInfo.geometry);
    if (!poly) return false;

    const coords = poly.getCoordinates()[0];
    return this.addParcelFromCoordinates(coords);
  };

  DefraMapClient.prototype.addParcelFromCoordinates = function(coords) {
    if (this._mode !== 'habitat-parcels') return false;
    if (!coords || coords.length < 4) return false;

    const parcelCoords = coords.map(c => [...c]);
    const first = parcelCoords[0];
    const last = parcelCoords[parcelCoords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      parcelCoords.push([...first]);
    }

    const completedPolygon = new ol.geom.Polygon([parcelCoords]);
    const colorIndex = this._habitatParcels.length % this._parcelColors.length;

    const parcelFeature = new ol.Feature({
      geometry: completedPolygon,
      type: 'parcel',
      colorIndex: colorIndex
    });
    this._drawSource.addFeature(parcelFeature);

    const vertexFeatures = [];
    for (let i = 0; i < parcelCoords.length - 1; i++) {
      const vertexFeature = new ol.Feature({
        geometry: new ol.geom.Point(parcelCoords[i]),
        type: 'vertex',
        isFirst: i === 0,
        highlighted: false,
        colorIndex: colorIndex
      });
      vertexFeatures.push(vertexFeature);
      this._drawSource.addFeature(vertexFeature);
    }

    const id = `parcel-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const parcel = { id, feature: parcelFeature, coords: parcelCoords, vertices: vertexFeatures, colorIndex, meta: {} };
    this._habitatParcels.push(parcel);

    const index = this._habitatParcels.length - 1;
    this._emitter.emit('parcel:added', { index, id, areaSqm: completedPolygon.getArea(), source: 'fill' });
    this._emitter.emit('parcels:changed', { count: this._habitatParcels.length, totalAreaSqm: this.parcelsTotalAreaSqm });
    return true;
  };

  // ============================
  // Internal slice (ported core behaviour)
  // ============================

  DefraMapClient.prototype._clearSliceVisuals = function() {
    if (this._sliceSource) this._sliceSource.clear();
    this._sliceHover = null;
    this._sliceStartMarker = null;
    this._slicePreviewLine = null;
  };

  DefraMapClient.prototype._handleSlicePointerMove = function(evt) {
    if (!this._sliceActive) return;
    const coordinate = evt.coordinate;
    const snapInfo = this._sliceStart ? this._findSliceSnapPointOnSourcePolygon(coordinate) : this._findSliceSnapPoint(coordinate);

    if (this._sliceHover) {
      this._sliceSource.removeFeature(this._sliceHover);
      this._sliceHover = null;
    }

    if (snapInfo) {
      let featureType;
      if (snapInfo.isVertex) {
        featureType = snapInfo.sourceType === 'parcel' ? 'parcel-vertex-hover' : 'boundary-vertex-hover';
      } else {
        featureType = 'edge-hover';
      }
      this._sliceHover = new ol.Feature({
        geometry: new ol.geom.Point(snapInfo.coordinate),
        featureType: featureType
      });
      this._sliceSource.addFeature(this._sliceHover);
      this._map.getTargetElement().style.cursor = 'pointer';
    } else {
      this._map.getTargetElement().style.cursor = 'crosshair';
    }

    if (this._sliceStart) {
      if (this._slicePreviewLine) {
        this._sliceSource.removeFeature(this._slicePreviewLine);
      }
      const endCoord = snapInfo ? snapInfo.coordinate : coordinate;
      this._slicePreviewLine = new ol.Feature({
        geometry: new ol.geom.LineString([this._sliceStart.coordinate, endCoord]),
        featureType: 'line'
      });
      this._sliceSource.addFeature(this._slicePreviewLine);
    }
  };

  DefraMapClient.prototype._handleSliceClick = function(evt) {
    if (!this._sliceActive) return;
    const coordinate = evt.coordinate;

    if (!this._sliceStart) {
      const snapInfo = this._findSliceSnapPoint(coordinate);
      if (!snapInfo) {
        this._emitter.emit('slice:message', { type: 'warning', message: 'Please click on a boundary or parcel edge.' });
        return;
      }

      this._sliceStart = snapInfo;
      this._sliceSourceType = snapInfo.sourceType;
      this._sliceSourceParcelIndex = snapInfo.parcelIndex;
      this._sliceSourceCoords = snapInfo.polygonCoords.slice();

      this._sliceStartMarker = new ol.Feature({
        geometry: new ol.geom.Point(this._sliceStart.coordinate),
        featureType: 'start'
      });
      this._sliceSource.addFeature(this._sliceStartMarker);

      this._emitter.emit('slice:pointSelected', { stage: 'start', sourceType: this._sliceSourceType, parcelIndex: this._sliceSourceParcelIndex });
      return;
    }

    const snapInfo = this._findSliceSnapPointOnSourcePolygon(coordinate);
    if (!snapInfo) {
      this._emitter.emit('slice:message', { type: 'warning', message: 'Please click on the same polygon to complete the slice.' });
      return;
    }

    const dist = this._getDistance(this._sliceStart.coordinate, snapInfo.coordinate);
    if (dist < 1) {
      this._emitter.emit('slice:message', { type: 'warning', message: 'Please select a different point.' });
      return;
    }

    this._executeSlice(this._sliceStart, snapInfo);
  };

  DefraMapClient.prototype._findSliceSnapPointOnSourcePolygon = function(coordinate) {
    const resolution = this._map.getView().getResolution();
    const tolerance = this._snapTolerancePx * resolution;

    let result = null;
    let minDist = Infinity;

    const coords = this._sliceSourceCoords;
    if (!coords || coords.length < 3) return null;

    for (let i = 0; i < coords.length - 1; i++) {
      const dist = this._getDistance(coordinate, coords[i]);
      if (dist < tolerance && dist < minDist) {
        minDist = dist;
        result = { coordinate: coords[i], edgeIndex: i, isVertex: true, sourceType: this._sliceSourceType, parcelIndex: this._sliceSourceParcelIndex, polygonCoords: coords };
      }
    }

    for (let i = 0; i < coords.length - 1; i++) {
      const closest = this._closestPointOnSegment(coordinate, coords[i], coords[i + 1]);
      const dist = this._getDistance(coordinate, closest);
      if (dist < tolerance && dist < minDist) {
        minDist = dist;
        result = { coordinate: closest, edgeIndex: i, isVertex: false, sourceType: this._sliceSourceType, parcelIndex: this._sliceSourceParcelIndex, polygonCoords: coords };
      }
    }

    return result;
  };

  DefraMapClient.prototype._findSliceSnapPoint = function(coordinate) {
    const resolution = this._map.getView().getResolution();
    const tolerance = this._snapTolerancePx * resolution;

    let result = null;
    let minDist = Infinity;

    // Parcels first
    if (this._habitatParcels.length > 0) {
      for (let p = 0; p < this._habitatParcels.length; p++) {
        const geom = this._habitatParcels[p].feature.getGeometry();
        const coords = geom.getCoordinates()[0];

        for (let i = 0; i < coords.length - 1; i++) {
          const dist = this._getDistance(coordinate, coords[i]);
          if (dist < tolerance && dist < minDist) {
            minDist = dist;
            result = { coordinate: coords[i], edgeIndex: i, isVertex: true, sourceType: 'parcel', parcelIndex: p, polygonCoords: coords };
          }
        }

        if (!result || result.sourceType !== 'parcel' || result.parcelIndex !== p) {
          for (let i = 0; i < coords.length - 1; i++) {
            const closest = this._closestPointOnSegment(coordinate, coords[i], coords[i + 1]);
            const dist = this._getDistance(coordinate, closest);
            if (dist < tolerance && dist < minDist) {
              minDist = dist;
              result = { coordinate: closest, edgeIndex: i, isVertex: false, sourceType: 'parcel', parcelIndex: p, polygonCoords: coords };
            }
          }
        }
      }
    }

    if (result && result.sourceType === 'parcel') return result;

    // Boundary
    if (this._boundaryPolygon) {
      const coords = this._boundaryPolygon.getCoordinates()[0];
      for (let i = 0; i < coords.length - 1; i++) {
        const dist = this._getDistance(coordinate, coords[i]);
        if (dist < tolerance && dist < minDist) {
          minDist = dist;
          result = { coordinate: coords[i], edgeIndex: i, isVertex: true, sourceType: 'boundary', parcelIndex: -1, polygonCoords: coords };
        }
      }

      if (!result) {
        for (let i = 0; i < coords.length - 1; i++) {
          const closest = this._closestPointOnSegment(coordinate, coords[i], coords[i + 1]);
          const dist = this._getDistance(coordinate, closest);
          if (dist < tolerance && dist < minDist) {
            minDist = dist;
            result = { coordinate: closest, edgeIndex: i, isVertex: false, sourceType: 'boundary', parcelIndex: -1, polygonCoords: coords };
          }
        }
      }
    }

    return result;
  };

  DefraMapClient.prototype._closestPointOnSegment = function(point, segStart, segEnd) {
    const dx = segEnd[0] - segStart[0];
    const dy = segEnd[1] - segStart[1];
    if (dx === 0 && dy === 0) return [...segStart];

    const t = Math.max(0, Math.min(1, ((point[0] - segStart[0]) * dx + (point[1] - segStart[1]) * dy) / (dx * dx + dy * dy)));
    return [segStart[0] + t * dx, segStart[1] + t * dy];
  };

  DefraMapClient.prototype._executeSlice = function(start, end) {
    const originalCoords = this._sliceSourceCoords.slice(0, -1);
    const newCoords = [];
    let startInserted = false;
    let endInserted = false;
    let startIdx = -1;
    let endIdx = -1;

    for (let i = 0; i < originalCoords.length; i++) {
      const currentCoord = originalCoords[i];
      newCoords.push([...currentCoord]);

      if (!startInserted && start.isVertex && start.edgeIndex === i) {
        startIdx = newCoords.length - 1;
        startInserted = true;
      }
      if (!endInserted && end.isVertex && end.edgeIndex === i) {
        endIdx = newCoords.length - 1;
        endInserted = true;
      }

      if (!startInserted && !start.isVertex && start.edgeIndex === i) {
        newCoords.push([...start.coordinate]);
        startIdx = newCoords.length - 1;
        startInserted = true;
      }
      if (!endInserted && !end.isVertex && end.edgeIndex === i) {
        newCoords.push([...end.coordinate]);
        endIdx = newCoords.length - 1;
        endInserted = true;
      }
    }

    if (startIdx === -1 || endIdx === -1) {
      this._emitter.emit('slice:message', { type: 'error', message: 'Error creating slice. Please try again.' });
      return;
    }

    const i = Math.min(startIdx, endIdx);
    const j = Math.max(startIdx, endIdx);

    const polyA = [];
    for (let idx = i; idx <= j; idx++) polyA.push([...newCoords[idx]]);
    polyA.push([...newCoords[i]]);

    const polyB = [];
    for (let idx = j; idx < newCoords.length; idx++) polyB.push([...newCoords[idx]]);
    for (let idx = 0; idx <= i; idx++) polyB.push([...newCoords[idx]]);
    polyB.push([...newCoords[j]]);

    if (polyA.length < 4 || polyB.length < 4) {
      this._emitter.emit('slice:message', { type: 'warning', message: 'Cannot create valid polygons from this slice.' });
      return;
    }

    if (this._sliceSourceType === 'boundary') {
      this.addParcelFromCoordinates(polyA);
      this.addParcelFromCoordinates(polyB);
    } else {
      this._replaceParcelWithSlice(this._sliceSourceParcelIndex, polyA, polyB);
    }

    this._finishSlice();
  };

  DefraMapClient.prototype._replaceParcelWithSlice = function(parcelIndex, coordsA, coordsB) {
    if (parcelIndex < 0 || parcelIndex >= this._habitatParcels.length) return;
    const original = this._habitatParcels[parcelIndex];
    this._drawSource.removeFeature(original.feature);
    original.vertices.forEach(v => this._drawSource.removeFeature(v));
    this._habitatParcels.splice(parcelIndex, 1);

    this.addParcelFromCoordinates(coordsA);
    this.addParcelFromCoordinates(coordsB);
  };

  DefraMapClient.prototype._finishSlice = function() {
    this._sliceActive = false;
    this._sliceStart = null;
    this._sliceSourceType = null;
    this._sliceSourceParcelIndex = -1;
    this._sliceSourceCoords = null;
    this._clearSliceVisuals();
    this._map.getTargetElement().style.cursor = 'default';
    this._emitter.emit('slice:completed', {});
  };

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
      slice: { active: this._sliceActive }
    };
  };

  // ============================
  // Export
  // ============================

  window.DefraMapClient = DefraMapClient;
})(window);

