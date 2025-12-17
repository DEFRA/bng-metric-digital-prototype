//
// Upload red line boundary from zipped shapefile
// Backend converts shapefile (typically EPSG:27700) to WGS84 (EPSG:4326) using shpjs
// Frontend transforms from EPSG:4326 to EPSG:3857 (Web Mercator) for map display
//

(function(window) {
  'use strict';

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

    const format = new ol.format.GeoJSON();
    // Read features from WGS84 (EPSG:4326) and convert directly to map projection (EPSG:3857)
    const features = format.readFeatures(geojson4326, {
      dataProjection: 'EPSG:4326',
      featureProjection: 'EPSG:3857'
    });

    if (!features || !features.length) {
      showStatusSafe('No features found in the uploaded shapefile.', 'error');
      return;
    }

    // Use the first polygon / multipolygon feature as the red line boundary
    const feature3857 = features[0];
    let geom3857 = feature3857.getGeometry();

    if (!geom3857) {
      showStatusSafe('The first feature has no geometry.', 'error');
      return;
    }

    // If MultiPolygon, take the first polygon
    if (geom3857.getType && geom3857.getType() === 'MultiPolygon') {
      const polys = geom3857.getPolygons();
      if (polys && polys.length > 0) {
        geom3857 = polys[0];
      }
    }

    // Extract coordinates for SnapDrawing (expects EPSG:3857)
    const coords3857 = geom3857.getCoordinates && geom3857.getCoordinates()[0];
    if (!coords3857 || coords3857.length < 4) {
      showStatusSafe('The uploaded boundary is not a valid polygon.', 'error');
      return;
    }

    if (window.SnapDrawing && window.SnapDrawing.setPolygonFromCoordinates) {
      const success = window.SnapDrawing.setPolygonFromCoordinates(coords3857);
      if (!success) {
        showStatusSafe('Could not set the uploaded boundary on the map.', 'error');
        return;
      }
    }

    // Zoom map to boundary
    const map = window.appMap;
    if (map && geom3857.getExtent) {
      map.getView().fit(geom3857.getExtent(), {
        padding: [50, 50, 50, 50],
        maxZoom: 17,
        duration: 600
      });
    }

    // Store WGS84 (EPSG:4326) GeoJSON version for downstream use
    try {
      window.uploadedRedlineBoundaryEPSG4326 = geojson4326;
      console.log('✓ Uploaded boundary stored in EPSG:4326 on window.uploadedRedlineBoundaryEPSG4326');
    } catch (e) {
      console.error('Error storing uploaded boundary:', e);
    }

    // Geometry is now in EPSG:3857 for map display
    // WGS84 (EPSG:4326) is available via window.uploadedRedlineBoundaryEPSG4326
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
