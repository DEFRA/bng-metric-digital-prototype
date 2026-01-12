//
// Upload red line boundary from zipped shapefile
// Backend converts shapefile (typically EPSG:27700) to WGS84 (EPSG:4326) using shpjs
// Frontend transforms from EPSG:4326 to the map's CRS (EPSG:27700 or EPSG:3857)
//

(function(window) {
  'use strict';

  // Get the map's CRS (defaults to EPSG:27700 for best alignment)
  function getMapCRS() {
    return window.appMapCRS || 'EPSG:27700';
  }

  window.GOVUKPrototypeKit.documentReady(() => {
    const form = document.getElementById('upload-boundary-form');
    const fileInput = document.getElementById('redline-zip');

    if (!form || !fileInput) {
      return;
    }

    form.addEventListener('submit', async function(event) {
      event.preventDefault();

      const file = fileInput.files && fileInput.files[0];
      if (!file) {
        showStatusSafe('Select a .zip file to upload.', 'warning');
        return;
      }

      if (!file.name.toLowerCase().endsWith('.zip')) {
        showStatusSafe('The file must be a .zip containing a shapefile.', 'warning');
        return;
      }

      // Check file size (50MB limit)
      const maxSizeBytes = 50 * 1024 * 1024; // 50MB
      if (file.size > maxSizeBytes) {
        const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);
        showStatusSafe(`File size (${fileSizeMB}MB) exceeds the maximum allowed size of 50MB.`, 'warning');
        return;
      }

      const submitButton = form.querySelector('button[type="submit"]');
      const originalText = submitButton ? submitButton.textContent : '';

      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Uploading...';
      }

      try {
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/api/convert', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          let detail = 'Upload failed. Please check the file and try again.';
          try {
            const errorJson = await response.json();
            if (errorJson && errorJson.detail) {
              detail = errorJson.detail;
            }
          } catch (e) {
            // Ignore JSON parse errors
          }
          showStatusSafe(detail, 'error');
          return;
        }

        const geojson4326 = await response.json();
        
        // Validate that the polygon is within England before displaying
        const isValid = await validatePolygonWithinEngland(geojson4326);
        if (!isValid.valid) {
          showStatusSafe(isValid.error || 'The uploaded boundary is not within England.', 'warning');
          return;
        }
        
        handleGeoJSONResult(geojson4326);
      } catch (error) {
        console.error('Error uploading boundary zip:', error);
        showStatusSafe('There was a problem uploading the file. Please try again.', 'error');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = originalText;
        }
      }
    });
  });

  function handleGeoJSONResult(geojson4326) {
    if (!geojson4326) {
      showStatusSafe('No features were returned from the uploaded file.', 'error');
      return;
    }

    const mapCRS = getMapCRS();
    const format = new ol.format.GeoJSON();
    
    // Read features from WGS84 (EPSG:4326) and convert to map projection
    const features = format.readFeatures(geojson4326, {
      dataProjection: 'EPSG:4326',
      featureProjection: mapCRS
    });

    if (!features || !features.length) {
      showStatusSafe('No features found in the uploaded shapefile.', 'error');
      return;
    }

    // Use the first polygon / multipolygon feature as the red line boundary
    const featureMapCRS = features[0];
    let geomMapCRS = featureMapCRS.getGeometry();

    if (!geomMapCRS) {
      showStatusSafe('The first feature has no geometry.', 'error');
      return;
    }

    // If MultiPolygon, take the first polygon
    if (geomMapCRS.getType && geomMapCRS.getType() === 'MultiPolygon') {
      const polys = geomMapCRS.getPolygons();
      if (polys && polys.length > 0) {
        geomMapCRS = polys[0];
      }
    }

    // Extract coordinates for SnapDrawing (in map's CRS)
    const coordsMapCRS = geomMapCRS.getCoordinates && geomMapCRS.getCoordinates()[0];
    if (!coordsMapCRS || coordsMapCRS.length < 4) {
      showStatusSafe('The uploaded boundary is not a valid polygon.', 'error');
      return;
    }

    if (window.SnapDrawing && window.SnapDrawing.setPolygonFromCoordinates) {
      const success = window.SnapDrawing.setPolygonFromCoordinates(coordsMapCRS);
      if (!success) {
        showStatusSafe('Could not set the uploaded boundary on the map.', 'error');
        return;
      }
    }

    // Zoom map to boundary
    const map = window.appMap;
    if (map && geomMapCRS.getExtent) {
      map.getView().fit(geomMapCRS.getExtent(), {
        padding: [50, 50, 50, 50],
        maxZoom: 15,
        duration: 600
      });
    }

    // Store WGS84 (EPSG:4326) GeoJSON version for downstream use
    try {
      window.uploadedRedlineBoundaryEPSG4326 = geojson4326;
      console.log(`✓ Uploaded boundary stored in EPSG:4326, displayed in ${mapCRS}`);
    } catch (e) {
      console.error('Error storing uploaded boundary:', e);
    }

    showStatusSafe('Boundary uploaded and displayed on the map.', 'success');
  }

  /**
   * Convert GeoJSON polygon to Esri JSON format
   * @param {Object} geojsonGeometry - GeoJSON geometry (Polygon or MultiPolygon)
   * @returns {Object} Esri JSON geometry object
   */
  function geojsonToEsriJSON(geojsonGeometry) {
    if (!geojsonGeometry || !geojsonGeometry.coordinates) {
      throw new Error('Invalid GeoJSON geometry');
    }

    const type = geojsonGeometry.type;
    
    if (type === 'Polygon') {
      // Polygon: coordinates is an array of rings [exterior, ...holes]
      const rings = geojsonGeometry.coordinates.map(ring => {
        // Esri JSON uses [lon, lat] format (same as GeoJSON)
        return ring.map(coord => [coord[0], coord[1]]);
      });
      
      return {
        rings: rings,
        spatialReference: {
          wkid: 4326
        }
      };
    } else if (type === 'MultiPolygon') {
      // MultiPolygon: take the first polygon only
      const firstPolygon = geojsonGeometry.coordinates[0];
      const rings = firstPolygon.map(ring => {
        return ring.map(coord => [coord[0], coord[1]]);
      });
      
      return {
        rings: rings,
        spatialReference: {
          wkid: 4326
        }
      };
    } else {
      throw new Error('Geometry must be a Polygon or MultiPolygon');
    }
  }

  /**
   * Check if two line segments intersect (excluding endpoints)
   * @param {Array} a1 - First point of segment A [x, y]
   * @param {Array} a2 - Second point of segment A [x, y]
   * @param {Array} b1 - First point of segment B [x, y]
   * @param {Array} b2 - Second point of segment B [x, y]
   * @returns {boolean} True if segments intersect (not just touch at endpoints)
   */
  function doLineSegmentsIntersect(a1, a2, b1, b2) {
    // Helper function to calculate orientation
    const orientation = (p, q, r) => {
      const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1]);
      if (val === 0) return 0; // Collinear
      return val > 0 ? 1 : 2; // Clockwise or Counterclockwise
    };

    const onSegment = (p, q, r) => {
      return q[0] <= Math.max(p[0], r[0]) && q[0] >= Math.min(p[0], r[0]) &&
             q[1] <= Math.max(p[1], r[1]) && q[1] >= Math.min(p[1], r[1]);
    };

    // Find orientations
    const o1 = orientation(a1, a2, b1);
    const o2 = orientation(a1, a2, b2);
    const o3 = orientation(b1, b2, a1);
    const o4 = orientation(b1, b2, a2);

    // General case: segments intersect if orientations differ
    if (o1 !== o2 && o3 !== o4) {
      return true;
    }

    // Special cases: collinear segments
    if (o1 === 0 && onSegment(a1, b1, a2)) return true;
    if (o2 === 0 && onSegment(a1, b2, a2)) return true;
    if (o3 === 0 && onSegment(b1, a1, b2)) return true;
    if (o4 === 0 && onSegment(b1, a2, b2)) return true;

    return false;
  }

  /**
   * Check if a polygon is self-intersecting
   * @param {ol.geom.Polygon} polygon - OpenLayers polygon geometry
   * @returns {boolean} True if polygon is self-intersecting
   */
  function isPolygonSelfIntersecting(polygon) {
    const coordinates = polygon.getCoordinates()[0]; // Get exterior ring
    const numPoints = coordinates.length;

    // Need at least 4 points (including closing point) to form a polygon
    if (numPoints < 4) {
      return false;
    }

    // Check all pairs of non-adjacent edges
    for (let i = 0; i < numPoints - 1; i++) {
      const a1 = coordinates[i];
      const a2 = coordinates[i + 1];

      // Skip adjacent and next-to-adjacent edges (they share vertices)
      // Also skip the edge that would close the polygon with the starting edge
      for (let j = i + 2; j < numPoints - 1; j++) {
        // Skip the last edge if it's adjacent to the first edge
        if (i === 0 && j === numPoints - 2) {
          continue;
        }

        const b1 = coordinates[j];
        const b2 = coordinates[j + 1];

        if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Validate that the uploaded polygon is within England
   * Uses ArcGIS REST service to check if polygon intersects with England boundary
   * @param {Object} geojson4326 - GeoJSON in EPSG:4326 (WGS84)
   * @returns {Promise<Object>} { valid: boolean, error: string|null }
   */
  async function validatePolygonWithinEngland(geojson4326) {
    if (!geojson4326 || !geojson4326.features || geojson4326.features.length === 0) {
      return { valid: false, error: 'No features found in the uploaded file.' };
    }

    if (geojson4326.features.length > 10) {
      return { valid: false, error: 'More than 10 red line boundaries in the uploaded file.' };
    }

    // Get the first feature's geometry
    const feature = geojson4326.features[0];
    if (!feature.geometry) {
      return { valid: false, error: 'The uploaded file must contain a geometry.' };
    }

    const geomType = feature.geometry.type;
    if (geomType !== 'Polygon' && geomType !== 'MultiPolygon') {
      return { valid: false, error: 'The uploaded file must contain a Polygon or MultiPolygon geometry.' };
    }

    // Ensure uploaded RLB is not too large (check coordinate count)
    if (geomType === 'Polygon') {
      const coordCount = feature.geometry.coordinates[0] ? feature.geometry.coordinates[0].length : 0;
      if (coordCount > 10000) {
        return { valid: false, error: 'The uploaded boundary has too many coordinates. Please upload a simpler boundary.' };
      }
    } else if (geomType === 'MultiPolygon') {
      const totalCoords = feature.geometry.coordinates.reduce((sum, poly) => {
        return sum + (poly[0] ? poly[0].length : 0);
      }, 0);
      if (totalCoords > 10000) {
        return { valid: false, error: 'The uploaded boundary has too many coordinates. Please upload a simpler boundary.' };
      }
    }

    // Check if polygon is self-intersecting and calculate area
    try {
      const format = new ol.format.GeoJSON();
      const olFeature = format.readFeature(feature, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:3857' // Transform to Web Mercator for accurate area calculation
      });

      const geometry = olFeature.getGeometry();
      if (!geometry) {
        return { valid: false, error: 'Could not read geometry from the uploaded file.' };
      }

      // Check for self-intersection
      if (geometry.getType() === 'Polygon') {
        if (isPolygonSelfIntersecting(geometry)) {
          return { 
            valid: false, 
            error: 'The uploaded boundary is self-intersecting. Please upload a valid polygon without crossing edges.' 
          };
        }
      } else if (geometry.getType() === 'MultiPolygon') {
        // Check each polygon in the MultiPolygon
        const polygons = geometry.getPolygons();
        for (let i = 0; i < polygons.length; i++) {
          if (isPolygonSelfIntersecting(polygons[i])) {
            return { 
              valid: false, 
              error: `The uploaded boundary polygon ${i + 1} is self-intersecting. Please upload a valid polygon without crossing edges.` 
            };
          }
        }
      }

      // Handle MultiPolygon - calculate area of all polygons
      let areaSquareMeters = 0;
      if (geometry.getType() === 'MultiPolygon') {
        const polygons = geometry.getPolygons();
        polygons.forEach(polygon => {
          areaSquareMeters += polygon.getArea();
        });
      } else {
        areaSquareMeters = geometry.getArea();
      }

      // Convert from square meters to square kilometers
      const areaSquareKilometers = areaSquareMeters / 1000000;

      // Check if area is greater than 100 km²
      if (areaSquareKilometers > 100) {
        return { 
          valid: false, 
          error: `The uploaded boundary area (${areaSquareKilometers.toFixed(2)} km²) exceeds the maximum allowed size of 100 km². Please upload a smaller boundary.` 
        };
      }
    } catch (areaError) {
      console.error('Error calculating polygon area:', areaError);
      // Continue with validation even if area calculation fails
    }

    try {
      // Convert GeoJSON geometry to Esri JSON format
      const esriGeometry = geojsonToEsriJSON(feature.geometry);

      // Call backend endpoint to validate with ArcGIS service
      const response = await fetch('/api/validate-england', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ geometry: esriGeometry })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return { 
          valid: false, 
          error: errorData.error || 'Error validating polygon with England boundary service.' 
        };
      }

      const result = await response.json();
      return result;

    } catch (error) {
      console.error('Error validating polygon within England:', error);
      // Fail closed - don't allow upload if validation fails
      return { 
        valid: false, 
        error: 'Error validating polygon: ' + error.message 
      };
    }
  }

  function showStatusSafe(message, type) {
    if (typeof window.showStatus === 'function') {
      window.showStatus(message, type);
    } else {
      console.log('[' + (type || 'info') + '] ' + message);
    }
  }

})(window);
