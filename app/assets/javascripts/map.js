//
// BNG prototype map page bootstrap (uses the reusable window.DefraMapClient library).
//

window.GOVUKPrototypeKit.documentReady(() => {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) {
    return;
  }

  const mode = mapContainer.dataset.mode || 'red-line-boundary';
  const boundaryUrl = mapContainer.dataset.boundaryUrl || null;

  const SNAP_LAYERS = [
    'bld-fts-building-1',
    'bld-fts-building-2',
    'bld-fts-building-3',
    'bld-fts-buildingline-1',
    'str-fts-fieldboundary-1',
    'str-fts-structureline-1',
    'lnd-fts-land-1',
    'lnd-fts-land-2',
    'lnd-fts-land-3',
    'lus-fts-site-1',
    'lus-fts-site-2',
    'wtr-ntwk-waterlink-1',
    'wtr-ntwk-waterlink-2',
    'wtr-ntwk-waternode-1',
    'wtr-fts-water-1',
    'wtr-fts-water-2',
    'wtr-fts-water-3',
    'lnd-fts-landformline-1',
    'lnd-fts-landformpoint-1',
    'lnd-fts-landpoint-1',
    'trn-ntwk-roadlink-1',
    'trn-ntwk-roadlink-2',
    'trn-ntwk-roadlink-3',
    'trn-ntwk-roadlink-4',
    'trn-ntwk-roadlink-5',
    'trn-ntwk-road-1',
    'trn-ntwk-pathlink-1',
    'trn-ntwk-pathlink-2',
    'trn-ntwk-pathlink-3',
    'trn-ntwk-path-1',
    'trn-ntwk-railwaylink-1',
    'trn-ntwk-railwaylinkset-1',
  ];

  const FILL_POLYGON_LAYERS = [
    'lnd-fts-land-1',
    'lnd-fts-land-2',
    'lnd-fts-land-3',
    'lus-fts-site-1',
    'lus-fts-site-2',
    'bld-fts-building-1',
    'bld-fts-building-2',
    'bld-fts-building-3',
    'wtr-fts-water-1',
    'wtr-fts-water-2',
    'wtr-fts-water-3',
  ];

  const osFeaturesLoading = document.getElementById('os-features-loading');

  const client = new window.DefraMapClient({
    target: mapContainer,
    mode: mode,
    projection: 'EPSG:27700',
    tiles: {
      collectionId: 'ngd-base',
      crs: '27700',
      tileMatrixSetUrl: 'https://api.os.uk/maps/vector/ngd/ota/v1/tilematrixsets/27700',
      styleUrl: '/api/os/tiles/style/27700',
      tilesUrlTemplate: '/api/os/tiles/ngd-base/27700/{z}/{y}/{x}',
    },
    osFeatures: {
      baseUrl: '/api/os/features',
      minZoomForSnap: 14,
      fetchThrottleMs: 300,
      layers: SNAP_LAYERS,
      fillPolygonLayers: FILL_POLYGON_LAYERS,
      simplifyTolerance: 0,
      maxFeaturesPerRequest: 100,
    },
    endpoints: {
      saveBoundaryUrl: '/api/save-red-line-boundary',
      saveParcelsUrl: '/api/save-habitat-parcels',
    },
  });

  window.bngMapClient = client;

  client.on('osFeatures:loading', (e) => {
    if (!osFeaturesLoading) return;
    if (e.loading) osFeaturesLoading.classList.add('visible');
    else osFeaturesLoading.classList.remove('visible');
  });

  client.on('view:changed', (e) => {
    updateZoomUI(e.zoom, e.minZoomForSnap);
  });

  client.on('validation:error', (e) => {
    showStatus(e.message, 'error');
  });

  client.on('fill:message', (e) => {
    showStatus(e.message, e.type || 'info');
  });

  client.on('fill:selectionChanged', (e) => {
    const info = document.getElementById('fill-selection-info');
    const count = document.getElementById('selection-count');
    const area = document.getElementById('selection-area');
    if (info && count && area) {
      info.style.display = client.getDebugInfo().fill.active ? 'block' : 'none';
      count.textContent = String(e.selectedCount);
      area.textContent = (e.totalAreaSqm / 10000).toFixed(2);
    }
  });

  client.on('fill:confirmed', (e) => {
    showStatus(`Boundary created: ${(e.areaSqm / 10000).toFixed(2)} hectares`, 'success');
    renderBoundaryArea();
    const saveButton = document.getElementById('save-boundary');
    if (saveButton) saveButton.classList.remove('disabled');
  });

  client.on('boundary:changed', () => {
    renderBoundaryArea();
  });

  client.on('sketch:area', (e) => {
    renderSketchArea(e.areaSqm);
  });

  client.on('boundary:loaded', () => {
    renderBoundaryArea();
    renderHabitatTotals();
  });

  client.on('parcel:added', () => {
    showStatus('Parcel added successfully', 'success');
    window.bngRenderParcelsList();
    renderHabitatTotals();
    if (window.HabitatAttribution && window.HabitatAttribution.renderForm) {
      window.HabitatAttribution.renderForm();
    }
  });

  client.on('parcel:removed', () => {
    showStatus('Parcel removed', 'info');
    window.bngRenderParcelsList();
    renderHabitatTotals();
    if (window.HabitatAttribution && window.HabitatAttribution.renderForm) {
      window.HabitatAttribution.renderForm();
    }
  });

  client.on('parcel:changed', () => {
    window.bngRenderParcelsList();
    renderHabitatTotals();
  });

  client.on('parcel:selected', (e) => {
    if (!window.HabitatAttribution) return;
    if (e.index >= 0) window.HabitatAttribution.selectParcel(e.index);
    else window.HabitatAttribution.deselectParcel();
  });

  client.on('slice:message', (e) => {
    showStatus(e.message, e.type || 'info');
  });

  client.on('slice:completed', () => {
    showStatus('Slice complete', 'success');
    window.bngRenderParcelsList();
    renderHabitatTotals();
  });

  window.bngRenderParcelsList = function() {
    if (mode !== 'habitat-parcels') return;
    const listElement = document.getElementById('parcels-list-items');
    if (!listElement) return;

    const count = client.getParcelCount();
    if (count === 0) {
      listElement.innerHTML = '<li class="govuk-body-s" style="color: #505a5f;">No parcels drawn yet</li>';
      updateSaveParcelsButtonState();
      return;
    }

    const selectedIndex = client.getSelectedParcelIndex();
    const debug = client.getDebugInfo();
    const isEditingAny = debug.parcels.editingIndex >= 0;

    const rows = [];
    for (let i = 0; i < count; i++) {
      const meta = client.getParcelMeta(i) || {};
      const parcelName = meta.broadHabitat ? meta.broadHabitat : `Parcel ${i + 1}`;
      const areaHa = client.getParcelAreaSqm(i) / 10000;
      const isSelected = selectedIndex === i;
      const isEditing = debug.parcels.editingIndex === i;
      const isAnotherEditing = isEditingAny && !isEditing;

      let statusHtml = '<span class="govuk-tag govuk-tag--red" style="font-size: 10px; margin-left: 5px;">Incomplete</span>';
      if (window.HabitatAttribution && window.HabitatAttribution.isParcelComplete) {
        if (window.HabitatAttribution.isParcelComplete(i)) {
          statusHtml = '<span class="govuk-tag govuk-tag--green" style="font-size: 10px; margin-left: 5px;">Complete</span>';
        }
      }

      let editButton = '';
      if (isEditing) {
        editButton = `<button type="button" class="govuk-link" style="color: #00703c; cursor: pointer; border: none; background: none; font-weight: bold;" data-edit-done="${i}">Done</button>`;
      } else if (!isAnotherEditing && !debug.drawing.isDrawing) {
        editButton = `<button type="button" class="govuk-link" style="color: #1d70b8; cursor: pointer; border: none; background: none;" data-edit="${i}">Edit shape</button>`;
      }

      let removeButton = '';
      if (!isAnotherEditing && !debug.drawing.isDrawing) {
        removeButton = `<button type="button" class="govuk-link" style="color: #d4351c; cursor: pointer; border: none; background: none; margin-left: 10px;" data-remove="${i}">Remove</button>`;
      }

      let rowStyle = 'display: flex; flex-direction: column; padding: 8px; border-bottom: 1px solid #b1b4b6;';
      if (isEditing) rowStyle += ' background: #fef7e5;';
      else if (isSelected) rowStyle += ' background: #e8f4f8; border-left: 4px solid #1d70b8;';

      rows.push(`
        <li class="govuk-body-s" style="${rowStyle}">
          <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
            <span style="display: flex; align-items: center;">
              <a href="#" class="govuk-link" data-select="${i}" style="text-decoration: ${isSelected ? 'none' : 'underline'}; font-weight: ${isSelected ? 'bold' : 'normal'};">${parcelName}</a>
            </span>
            <span id="parcel-status-${i}">${statusHtml}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-top: 4px;">
            <span style="color: #505a5f;"><span id="parcel-area-${i}">${areaHa.toFixed(2)}</span> ha</span>
            <span>
              ${editButton}
              ${removeButton}
            </span>
          </div>
        </li>
      `);
    }

    listElement.innerHTML = rows.join('');

    listElement.querySelectorAll('[data-select]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const idx = Number(el.getAttribute('data-select'));
        client.selectParcel(idx);
      });
    });
    listElement.querySelectorAll('[data-edit]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const idx = Number(el.getAttribute('data-edit'));
        client.startEditingParcel(idx);
        window.bngRenderParcelsList();
      });
    });
    listElement.querySelectorAll('[data-edit-done]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        client.stopEditingParcel();
        window.bngRenderParcelsList();
      });
    });
    listElement.querySelectorAll('[data-remove]').forEach(el => {
      el.addEventListener('click', (ev) => {
        ev.preventDefault();
        const idx = Number(el.getAttribute('data-remove'));
        client.removeParcel(idx);
      });
    });

    updateSaveParcelsButtonState();
  };

  init();

  async function init() {
    try {
      await client.init();
      window.dispatchEvent(new CustomEvent('bng-map-client-ready', { detail: { client: client } }));

      if (mode === 'habitat-parcels' && boundaryUrl) {
        await loadBoundary(boundaryUrl);
        initHabitatAttribution();
        window.bngRenderParcelsList();
        renderHabitatTotals();
      }

      setupUIControls();
    } catch (error) {
      console.error('❌ Error initializing map:', error);
      mapContainer.innerHTML = '<div style="padding: 20px; color: red;">Error loading map. Please check console for details.</div>';
    }
  }

  async function loadBoundary(url) {
    try {
      const response = await fetch(url);
      const boundaryGeoJSON = await response.json();
      if (!boundaryGeoJSON) {
        showStatus('No boundary defined. Please define a red line boundary first.', 'error');
        setTimeout(() => { window.location.href = '/define-red-line-boundary'; }, 2000);
        return;
      }
      const ok = client.loadBoundaryGeoJSON(boundaryGeoJSON);
      if (!ok) {
        showStatus('Error loading boundary. Please try again.', 'error');
      }
    } catch (e) {
      showStatus('Error loading boundary. Please try again.', 'error');
    }
  }

  function initHabitatAttribution() {
    if (!window.HabitatAttribution || !window.HabitatAttribution.init) return;
    window.HabitatAttribution.init({
      mapClient: client,
      onSelectionChange: (index) => {
        if (index >= 0) client.selectParcel(index);
        else client.deselectParcel();
      },
      onValidationChange: () => {
        updateSaveParcelsButtonState();
      }
    });

    const deselectBtn = document.getElementById('deselect-parcel-btn');
    if (deselectBtn) {
      deselectBtn.addEventListener('click', (e) => {
        e.preventDefault();
        client.deselectParcel();
      });
    }
  }

  function setupUIControls() {
    const startButton = document.getElementById('start-drawing');
    const cancelButton = document.getElementById('cancel-drawing');
    const clearButton = document.getElementById('clear-polygon');
    const exportButton = document.getElementById('export-geojson');
    const snapCheckbox = document.getElementById('snap-enabled');
    const saveBoundaryButton = document.getElementById('save-boundary');
    const saveParcelsButton = document.getElementById('save-parcels');

    const startFillButton = document.getElementById('start-fill');
    const cancelFillButton = document.getElementById('cancel-fill');
    const confirmFillButton = document.getElementById('confirm-fill');

    const startFillParcelButton = document.getElementById('start-fill-parcel');
    const finishFillParcelButton = document.getElementById('finish-fill-parcel');

    const startSliceButton = document.getElementById('start-slice');
    const cancelSliceButton = document.getElementById('cancel-slice');

    if (startButton) {
      startButton.addEventListener('click', (e) => {
        e.preventDefault();
        if (client.getDebugInfo().fill.active) client.cancelFill();
        client.startDrawing();
        if (startButton.parentElement) startButton.parentElement.style.display = 'none';
        if (startFillButton && startFillButton.parentElement) startFillButton.parentElement.style.display = 'none';
        if (startFillParcelButton && startFillParcelButton.parentElement) startFillParcelButton.parentElement.style.display = 'none';
        if (startSliceButton && startSliceButton.parentElement) startSliceButton.parentElement.style.display = 'none';
        if (cancelButton && cancelButton.parentElement) cancelButton.parentElement.style.display = 'block';
        showStatus('Drawing mode active - click to place vertices', 'info');
      });
    }

    if (cancelButton) {
      cancelButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.cancelDrawing();
        if (startButton && startButton.parentElement) startButton.parentElement.style.display = 'block';
        if (startFillButton && startFillButton.parentElement) startFillButton.parentElement.style.display = 'block';
        if (startFillParcelButton && startFillParcelButton.parentElement) startFillParcelButton.parentElement.style.display = 'block';
        if (startSliceButton && startSliceButton.parentElement) startSliceButton.parentElement.style.display = 'block';
        if (cancelButton.parentElement) cancelButton.parentElement.style.display = 'none';
        showStatus('Drawing cancelled', 'info');
      });
    }

    if (clearButton) {
      clearButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.clearBoundary();
        if (startButton && startButton.parentElement) startButton.parentElement.style.display = 'block';
        if (startFillButton && startFillButton.parentElement) startFillButton.parentElement.style.display = 'block';
        showStatus('Polygon cleared - draw a new one', 'info');
      });
    }

    if (startFillButton) {
      startFillButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.startFillBoundary();
        if (cancelFillButton && cancelFillButton.parentElement) cancelFillButton.parentElement.style.display = 'block';
        if (confirmFillButton && confirmFillButton.parentElement) confirmFillButton.parentElement.style.display = 'none';
        if (startFillButton.parentElement) startFillButton.parentElement.style.display = 'none';
        if (startButton && startButton.parentElement) startButton.parentElement.style.display = 'none';
        const info = document.getElementById('fill-selection-info');
        if (info) info.style.display = 'block';
        showStatus('Fill mode active - click on polygons to select them', 'info');
      });
    }

    if (cancelFillButton) {
      cancelFillButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.cancelFill();
        if (cancelFillButton.parentElement) cancelFillButton.parentElement.style.display = 'none';
        if (confirmFillButton && confirmFillButton.parentElement) confirmFillButton.parentElement.style.display = 'none';
        if (startFillButton && startFillButton.parentElement) startFillButton.parentElement.style.display = 'block';
        if (startButton && startButton.parentElement) startButton.parentElement.style.display = 'block';
        const info = document.getElementById('fill-selection-info');
        if (info) info.style.display = 'none';
        showStatus('Fill mode cancelled', 'info');
      });
    }

    if (confirmFillButton) {
      confirmFillButton.addEventListener('click', (e) => {
        e.preventDefault();
        const ok = client.confirmFill();
        if (ok) {
          if (cancelFillButton && cancelFillButton.parentElement) cancelFillButton.parentElement.style.display = 'none';
          if (confirmFillButton.parentElement) confirmFillButton.parentElement.style.display = 'none';
          if (startFillButton && startFillButton.parentElement) startFillButton.parentElement.style.display = 'block';
          if (startButton && startButton.parentElement) startButton.parentElement.style.display = 'block';
          const info = document.getElementById('fill-selection-info');
          if (info) info.style.display = 'none';
        }
      });
    }

    client.on('fill:selectionChanged', (e) => {
      if (confirmFillButton && confirmFillButton.parentElement) {
        confirmFillButton.parentElement.style.display = e.selectedCount > 0 ? 'block' : 'none';
      }
    });

    if (startFillParcelButton) {
      startFillParcelButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.startFillParcels();
        if (finishFillParcelButton && finishFillParcelButton.parentElement) finishFillParcelButton.parentElement.style.display = 'block';
        if (startFillParcelButton.parentElement) startFillParcelButton.parentElement.style.display = 'none';
        if (startButton && startButton.parentElement) startButton.parentElement.style.display = 'none';
        if (startSliceButton && startSliceButton.parentElement) startSliceButton.parentElement.style.display = 'none';
        showStatus('Fill mode active - click on OS polygons within the boundary to add as parcels', 'info');
      });
    }

    if (finishFillParcelButton) {
      finishFillParcelButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.cancelFill();
        if (finishFillParcelButton.parentElement) finishFillParcelButton.parentElement.style.display = 'none';
        if (startFillParcelButton && startFillParcelButton.parentElement) startFillParcelButton.parentElement.style.display = 'block';
        if (startButton && startButton.parentElement) startButton.parentElement.style.display = 'block';
        if (startSliceButton && startSliceButton.parentElement) startSliceButton.parentElement.style.display = 'block';
        showStatus('Fill mode finished', 'info');
      });
    }

    if (startSliceButton) {
      startSliceButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.startSlice();
        if (startSliceButton.parentElement) startSliceButton.parentElement.style.display = 'none';
        if (cancelSliceButton && cancelSliceButton.parentElement) cancelSliceButton.parentElement.style.display = 'block';
      });
    }

    if (cancelSliceButton) {
      cancelSliceButton.addEventListener('click', (e) => {
        e.preventDefault();
        client.cancelSlice();
        if (cancelSliceButton.parentElement) cancelSliceButton.parentElement.style.display = 'none';
        if (startSliceButton && startSliceButton.parentElement) startSliceButton.parentElement.style.display = 'block';
      });
    }

    if (exportButton) {
      exportButton.addEventListener('click', (e) => {
        e.preventDefault();
        let exportData;
        if (mode === 'habitat-parcels') {
          exportData = client.exportParcelsGeoJSON({ dataProjection: 'EPSG:4326' });
          if (!exportData || !exportData.features.length) {
            showStatus('No parcels to export. Draw parcels first.', 'warning');
            return;
          }
        } else {
          exportData = client.exportBoundaryGeoJSON({ dataProjection: 'EPSG:4326' });
          if (!exportData) {
            showStatus('No polygon to export. Draw a polygon first.', 'warning');
            return;
          }
        }

        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = (mode === 'habitat-parcels' ? 'parcels-' : 'boundary-') + Date.now() + '.geojson';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showStatus('GeoJSON exported successfully', 'success');
      });
    }

    if (snapCheckbox) {
      snapCheckbox.addEventListener('change', (e) => {
        client.setSnappingEnabled(e.target.checked);
        showStatus(e.target.checked ? 'OS feature snapping enabled' : 'OS feature snapping disabled', 'info');
      });
    }

    const snapBoundaryVerticesCheckbox = document.getElementById('snap-boundary-vertices');
    if (snapBoundaryVerticesCheckbox) {
      snapBoundaryVerticesCheckbox.addEventListener('change', (e) => {
        client.setSnapToBoundaryVertices(e.target.checked);
        showStatus(e.target.checked ? 'Boundary corner snapping enabled' : 'Boundary corner snapping disabled', 'info');
      });
    }

    const snapBoundaryEdgesCheckbox = document.getElementById('snap-boundary-edges');
    if (snapBoundaryEdgesCheckbox) {
      snapBoundaryEdgesCheckbox.addEventListener('change', (e) => {
        client.setSnapToBoundaryEdges(e.target.checked);
        showStatus(e.target.checked ? 'Boundary edge snapping enabled' : 'Boundary edge snapping disabled', 'info');
      });
    }

    const snapParcelVerticesCheckbox = document.getElementById('snap-parcel-vertices');
    if (snapParcelVerticesCheckbox) {
      snapParcelVerticesCheckbox.addEventListener('change', (e) => {
        client.setSnapToParcelVertices(e.target.checked);
        showStatus(e.target.checked ? 'Parcel corner snapping enabled' : 'Parcel corner snapping disabled', 'info');
      });
    }

    const snapParcelEdgesCheckbox = document.getElementById('snap-parcel-edges');
    if (snapParcelEdgesCheckbox) {
      snapParcelEdgesCheckbox.addEventListener('change', (e) => {
        client.setSnapToParcelEdges(e.target.checked);
        showStatus(e.target.checked ? 'Parcel edge snapping enabled' : 'Parcel edge snapping disabled', 'info');
      });
    }

    if (saveBoundaryButton) {
      saveBoundaryButton.addEventListener('click', async (e) => {
        e.preventDefault();
        if (saveBoundaryButton.classList.contains('disabled')) return;
        try {
          saveBoundaryButton.classList.add('disabled');
          saveBoundaryButton.textContent = 'Saving...';
          const result = await client.saveBoundary();
          if (result.ok && result.response && result.response.success) {
            showStatus('Boundary saved successfully! Redirecting...', 'success');
            setTimeout(() => { window.location.href = result.response.redirect; }, 1000);
          } else {
            throw new Error('Save failed');
          }
        } catch (err) {
          console.error('Error saving boundary:', err);
          showStatus('Error saving boundary. Please try again.', 'error');
          saveBoundaryButton.classList.remove('disabled');
          saveBoundaryButton.textContent = 'Save Boundary';
        }
      });
    }

    if (saveParcelsButton) {
      saveParcelsButton.addEventListener('click', async (e) => {
        e.preventDefault();
        if (saveParcelsButton.classList.contains('disabled')) return;
        if (client.getParcelCount() === 0) {
          showStatus('No parcels to save. Draw at least one parcel.', 'warning');
          return;
        }

        const geomValidation = client.validateAllParcels();
        if (!geomValidation.valid) {
          showStatus('Cannot save parcels:\n• ' + geomValidation.errors.join('\n• '), 'error');
          return;
        }

        if (window.HabitatAttribution && window.HabitatAttribution.validateAllParcels) {
          const attrValidation = window.HabitatAttribution.validateAllParcels();
          if (!attrValidation.valid) {
            showStatus('Cannot save parcels: baseline habitat data is incomplete.', 'error');
            updateSaveParcelsButtonState();
            return;
          }
        }

        try {
          saveParcelsButton.classList.add('disabled');
          saveParcelsButton.textContent = 'Saving...';
          const result = await client.saveParcels();
          if (result.ok && result.response && result.response.success) {
            showStatus('Parcels saved successfully! Redirecting...', 'success');
            setTimeout(() => { window.location.href = result.response.redirect; }, 1000);
          } else {
            throw new Error('Save failed');
          }
        } catch (err) {
          console.error('Error saving parcels:', err);
          showStatus('Error saving parcels. Please try again.', 'error');
          saveParcelsButton.classList.remove('disabled');
          saveParcelsButton.textContent = 'Save Parcels';
        }
      });
    }
  }

  function updateZoomUI(zoom, minZoomForSnap) {
    const zoomDisplay = document.getElementById('zoom-display');
    const snapStatus = document.getElementById('snap-status');
    if (!zoomDisplay) return;
    const roundedZoom = Math.round(zoom * 10) / 10;
    zoomDisplay.textContent = `Zoom: ${roundedZoom}`;
    if (zoom >= minZoomForSnap) {
      zoomDisplay.className = 'govuk-tag govuk-tag--green';
      if (snapStatus) {
        snapStatus.textContent = 'Snapping enabled';
        snapStatus.style.color = '#00703c';
        snapStatus.style.fontWeight = 'bold';
      }
    } else {
      zoomDisplay.className = 'govuk-tag';
      if (snapStatus) {
        snapStatus.textContent = `Snapping disabled (zoom to level ${minZoomForSnap}+)`;
        snapStatus.style.color = '#505a5f';
        snapStatus.style.fontWeight = 'normal';
      }
    }
  }

  function renderBoundaryArea() {
    const areaDisplay = document.getElementById('area-display');
    const areaValue = document.getElementById('area-value');
    const areaAcres = document.getElementById('area-acres');
    if (!areaDisplay || !areaValue || !areaAcres) return;
    const sqm = client.boundaryAreaSqm;
    if (!sqm || sqm <= 0) {
      areaDisplay.style.display = 'none';
      return;
    }
    const hectares = sqm / 10000;
    areaValue.textContent = hectares.toFixed(2);
    areaAcres.textContent = (sqm / 4046.86).toFixed(2);
    areaDisplay.style.display = 'block';
  }

  function renderSketchArea(areaSqm) {
    const areaDisplay = document.getElementById('area-display');
    const areaValue = document.getElementById('area-value');
    const areaAcres = document.getElementById('area-acres');
    if (!areaDisplay || !areaValue || !areaAcres) return;
    if (!areaSqm || areaSqm <= 0) {
      areaDisplay.style.display = 'none';
      return;
    }
    const hectares = areaSqm / 10000;
    areaValue.textContent = hectares.toFixed(2);
    areaAcres.textContent = (areaSqm / 4046.86).toFixed(2);
    areaDisplay.style.display = 'block';
  }

  function renderHabitatTotals() {
    if (mode !== 'habitat-parcels') return;
    const boundaryArea = document.getElementById('boundary-area');
    const totalEl = document.getElementById('total-area');
    const remainingEl = document.getElementById('remaining-area-value');
    const warningEl = document.getElementById('remaining-area-warning');

    if (boundaryArea) {
      boundaryArea.textContent = (client.boundaryAreaSqm / 10000).toFixed(2);
    }
    if (totalEl) {
      totalEl.textContent = (client.parcelsTotalAreaSqm / 10000).toFixed(2);
    }
    if (remainingEl) {
      const remaining = (client.boundaryAreaSqm - client.parcelsTotalAreaSqm) / 10000;
      remainingEl.textContent = remaining.toFixed(2);
      remainingEl.style.color = remaining <= 0 ? (remaining < 0 ? '#d4351c' : '#00703c') : '#d4351c';
      if (warningEl) warningEl.style.display = remaining < 0 ? 'block' : 'none';
    }
  }

  function updateSaveParcelsButtonState() {
    const saveBtn = document.getElementById('save-parcels');
    if (!saveBtn) return;
    if (client.getParcelCount() === 0) {
      saveBtn.classList.add('disabled');
      return;
    }

    let allValid = true;
    if (window.HabitatAttribution && window.HabitatAttribution.validateAllParcels) {
      allValid = window.HabitatAttribution.validateAllParcels().valid;
    }
    if (allValid) saveBtn.classList.remove('disabled');
    else saveBtn.classList.add('disabled');
  }
});

/**
 * Show status message
 */
function showStatus(message, type) {
  const statusMessage = document.getElementById('status-message');
  const statusText = document.getElementById('status-text');
  const statusTitle = document.getElementById('status-title');

  if (!statusMessage || !statusText || !statusTitle) {
    console.log(`[${type}] ${message}`);
    return;
  }

  statusText.textContent = message;

  let title = 'Information';
  let ariaLive = 'polite';

  statusMessage.classList.remove('govuk-notification-banner--success');

  if (type === 'success') {
    title = 'Success';
    statusMessage.classList.add('govuk-notification-banner--success');
    ariaLive = 'polite';
  } else if (type === 'warning') {
    title = 'Important';
    ariaLive = 'assertive';
  } else if (type === 'error') {
    title = 'Error';
    ariaLive = 'assertive';
  }

  statusTitle.textContent = title;
  statusMessage.setAttribute('aria-live', ariaLive);
  statusMessage.setAttribute('aria-atomic', 'true');
  statusMessage.style.display = 'block';

  const hideDelay = type === 'error' ? 8000 : 5000;
  setTimeout(() => {
    statusMessage.style.display = 'none';
  }, hideDelay);
}

