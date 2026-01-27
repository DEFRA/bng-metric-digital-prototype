//
// BNG prototype map page bootstrap for Red Line Boundary (uses the reusable window.DefraMapClient library).
//

window.GOVUKPrototypeKit.documentReady(() => {
  const mapContainer = document.getElementById('map')
  if (!mapContainer) {
    return
  }

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
    'trn-ntwk-railwaylinkset-1'
  ]

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
    'wtr-fts-water-3'
  ]

  const osFeaturesLoading = document.getElementById('os-features-loading')

  const client = new window.DefraMapClient({
    target: mapContainer,
    mode: 'red-line-boundary',
    projection: 'EPSG:27700',
    zoom: 3,
    tiles: {
      collectionId: 'ngd-base',
      crs: '27700',
      tileMatrixSetUrl:
        'https://api.os.uk/maps/vector/ngd/ota/v1/tilematrixsets/27700',
      styleUrl: '/api/os/tiles/style/27700',
      tilesUrlTemplate: '/api/os/tiles/ngd-base/27700/{z}/{y}/{x}'
    },
    osFeatures: {
      baseUrl: '/api/os/features',
      minZoomForSnap: 12,
      fetchThrottleMs: 300,
      layers: SNAP_LAYERS,
      fillPolygonLayers: FILL_POLYGON_LAYERS,
      simplifyTolerance: 0,
      maxFeaturesPerRequest: 100
    },
    endpoints: {
      saveBoundaryUrl: '/api/save-red-line-boundary'
    },
    controls: {
      enabled: true,
      tools: 'draw,fill-boundary,remove',
      snappingToggles: 'os'
    }
  })

  window.bngMapClient = client

  client.on('osFeatures:loading', (e) => {
    if (!osFeaturesLoading) return
    if (e.loading) osFeaturesLoading.classList.add('visible')
    else osFeaturesLoading.classList.remove('visible')
  })

  // view:changed event is handled by the controls overlay for tool enabling/disabling

  client.on('validation:error', (e) => {
    showStatus(e.message, 'error')
  })

  client.on('fill:message', (e) => {
    showStatus(e.message, e.type || 'info')
  })

  client.on('fill:selectionChanged', (e) => {
    // Update area display during fill selection
    if (client.getDebugInfo().fill.active && e.selectedCount > 0) {
      renderAreaDisplay(e.totalAreaSqm)
    } else if (!client.boundaryAreaSqm || client.boundaryAreaSqm <= 0) {
      hideAreaDisplay()
    }
  })

  client.on('fill:cancelled', () => {
    renderBoundaryArea()
  })

  client.on('fill:confirmed', (e) => {
    showStatus(
      `Boundary created: ${(e.areaSqm / 10000).toFixed(2)} hectares`,
      'success'
    )
    renderBoundaryArea()
    updateSaveButtonState()
  })

  client.on('boundary:changed', () => {
    renderBoundaryArea()
    updateSaveButtonState()
  })

  client.on('sketch:area', (e) => {
    renderAreaDisplay(e.areaSqm)
  })

  client.on('drawing:completed', () => {
    renderBoundaryArea()
    updateSaveButtonState()
  })

  // Handle save from drawer controls
  client.on('controls:save', async () => {
    await saveBoundary()
  })

  init()

  async function init() {
    try {
      await client.init()
      window.dispatchEvent(
        new CustomEvent('bng-map-client-ready', { detail: { client: client } })
      )
      updateSaveButtonState()
    } catch (error) {
      console.error('❌ Error initializing map:', error)
      mapContainer.innerHTML =
        '<div style="padding: 20px; color: red;">Error loading map. Please check console for details.</div>'
    }
  }

  async function saveBoundary() {
    if (!client.boundaryAreaSqm || client.boundaryAreaSqm <= 0) {
      showStatus('No boundary to save. Draw a boundary first.', 'warning')
      return
    }
    try {
      if (client.setSaveEnabled) client.setSaveEnabled(false)
      showStatus('Saving boundary...', 'info')
      const result = await client.saveBoundary()
      if (result.ok && result.response && result.response.success) {
        showStatus('Boundary saved successfully! Redirecting...', 'success')
        setTimeout(() => {
          window.location.href = result.response.redirect
        }, 1000)
      } else {
        throw new Error('Save failed')
      }
    } catch (err) {
      console.error('Error saving boundary:', err)
      showStatus('Error saving boundary. Please try again.', 'error')
      updateSaveButtonState()
    }
  }

  function updateSaveButtonState() {
    const canSave = client.boundaryAreaSqm && client.boundaryAreaSqm > 0
    if (client.setSaveEnabled) {
      client.setSaveEnabled(canSave)
    }
  }

  function renderBoundaryArea() {
    const sqm = client.boundaryAreaSqm
    if (!sqm || sqm <= 0) {
      hideAreaDisplay()
      return
    }
    renderAreaDisplay(sqm)
  }

  function renderAreaDisplay(areaSqm) {
    const areaDisplay = document.getElementById('map-area-display')
    const areaValue = document.getElementById('area-value')
    if (!areaDisplay || !areaValue) return

    if (!areaSqm || areaSqm <= 0) {
      areaDisplay.style.display = 'none'
      return
    }

    const hectares = areaSqm / 10000
    areaValue.textContent = hectares.toFixed(2)
    areaDisplay.style.display = 'block'
  }

  function hideAreaDisplay() {
    const areaDisplay = document.getElementById('map-area-display')
    if (areaDisplay) {
      areaDisplay.style.display = 'none'
    }
  }
})

/**
 * Show status message
 */
function showStatus(message, type) {
  const statusMessage = document.getElementById('status-message')
  const statusText = document.getElementById('status-text')
  const statusTitle = document.getElementById('status-title')

  if (!statusMessage || !statusText || !statusTitle) {
    console.log(`[${type}] ${message}`)
    return
  }

  statusText.textContent = message

  let title = 'Information'
  let ariaLive = 'polite'

  statusMessage.classList.remove('govuk-notification-banner--success')

  if (type === 'success') {
    title = 'Success'
    statusMessage.classList.add('govuk-notification-banner--success')
    ariaLive = 'polite'
  } else if (type === 'warning') {
    title = 'Important'
    ariaLive = 'assertive'
  } else if (type === 'error') {
    title = 'Error'
    ariaLive = 'assertive'
  }

  statusTitle.textContent = title
  statusMessage.setAttribute('aria-live', ariaLive)
  statusMessage.setAttribute('aria-atomic', 'true')
  statusMessage.style.display = 'block'

  const hideDelay = type === 'error' ? 8000 : 5000
  setTimeout(() => {
    statusMessage.style.display = 'none'
  }, hideDelay)
}
