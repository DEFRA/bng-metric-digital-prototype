//
// DefraMapClient snapping (prototype augmentation)
// Not a module: extends `window.DefraMapClient.prototype`.
//

(function(window) {
  'use strict';

  const DefraMapClient = window.DefraMapClient;
  if (!DefraMapClient) {
    throw new Error('defra-map-client.snapping.js requires window.DefraMapClient to be loaded first.');
  }

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
})(window);

