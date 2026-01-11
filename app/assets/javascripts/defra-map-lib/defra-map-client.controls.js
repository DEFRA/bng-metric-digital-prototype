//
// DefraMapClient in-map controls overlay (prototype augmentation)
// Renders map-interaction controls *inside* the map container.
//

(function(window) {
  'use strict';

  const DefraMapClient = window.DefraMapClient;
  if (!DefraMapClient) {
    throw new Error('defra-map-client.controls.js requires window.DefraMapClient to be loaded first.');
  }

  function parseCsv(str) {
    if (!str) return [];
    return String(str)
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }

  DefraMapClient.prototype._setupInMapControls = function() {
    const cfg = this._controls || {};
    const enabled = cfg.enabled !== false;
    if (!enabled) return;

    const tools = parseCsv(cfg.tools);
    const snapToggles = parseCsv(cfg.snappingToggles);

    if (!tools.length && !snapToggles.length) {
      return;
    }

    const target = this._map && this._map.getTargetElement ? this._map.getTargetElement() : null;
    if (!target) return;

    // Container
    const root = document.createElement('div');
    root.className = 'defra-map-controls';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Map tools');

    const panel = document.createElement('div');
    panel.className = 'defra-map-controls__panel';
    root.appendChild(panel);

    // Tool buttons
    const addButton = (text, action, extraClass) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `defra-map-controls__button ${extraClass || ''}`.trim();
      btn.setAttribute('data-action', action);
      btn.textContent = text;
      return btn;
    };

    const setToggleState = (btn, on) => {
      const isOn = !!on;
      btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      if (isOn) btn.classList.add('defra-map-controls__toggle--on');
      else btn.classList.remove('defra-map-controls__toggle--on');
    };

    const addToggle = (labelText, dataKey, on, extraClass) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `defra-map-controls__toggle ${extraClass || ''}`.trim();
      btn.setAttribute('data-snap', dataKey);
      btn.textContent = labelText;
      setToggleState(btn, on);
      return btn;
    };

    const toolRow = document.createElement('div');
    toolRow.className = 'defra-map-controls__row';
    panel.appendChild(toolRow);

    // Draw controls
    let btnDraw = null;
    let btnCancelDraw = null;

    if (tools.includes('draw')) {
      const drawLabel = cfg.drawLabel || (this._mode === 'habitat-parcels' ? 'Draw parcel' : 'Draw boundary');
      btnDraw = addButton(drawLabel, 'draw');
      btnCancelDraw = addButton('Cancel drawing', 'cancel-draw', 'defra-map-controls__button--warning');
      btnCancelDraw.style.display = 'none';

      toolRow.appendChild(btnDraw);
      toolRow.appendChild(btnCancelDraw);
    }

    // Fill boundary controls
    let btnFillBoundary = null;
    let btnConfirmFill = null;
    let btnCancelFill = null;

    if (tools.includes('fill-boundary')) {
      btnFillBoundary = addButton('Fill boundary', 'fill-boundary');
      btnConfirmFill = addButton('Confirm', 'confirm-fill', 'defra-map-controls__button--primary');
      btnCancelFill = addButton('Cancel', 'cancel-fill', 'defra-map-controls__button--warning');

      btnConfirmFill.style.display = 'none';
      btnCancelFill.style.display = 'none';

      toolRow.appendChild(btnFillBoundary);
      toolRow.appendChild(btnConfirmFill);
      toolRow.appendChild(btnCancelFill);
    }

    // Fill parcels controls
    let btnFillParcels = null;
    let btnFinishFillParcels = null;

    if (tools.includes('fill-parcels')) {
      btnFillParcels = addButton('Fill parcel', 'fill-parcels');
      btnFinishFillParcels = addButton('Finish fill', 'finish-fill-parcels', 'defra-map-controls__button--warning');
      btnFinishFillParcels.style.display = 'none';

      toolRow.appendChild(btnFillParcels);
      toolRow.appendChild(btnFinishFillParcels);
    }

    // Slice controls
    let btnSlice = null;
    let btnCancelSlice = null;

    if (tools.includes('slice')) {
      btnSlice = addButton('Slice', 'slice');
      btnCancelSlice = addButton('Cancel slice', 'cancel-slice', 'defra-map-controls__button--warning');
      btnCancelSlice.style.display = 'none';

      toolRow.appendChild(btnSlice);
      toolRow.appendChild(btnCancelSlice);
    }

    // Snapping toggles
    const snapButtons = {};
    const otherSnapToggles = snapToggles.filter((t) => t !== 'os');

    if (snapToggles.includes('os')) {
      const btn = addToggle('Snap to OS features', 'os', this._snappingEnabled, 'defra-map-controls__toggle--inline');
      snapButtons.os = btn;
      toolRow.appendChild(btn);
    }

    if (otherSnapToggles.length) {
      const snapPanel = document.createElement('div');
      snapPanel.className = 'defra-map-controls__snap-panel';
      panel.appendChild(snapPanel);

      const snapTitle = document.createElement('div');
      snapTitle.className = 'defra-map-controls__snap-title';
      snapTitle.textContent = 'Snapping';
      snapPanel.appendChild(snapTitle);

      const snapList = document.createElement('div');
      snapList.className = 'defra-map-controls__snap-list';
      snapPanel.appendChild(snapList);

      if (snapToggles.includes('boundary-vertices')) {
        const btn = addToggle('Snap to boundary corners', 'boundary-vertices', this._snapToBoundaryVertices);
        snapButtons['boundary-vertices'] = btn;
        snapList.appendChild(btn);
      }
      if (snapToggles.includes('boundary-edges')) {
        const btn = addToggle('Snap to boundary edges', 'boundary-edges', this._snapToBoundaryEdges);
        snapButtons['boundary-edges'] = btn;
        snapList.appendChild(btn);
      }
      if (snapToggles.includes('parcel-vertices')) {
        const btn = addToggle('Snap to parcel corners', 'parcel-vertices', this._snapToParcelVertices);
        snapButtons['parcel-vertices'] = btn;
        snapList.appendChild(btn);
      }
      if (snapToggles.includes('parcel-edges')) {
        const btn = addToggle('Snap to parcel edges', 'parcel-edges', this._snapToParcelEdges);
        snapButtons['parcel-edges'] = btn;
        snapList.appendChild(btn);
      }
    }

    // Attach
    target.appendChild(root);
    this._controlsContainer = root;

    // Wire handlers
    const updateButtons = () => {
      const dbg = this.getDebugInfo ? this.getDebugInfo() : null;
      const fillActive = dbg && dbg.fill ? !!dbg.fill.active : false;
      const fillMode = dbg && dbg.fill ? dbg.fill.mode : null;
      const sliceActive = dbg && dbg.slice ? !!dbg.slice.active : false;
      const isDrawing = dbg && dbg.drawing ? !!dbg.drawing.isDrawing : false;

      if (btnDraw) {
        btnDraw.style.display = isDrawing ? 'none' : 'inline-flex';
        if (btnCancelDraw) btnCancelDraw.style.display = isDrawing ? 'inline-flex' : 'none';
      }

      if (btnFillBoundary) {
        const isFillBoundary = fillActive && fillMode === 'boundary';
        btnFillBoundary.style.display = isFillBoundary ? 'none' : 'inline-flex';
        if (btnCancelFill) btnCancelFill.style.display = isFillBoundary ? 'inline-flex' : 'none';
        if (btnConfirmFill && !isFillBoundary) btnConfirmFill.style.display = 'none';
      }

      if (btnFillParcels) {
        const isFillParcels = fillActive && fillMode === 'parcels';
        btnFillParcels.style.display = isFillParcels ? 'none' : 'inline-flex';
        if (btnFinishFillParcels) btnFinishFillParcels.style.display = isFillParcels ? 'inline-flex' : 'none';
      }

      if (btnSlice) {
        btnSlice.style.display = sliceActive ? 'none' : 'inline-flex';
        if (btnCancelSlice) btnCancelSlice.style.display = sliceActive ? 'inline-flex' : 'none';
      }
    };

    const updateSnapButtons = () => {
      if (snapButtons.os) setToggleState(snapButtons.os, this._snappingEnabled);
      if (snapButtons['boundary-vertices']) setToggleState(snapButtons['boundary-vertices'], this._snapToBoundaryVertices);
      if (snapButtons['boundary-edges']) setToggleState(snapButtons['boundary-edges'], this._snapToBoundaryEdges);
      if (snapButtons['parcel-vertices']) setToggleState(snapButtons['parcel-vertices'], this._snapToParcelVertices);
      if (snapButtons['parcel-edges']) setToggleState(snapButtons['parcel-edges'], this._snapToParcelEdges);
    };

    // Tool + snap actions
    root.addEventListener('click', (e) => {
      const actionEl = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      const snapEl = e.target && e.target.closest ? e.target.closest('[data-snap]') : null;

      if (!actionEl && !snapEl) return;
      e.preventDefault();

      if (snapEl && !actionEl) {
        const key = snapEl.getAttribute('data-snap');
        if (!key) return;

        if (key === 'os') this.setSnappingEnabled(!this._snappingEnabled);
        else if (key === 'boundary-vertices') this.setSnapToBoundaryVertices(!this._snapToBoundaryVertices);
        else if (key === 'boundary-edges') this.setSnapToBoundaryEdges(!this._snapToBoundaryEdges);
        else if (key === 'parcel-vertices') this.setSnapToParcelVertices(!this._snapToParcelVertices);
        else if (key === 'parcel-edges') this.setSnapToParcelEdges(!this._snapToParcelEdges);

        updateSnapButtons();
        return;
      }

      const action = actionEl.getAttribute('data-action');
      if (action === 'draw') {
        if (this._sliceActive) this.cancelSlice();
        if (this._fillActive) this.cancelFill();
        this.startDrawing();
        updateButtons();
      } else if (action === 'cancel-draw') {
        this.cancelDrawing();
        updateButtons();
      } else if (action === 'fill-boundary') {
        if (this._sliceActive) this.cancelSlice();
        if (this._isDrawing) this.cancelDrawing();
        this.startFillBoundary();
        updateButtons();
      } else if (action === 'confirm-fill') {
        const ok = this.confirmFill();
        if (ok) updateButtons();
      } else if (action === 'cancel-fill') {
        this.cancelFill();
        updateButtons();
      } else if (action === 'fill-parcels') {
        if (this._sliceActive) this.cancelSlice();
        if (this._isDrawing) this.cancelDrawing();
        this.startFillParcels();
        updateButtons();
      } else if (action === 'finish-fill-parcels') {
        this.cancelFill();
        updateButtons();
      } else if (action === 'slice') {
        if (this._fillActive) this.cancelFill();
        if (this._isDrawing) this.cancelDrawing();
        this.startSlice();
        updateButtons();
      } else if (action === 'cancel-slice') {
        this.cancelSlice();
        updateButtons();
      }
    });

    // Keep buttons in sync with tool state
    this.on('drawing:started', updateButtons);
    this.on('drawing:cancelled', updateButtons);
    this.on('drawing:completed', updateButtons);
    this.on('parcel:added', updateButtons);
    this.on('fill:started', updateButtons);
    this.on('fill:cancelled', updateButtons);
    this.on('fill:confirmed', updateButtons);
    this.on('slice:started', updateButtons);
    this.on('slice:cancelled', updateButtons);
    this.on('slice:completed', updateButtons);

    this.on('snapping:osFeaturesChanged', updateSnapButtons);
    this.on('snapping:boundaryVerticesChanged', updateSnapButtons);
    this.on('snapping:boundaryEdgesChanged', updateSnapButtons);
    this.on('snapping:parcelVerticesChanged', updateSnapButtons);
    this.on('snapping:parcelEdgesChanged', updateSnapButtons);

    // Confirm button only makes sense for boundary fill + with selection
    if (btnConfirmFill) {
      this.on('fill:selectionChanged', (ev) => {
        const dbg = this.getDebugInfo ? this.getDebugInfo() : null;
        const fillActive = dbg && dbg.fill ? !!dbg.fill.active : false;
        const fillMode = dbg && dbg.fill ? dbg.fill.mode : null;
        const isFillBoundary = fillActive && fillMode === 'boundary';
        btnConfirmFill.style.display = (isFillBoundary && ev.selectedCount > 0) ? 'inline-flex' : 'none';
      });
    }

    updateButtons();
    updateSnapButtons();
  };
})(window);

