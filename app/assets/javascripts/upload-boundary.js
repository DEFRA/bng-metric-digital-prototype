//
// Upload red line boundary from zipped shapefile (EPSG:27700)
// Keeps geometry in British National Grid for processing,
// and transforms only to the map projection (EPSG:3857) for display.
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

        const geojson27700 = await response.json();
        handleGeoJSONResult(geojson27700);
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

  function handleGeoJSONResult(geojson27700) {
    if (!geojson27700) {
      showStatusSafe('No features were returned from the uploaded file.', 'error');
      return;
    }

    const format = new ol.format.GeoJSON();
    const features = format.readFeatures(geojson27700, {
      dataProjection: 'EPSG:27700',
      featureProjection: 'EPSG:27700'
    });

    if (!features || !features.length) {
      showStatusSafe('No features found in the uploaded shapefile.', 'error');
      return;
    }

    // Use the first polygon / multipolygon feature as the red line boundary
    const feature27700 = features[0];
    let geom27700 = feature27700.getGeometry();

    if (!geom27700) {
      showStatusSafe('The first feature has no geometry.', 'error');
      return;
    }

    // If MultiPolygon, take the first polygon
    if (geom27700.getType && geom27700.getType() === 'MultiPolygon') {
      const polys = geom27700.getPolygons();
      if (polys && polys.length > 0) {
        geom27700 = polys[0];
      }
    }

    // 1) Clone and transform to map projection (EPSG:3857) for display
    const geom3857 = geom27700.clone().transform('EPSG:27700', 'EPSG:3857');

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

    // 2) Also provide a WGS84 (EPSG:4326) GeoJSON version for downstream use
    try {
      const geom4326 = geom27700.clone().transform('EPSG:27700', 'EPSG:4326');
      const feature4326 = new ol.Feature({ geometry: geom4326 });
      const geojson4326 = format.writeFeatureObject(feature4326, {
        dataProjection: 'EPSG:4326',
        featureProjection: 'EPSG:4326'
      });
      window.uploadedRedlineBoundaryEPSG4326 = geojson4326;
      console.log('✓ Uploaded boundary converted to EPSG:4326 and stored on window.uploadedRedlineBoundaryEPSG4326');
    } catch (e) {
      console.error('Error converting uploaded boundary to EPSG:4326:', e);
    }

    // Note: We deliberately keep the underlying geometry in EPSG:27700 for calculations.
    // Display uses EPSG:3857, and WGS84 (EPSG:4326) is available via window.uploadedRedlineBoundaryEPSG4326.
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
