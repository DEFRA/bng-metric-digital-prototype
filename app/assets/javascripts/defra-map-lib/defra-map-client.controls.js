//
// DefraMapClient in-map controls overlay (prototype augmentation)
// Renders map-interaction controls *inside* the map container.
// Includes hamburger menu drawer with icons, zoom-based tool disabling, save button and help modal.
//

(function(window) {
  'use strict';

  const DefraMapClient = window.DefraMapClient;
  if (!DefraMapClient) {
    throw new Error('defra-map-client.controls.js requires window.DefraMapClient to be loaded first.');
  }

  // SVG Icons
  const ICONS = {
    // Hamburger menu icon (3 lines)
    menu: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>`,
    // Close icon (X)
    close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    // Draw/Pen icon
    draw: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19l7-7 3 3-7 7-3-3z"></path><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"></path><path d="M2 2l7.586 7.586"></path><circle cx="11" cy="11" r="2"></circle></svg>`,
    // Fill/Paint bucket icon
    fill: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 11l-8-8-8.6 8.6a2 2 0 0 0 0 2.8l5.2 5.2c.8.8 2 .8 2.8 0L19 11z"></path><path d="M5 2l5 5"></path><path d="M2 13h15"></path><path d="M22 20.5c0 .8-.7 1.5-1.5 1.5s-1.5-.7-1.5-1.5c0-1 1.5-2.5 1.5-2.5s1.5 1.5 1.5 2.5z"></path></svg>`,
    // Slice/Knife icon
    slice: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 504.376 504.376" fill="currentColor" aria-hidden="true"><path d="M501.576,141.588l-92.4-91.6c-1.6-1.6-3.6-2.4-5.6-2.4s-4,0.8-5.6,2.4l-124.8,124.4c0,0,0,0,0,0.4c0,0-0.4,0-0.4,0.4l-270.4,268.4c-2.8,2.8-3.2,6.8-0.8,10c1.6,2,4,3.2,6.4,3.2c1.2,0,2.4-0.4,3.2-0.8l313.6-146.8c0.8-0.4,1.6-0.8,2.4-1.6l34.4-34.4l4,3.6c1.6,1.6,3.6,2.4,5.6,2.4s4-0.8,5.6-2.4l125.2-124.4c1.6-1.6,2.4-3.6,2.4-5.6S503.176,143.188,501.576,141.588z M316.776,295.988l-271.6,127.2l232.8-231.6l71.6,71.2L316.776,295.988z"/></svg>`,
    // Magnet icon for snapping
    magnet: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l-4-4 4-4"></path><path d="M18 15l4-4-4-4"></path><path d="M2 11h8c2.2 0 4-1.8 4-4V4"></path><path d="M22 11h-8c-2.2 0-4-1.8-4-4V4"></path></svg>`,
    // Corner/Vertex snap icon (crosshair on corner)
    cornerSnap: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3h7v7H3z"></path><circle cx="6.5" cy="6.5" r="2"></circle><path d="M14 3h7v4"></path><path d="M21 14v7h-4"></path><path d="M10 21H3v-7"></path></svg>`,
    // Edge snap icon (line with snap point)
    edgeSnap: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h18"></path><circle cx="12" cy="12" r="3"></circle><path d="M3 3v6"></path><path d="M21 3v6"></path><path d="M3 15v6"></path><path d="M21 15v6"></path></svg>`,
    // Cancel icon
    cancel: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`,
    // Confirm/Check icon
    confirm: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    // Finish icon
    finish: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    // Save icon (floppy disk)
    save: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
    // Help icon (question mark in circle)
    help: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`
  };

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

    // Track zoom state for disabling tools
    let currentZoom = this.getZoom() || 0;
    let toolsEnabled = currentZoom >= this._minZoomForSnap;
    let drawerOpen = false;

    // Container
    const root = document.createElement('div');
    root.className = 'defra-map-controls';
    root.setAttribute('role', 'region');
    root.setAttribute('aria-label', 'Map drawing tools');

    // Hamburger button
    const hamburgerBtn = document.createElement('button');
    hamburgerBtn.type = 'button';
    hamburgerBtn.className = 'defra-map-controls__hamburger';
    hamburgerBtn.setAttribute('aria-label', 'Open drawing tools menu');
    hamburgerBtn.setAttribute('aria-expanded', 'false');
    hamburgerBtn.setAttribute('aria-controls', 'defra-map-drawer');
    hamburgerBtn.innerHTML = ICONS.menu;
    root.appendChild(hamburgerBtn);

    // Drawer panel
    const drawer = document.createElement('div');
    drawer.id = 'defra-map-drawer';
    drawer.className = 'defra-map-controls__drawer';
    drawer.setAttribute('role', 'dialog');
    drawer.setAttribute('aria-label', 'Drawing tools');
    drawer.setAttribute('aria-hidden', 'true');
    root.appendChild(drawer);

    // Drawer header with close button
    const drawerHeader = document.createElement('div');
    drawerHeader.className = 'defra-map-controls__drawer-header';
    
    const drawerTitle = document.createElement('span');
    drawerTitle.className = 'defra-map-controls__drawer-title';
    drawerTitle.textContent = 'Drawing Tools';
    drawerHeader.appendChild(drawerTitle);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'defra-map-controls__close';
    closeBtn.setAttribute('aria-label', 'Close drawing tools menu');
    closeBtn.innerHTML = ICONS.close;
    drawerHeader.appendChild(closeBtn);

    drawer.appendChild(drawerHeader);

    // Zoom warning message
    const zoomWarning = document.createElement('div');
    zoomWarning.className = 'defra-map-controls__zoom-warning';
    zoomWarning.setAttribute('role', 'alert');
    zoomWarning.innerHTML = `<span class="defra-map-controls__zoom-warning-icon">⚠</span> Zoom in to level ${this._minZoomForSnap} to enable tools`;
    drawer.appendChild(zoomWarning);

    // Drawer content
    const drawerContent = document.createElement('div');
    drawerContent.className = 'defra-map-controls__drawer-content';
    drawer.appendChild(drawerContent);

    // Tool buttons section
    const toolsSection = document.createElement('div');
    toolsSection.className = 'defra-map-controls__section';
    drawerContent.appendChild(toolsSection);

    // Helper to create icon button
    const addIconButton = (icon, label, action, extraClass) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `defra-map-controls__icon-btn ${extraClass || ''}`.trim();
      btn.setAttribute('data-action', action);
      btn.setAttribute('aria-label', label);
      btn.setAttribute('title', label);
      btn.innerHTML = icon;
      return btn;
    };

    const setToggleState = (btn, on) => {
      const isOn = !!on;
      btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      if (isOn) btn.classList.add('defra-map-controls__toggle--on');
      else btn.classList.remove('defra-map-controls__toggle--on');
    };

    const addSnapToggle = (icon, labelText, dataKey, on, extraClass) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `defra-map-controls__snap-btn ${extraClass || ''}`.trim();
      btn.setAttribute('data-snap', dataKey);
      btn.setAttribute('aria-label', labelText);
      btn.setAttribute('title', labelText);
      btn.innerHTML = `<span class="defra-map-controls__snap-icon">${icon}</span><span class="defra-map-controls__snap-label">${labelText}</span>`;
      setToggleState(btn, on);
      return btn;
    };

    // Draw tools row
    const toolRow = document.createElement('div');
    toolRow.className = 'defra-map-controls__tool-row';
    toolsSection.appendChild(toolRow);

    // Draw controls
    let btnDraw = null;
    let btnCancelDraw = null;

    if (tools.includes('draw')) {
      const drawLabel = cfg.drawLabel || (this._mode === 'habitat-parcels' ? 'Draw parcel' : 'Draw boundary');
      btnDraw = addIconButton(ICONS.draw, drawLabel, 'draw');
      btnCancelDraw = addIconButton(ICONS.cancel, 'Cancel drawing', 'cancel-draw', 'defra-map-controls__icon-btn--warning');
      btnCancelDraw.style.display = 'none';

      toolRow.appendChild(btnDraw);
      toolRow.appendChild(btnCancelDraw);
    }

    // Fill boundary controls
    let btnFillBoundary = null;
    let btnConfirmFill = null;
    let btnCancelFill = null;

    if (tools.includes('fill-boundary')) {
      btnFillBoundary = addIconButton(ICONS.fill, 'Fill boundary', 'fill-boundary');
      btnConfirmFill = addIconButton(ICONS.confirm, 'Confirm selection', 'confirm-fill', 'defra-map-controls__icon-btn--primary');
      btnCancelFill = addIconButton(ICONS.cancel, 'Cancel fill', 'cancel-fill', 'defra-map-controls__icon-btn--warning');

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
      btnFillParcels = addIconButton(ICONS.fill, 'Fill parcel', 'fill-parcels');
      btnFinishFillParcels = addIconButton(ICONS.finish, 'Finish fill', 'finish-fill-parcels', 'defra-map-controls__icon-btn--warning');
      btnFinishFillParcels.style.display = 'none';

      toolRow.appendChild(btnFillParcels);
      toolRow.appendChild(btnFinishFillParcels);
    }

    // Slice controls
    let btnSlice = null;
    let btnCancelSlice = null;

    if (tools.includes('slice')) {
      btnSlice = addIconButton(ICONS.slice, 'Slice polygon', 'slice');
      btnCancelSlice = addIconButton(ICONS.cancel, 'Cancel slice', 'cancel-slice', 'defra-map-controls__icon-btn--warning');
      btnCancelSlice.style.display = 'none';

      toolRow.appendChild(btnSlice);
      toolRow.appendChild(btnCancelSlice);
    }

    // Snapping toggles section
    const snapButtons = {};

    if (snapToggles.length > 0) {
      const snapSection = document.createElement('div');
      snapSection.className = 'defra-map-controls__section defra-map-controls__section--snapping';
      drawerContent.appendChild(snapSection);

      const snapTitle = document.createElement('div');
      snapTitle.className = 'defra-map-controls__section-title';
      snapTitle.textContent = 'Snapping';
      snapSection.appendChild(snapTitle);

      const snapList = document.createElement('div');
      snapList.className = 'defra-map-controls__snap-list';
      snapSection.appendChild(snapList);

      if (snapToggles.includes('os')) {
        const btn = addSnapToggle(ICONS.magnet, 'Snap to OS features', 'os', this._snappingEnabled);
        snapButtons.os = btn;
        snapList.appendChild(btn);
      }

      if (snapToggles.includes('boundary-vertices')) {
        const btn = addSnapToggle(ICONS.cornerSnap, 'Snap to boundary corners', 'boundary-vertices', this._snapToBoundaryVertices);
        snapButtons['boundary-vertices'] = btn;
        snapList.appendChild(btn);
      }
      if (snapToggles.includes('boundary-edges')) {
        const btn = addSnapToggle(ICONS.edgeSnap, 'Snap to boundary edges', 'boundary-edges', this._snapToBoundaryEdges);
        snapButtons['boundary-edges'] = btn;
        snapList.appendChild(btn);
      }
      if (snapToggles.includes('parcel-vertices')) {
        const btn = addSnapToggle(ICONS.cornerSnap, 'Snap to parcel corners', 'parcel-vertices', this._snapToParcelVertices);
        snapButtons['parcel-vertices'] = btn;
        snapList.appendChild(btn);
      }
      if (snapToggles.includes('parcel-edges')) {
        const btn = addSnapToggle(ICONS.edgeSnap, 'Snap to parcel edges', 'parcel-edges', this._snapToParcelEdges);
        snapButtons['parcel-edges'] = btn;
        snapList.appendChild(btn);
      }
    }

    // Actions section (Save + Help)
    const actionsSection = document.createElement('div');
    actionsSection.className = 'defra-map-controls__section defra-map-controls__section--actions';
    drawerContent.appendChild(actionsSection);

    const actionsList = document.createElement('div');
    actionsList.className = 'defra-map-controls__actions-list';
    actionsSection.appendChild(actionsList);

    // Save button
    let btnSave = null;
    const saveLabel = this._mode === 'habitat-parcels' ? 'Save parcels' : 'Save boundary';
    btnSave = document.createElement('button');
    btnSave.type = 'button';
    btnSave.className = 'defra-map-controls__action-btn defra-map-controls__action-btn--save defra-map-controls__action-btn--disabled';
    btnSave.setAttribute('data-action', 'save');
    btnSave.setAttribute('aria-label', saveLabel);
    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="defra-map-controls__action-icon">${ICONS.save}</span><span class="defra-map-controls__action-label">${saveLabel}</span>`;
    actionsList.appendChild(btnSave);

    // Help button
    const btnHelp = document.createElement('button');
    btnHelp.type = 'button';
    btnHelp.className = 'defra-map-controls__action-btn';
    btnHelp.setAttribute('data-action', 'help');
    btnHelp.setAttribute('aria-label', 'Show help');
    btnHelp.innerHTML = `<span class="defra-map-controls__action-icon">${ICONS.help}</span><span class="defra-map-controls__action-label">Help</span>`;
    actionsList.appendChild(btnHelp);

    // Attach
    target.appendChild(root);
    this._controlsContainer = root;
    this._saveButton = btnSave;

    // Drawer open/close functions
    const openDrawer = () => {
      drawerOpen = true;
      drawer.classList.add('defra-map-controls__drawer--open');
      drawer.setAttribute('aria-hidden', 'false');
      hamburgerBtn.setAttribute('aria-expanded', 'true');
      hamburgerBtn.classList.add('defra-map-controls__hamburger--active');
    };

    const closeDrawer = () => {
      drawerOpen = false;
      drawer.classList.remove('defra-map-controls__drawer--open');
      drawer.setAttribute('aria-hidden', 'true');
      hamburgerBtn.setAttribute('aria-expanded', 'false');
      hamburgerBtn.classList.remove('defra-map-controls__hamburger--active');
    };

    // Hamburger click handler
    hamburgerBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (drawerOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    // Close button handler
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeDrawer();
    });

    // Modal handling
    const openHelpModal = () => {
      const modal = document.getElementById('help-modal');
      if (modal) {
        modal.setAttribute('aria-hidden', 'false');
        modal.classList.add('defra-modal--open');
        document.body.classList.add('defra-modal-open');
        // Focus first focusable element
        const closeBtn = modal.querySelector('.defra-modal__close');
        if (closeBtn) closeBtn.focus();
      }
    };

    const closeHelpModal = () => {
      const modal = document.getElementById('help-modal');
      if (modal) {
        modal.setAttribute('aria-hidden', 'true');
        modal.classList.remove('defra-modal--open');
        document.body.classList.remove('defra-modal-open');
      }
    };

    // Set up modal close handlers
    const modal = document.getElementById('help-modal');
    if (modal) {
      modal.querySelectorAll('[data-close-modal]').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          closeHelpModal();
        });
      });
      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('defra-modal--open')) {
          closeHelpModal();
        }
      });
    }

    // Handle all tool and snap clicks directly on the drawer content
    drawerContent.addEventListener('click', (e) => {
      e.stopPropagation();

      // Handle action clicks (save, help) - these work regardless of zoom
      const actionEl = e.target && e.target.closest ? e.target.closest('[data-action]') : null;
      if (actionEl) {
        e.preventDefault();
        const action = actionEl.getAttribute('data-action');
        
        if (action === 'help') {
          openHelpModal();
          closeDrawer();
          return;
        }
        
        if (action === 'save' && !actionEl.disabled) {
          // Emit save event for page-specific handling
          this._emitter.emit('controls:save', {});
          return;
        }
      }
      
      if (!toolsEnabled) return;

      // Handle snap toggle clicks
      const snapEl = e.target && e.target.closest ? e.target.closest('[data-snap]') : null;
      if (snapEl) {
        e.preventDefault();
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

      // Handle tool action clicks (require zoom)
      if (actionEl) {
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
      }
    });

    // Stop propagation on drawer header clicks
    drawerHeader.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Update tool disabled state based on zoom
    const updateToolsEnabledState = () => {
      const zoom = this.getZoom() || 0;
      currentZoom = zoom;
      toolsEnabled = zoom >= this._minZoomForSnap;

      // Show/hide zoom warning
      if (toolsEnabled) {
        zoomWarning.classList.add('defra-map-controls__zoom-warning--hidden');
        drawerContent.classList.remove('defra-map-controls__drawer-content--disabled');
      } else {
        zoomWarning.classList.remove('defra-map-controls__zoom-warning--hidden');
        drawerContent.classList.add('defra-map-controls__drawer-content--disabled');
      }

      // Disable/enable all tool buttons
      const allToolButtons = toolsSection.querySelectorAll('.defra-map-controls__icon-btn');
      allToolButtons.forEach(btn => {
        btn.disabled = !toolsEnabled;
        if (!toolsEnabled) {
          btn.classList.add('defra-map-controls__icon-btn--disabled');
        } else {
          btn.classList.remove('defra-map-controls__icon-btn--disabled');
        }
      });

      // Also disable/enable snap buttons
      Object.values(snapButtons).forEach(btn => {
        btn.disabled = !toolsEnabled;
        if (!toolsEnabled) {
          btn.classList.add('defra-map-controls__snap-btn--disabled');
        } else {
          btn.classList.remove('defra-map-controls__snap-btn--disabled');
        }
      });
    };

    // Wire handlers for button state updates
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

    // Listen for view changes to update tool enabled state
    this.on('view:changed', () => {
      updateToolsEnabledState();
    });

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

    // Save button state update
    const updateSaveButton = (enabled) => {
      if (!btnSave) return;
      btnSave.disabled = !enabled;
      if (enabled) {
        btnSave.classList.remove('defra-map-controls__action-btn--disabled');
      } else {
        btnSave.classList.add('defra-map-controls__action-btn--disabled');
      }
    };

    // Expose save button control
    this.setSaveEnabled = updateSaveButton;

    updateButtons();
    updateSnapButtons();
    updateToolsEnabledState();
  };
})(window);
