//
// BNG prototype map page bootstrap for Habitat Parcels (uses the reusable window.DefraMapClient library).
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

  // Tolerance for floating point comparisons (0.01 hectare = 100 sqm)
  const AREA_TOLERANCE_SQM = 100

  const client = new window.DefraMapClient({
    target: mapContainer,
    mode: 'habitat-parcels',
    projection: 'EPSG:27700',
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
      saveBoundaryUrl: '/api/save-red-line-boundary',
      saveParcelsUrl: '/api/save-habitat-parcels'
    },
    controls: {
      enabled: true,
      tools: 'draw,fill-parcels,slice,remove',
      snappingToggles:
        'os,boundary-vertices,boundary-edges,parcel-vertices,parcel-edges'
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

  client.on('fill:cancelled', () => {
    renderAreaDisplay()
  })

  client.on('boundary:loaded', () => {
    renderAreaDisplay()
    updateSaveButtonState()
  })

  client.on('parcel:added', () => {
    showStatus('Parcel added successfully', 'success')
    renderAreaDisplay()
    updateSaveButtonState()
  })

  client.on('parcel:removed', () => {
    showStatus('Parcel removed', 'info')
    renderAreaDisplay()
    updateSaveButtonState()
  })

  client.on('parcel:changed', () => {
    renderAreaDisplay()
    updateSaveButtonState()
  })

  client.on('slice:message', (e) => {
    showStatus(e.message, e.type || 'info')
  })

  client.on('slice:completed', () => {
    showStatus('Slice complete', 'success')
    renderAreaDisplay()
    updateSaveButtonState()
  })

  // Handle save from drawer controls
  client.on('controls:save', async () => {
    await saveParcels()
  })

  init()

  async function init() {
    try {
      await client.init()
      window.dispatchEvent(
        new CustomEvent('bng-map-client-ready', { detail: { client: client } })
      )

      await loadBoundary('/api/red-line-boundary')
      renderAreaDisplay()
      updateSaveButtonState()
    } catch (error) {
      console.error('❌ Error initializing map:', error)
      mapContainer.innerHTML =
        '<div style="padding: 20px; color: red;">Error loading map. Please check console for details.</div>'
    }
  }

  async function loadBoundary(url) {
    try {
      const response = await fetch(url)
      const boundaryGeoJSON = await response.json()
      if (!boundaryGeoJSON) {
        showStatus(
          'No boundary defined. Please define a red line boundary first.',
          'error'
        )
        setTimeout(() => {
          window.location.href = '/define-red-line-boundary'
        }, 2000)
        return
      }
      const ok = client.loadBoundaryGeoJSON(boundaryGeoJSON)
      if (!ok) {
        showStatus('Error loading boundary. Please try again.', 'error')
      }
    } catch (e) {
      showStatus('Error loading boundary. Please try again.', 'error')
    }
  }

  async function saveParcels() {
    if (client.getParcelCount() === 0) {
      showStatus('No parcels to save. Draw at least one parcel.', 'warning')
      return
    }

    const geomValidation = client.validateAllParcels()
    if (!geomValidation.valid) {
      showStatus(
        'Cannot save parcels:\n• ' + geomValidation.errors.join('\n• '),
        'error'
      )
      return
    }

    // Check remaining area with tolerance for floating point errors
    const remaining = client.boundaryAreaSqm - client.parcelsTotalAreaSqm
    if (remaining < -AREA_TOLERANCE_SQM) {
      showStatus(
        'Parcel areas exceed boundary area. Please adjust parcels.',
        'error'
      )
      return
    }

    try {
      if (client.setSaveEnabled) client.setSaveEnabled(false)
      showStatus('Saving parcels...', 'info')
      const result = await client.saveParcels()
      if (result.ok && result.response && result.response.success) {
        showStatus('Parcels saved successfully! Redirecting...', 'success')
        setTimeout(() => {
          window.location.href = result.response.redirect
        }, 1000)
      } else {
        throw new Error('Save failed')
      }
    } catch (err) {
      console.error('Error saving parcels:', err)
      showStatus('Error saving parcels. Please try again.', 'error')
      updateSaveButtonState()
    }
  }

  function updateSaveButtonState() {
    if (!client.setSaveEnabled) return

    if (client.getParcelCount() === 0) {
      client.setSaveEnabled(false)
      return
    }

    const geomValidation = client.validateAllParcels()

    // Also check remaining area with tolerance
    const remaining = client.boundaryAreaSqm - client.parcelsTotalAreaSqm
    const areaValid = remaining >= -AREA_TOLERANCE_SQM

    client.setSaveEnabled(geomValidation.valid && areaValid)
  }

  function renderAreaDisplay() {
    const areaDisplay = document.getElementById('map-area-display')
    const boundaryEl = document.getElementById('boundary-area')
    const totalEl = document.getElementById('total-area')
    const remainingEl = document.getElementById('remaining-area-value')

    if (!areaDisplay) return

    // Show the display
    areaDisplay.style.display = 'block'

    if (boundaryEl && client.boundaryAreaSqm) {
      boundaryEl.textContent =
        (client.boundaryAreaSqm / 10000).toFixed(2) + ' ha'
    }

    if (totalEl) {
      totalEl.textContent =
        (client.parcelsTotalAreaSqm / 10000).toFixed(2) + ' ha'
    }

    if (remainingEl) {
      const remainingSqm = client.boundaryAreaSqm - client.parcelsTotalAreaSqm
      const remainingHa = remainingSqm / 10000

      // Use tolerance for display: if very close to 0, show 0.00
      if (Math.abs(remainingHa) < 0.005) {
        remainingEl.textContent = '0.00 ha'
        remainingEl.className =
          'map-area-display__data map-area-display__data--success'
      } else if (remainingHa < 0) {
        remainingEl.textContent = remainingHa.toFixed(2) + ' ha'
        remainingEl.className =
          'map-area-display__data map-area-display__data--warning'
      } else {
        remainingEl.textContent = remainingHa.toFixed(2) + ' ha'
        remainingEl.className = 'map-area-display__data'
      }
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
