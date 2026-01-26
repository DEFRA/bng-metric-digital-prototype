//
// DefraMapClient keyboard accessibility (prototype augmentation)
// Implements keyboard navigation, focus management, and keyboard drawing mode.
// Not a module: extends `window.DefraMapClient.prototype`.
//

;(function (window) {
  'use strict'

  const DefraMapClient = window.DefraMapClient
  if (!DefraMapClient) {
    throw new Error(
      'defra-map-client.keyboard.js requires window.DefraMapClient to be loaded first.'
    )
  }

  // SVG crosshair icon for keyboard drawing target
  const CROSSHAIR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="#0b0c0c" stroke-width="2" aria-hidden="true">
    <circle cx="24" cy="24" r="12" stroke-dasharray="4 2" fill="none"/>
    <line x1="24" y1="4" x2="24" y2="16"/>
    <line x1="24" y1="32" x2="24" y2="44"/>
    <line x1="4" y1="24" x2="16" y2="24"/>
    <line x1="32" y1="24" x2="44" y2="24"/>
    <circle cx="24" cy="24" r="3" fill="#0b0c0c"/>
  </svg>`

  // Keyboard shortcuts data for help modal
  const KEYBOARD_SHORTCUTS = [
    {
      category: 'Navigation',
      shortcuts: [
        { keys: 'Arrow keys', description: 'Pan the map' },
        {
          keys: 'Shift + Arrow keys',
          description: 'Pan the map (fine control)'
        },
        { keys: '+ or =', description: 'Zoom in' },
        { keys: '- or _', description: 'Zoom out' },
        { keys: 'Shift + +/-', description: 'Zoom in/out (fine control)' },
        { keys: 'Home', description: 'Reset to initial view' }
      ]
    },
    {
      category: 'Tools',
      shortcuts: [
        { keys: 'Ctrl + M', description: 'Open/close drawing tools menu' },
        { keys: 'Ctrl + K', description: 'Open keyboard shortcuts help' }
      ]
    },
    {
      category: 'Drawing & Selection',
      shortcuts: [
        {
          keys: 'Ctrl + Space',
          description: 'Place point, select fill area, or set slice point'
        },
        { keys: 'Enter', description: 'Finish drawing and accept shape' },
        {
          keys: 'Escape',
          description: 'Cancel current operation or close menu'
        }
      ]
    }
  ]

  // Store original init method
  const originalInit = DefraMapClient.prototype.init

  // Override init to add keyboard setup
  DefraMapClient.prototype.init = async function () {
    // Call original init
    const result = await originalInit.call(this)

    // Setup keyboard interaction after map is ready
    this._setupKeyboardInteraction()

    return result
  }

  // ============================
  // Keyboard setup
  // ============================

  DefraMapClient.prototype._setupKeyboardInteraction = function () {
    const target = this._map.getTargetElement()
    if (!target) return

    // Make map container focusable
    target.setAttribute('tabindex', '0')
    target.setAttribute('role', 'application')
    target.setAttribute(
      'aria-label',
      'Interactive map. Use arrow keys to pan, plus and minus to zoom. Press Ctrl+K for keyboard shortcuts.'
    )

    // Track keyboard mode state
    this._keyboardMode = false
    this._keyboardTargetElement = null
    this._keyboardHintElement = null

    // Store initial view for Home key
    const view = this._map.getView()
    this._initialCenter = view.getCenter()
    this._initialZoom = view.getZoom()

    // Create keyboard help modal
    this._createKeyboardHelpModal()

    // Prevent scroll when map receives focus via tab
    target.addEventListener(
      'focus',
      (e) => {
        // Store scroll position before focus changes anything
        const scrollX = window.scrollX
        const scrollY = window.scrollY

        // Use requestAnimationFrame to restore scroll after browser's default behavior
        requestAnimationFrame(() => {
          window.scrollTo(scrollX, scrollY)
        })

        this._handleMapFocus()
      },
      { passive: true }
    )

    // Bind other event handlers
    target.addEventListener('keydown', (e) => this._handleMapKeydown(e))
    target.addEventListener('blur', () => this._handleMapBlur())

    // Global keydown for Ctrl+M menu toggle, Ctrl+K help, and Escape handling
    document.addEventListener('keydown', (e) => this._handleGlobalKeydown(e))

    // Track if keyboard help modal is open for escape handling
    this._keyboardHelpModalOpen = false

    // Track mouse/pointer interaction to exit keyboard mode
    target.addEventListener('pointerdown', () => this._exitKeyboardMode())
    target.addEventListener('pointermove', (e) => {
      // Only exit on actual mouse movement with buttons, not touch
      if (e.pointerType === 'mouse' && !this._keyboardMode) return
      if (e.pointerType === 'mouse') {
        this._exitKeyboardMode()
      }
    })
  }

  // ============================
  // Keyboard help modal
  // ============================

  DefraMapClient.prototype._createKeyboardHelpModal = function () {
    // Check if modal already exists
    if (document.getElementById('keyboard-help-modal')) return

    const modal = document.createElement('div')
    modal.id = 'keyboard-help-modal'
    modal.className = 'defra-modal'
    modal.setAttribute('aria-hidden', 'true')
    modal.setAttribute('role', 'dialog')
    modal.setAttribute('aria-labelledby', 'keyboard-help-modal-title')
    modal.setAttribute('aria-modal', 'true')

    modal.innerHTML = `
      <div class="defra-modal__overlay" data-close-modal></div>
      <div class="defra-modal__container">
        <div class="defra-modal__header">
          <h2 class="defra-modal__title" id="keyboard-help-modal-title">Keyboard shortcuts</h2>
          <button type="button" class="defra-modal__close" aria-label="Close keyboard shortcuts" data-close-modal>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        <div class="defra-modal__content" tabindex="0" role="region" aria-label="Keyboard shortcuts list">
          ${this._generateKeyboardHelpContent()}
        </div>
      </div>
    `

    document.body.appendChild(modal)

    // Set up close handlers
    modal.querySelectorAll('[data-close-modal]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault()
        this._closeKeyboardHelpModal()
      })
    })
  }

  DefraMapClient.prototype._generateKeyboardHelpContent = function () {
    let html = ''

    for (const category of KEYBOARD_SHORTCUTS) {
      html += `<h3 class="govuk-heading-s">${category.category}</h3>`
      html += '<dl class="defra-keyboard-help__list">'

      for (const shortcut of category.shortcuts) {
        html += `
          <div class="defra-keyboard-help__item">
            <dt class="defra-keyboard-help__keys"><kbd>${shortcut.keys}</kbd></dt>
            <dd class="defra-keyboard-help__description">${shortcut.description}</dd>
          </div>
        `
      }

      html += '</dl>'
    }

    html += `
      <div class="govuk-inset-text">
        <p class="govuk-body-s">Hold <kbd>Shift</kbd> while using arrow keys or zoom keys for finer control.</p>
      </div>
    `

    return html
  }

  DefraMapClient.prototype._openKeyboardHelpModal = function () {
    const modal = document.getElementById('keyboard-help-modal')
    if (!modal) return

    // Mark modal as open
    this._keyboardHelpModalOpen = true

    // Store scroll position before opening
    this._modalScrollY = window.scrollY
    this._modalScrollX = window.scrollX

    modal.setAttribute('aria-hidden', 'false')
    modal.classList.add('defra-modal--open')
    document.body.classList.add('defra-modal-open')

    // Apply negative top margin to prevent visual jump
    document.body.style.top = `-${this._modalScrollY}px`

    // Setup focus trap (only once)
    if (!modal._focusTrapInitialized) {
      this._setupModalFocusTrap(modal)
      modal._focusTrapInitialized = true
    }

    // Focus the content area to allow keyboard scrolling with arrow keys
    // Use longer timeout to ensure modal transition has started and element is visible
    const contentArea = modal.querySelector('.defra-modal__content')
    if (contentArea) {
      // Ensure content is focusable
      contentArea.setAttribute('tabindex', '0')
      // Focus after a short delay to allow CSS transition to begin
      setTimeout(() => {
        contentArea.focus({ preventScroll: true })
      }, 50)
    }

    this._emitter.emit('keyboard:helpOpened', {})
  }

  DefraMapClient.prototype._closeKeyboardHelpModal = function () {
    const modal = document.getElementById('keyboard-help-modal')
    if (!modal) return
    if (!this._keyboardHelpModalOpen) return

    // Mark modal as closed
    this._keyboardHelpModalOpen = false

    modal.setAttribute('aria-hidden', 'true')
    modal.classList.remove('defra-modal--open')
    document.body.classList.remove('defra-modal-open')
    document.body.style.top = ''

    // Restore scroll position
    if (typeof this._modalScrollY === 'number') {
      window.scrollTo(this._modalScrollX || 0, this._modalScrollY)
    }

    // Return focus to map without scrolling - use setTimeout to ensure modal is hidden
    setTimeout(() => {
      const target = this._map.getTargetElement()
      if (target) {
        target.focus({ preventScroll: true })
      }
    }, 10)

    this._emitter.emit('keyboard:helpClosed', {})
  }

  DefraMapClient.prototype._setupModalFocusTrap = function (modal) {
    const self = this

    const trapHandler = (e) => {
      if (!modal.classList.contains('defra-modal--open')) return

      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        self._closeKeyboardHelpModal()
        return
      }

      if (e.key === 'Tab') {
        // Get focusable elements fresh each time (in case DOM changes)
        const focusableElements = modal.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )

        if (focusableElements.length === 0) return

        const firstFocusable = focusableElements[0]
        const lastFocusable = focusableElements[focusableElements.length - 1]

        if (e.shiftKey) {
          // Shift+Tab: if on first element, go to last
          if (document.activeElement === firstFocusable) {
            e.preventDefault()
            lastFocusable.focus({ preventScroll: true })
          }
        } else {
          // Tab: if on last element, go to first
          if (document.activeElement === lastFocusable) {
            e.preventDefault()
            firstFocusable.focus({ preventScroll: true })
          }
        }
      }
    }

    modal.addEventListener('keydown', trapHandler)
  }

  // ============================
  // Focus management
  // ============================

  DefraMapClient.prototype._handleMapFocus = function () {
    const target = this._map.getTargetElement()
    target.classList.add('defra-map--focused')

    // Show keyboard hint panel
    this._showKeyboardHint()

    this._emitter.emit('keyboard:focus', {})
  }

  DefraMapClient.prototype._handleMapBlur = function () {
    const target = this._map.getTargetElement()
    target.classList.remove('defra-map--focused')
    this._hideKeyboardTarget()
    this._hideKeyboardHint()
    this._emitter.emit('keyboard:blur', {})
  }

  // ============================
  // Keyboard hint panel
  // ============================

  DefraMapClient.prototype._showKeyboardHint = function () {
    if (this._keyboardHintElement) return

    const target = this._map.getTargetElement()
    const hint = document.createElement('div')
    hint.className = 'defra-map-keyboard-hint'
    hint.setAttribute('role', 'status')
    hint.innerHTML = `
      <span class="defra-map-keyboard-hint__text">
        Press <kbd>Ctrl</kbd> + <kbd>K</kbd> for keyboard shortcuts
      </span>
    `
    target.appendChild(hint)
    this._keyboardHintElement = hint
  }

  DefraMapClient.prototype._hideKeyboardHint = function () {
    if (this._keyboardHintElement) {
      this._keyboardHintElement.remove()
      this._keyboardHintElement = null
    }
  }

  // ============================
  // Keyboard mode management
  // ============================

  DefraMapClient.prototype._enterKeyboardMode = function () {
    if (this._keyboardMode) return
    this._keyboardMode = true

    const target = this._map.getTargetElement()
    target.classList.add('defra-map--keyboard-mode')

    // Show center target if a tool is active
    if (
      this._isDrawing ||
      this._fillActive ||
      this._sliceActive ||
      this._isLineDrawing
    ) {
      this._showKeyboardTarget()
      this._updateKeyboardSnapIndicator()
    }

    this._emitter.emit('keyboard:modeEntered', {})
  }

  DefraMapClient.prototype._exitKeyboardMode = function () {
    if (!this._keyboardMode) return
    this._keyboardMode = false

    const target = this._map.getTargetElement()
    target.classList.remove('defra-map--keyboard-mode')
    this._hideKeyboardTarget()

    this._emitter.emit('keyboard:modeExited', {})
  }

  // ============================
  // Check if any interactive tool is active
  // ============================

  DefraMapClient.prototype._isToolActive = function () {
    return (
      this._isDrawing ||
      this._fillActive ||
      this._sliceActive ||
      this._isLineDrawing
    )
  }

  // ============================
  // Keyboard target (crosshair) overlay
  // ============================

  DefraMapClient.prototype._showKeyboardTarget = function () {
    if (this._keyboardTargetElement) return

    const target = this._map.getTargetElement()
    const overlay = document.createElement('div')
    overlay.className = 'defra-map-keyboard-target'
    overlay.innerHTML = CROSSHAIR_SVG
    overlay.setAttribute('aria-hidden', 'true')
    target.appendChild(overlay)
    this._keyboardTargetElement = overlay
  }

  DefraMapClient.prototype._hideKeyboardTarget = function () {
    if (this._keyboardTargetElement) {
      this._keyboardTargetElement.remove()
      this._keyboardTargetElement = null
    }
    // Clear hover marker when hiding target
    if (this._hoverSource) {
      this._hoverSource.clear()
    }
  }

  // ============================
  // Keyboard snap indicator
  // ============================

  DefraMapClient.prototype._updateKeyboardSnapIndicator = function () {
    if (!this._keyboardMode || !this._isToolActive()) {
      return
    }

    // Get map center coordinate
    const center = this._map.getView().getCenter()
    if (!center) return

    // Find snap point for center
    const snapResult = this._findSnapPoint(center)
    let snapCoord = snapResult.coordinate
    let snapType = snapResult.snapType

    // Clamp to boundary if in habitat-parcels mode
    if (
      (this._snapToBoundaryVertices || this._snapToBoundaryEdges) &&
      this._mode === 'habitat-parcels' &&
      this._boundaryPolygon
    ) {
      const clamped = this._clampToBoundary(snapCoord)
      if (clamped[0] !== snapCoord[0] || clamped[1] !== snapCoord[1]) {
        snapCoord = clamped
        snapType = this._snapType.BOUNDARY_EDGE
      }
    }

    // Store for use when placing point
    this._lastSnapCoord = snapCoord
    this._lastSnapType = snapType

    // Update hover marker to show snap position
    this._updateHoverMarker(snapCoord, snapType)

    // Update live polygon preview if we have vertices (drawing mode)
    if (this._isDrawing && this._currentPolygonCoords.length > 0) {
      this._updateLivePolygon(snapCoord)
    }

    // Update slice preview line if slice is active with a start point
    if (this._sliceActive && this._sliceStart) {
      this._updateSlicePreviewForKeyboard(snapCoord)
    }

    // Update live line preview if we have points (line drawing mode)
    if (this._isLineDrawing && this._currentLineCoords.length > 0) {
      this._updateLiveLine(snapCoord)
    }
  }

  // ============================
  // Slice preview for keyboard
  // ============================

  DefraMapClient.prototype._updateSlicePreviewForKeyboard = function (
    snapCoord
  ) {
    // Update the slice hover marker
    if (this._sliceHover) {
      this._sliceSource.removeFeature(this._sliceHover)
      this._sliceHover = null
    }

    // Find snap point on source polygon for the current center
    const sliceSnap = this._findSliceSnapPointOnSourcePolygon(snapCoord)
    if (sliceSnap) {
      let featureType
      if (sliceSnap.isVertex) {
        featureType =
          sliceSnap.sourceType === 'parcel'
            ? 'parcel-vertex-hover'
            : 'boundary-vertex-hover'
      } else {
        featureType = 'edge-hover'
      }
      this._sliceHover = new ol.Feature({
        geometry: new ol.geom.Point(sliceSnap.coordinate),
        featureType: featureType
      })
      this._sliceSource.addFeature(this._sliceHover)
    }

    // Update preview line
    if (this._slicePreviewLine) {
      this._sliceSource.removeFeature(this._slicePreviewLine)
    }
    const endCoord = sliceSnap ? sliceSnap.coordinate : snapCoord
    this._slicePreviewLine = new ol.Feature({
      geometry: new ol.geom.LineString([this._sliceStart.coordinate, endCoord]),
      featureType: 'line'
    })
    this._sliceSource.addFeature(this._slicePreviewLine)
  }

  // ============================
  // Map keydown handler
  // ============================

  DefraMapClient.prototype._handleMapKeydown = function (e) {
    // Don't process keys when keyboard help modal is open - allow native scrolling
    if (this._keyboardHelpModalOpen) return

    // Enter keyboard mode on any key press
    this._enterKeyboardMode()

    const view = this._map.getView()
    const zoom = view.getZoom()
    const mapTarget = this._map.getTargetElement()

    // Calculate pan step based on zoom level (smaller steps at higher zoom)
    // Shift key reduces the step for finer control
    const resolution = view.getResolution()
    const basePanStep = resolution * 100 // Pan by 100 pixels worth
    const panStep = e.shiftKey ? basePanStep * 0.2 : basePanStep // 20% when shift is held

    // Zoom step - normal is 1 level, shift is 0.25 level
    const zoomStep = e.shiftKey ? 0.25 : 1

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        view.animate({
          center: [view.getCenter()[0], view.getCenter()[1] + panStep],
          duration: 100
        })
        this._scheduleSnapUpdate()
        break

      case 'ArrowDown':
        e.preventDefault()
        view.animate({
          center: [view.getCenter()[0], view.getCenter()[1] - panStep],
          duration: 100
        })
        this._scheduleSnapUpdate()
        break

      case 'ArrowLeft':
        e.preventDefault()
        view.animate({
          center: [view.getCenter()[0] - panStep, view.getCenter()[1]],
          duration: 100
        })
        this._scheduleSnapUpdate()
        break

      case 'ArrowRight':
        e.preventDefault()
        view.animate({
          center: [view.getCenter()[0] + panStep, view.getCenter()[1]],
          duration: 100
        })
        this._scheduleSnapUpdate()
        break

      case '+':
      case '=':
        e.preventDefault()
        if (zoom + zoomStep <= view.getMaxZoom()) {
          view.animate({
            zoom: zoom + zoomStep,
            duration: 200
          })
          this._scheduleSnapUpdate()
        }
        break

      case '-':
      case '_':
        e.preventDefault()
        if (zoom - zoomStep >= view.getMinZoom()) {
          view.animate({
            zoom: zoom - zoomStep,
            duration: 200
          })
          this._scheduleSnapUpdate()
        }
        break

      case 'Home':
        e.preventDefault()
        view.animate({
          center: this._initialCenter,
          zoom: this._initialZoom,
          duration: 500
        })
        this._scheduleSnapUpdate()
        break

      case ' ':
        // Ctrl+Space handled by global handler to avoid duplicate execution
        // Just prevent default here to avoid page scroll
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault()
        }
        break

      case 'Enter':
        // Only handle Enter when map itself has focus (not child elements like drawer buttons)
        // This allows Enter to activate focused buttons in the drawer
        if (document.activeElement === mapTarget) {
          e.preventDefault()
          this._handleKeyboardConfirm()
        }
        break

      case 'Escape':
        // Only handle Escape when map itself has focus
        if (document.activeElement === mapTarget) {
          e.preventDefault()
          this._handleKeyboardCancel()
        }
        break
    }
  }

  // ============================
  // Keyboard action handlers
  // ============================

  DefraMapClient.prototype._handleKeyboardAction = async function () {
    if (this._isDrawing) {
      this._handleKeyboardPlacePoint()
    } else if (this._fillActive) {
      await this._handleKeyboardFillSelect()
    } else if (this._sliceActive) {
      this._handleKeyboardSliceSelect()
    } else if (this._isLineDrawing) {
      this._handleKeyboardPlaceLinePoint()
    }
  }

  DefraMapClient.prototype._handleKeyboardConfirm = function () {
    // Match the Accept button behavior exactly
    if (this._isDrawing) {
      // Auto-close polygon if we have at least 3 points (same as Accept button)
      if (
        this._currentPolygonCoords &&
        this._currentPolygonCoords.length >= 3
      ) {
        this._closePolygon()
      }
    } else if (this._fillActive) {
      if (this._fillMode === 'boundary') {
        // For fill-boundary, confirm the selection
        this.confirmFill()
      } else if (this._fillMode === 'parcels') {
        // For fill-parcels, finish the mode (same as Accept button)
        this.cancelFill()
      }
    } else if (this._sliceActive) {
      if (this._sliceStart) {
        // For slice with a start point, try to complete at current position
        this._handleKeyboardSliceSelect()
      } else {
        // No start point yet, cancel slice mode
        this.cancelSlice()
      }
    } else if (this._removeActive) {
      // Finish remove mode (same as Accept button)
      this.finishRemove()
    } else if (this._isLineDrawing) {
      // Finish line if we have at least 2 points (same as Accept button)
      if (this._currentLineCoords && this._currentLineCoords.length >= 2) {
        this.finishLineDraw()
      }
    }
  }

  DefraMapClient.prototype._handleKeyboardCancel = function () {
    if (this._isDrawing) {
      this.cancelDrawing()
    } else if (this._fillActive) {
      this.cancelFill()
    } else if (this._sliceActive) {
      this.cancelSlice()
    } else if (this._removeActive) {
      this.cancelRemove()
    } else if (this._isLineDrawing) {
      this.cancelLineDraw()
    }
  }

  // ============================
  // Global keydown handler
  // ============================

  DefraMapClient.prototype._handleGlobalKeydown = function (e) {
    // Escape to close keyboard help modal (highest priority)
    if (e.key === 'Escape' && this._keyboardHelpModalOpen) {
      e.preventDefault()
      e.stopPropagation()
      this._closeKeyboardHelpModal()
      return
    }

    // Escape to close drawer menu if open
    if (e.key === 'Escape') {
      const drawer = document.getElementById('defra-map-drawer')
      if (
        drawer &&
        drawer.classList.contains('defra-map-controls__drawer--open')
      ) {
        e.preventDefault()
        e.stopPropagation()
        this._closeDrawerMenu()
        return
      }
    }

    // Ctrl+Space to perform action (place point, fill select, slice) - works globally when tool is active
    if ((e.ctrlKey || e.metaKey) && e.key === ' ') {
      if (this._isToolActive()) {
        e.preventDefault()
        e.stopPropagation()
        // Enter keyboard mode and ensure crosshair is visible
        this._enterKeyboardMode()
        // Show crosshair and update snap if not already shown
        if (this._keyboardMode && !this._keyboardTargetElement) {
          this._showKeyboardTarget()
        }
        this._updateKeyboardSnapIndicator()
        this._handleKeyboardAction()
        return
      }
    }

    // Ctrl+M to toggle drawer menu
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
      e.preventDefault()
      this._toggleDrawerMenu()
      return
    }

    // Ctrl+K to open keyboard help
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault()
      if (this._keyboardHelpModalOpen) {
        this._closeKeyboardHelpModal()
      } else {
        this._openKeyboardHelpModal()
      }
      return
    }
  }

  // ============================
  // Drawer menu keyboard control
  // ============================

  DefraMapClient.prototype._toggleDrawerMenu = function () {
    const drawer = document.getElementById('defra-map-drawer')
    if (!drawer) return

    const isOpen = drawer.classList.contains('defra-map-controls__drawer--open')
    const hamburgerBtn = document.querySelector(
      '.defra-map-controls__hamburger'
    )

    if (isOpen) {
      this._closeDrawerMenu()
    } else {
      // Open drawer
      drawer.classList.add('defra-map-controls__drawer--open')
      drawer.setAttribute('aria-hidden', 'false')
      if (hamburgerBtn) {
        hamburgerBtn.setAttribute('aria-expanded', 'true')
        hamburgerBtn.classList.add('defra-map-controls__hamburger--active')
        // Focus hamburger button to allow Tab navigation into menu
        hamburgerBtn.focus()
      }
      this._setupDrawerFocusTrap(drawer)
      this._emitter.emit('keyboard:drawerOpened', {})
    }
  }

  DefraMapClient.prototype._closeDrawerMenu = function () {
    const drawer = document.getElementById('defra-map-drawer')
    if (!drawer) return

    const hamburgerBtn = document.querySelector(
      '.defra-map-controls__hamburger'
    )

    drawer.classList.remove('defra-map-controls__drawer--open')
    drawer.setAttribute('aria-hidden', 'true')
    if (hamburgerBtn) {
      hamburgerBtn.setAttribute('aria-expanded', 'false')
      hamburgerBtn.classList.remove('defra-map-controls__hamburger--active')
    }

    // Return focus to map
    const mapTarget = this._map.getTargetElement()
    if (mapTarget) {
      mapTarget.focus({ preventScroll: true })
    }

    this._emitter.emit('keyboard:drawerClosed', {})
  }

  DefraMapClient.prototype._setupDrawerFocusTrap = function (drawer) {
    // Remove any existing trap handler
    if (this._drawerKeyHandler) {
      drawer.removeEventListener('keydown', this._drawerKeyHandler)
    }

    this._drawerKeyHandler = (e) => {
      const isOpen = drawer.classList.contains(
        'defra-map-controls__drawer--open'
      )
      if (!isOpen) return

      // Get all focusable elements in drawer
      const focusableElements = drawer.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements[focusableElements.length - 1]

      if (e.key === 'Tab') {
        if (e.shiftKey) {
          // Shift+Tab from first element goes to last
          if (document.activeElement === firstFocusable) {
            e.preventDefault()
            lastFocusable.focus()
          }
        } else {
          // Tab from last element goes to first
          if (document.activeElement === lastFocusable) {
            e.preventDefault()
            firstFocusable.focus()
          }
        }
      }
      // Note: Escape is handled by _handleGlobalKeydown
    }

    drawer.addEventListener('keydown', this._drawerKeyHandler)
  }

  // ============================
  // Keyboard drawing
  // ============================

  DefraMapClient.prototype._handleKeyboardPlacePoint = function () {
    if (!this._isDrawing) return

    // Use the last calculated snap coordinate (from center)
    const snapCoord = this._lastSnapCoord || this._map.getView().getCenter()
    if (!snapCoord) return

    // Check if we should close polygon (if we're near the first vertex)
    if (this._currentPolygonCoords.length >= 3) {
      const firstCoord = this._currentPolygonCoords[0]
      const distance = this._getDistance(snapCoord, firstCoord)
      const resolution = this._map.getView().getResolution()
      const closeThreshold = this._closeTolerancePx * resolution

      if (distance <= closeThreshold) {
        // Close the polygon
        this._closePolygon()
        this._hideKeyboardTarget()
        return
      }
    }

    // Place the vertex
    const isFirstVertex = this._currentPolygonCoords.length === 0
    this._placeVertex(snapCoord, isFirstVertex)

    // Announce placement for screen readers
    this._announceAction(`Point ${this._currentPolygonCoords.length} placed`)

    // Update snap indicator for next position
    this._updateKeyboardSnapIndicator()
  }

  // ============================
  // Keyboard line drawing (hedgerow/watercourse)
  // ============================

  DefraMapClient.prototype._handleKeyboardPlaceLinePoint = function () {
    if (!this._isLineDrawing) return

    // Use the last calculated snap coordinate (from center)
    const snapCoord = this._lastSnapCoord || this._map.getView().getCenter()
    if (!snapCoord) return

    // Place the vertex on the line
    this._placeLineVertex(snapCoord)

    // Announce placement for screen readers
    this._announceAction(`Point ${this._currentLineCoords.length} placed`)

    // Update snap indicator for next position
    this._updateKeyboardSnapIndicator()
  }

  // ============================
  // Keyboard fill selection
  // ============================

  DefraMapClient.prototype._handleKeyboardFillSelect = async function () {
    if (!this._fillActive) return

    const zoom = this.getZoom()
    const featureCount = this._snapIndexSource
      ? this._snapIndexSource.getFeatures().length
      : 0
    console.log(
      '[KB Fill] zoom:',
      zoom,
      'features:',
      featureCount,
      'minZoom:',
      this._minZoomForSnap
    )

    if (typeof zoom === 'number' && zoom < this._minZoomForSnap) {
      this._announceAction('Zoom in further to select polygons')
      return
    }

    if (featureCount === 0) {
      this._lastFetchExtent = null
      await this._fetchSnapData()
      console.log(
        '[KB Fill] After fetch:',
        this._snapIndexSource ? this._snapIndexSource.getFeatures().length : 0
      )
    }

    const mapSize = this._map.getSize()
    const centerPixel = [mapSize[0] / 2, mapSize[1] / 2]
    const centerCoord = this._map.getCoordinateFromPixel(centerPixel)
    console.log(
      '[KB Fill] centerPixel:',
      centerPixel,
      'centerCoord:',
      centerCoord
    )

    // Try finding polygon at center
    const clickedPolygon = this._findFillPolygonAtPixel(centerPixel, false)
    console.log('[KB Fill] result:', clickedPolygon)

    if (!clickedPolygon) {
      this._announceAction('No polygon found at this location')
      return
    }

    console.log('[KB Fill] fillMode:', this._fillMode)

    if (this._fillMode === 'parcels') {
      console.log('[KB Fill] Validating for parcels mode...')
      const validation = this._validatePolygonWithinBoundary(
        clickedPolygon.geometry
      )
      if (!validation.valid) {
        console.log('[KB Fill] Validation failed:', validation.error)
        this._announceAction(validation.error)
        return
      }

      const overlapCheck = this._checkOverlapWithExistingParcels(
        clickedPolygon.geometry
      )
      if (!overlapCheck.valid) {
        console.log('[KB Fill] Overlap check failed:', overlapCheck.error)
        this._announceAction(overlapCheck.error)
        return
      }

      console.log('[KB Fill] Adding as parcel...')
      this._addFillPolygonAsParcel(clickedPolygon)
      this._announceAction('Parcel added')
      return
    }

    console.log('[KB Fill] Toggling selection (boundary mode)...')
    this._toggleFillSelection(clickedPolygon)
    console.log('[KB Fill] Selection count:', this._fillSelected.length)
    this._announceAction(
      `Polygon ${this._fillSelected.length > 0 ? 'selected' : 'deselected'}`
    )
  }

  // ============================
  // Keyboard slice selection
  // ============================

  DefraMapClient.prototype._handleKeyboardSliceSelect = function () {
    if (!this._sliceActive) return

    const center = this._map.getView().getCenter()
    if (!center) return

    if (!this._sliceStart) {
      // First point - find snap point on boundary or parcel
      const snapInfo = this._findSliceSnapPoint(center)
      if (!snapInfo) {
        this._announceAction(
          'Please position crosshair on a boundary or parcel edge'
        )
        return
      }

      this._sliceStart = snapInfo
      this._sliceSourceType = snapInfo.sourceType
      this._sliceSourceParcelIndex = snapInfo.parcelIndex
      this._sliceSourceCoords = snapInfo.polygonCoords.slice()

      this._sliceStartMarker = new ol.Feature({
        geometry: new ol.geom.Point(this._sliceStart.coordinate),
        featureType: 'start'
      })
      this._sliceSource.addFeature(this._sliceStartMarker)

      this._announceAction(
        'Slice start point set. Move to end point and press Ctrl+Space again'
      )
      this._emitter.emit('slice:pointSelected', {
        stage: 'start',
        sourceType: this._sliceSourceType,
        parcelIndex: this._sliceSourceParcelIndex
      })
      return
    }

    // Second point - complete the slice
    const snapInfo = this._findSliceSnapPointOnSourcePolygon(center)
    if (!snapInfo) {
      this._announceAction(
        'Please position crosshair on the same polygon to complete slice'
      )
      return
    }

    const dist = this._getDistance(
      this._sliceStart.coordinate,
      snapInfo.coordinate
    )
    if (dist < 1) {
      this._announceAction('Please select a different point')
      return
    }

    this._executeSlice(this._sliceStart, snapInfo)
    this._announceAction('Slice completed')
  }

  // ============================
  // Screen reader announcements
  // ============================

  DefraMapClient.prototype._announceAction = function (message) {
    // Create or reuse live region for announcements
    let liveRegion = document.getElementById('defra-map-announcements')
    if (!liveRegion) {
      liveRegion = document.createElement('div')
      liveRegion.id = 'defra-map-announcements'
      liveRegion.setAttribute('aria-live', 'polite')
      liveRegion.setAttribute('aria-atomic', 'true')
      liveRegion.className = 'govuk-visually-hidden'
      document.body.appendChild(liveRegion)
    }

    // Clear and set new message
    liveRegion.textContent = ''
    setTimeout(() => {
      liveRegion.textContent = message
    }, 100)
  }

  // ============================
  // Utility: schedule snap update after animation
  // ============================

  DefraMapClient.prototype._scheduleSnapUpdate = function () {
    if (this._snapUpdateTimeout) {
      clearTimeout(this._snapUpdateTimeout)
    }
    this._snapUpdateTimeout = setTimeout(() => {
      this._updateKeyboardSnapIndicator()
    }, 150)
  }

  // ============================
  // Override startDrawing to show keyboard target
  // ============================

  const originalStartDrawing = DefraMapClient.prototype.startDrawing
  DefraMapClient.prototype.startDrawing = function () {
    originalStartDrawing.call(this)

    // Show keyboard target if in keyboard mode
    if (this._keyboardMode && this._isDrawing) {
      this._showKeyboardTarget()
      this._updateKeyboardSnapIndicator()
    }
  }

  // ============================
  // Override cancelDrawing to hide keyboard target
  // ============================

  const originalCancelDrawing = DefraMapClient.prototype.cancelDrawing
  DefraMapClient.prototype.cancelDrawing = function () {
    originalCancelDrawing.call(this)
    this._hideKeyboardTarget()
  }

  // ============================
  // Override finishDrawing to hide keyboard target
  // ============================

  const originalFinishDrawing = DefraMapClient.prototype.finishDrawing
  DefraMapClient.prototype.finishDrawing = function () {
    originalFinishDrawing.call(this)
    this._hideKeyboardTarget()
  }

  // ============================
  // Override fill methods to show/hide keyboard target
  // ============================

  const originalStartFill = DefraMapClient.prototype._startFill
  if (originalStartFill) {
    DefraMapClient.prototype._startFill = function (kind) {
      originalStartFill.call(this, kind)

      // Show keyboard target if in keyboard mode
      if (this._keyboardMode && this._fillActive) {
        this._showKeyboardTarget()
        this._updateKeyboardSnapIndicator()
      }
    }
  }

  const originalCancelFill = DefraMapClient.prototype.cancelFill
  if (originalCancelFill) {
    DefraMapClient.prototype.cancelFill = function () {
      originalCancelFill.call(this)
      this._hideKeyboardTarget()
    }
  }

  // ============================
  // Override slice methods to show/hide keyboard target
  // ============================

  const originalStartSlice = DefraMapClient.prototype.startSlice
  if (originalStartSlice) {
    DefraMapClient.prototype.startSlice = function () {
      originalStartSlice.call(this)

      // Show keyboard target if in keyboard mode
      if (this._keyboardMode && this._sliceActive) {
        this._showKeyboardTarget()
        this._updateKeyboardSnapIndicator()
      }
    }
  }

  const originalCancelSlice = DefraMapClient.prototype.cancelSlice
  if (originalCancelSlice) {
    DefraMapClient.prototype.cancelSlice = function () {
      originalCancelSlice.call(this)
      this._hideKeyboardTarget()
    }
  }

  // ============================
  // Listen for tool events to manage keyboard target visibility
  // ============================

  const originalSetupMapEventHandlers =
    DefraMapClient.prototype._setupMapEventHandlers
  DefraMapClient.prototype._setupMapEventHandlers = function () {
    originalSetupMapEventHandlers.call(this)

    // Show/hide keyboard target based on drawing state
    this.on('drawing:started', () => {
      if (this._keyboardMode) {
        this._showKeyboardTarget()
        this._updateKeyboardSnapIndicator()
      }
    })

    this.on('drawing:cancelled', () => {
      this._hideKeyboardTarget()
    })

    this.on('drawing:completed', () => {
      this._hideKeyboardTarget()
    })

    this.on('parcel:added', () => {
      this._hideKeyboardTarget()
    })

    // Fill tool events
    this.on('fill:started', () => {
      if (this._keyboardMode) {
        this._showKeyboardTarget()
        this._updateKeyboardSnapIndicator()
      }
    })

    this.on('fill:cancelled', () => {
      this._hideKeyboardTarget()
    })

    this.on('fill:confirmed', () => {
      this._hideKeyboardTarget()
    })

    // Slice tool events
    this.on('slice:started', () => {
      if (this._keyboardMode) {
        this._showKeyboardTarget()
        this._updateKeyboardSnapIndicator()
      }
    })

    this.on('slice:cancelled', () => {
      this._hideKeyboardTarget()
    })

    this.on('slice:completed', () => {
      this._hideKeyboardTarget()
    })

    // Line drawing (hedgerow/watercourse) events
    this.on('linedraw:started', () => {
      if (this._keyboardMode) {
        this._showKeyboardTarget()
        this._updateKeyboardSnapIndicator()
      }
    })

    this.on('linedraw:cancelled', () => {
      this._hideKeyboardTarget()
    })

    this.on('linedraw:completed', () => {
      this._hideKeyboardTarget()
    })

    this.on('hedgerow:added', () => {
      this._hideKeyboardTarget()
    })

    this.on('watercourse:added', () => {
      this._hideKeyboardTarget()
    })
  }
})(window)
