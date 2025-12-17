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

  function showStatusSafe(message, type) {
    if (typeof window.showStatus === 'function') {
      window.showStatus(message, type);
    } else {
      console.log('[' + (type || 'info') + '] ' + message);
    }
  }

})(window);
