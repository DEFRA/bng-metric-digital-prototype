//
// DefraMapClient in-map controls overlay (prototype augmentation)
// Renders map-interaction controls *inside* the map container.
// Includes hamburger menu drawer with icons, zoom-based tool disabling, save button and help modal.
// Floating action buttons for confirm/cancel appear bottom-right when tools are active.
//

;(function (window) {
  'use strict'

  const DefraMapClient = window.DefraMapClient
  if (!DefraMapClient) {
    throw new Error(
      'defra-map-client.controls.js requires window.DefraMapClient to be loaded first.'
    )
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
    cancel: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
    // Confirm/Check icon
    confirm: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
    // Finish icon
    finish: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`,
    // Save icon (floppy disk)
    save: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>`,
    // Help icon (question mark in circle)
    help: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`,
    // Trash/Remove icon
    remove: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`,
    // Hedgerow icon - stylized hedge/branch
    hedgerow: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20"/><path d="M8 6c-2 2-4 1-4 1s1 4 4 4"/><path d="M16 6c2 2 4 1 4 1s-1 4-4 4"/><path d="M8 14c-2 2-4 1-4 1s1 4 4 4"/><path d="M16 14c2 2 4 1 4 1s-1 4-4 4"/></svg>`,
    // Watercourse icon - wavy water lines
    watercourse: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>`
  }

  function parseCsv(str) {
    if (!str) return []
    return String(str)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  }

  DefraMapClient.prototype._setupInMapControls = function () {
    const cfg = this._controls || {}
    const enabled = cfg.enabled !== false
    if (!enabled) return

    const tools = parseCsv(cfg.tools)
    const snapToggles = parseCsv(cfg.snappingToggles)

    if (!tools.length && !snapToggles.length) {
      return
    }

    const target =
      this._map && this._map.getTargetElement
        ? this._map.getTargetElement()
        : null
    if (!target) return

    // Track zoom state for disabling tools
    let currentZoom = this.getZoom() || 0
    let toolsEnabled = currentZoom >= this._minZoomForSnap
    let drawerOpen = false

    // Container
    const root = document.createElement('div')
    root.className = 'defra-map-controls'
    root.setAttribute('role', 'region')
    root.setAttribute('aria-label', 'Map drawing tools')

    // Hamburger button
    const hamburgerBtn = document.createElement('button')
    hamburgerBtn.type = 'button'
    hamburgerBtn.className = 'defra-map-controls__hamburger'
    hamburgerBtn.setAttribute('aria-label', 'Open drawing tools menu')
    hamburgerBtn.setAttribute('aria-expanded', 'false')
    hamburgerBtn.setAttribute('aria-controls', 'defra-map-drawer')
    hamburgerBtn.innerHTML = ICONS.menu
    root.appendChild(hamburgerBtn)

    // Drawer panel
    const drawer = document.createElement('div')
    drawer.id = 'defra-map-drawer'
    drawer.className = 'defra-map-controls__drawer'
    drawer.setAttribute('role', 'dialog')
    drawer.setAttribute('aria-label', 'Drawing tools')
    drawer.setAttribute('aria-hidden', 'true')
    root.appendChild(drawer)

    // Drawer header with close button
    const drawerHeader = document.createElement('div')
    drawerHeader.className = 'defra-map-controls__drawer-header'

    const drawerTitle = document.createElement('span')
    drawerTitle.className = 'defra-map-controls__drawer-title'
    drawerTitle.textContent = 'Drawing Tools'
    drawerHeader.appendChild(drawerTitle)

    const closeBtn = document.createElement('button')
    closeBtn.type = 'button'
    closeBtn.className = 'defra-map-controls__close'
    closeBtn.setAttribute('aria-label', 'Close drawing tools menu')
    closeBtn.innerHTML = ICONS.close
    drawerHeader.appendChild(closeBtn)

    drawer.appendChild(drawerHeader)

    // Zoom warning message
    const zoomWarning = document.createElement('div')
    zoomWarning.className = 'defra-map-controls__zoom-warning'
    zoomWarning.setAttribute('role', 'alert')
    zoomWarning.innerHTML = `<span class="defra-map-controls__zoom-warning-icon">⚠</span> Zoom in to level ${this._minZoomForSnap} to enable tools`
    drawer.appendChild(zoomWarning)

    // Drawer content
    const drawerContent = document.createElement('div')
    drawerContent.className = 'defra-map-controls__drawer-content'
    drawer.appendChild(drawerContent)

    // Tool buttons section
    const toolsSection = document.createElement('div')
    toolsSection.className = 'defra-map-controls__section'
    drawerContent.appendChild(toolsSection)

    // Helper to create icon button
    const addIconButton = (icon, label, action, extraClass) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `defra-map-controls__icon-btn ${extraClass || ''}`.trim()
      btn.setAttribute('data-action', action)
      btn.setAttribute('aria-label', label)
      btn.setAttribute('title', label)
      btn.innerHTML = icon
      return btn
    }

    const setToggleState = (btn, on) => {
      const isOn = !!on
      btn.setAttribute('aria-pressed', isOn ? 'true' : 'false')
      if (isOn) btn.classList.add('defra-map-controls__toggle--on')
      else btn.classList.remove('defra-map-controls__toggle--on')
    }

    const addSnapToggle = (icon, labelText, dataKey, on, extraClass) => {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = `defra-map-controls__snap-btn ${extraClass || ''}`.trim()
      btn.setAttribute('data-snap', dataKey)
      btn.setAttribute('aria-label', labelText)
      btn.setAttribute('title', labelText)
      btn.innerHTML = `<span class="defra-map-controls__snap-icon">${icon}</span><span class="defra-map-controls__snap-label">${labelText}</span>`
      setToggleState(btn, on)
      return btn
    }

    // Draw tools row
    const toolRow = document.createElement('div')
    toolRow.className = 'defra-map-controls__tool-row'
    toolsSection.appendChild(toolRow)

    // Draw controls (only the start button in the menu)
    let btnDraw = null

    if (tools.includes('draw')) {
      const drawLabel =
        cfg.drawLabel ||
        (this._mode === 'habitat-parcels' ? 'Draw parcel' : 'Draw boundary')
      btnDraw = addIconButton(ICONS.draw, drawLabel, 'draw')
      toolRow.appendChild(btnDraw)
    }

    // Fill boundary controls (only the start button in the menu)
    let btnFillBoundary = null

    if (tools.includes('fill-boundary')) {
      btnFillBoundary = addIconButton(
        ICONS.fill,
        'Fill boundary',
        'fill-boundary'
      )
      toolRow.appendChild(btnFillBoundary)
    }

    // Fill parcels controls (only the start button in the menu)
    let btnFillParcels = null

    if (tools.includes('fill-parcels')) {
      btnFillParcels = addIconButton(ICONS.fill, 'Fill parcel', 'fill-parcels')
      toolRow.appendChild(btnFillParcels)
    }

    // Slice controls (only the start button in the menu)
    let btnSlice = null

    if (tools.includes('slice')) {
      btnSlice = addIconButton(ICONS.slice, 'Slice polygon', 'slice')
      toolRow.appendChild(btnSlice)
    }

    // Remove polygon controls (only the start button in the menu)
    let btnRemove = null

    if (tools.includes('remove')) {
      const removeLabel =
        cfg.removeLabel ||
        (this._mode === 'habitat-parcels' ? 'Remove parcel' : 'Remove boundary')
      btnRemove = addIconButton(
        ICONS.remove,
        removeLabel,
        'remove',
        'defra-map-controls__icon-btn--warning'
      )
      toolRow.appendChild(btnRemove)
    }

    // Hedgerow drawing controls
    let btnHedgerow = null

    if (tools.includes('hedgerow')) {
      btnHedgerow = addIconButton(
        ICONS.hedgerow,
        'Draw hedgerow',
        'hedgerow',
        'defra-map-controls__icon-btn--hedgerow'
      )
      toolRow.appendChild(btnHedgerow)
    }

    // Watercourse drawing controls
    let btnWatercourse = null

    if (tools.includes('watercourse')) {
      btnWatercourse = addIconButton(
        ICONS.watercourse,
        'Draw watercourse',
        'watercourse',
        'defra-map-controls__icon-btn--watercourse'
      )
      toolRow.appendChild(btnWatercourse)
    }

    // ========================================
    // Floating Action Buttons (bottom-right)
    // ========================================
    const floatingActions = document.createElement('div')
    floatingActions.className = 'defra-map-floating-actions'
    floatingActions.setAttribute('role', 'group')
    floatingActions.setAttribute('aria-label', 'Tool actions')
    floatingActions.style.display = 'none'

    // Cancel button (lozenge shape with icon)
    const floatingCancelBtn = document.createElement('button')
    floatingCancelBtn.type = 'button'
    floatingCancelBtn.className =
      'defra-map-floating-actions__btn defra-map-floating-actions__btn--cancel'
    floatingCancelBtn.setAttribute('aria-label', 'Cancel')
    floatingCancelBtn.setAttribute('title', 'Cancel')
    floatingCancelBtn.innerHTML = ICONS.cancel

    // Confirm/Accept button (lozenge shape with icon)
    const floatingConfirmBtn = document.createElement('button')
    floatingConfirmBtn.type = 'button'
    floatingConfirmBtn.className =
      'defra-map-floating-actions__btn defra-map-floating-actions__btn--confirm'
    floatingConfirmBtn.setAttribute('aria-label', 'Accept')
    floatingConfirmBtn.setAttribute('title', 'Accept')
    floatingConfirmBtn.innerHTML = ICONS.confirm

    floatingActions.appendChild(floatingCancelBtn)
    floatingActions.appendChild(floatingConfirmBtn)

    // Track which tool is active for floating buttons
    let activeToolType = null // 'draw' | 'fill-boundary' | 'fill-parcels' | 'slice' | 'remove' | 'hedgerow' | 'watercourse'

    // Snapping toggles section
    const snapButtons = {}

    if (snapToggles.length > 0) {
      const snapSection = document.createElement('div')
      snapSection.className =
        'defra-map-controls__section defra-map-controls__section--snapping'
      drawerContent.appendChild(snapSection)

      const snapTitle = document.createElement('div')
      snapTitle.className = 'defra-map-controls__section-title'
      snapTitle.textContent = 'Snapping'
      snapSection.appendChild(snapTitle)

      const snapList = document.createElement('div')
      snapList.className = 'defra-map-controls__snap-list'
      snapSection.appendChild(snapList)

      if (snapToggles.includes('os')) {
        const btn = addSnapToggle(
          ICONS.magnet,
          'Snap to OS features',
          'os',
          this._snappingEnabled
        )
        snapButtons.os = btn
        snapList.appendChild(btn)
      }

      if (snapToggles.includes('boundary-vertices')) {
        const btn = addSnapToggle(
          ICONS.cornerSnap,
          'Snap to boundary corners',
          'boundary-vertices',
          this._snapToBoundaryVertices
        )
        snapButtons['boundary-vertices'] = btn
        snapList.appendChild(btn)
      }
      if (snapToggles.includes('boundary-edges')) {
        const btn = addSnapToggle(
          ICONS.edgeSnap,
          'Snap to boundary edges',
          'boundary-edges',
          this._snapToBoundaryEdges
        )
        snapButtons['boundary-edges'] = btn
        snapList.appendChild(btn)
      }
      if (snapToggles.includes('parcel-vertices')) {
        const btn = addSnapToggle(
          ICONS.cornerSnap,
          'Snap to parcel corners',
          'parcel-vertices',
          this._snapToParcelVertices
        )
        snapButtons['parcel-vertices'] = btn
        snapList.appendChild(btn)
      }
      if (snapToggles.includes('parcel-edges')) {
        const btn = addSnapToggle(
          ICONS.edgeSnap,
          'Snap to parcel edges',
          'parcel-edges',
          this._snapToParcelEdges
        )
        snapButtons['parcel-edges'] = btn
        snapList.appendChild(btn)
      }
    }

    // Actions section (Save + Help)
    const actionsSection = document.createElement('div')
    actionsSection.className =
      'defra-map-controls__section defra-map-controls__section--actions'
    drawerContent.appendChild(actionsSection)

    const actionsList = document.createElement('div')
    actionsList.className = 'defra-map-controls__actions-list'
    actionsSection.appendChild(actionsList)

    // Save button
    let btnSave = null
    const saveLabel =
      this._mode === 'habitat-parcels' ? 'Save parcels' : 'Save boundary'
    btnSave = document.createElement('button')
    btnSave.type = 'button'
    btnSave.className =
      'defra-map-controls__action-btn defra-map-controls__action-btn--save defra-map-controls__action-btn--disabled'
    btnSave.setAttribute('data-action', 'save')
    btnSave.setAttribute('aria-label', saveLabel)
    btnSave.disabled = true
    btnSave.innerHTML = `<span class="defra-map-controls__action-icon">${ICONS.save}</span><span class="defra-map-controls__action-label">${saveLabel}</span>`
    actionsList.appendChild(btnSave)

    // Help button
    const btnHelp = document.createElement('button')
    btnHelp.type = 'button'
    btnHelp.className = 'defra-map-controls__action-btn'
    btnHelp.setAttribute('data-action', 'help')
    btnHelp.setAttribute('aria-label', 'Show help')
    btnHelp.innerHTML = `<span class="defra-map-controls__action-icon">${ICONS.help}</span><span class="defra-map-controls__action-label">Help</span>`
    actionsList.appendChild(btnHelp)

    // Attach controls and floating actions
    target.appendChild(root)
    target.appendChild(floatingActions)
    this._controlsContainer = root
    this._floatingActions = floatingActions
    this._saveButton = btnSave

    // Drawer open/close functions
    const openDrawer = () => {
      drawerOpen = true
      // Drawer positioning is handled by CSS (absolute positioning relative to controls container)
      drawer.classList.add('defra-map-controls__drawer--open')
      drawer.setAttribute('aria-hidden', 'false')
      hamburgerBtn.setAttribute('aria-expanded', 'true')
      hamburgerBtn.classList.add('defra-map-controls__hamburger--active')
    }

    const closeDrawer = (focusMap) => {
      drawerOpen = false

      // Move focus away from drawer BEFORE setting aria-hidden to avoid accessibility warning
      if (focusMap) {
        target.focus({ preventScroll: true })
      } else if (drawer.contains(document.activeElement)) {
        // If focus is inside drawer, move it to hamburger button
        hamburgerBtn.focus({ preventScroll: true })
      }

      drawer.classList.remove('defra-map-controls__drawer--open')
      drawer.setAttribute('aria-hidden', 'true')
      hamburgerBtn.setAttribute('aria-expanded', 'false')
      hamburgerBtn.classList.remove('defra-map-controls__hamburger--active')
    }

    // Hamburger click handler
    hamburgerBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (drawerOpen) {
        closeDrawer()
      } else {
        openDrawer()
      }
    })

    // Close button handler
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      closeDrawer()
    })

    // Modal handling
    const openHelpModal = () => {
      const modal = document.getElementById('help-modal')
      if (modal) {
        modal.setAttribute('aria-hidden', 'false')
        modal.classList.add('defra-modal--open')
        document.body.classList.add('defra-modal-open')
        // Focus first focusable element
        const closeBtn = modal.querySelector('.defra-modal__close')
        if (closeBtn) closeBtn.focus()
      }
    }

    const closeHelpModal = () => {
      const modal = document.getElementById('help-modal')
      if (modal) {
        modal.setAttribute('aria-hidden', 'true')
        modal.classList.remove('defra-modal--open')
        document.body.classList.remove('defra-modal-open')
      }
    }

    // Set up modal close handlers
    const modal = document.getElementById('help-modal')
    if (modal) {
      modal.querySelectorAll('[data-close-modal]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault()
          closeHelpModal()
        })
      })
      // Close on Escape key
      document.addEventListener('keydown', (e) => {
        if (
          e.key === 'Escape' &&
          modal.classList.contains('defra-modal--open')
        ) {
          closeHelpModal()
        }
      })
    }

    // Show/hide floating actions based on active tool
    const showFloatingActions = (toolType) => {
      activeToolType = toolType
      floatingActions.style.display = 'flex'

      // Hide cancel button for remove tool (cancel is redundant as removals are immediate)
      if (toolType === 'remove') {
        floatingCancelBtn.style.display = 'none'
      } else {
        floatingCancelBtn.style.display = 'inline-flex'
      }

      // Update confirm button state for drawing
      updateFloatingConfirmState()
    }

    const hideFloatingActions = () => {
      activeToolType = null
      floatingActions.style.display = 'none'
    }

    const updateFloatingConfirmState = () => {
      if (activeToolType === 'draw') {
        // For drawing, enable confirm only if we have at least 3 vertices
        const canConfirm =
          this._currentPolygonCoords && this._currentPolygonCoords.length >= 3
        floatingConfirmBtn.disabled = !canConfirm
        if (canConfirm) {
          floatingConfirmBtn.classList.remove(
            'defra-map-floating-actions__btn--disabled'
          )
        } else {
          floatingConfirmBtn.classList.add(
            'defra-map-floating-actions__btn--disabled'
          )
        }
      } else if (activeToolType === 'fill-boundary') {
        // For fill-boundary, enable confirm only if there's a selection
        const hasSelection = this._fillSelected && this._fillSelected.length > 0
        floatingConfirmBtn.disabled = !hasSelection
        if (hasSelection) {
          floatingConfirmBtn.classList.remove(
            'defra-map-floating-actions__btn--disabled'
          )
        } else {
          floatingConfirmBtn.classList.add(
            'defra-map-floating-actions__btn--disabled'
          )
        }
      } else if (
        activeToolType === 'hedgerow' ||
        activeToolType === 'watercourse'
      ) {
        // For line drawing, enable confirm only if we have at least 2 points
        const canConfirm =
          this._currentLineCoords && this._currentLineCoords.length >= 2
        floatingConfirmBtn.disabled = !canConfirm
        if (canConfirm) {
          floatingConfirmBtn.classList.remove(
            'defra-map-floating-actions__btn--disabled'
          )
        } else {
          floatingConfirmBtn.classList.add(
            'defra-map-floating-actions__btn--disabled'
          )
        }
      } else {
        // For other tools, always enable
        floatingConfirmBtn.disabled = false
        floatingConfirmBtn.classList.remove(
          'defra-map-floating-actions__btn--disabled'
        )
      }
    }

    // Handle floating action button clicks
    floatingCancelBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()

      if (activeToolType === 'draw') {
        this.cancelDrawing()
      } else if (
        activeToolType === 'fill-boundary' ||
        activeToolType === 'fill-parcels'
      ) {
        this.cancelFill()
      } else if (activeToolType === 'slice') {
        this.cancelSlice()
      } else if (activeToolType === 'remove') {
        this.cancelRemove()
      } else if (
        activeToolType === 'hedgerow' ||
        activeToolType === 'watercourse'
      ) {
        this.cancelLineDraw()
      }
      hideFloatingActions()
      updateButtons()
    })

    floatingConfirmBtn.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()

      if (activeToolType === 'draw') {
        // Auto-close polygon if we have at least 3 points
        if (
          this._currentPolygonCoords &&
          this._currentPolygonCoords.length >= 3
        ) {
          this._closePolygon()
        }
      } else if (activeToolType === 'fill-boundary') {
        const ok = this.confirmFill()
        if (!ok) return // Don't hide if confirm failed
      } else if (activeToolType === 'fill-parcels') {
        this.cancelFill() // Finish fill parcels mode
      } else if (activeToolType === 'slice') {
        // Slice doesn't have explicit confirm - it confirms on second click
        // But we can cancel it
        this.cancelSlice()
      } else if (activeToolType === 'remove') {
        // Finish remove mode - user is done removing parcels
        this.finishRemove()
      } else if (
        activeToolType === 'hedgerow' ||
        activeToolType === 'watercourse'
      ) {
        // Finish line if we have at least 2 points
        if (this._currentLineCoords && this._currentLineCoords.length >= 2) {
          this.finishLineDraw()
        }
      }
      hideFloatingActions()
      updateButtons()
    })

    // Handle all tool and snap clicks directly on the drawer content
    drawerContent.addEventListener('click', (e) => {
      e.stopPropagation()

      // Handle action clicks (save, help) - these work regardless of zoom
      const actionEl =
        e.target && e.target.closest ? e.target.closest('[data-action]') : null
      if (actionEl) {
        e.preventDefault()
        const action = actionEl.getAttribute('data-action')

        if (action === 'help') {
          openHelpModal()
          closeDrawer()
          return
        }

        if (action === 'save' && !actionEl.disabled) {
          // Emit save event for page-specific handling
          this._emitter.emit('controls:save', {})
          return
        }
      }

      if (!toolsEnabled) return

      // Handle snap toggle clicks - keep drawer open
      const snapEl =
        e.target && e.target.closest ? e.target.closest('[data-snap]') : null
      if (snapEl) {
        e.preventDefault()
        const key = snapEl.getAttribute('data-snap')
        if (!key) return

        if (key === 'os') this.setSnappingEnabled(!this._snappingEnabled)
        else if (key === 'boundary-vertices')
          this.setSnapToBoundaryVertices(!this._snapToBoundaryVertices)
        else if (key === 'boundary-edges')
          this.setSnapToBoundaryEdges(!this._snapToBoundaryEdges)
        else if (key === 'parcel-vertices')
          this.setSnapToParcelVertices(!this._snapToParcelVertices)
        else if (key === 'parcel-edges')
          this.setSnapToParcelEdges(!this._snapToParcelEdges)

        updateSnapButtons()
        // Snap toggles keep drawer open
        return
      }

      // Handle tool action clicks - close drawer and show floating actions
      if (actionEl) {
        const action = actionEl.getAttribute('data-action')

        if (action === 'draw') {
          if (this._sliceActive) this.cancelSlice()
          if (this._fillActive) this.cancelFill()
          this.startDrawing()
          closeDrawer(true) // Focus map for keyboard drawing
          showFloatingActions('draw')
          updateButtons()
        } else if (action === 'fill-boundary') {
          if (this._sliceActive) this.cancelSlice()
          if (this._isDrawing) this.cancelDrawing()
          this.startFillBoundary()
          closeDrawer(true) // Focus map for keyboard interaction
          showFloatingActions('fill-boundary')
          updateButtons()
        } else if (action === 'fill-parcels') {
          if (this._sliceActive) this.cancelSlice()
          if (this._isDrawing) this.cancelDrawing()
          this.startFillParcels()
          closeDrawer(true) // Focus map for keyboard interaction
          showFloatingActions('fill-parcels')
          updateButtons()
        } else if (action === 'slice') {
          if (this._fillActive) this.cancelFill()
          if (this._isDrawing) this.cancelDrawing()
          this.startSlice()
          closeDrawer(true) // Focus map for keyboard interaction
          showFloatingActions('slice')
          updateButtons()
        } else if (action === 'remove') {
          if (this._sliceActive) this.cancelSlice()
          if (this._fillActive) this.cancelFill()
          if (this._isDrawing) this.cancelDrawing()
          if (this._isLineDrawing) this.cancelLineDraw()
          this.startRemove()
          closeDrawer(true) // Focus map for keyboard interaction
          showFloatingActions('remove')
          updateButtons()
        } else if (action === 'hedgerow') {
          if (this._sliceActive) this.cancelSlice()
          if (this._fillActive) this.cancelFill()
          if (this._isDrawing) this.cancelDrawing()
          if (this._removeActive) this.cancelRemove()
          this.startDrawHedgerow()
          closeDrawer(true) // Focus map for keyboard interaction
          showFloatingActions('hedgerow')
          updateButtons()
        } else if (action === 'watercourse') {
          if (this._sliceActive) this.cancelSlice()
          if (this._fillActive) this.cancelFill()
          if (this._isDrawing) this.cancelDrawing()
          if (this._removeActive) this.cancelRemove()
          this.startDrawWatercourse()
          closeDrawer(true) // Focus map for keyboard interaction
          showFloatingActions('watercourse')
          updateButtons()
        }
      }
    })

    // Stop propagation on drawer header clicks
    drawerHeader.addEventListener('click', (e) => {
      e.stopPropagation()
    })

    // Update tool disabled state based on zoom
    const updateToolsEnabledState = () => {
      const zoom = this.getZoom() || 0
      currentZoom = zoom
      toolsEnabled = zoom >= this._minZoomForSnap

      // Show/hide zoom warning
      if (toolsEnabled) {
        zoomWarning.classList.add('defra-map-controls__zoom-warning--hidden')
        drawerContent.classList.remove(
          'defra-map-controls__drawer-content--disabled'
        )
      } else {
        zoomWarning.classList.remove('defra-map-controls__zoom-warning--hidden')
        drawerContent.classList.add(
          'defra-map-controls__drawer-content--disabled'
        )
      }

      // Disable/enable all tool buttons
      const allToolButtons = toolsSection.querySelectorAll(
        '.defra-map-controls__icon-btn'
      )
      allToolButtons.forEach((btn) => {
        btn.disabled = !toolsEnabled
        if (!toolsEnabled) {
          btn.classList.add('defra-map-controls__icon-btn--disabled')
        } else {
          btn.classList.remove('defra-map-controls__icon-btn--disabled')
        }
      })

      // Also disable/enable snap buttons
      Object.values(snapButtons).forEach((btn) => {
        btn.disabled = !toolsEnabled
        if (!toolsEnabled) {
          btn.classList.add('defra-map-controls__snap-btn--disabled')
        } else {
          btn.classList.remove('defra-map-controls__snap-btn--disabled')
        }
      })
    }

    // Wire handlers for button state updates
    const updateButtons = () => {
      const dbg = this.getDebugInfo ? this.getDebugInfo() : null
      const fillActive = dbg && dbg.fill ? !!dbg.fill.active : false
      const fillMode = dbg && dbg.fill ? dbg.fill.mode : null
      const sliceActive = dbg && dbg.slice ? !!dbg.slice.active : false
      const isDrawing = dbg && dbg.drawing ? !!dbg.drawing.isDrawing : false
      const removeActive = dbg && dbg.remove ? !!dbg.remove.active : false
      const isLineDrawing =
        dbg && dbg.linear ? !!dbg.linear.isLineDrawing : false
      const currentLineType =
        dbg && dbg.linear ? dbg.linear.currentLineType : null

      // Update tool button visibility (hide when that tool is active)
      if (btnDraw) {
        btnDraw.style.display = isDrawing ? 'none' : 'inline-flex'
      }

      if (btnFillBoundary) {
        const isFillBoundary = fillActive && fillMode === 'boundary'
        btnFillBoundary.style.display = isFillBoundary ? 'none' : 'inline-flex'
      }

      if (btnFillParcels) {
        const isFillParcels = fillActive && fillMode === 'parcels'
        btnFillParcels.style.display = isFillParcels ? 'none' : 'inline-flex'
      }

      if (btnSlice) {
        btnSlice.style.display = sliceActive ? 'none' : 'inline-flex'
      }

      if (btnRemove) {
        btnRemove.style.display = removeActive ? 'none' : 'inline-flex'
      }

      if (btnHedgerow) {
        const isHedgerowActive = isLineDrawing && currentLineType === 'hedgerow'
        btnHedgerow.style.display = isHedgerowActive ? 'none' : 'inline-flex'
      }

      if (btnWatercourse) {
        const isWatercourseActive =
          isLineDrawing && currentLineType === 'watercourse'
        btnWatercourse.style.display = isWatercourseActive
          ? 'none'
          : 'inline-flex'
      }

      // Update floating confirm button state
      updateFloatingConfirmState()
    }

    const updateSnapButtons = () => {
      if (snapButtons.os) setToggleState(snapButtons.os, this._snappingEnabled)
      if (snapButtons['boundary-vertices'])
        setToggleState(
          snapButtons['boundary-vertices'],
          this._snapToBoundaryVertices
        )
      if (snapButtons['boundary-edges'])
        setToggleState(snapButtons['boundary-edges'], this._snapToBoundaryEdges)
      if (snapButtons['parcel-vertices'])
        setToggleState(
          snapButtons['parcel-vertices'],
          this._snapToParcelVertices
        )
      if (snapButtons['parcel-edges'])
        setToggleState(snapButtons['parcel-edges'], this._snapToParcelEdges)
    }

    // Keep buttons in sync with tool state
    this.on('drawing:started', updateButtons)
    this.on('drawing:cancelled', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('drawing:completed', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('parcel:added', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('fill:started', updateButtons)
    this.on('fill:cancelled', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('fill:confirmed', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('slice:started', updateButtons)
    this.on('slice:cancelled', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('slice:completed', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('remove:started', updateButtons)
    this.on('remove:cancelled', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('remove:completed', () => {
      // Check if tool is still active (habitat-parcels mode keeps it active for multiple removals)
      const dbg = this.getDebugInfo ? this.getDebugInfo() : null
      const stillActive = dbg && dbg.remove ? !!dbg.remove.active : false
      if (!stillActive) {
        // Tool auto-deactivated (e.g., boundary removed or all parcels removed)
        hideFloatingActions()
      }
      updateButtons()
    })
    this.on('remove:finished', () => {
      hideFloatingActions()
      updateButtons()
    })

    // Linear feature (hedgerow/watercourse) events
    this.on('linedraw:started', updateButtons)
    this.on('linedraw:cancelled', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('linedraw:completed', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('hedgerow:added', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('watercourse:added', () => {
      hideFloatingActions()
      updateButtons()
    })
    this.on('hedgerow:removed', updateButtons)
    this.on('watercourse:removed', updateButtons)

    // Update floating confirm button state when line points are placed
    this.on('linedraw:lengthChanged', () => {
      updateFloatingConfirmState()
    })

    this.on('snapping:osFeaturesChanged', updateSnapButtons)
    this.on('snapping:boundaryVerticesChanged', updateSnapButtons)
    this.on('snapping:boundaryEdgesChanged', updateSnapButtons)
    this.on('snapping:parcelVerticesChanged', updateSnapButtons)
    this.on('snapping:parcelEdgesChanged', updateSnapButtons)

    // Listen for view changes to update tool enabled state
    this.on('view:changed', () => {
      updateToolsEnabledState()
    })

    // Update floating confirm button state when fill selection changes
    this.on('fill:selectionChanged', () => {
      updateFloatingConfirmState()
    })

    // Update floating confirm button state when vertices are placed during drawing
    this.on('sketch:area', () => {
      updateFloatingConfirmState()
    })

    // Save button state update
    const updateSaveButton = (enabled) => {
      if (!btnSave) return
      btnSave.disabled = !enabled
      if (enabled) {
        btnSave.classList.remove('defra-map-controls__action-btn--disabled')
      } else {
        btnSave.classList.add('defra-map-controls__action-btn--disabled')
      }
    }

    // Expose save button control
    this.setSaveEnabled = updateSaveButton

    updateButtons()
    updateSnapButtons()
    updateToolsEnabledState()
  }
})(window)
