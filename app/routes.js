//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

// Load environment variables from .env file
require('dotenv').config()

const { ProxyAgent } = require('undici')
const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

const multer = require('multer')
const proj4 = require('proj4')
const Database = require('better-sqlite3')
const wkx = require('wkx')

// Define British National Grid (EPSG:27700) for server-side reprojection
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
    '+x_0=400000 +y_0=-100000 +ellps=airy ' +
    '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 ' +
    '+units=m +no_defs'
)

// Polyfill `self` for shpjs which expects a browser-like global
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis
}

// Validation thresholds TBD
const maxFileSizeMB = 100
const boundaryLayerName = 'Red Line Boundary'
const habitatsLayerName = 'Habitats'
const maxBoundaryFeatures = 10
const maxPolygonSize = 1000000000 // 1000 sq km

const withinUKArcgisUrl =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Countries_December_2024_Boundaries_UK_BFE/FeatureServer/0/query'
const lpaQueryUrl =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services/Local_Planning_Authorities_April_2022_UK_BFE_2022/FeatureServer/0/query'
const ncaQueryUrl =
  'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Character_Areas_England/FeatureServer/0/query'
const lnrsQueryUrl =
  'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Local_Nature_Recovery_Strategy_Areas_England/FeatureServer/0/query'

const distinctivenessScores = {
  'V.High': 8,
  High: 6,
  Medium: 4,
  Low: 2,
  'V.Low': 0
}

const conditionScores = {
  Good: 3,
  'Fairly Good': 2.5,
  Moderate: 2,
  'Fairly Poor': 1.5,
  Poor: 1,
  'Condition Assessment N/A': 1,
  'N/A - Other': 0
}

// Lazy-load shpjs via dynamic import to ensure we get the ESM default export
let shpPromise = null
async function getShp() {
  if (!shpPromise) {
    shpPromise = import('shpjs').then((mod) => {
      return mod.default || mod.getShapefile || mod
    })
  }
  return shpPromise
}

const upload = multer({ storage: multer.memoryStorage() })

// Note: proj4 and EPSG:27700 definition kept for potential future use
// Currently, shpjs automatically converts shapefiles to WGS84 (EPSG:4326)
// and we pass this through to the frontend which handles projection to EPSG:3857 for display

// Add your routes here

// WFS API test page
router.get('/test-wfs', function (req, res) {
  res.render('test-wfs')
})

// OS API Proxy Endpoints
// These endpoints proxy requests to Ordnance Survey APIs,
// keeping the API key secure on the server side

// Tiles Style Endpoint - proxies OS NGD Vector Tile Styles API
// Supports both EPSG:27700 (British National Grid) and EPSG:3857 (Web Mercator)
router.get('/api/os/tiles/style/:crs?', async function (req, res) {
  const apiKey = process.env.OS_PROJECT_API_KEY

  if (!apiKey) {
    console.error('OS_PROJECT_API_KEY not found in environment variables')
    return res.status(500).json({ error: 'API key not configured' })
  }

  // Use EPSG:27700 (British National Grid) by default for better alignment
  // Fall back to 3857 if explicitly requested
  const crs = req.params.crs || '27700'
  const collectionId = 'ngd-base'
  const osUrl = `https://api.os.uk/maps/vector/ngd/ota/v1/collections/${collectionId}/styles/${crs}?key=${apiKey}`

  console.log(`Fetching style for CRS: ${crs}`)

  try {
    const response = await proxyFetch(osUrl, { method: 'GET' })

    if (!response.ok) {
      console.error(
        `OS NGD API error: ${response.status} ${response.statusText}`
      )
      const errorText = await response.text()
      console.error('Error details:', errorText)
      return res.status(response.status).json({
        error: 'OS NGD API request failed',
        status: response.status,
        details: errorText
      })
    }

    const data = await response.json()

    // Inject API key into tile source URLs
    if (data.sources) {
      Object.keys(data.sources).forEach((sourceKey) => {
        const source = data.sources[sourceKey]
        if (source.tiles && Array.isArray(source.tiles)) {
          source.tiles = source.tiles.map((tileUrl) => {
            // Add API key to tile URLs if not already present
            if (!tileUrl.includes('key=')) {
              const separator = tileUrl.includes('?') ? '&' : '?'
              return `${tileUrl}${separator}key=${apiKey}`
            }
            return tileUrl
          })
        }
      })
    }

    res.json(data)
  } catch (error) {
    console.error('Error fetching OS NGD tiles style:', error)
    res.status(500).json({ error: 'Failed to fetch tile styles' })
  }
})

// Tiles Endpoint - proxies OS NGD Vector Tile requests
// OGC API Tiles standard uses {z}/{y}/{x} order (TileMatrix/TileRow/TileCol)
// Supports optional CRS parameter: /api/os/tiles/:collection/:crs/:z/:y/:x
// Default CRS is 27700 (British National Grid) for better alignment with WFS features
router.get(
  '/api/os/tiles/:collection/:crs/:z/:y/:x',
  async function (req, res) {
    const apiKey = process.env.OS_PROJECT_API_KEY

    if (!apiKey) {
      console.error('OS_PROJECT_API_KEY not found in environment variables')
      return res.status(500).json({ error: 'API key not configured' })
    }

    const { collection, crs, z, y, x } = req.params
    const osUrl = `https://api.os.uk/maps/vector/ngd/ota/v1/collections/${collection}/tiles/${crs}/${z}/${y}/${x}?key=${apiKey}`

    console.log(
      `Fetching tile: ${collection}/${crs}/${z}/${y}/${x} (CRS/TileMatrix/TileRow/TileCol)`
    )
    console.log(`OS URL: ${osUrl.replace(apiKey, 'REDACTED')}`)

    try {
      const response = await proxyFetch(osUrl, { method: 'GET' })

      if (!response.ok) {
        console.error(
          `OS NGD Tiles API error: ${response.status} ${response.statusText} for tile ${z}/${y}/${x}`
        )
        const errorText = await response.text()
        console.error('Error details:', errorText)
        return res.status(response.status).send('Tile not found')
      }

      // Get the tile data as a buffer
      // Note: Node.js fetch automatically decompresses gzip content
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      console.log(`✓ Tile fetched: ${buffer.length} bytes (decompressed)`)

      // Set appropriate headers for MVT
      // DO NOT set Content-Encoding - the data is already decompressed by Node.js fetch
      res.set('Content-Type', 'application/vnd.mapbox-vector-tile')
      res.set('Access-Control-Allow-Origin', '*')
      res.set('Cache-Control', 'public, max-age=3600')

      res.send(buffer)
    } catch (error) {
      console.error('Error fetching OS NGD tile:', error)
      res.status(500).send('Failed to fetch tile')
    }
  }
)

// Features Endpoint - proxies OS NGD Features API (OGC API Features)
router.get('/api/os/features/:collection/items', async function (req, res) {
  const apiKey = process.env.OS_PROJECT_API_KEY

  if (!apiKey) {
    console.error('OS_PROJECT_API_KEY not found in environment variables')
    return res.status(500).json({ error: 'API key not configured' })
  }

  const collection = req.params.collection

  // Build OGC API Features query parameters
  const params = new URLSearchParams({
    key: apiKey
  })

  // Pass through query parameters from the client
  const allowedParams = ['bbox', 'bbox-crs', 'limit', 'offset', 'crs']
  allowedParams.forEach((param) => {
    if (req.query[param]) {
      params.append(param, req.query[param])
    }
  })

  const osUrl = `https://api.os.uk/features/ngd/ofa/v1/collections/${collection}/items?${params.toString()}`

  try {
    const response = await proxyFetch(osUrl, { method: 'GET' })

    if (!response.ok) {
      const errorText = await response.text()
      console.error(
        `OS NGD Features API error: ${response.status} ${response.statusText}`,
        errorText
      )
      return res.status(response.status).json({
        error: 'OS NGD Features API request failed',
        status: response.status,
        details: errorText
      })
    }

    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Error fetching OS NGD features:', error)
    res.status(500).json({ error: 'Failed to fetch features' })
  }
})

// Red Line Boundary API Endpoints

// Save red line boundary to session
router.post('/api/save-red-line-boundary', function (req, res) {
  req.session.data['redLineBoundary'] = req.body
  console.log('Red line boundary saved to session')
  // Explicitly save session to ensure data persists before redirect
  req.session.save(function (err) {
    if (err) {
      console.error('Session save error:', err)
      return res.status(500).json({ error: 'Failed to save session' })
    }
    res.json({ success: true, redirect: '/on-site-habitat-baseline' })
  })
})

// Get red line boundary from session
router.get('/api/red-line-boundary', function (req, res) {
  const boundary = req.session.data['redLineBoundary'] || null
  res.json(boundary)
})

// Habitat Parcels API Endpoints

// Save habitat parcels to session
router.post('/api/save-habitat-parcels', function (req, res) {
  req.session.data['habitatParcels'] = req.body
  console.log('Habitat parcels saved to session')
  // Explicitly save session to ensure data persists before redirect
  req.session.save(function (err) {
    if (err) {
      console.error('Session save error:', err)
      return res.status(500).json({ error: 'Failed to save session' })
    }
    res.json({ success: true, redirect: '/on-site-baseline/habitats-summary' })
  })
})

// Get habitat parcels from session
router.get('/api/habitat-parcels', function (req, res) {
  const parcels = req.session.data['habitatParcels'] || null
  res.json(parcels)
})

// Linear Features API Endpoints

// Save linear features to session
router.post('/api/save-linear-features', function (req, res) {
  req.session.data['hedgerows'] = req.body.hedgerows
  req.session.data['watercourses'] = req.body.watercourses
  console.log('Linear features saved to session')
  // Explicitly save session to ensure data persists
  req.session.save(function (err) {
    if (err) {
      console.error('Session save error:', err)
      return res.status(500).json({ error: 'Failed to save session' })
    }
    res.json({ success: true })
  })
})

// Get linear features from session
router.get('/api/linear-features', function (req, res) {
  res.json({
    hedgerows: req.session.data['hedgerows'] || {
      type: 'FeatureCollection',
      features: []
    },
    watercourses: req.session.data['watercourses'] || {
      type: 'FeatureCollection',
      features: []
    }
  })
})

router.post('/api/convert', upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith('.zip')) {
      return res
        .status(400)
        .json({ detail: 'Upload must be a .zip file containing a shapefile' })
    }

    // Convert Node.js Buffer to a clean ArrayBuffer slice for shpjs
    const buffer = req.file.buffer
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    )

    const shp = await getShp()
    // shpjs automatically converts shapefiles to WGS84 (EPSG:4326)
    // Frontend will handle projection to EPSG:3857 for display on the map
    const geojson = await shp(arrayBuffer)
    if (!geojson || !geojson.features || !geojson.features.length) {
      return res
        .status(400)
        .json({ detail: 'No features found in the archive' })
    }

    res.json(geojson)
  } catch (err) {
    console.error(err)
    res.status(400).json({ detail: 'Could not read shapefile contents' })
  }
})

async function proxyFetch(url, options) {
  const proxyUrlConfig = process.env.HTTP_PROXY

  if (!proxyUrlConfig) {
    return await fetch(url, options)
  }

  return await fetch(url, {
    ...options,
    dispatcher: new ProxyAgent({
      uri: proxyUrlConfig,
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10
    })
  })
}

// ============================================
// On-Site Baseline Journey Routes
// ============================================

// Upload Choice Page - GET
router.get('/on-site-baseline/start', function (req, res) {
  res.render('on-site-baseline/start', {
    error: req.query.error || null
  })
})

// Upload Choice Page - POST
router.post('/on-site-baseline/start', function (req, res) {
  const uploadChoice = req.body.uploadChoice

  if (!uploadChoice) {
    return res.redirect(
      '/on-site-baseline/start?error=Select how you want to add your habitat data'
    )
  }

  // Store the choice in session
  req.session.data['uploadChoice'] = uploadChoice

  // Route based on selection
  switch (uploadChoice) {
    case 'single-file':
      return res.redirect('/on-site-baseline/upload-single-file')
    case 'separate-files':
      // Future implementation
      return res.redirect('/on-site-baseline/upload-boundary')
    case 'no-files':
      return res.redirect('/define-red-line-boundary')
    default:
      return res.redirect('/on-site-baseline/start?error=Invalid selection')
  }
})

// Upload Single File Page - GET
router.get('/on-site-baseline/upload-single-file', function (req, res) {
  res.render('on-site-baseline/upload-single-file', {
    error: req.query.error || null
  })
})

// Upload Single File Page - POST (handles GeoPackage upload)
router.post(
  '/on-site-baseline/upload-single-file',
  upload.single('fileUpload'),
  async function (req, res) {
    if (!req.file) {
      return res.redirect(
        '/on-site-baseline/upload-single-file?error=Select a file to upload'
      )
    }

    const originalName = req.file.originalname.toLowerCase()
    if (!originalName.endsWith('.gpkg')) {
      return res.redirect(
        '/on-site-baseline/upload-single-file?error=Upload a GeoPackage (.gpkg) file'
      )
    }

    // Check that the file is not too large
    if (req.file.size > maxFileSizeMB * 1024 * 1024) {
      return res.redirect(
        `/on-site-baseline/upload-single-file?error=File is too large. Please upload a file smaller than ${maxFileSizeMB}MB`
      )
    }

    try {
      // Parse the GeoPackage file
      const gpkgData = parseGeoPackage(req.file.buffer)

      if (!gpkgData.layers || gpkgData.layers.length === 0) {
        return res.redirect(
          '/on-site-baseline/upload-single-file?error=No layers found in the GeoPackage file'
        )
      }

      // Store parsed data in session
      req.session.data['uploadedFiles'] = {
        habitatFile: {
          originalName: req.file.originalname,
          mimeType: req.file.mimetype,
          size: req.file.size,
          storageKey: `upload-${Date.now()}`
        }
      }

      console.log('gpkgData.layers:', gpkgData.layers)
      console.log('gpkgData.geometries:', gpkgData.geometries)

      // Check if geometries are within the UK
      //if (!gpkgData.geometries[boundaryLayerName].features.every(f => isWithinUK(f.geometry))) {
      if (!isWithinUK(gpkgData.geometries[boundaryLayerName].features)) {
        console.log('Geometries are not within England')
        return res.redirect(
          `/on-site-baseline/upload-single-file?error=Geometries are not within England`
        )
      }

      // Check that there are not too many Red Line Boundary features
      if (
        gpkgData.geometries[boundaryLayerName].features.length >
        maxBoundaryFeatures
      ) {
        console.log('Red Line Boundary has too many features')
        return res.redirect(
          `/on-site-baseline/upload-single-file?error=Red Line Boundary has too many features. Please upload a file with no more than ${maxBoundaryFeatures} features`
        )
      }

      // Check that geometries are not too large
      // `f.geometry` is a GeoJSON geometry object and does not have an `area` property,
      // so we calculate the area on the fly using `calculatePolygonArea`.
      if (
        gpkgData.geometries[boundaryLayerName].features.some((f) => {
          const area = calculatePolygonArea(f.geometry)
          return area > maxPolygonSize
        })
      ) {
        console.log('Geometries are too large')
        return res.redirect(
          `/on-site-baseline/upload-single-file?error=Geometries are too large. Please upload a file with polygons smaller than ${maxPolygonSize / 1000000} square kilometers`
        )
      }

      // Check that geometries do not self-intersect
      if (
        gpkgData.geometries[boundaryLayerName].features.some((f) => {
          // Check for self-intersection
          // f.geometry is a GeoJSON geometry object
          if (
            f.geometry.type === 'Polygon' ||
            f.geometry.type === 'MultiPolygon'
          ) {
            if (isPolygonSelfIntersecting(f.geometry)) {
              return true // Found a self-intersecting geometry
            }
          }
          return false // Not self-intersecting
        })
      ) {
        console.log('Geometries self-intersect')
        return res.redirect(
          `/on-site-baseline/upload-single-file?error=Geometries self-intersect. Please upload a file with non-self-intersecting polygons`
        )
      }

      // Get the LPA name
      const lpaName = await getLPA(
        gpkgData.geometries[boundaryLayerName].features
      )
      console.log('LPA name:', lpaName)

      const ncaName = await getNCA(
        gpkgData.geometries[boundaryLayerName].features
      )
      console.log('NCA name:', ncaName)

      const lnrsName = await getLNRS(
        gpkgData.geometries[boundaryLayerName].features
      )
      console.log('LNRS name:', lnrsName)

      req.session.data['geopackageLayers'] = gpkgData.layers
      req.session.data['geopackageGeometries'] = gpkgData.geometries
      req.session.data['lpaName'] = lpaName
      req.session.data['ncaName'] = ncaName
      req.session.data['lnrsName'] = lnrsName
      // Redirect to confirm page
      res.redirect('/on-site-baseline/confirm-layers')
    } catch (err) {
      console.error('GeoPackage parsing error:', err)
      return res.redirect(
        '/on-site-baseline/upload-single-file?error=Could not read the GeoPackage file. Please check the file is valid.'
      )
    }
  }
)

// Confirm Layers Page - GET
router.get('/on-site-baseline/confirm-layers', function (req, res) {
  const layers = req.session.data['geopackageLayers'] || []
  const geometries = req.session.data['geopackageGeometries'] || {}
  const uploadedFiles = req.session.data['uploadedFiles'] || {}

  // Find boundary and parcel layers (heuristic based on layer names)
  let siteBoundary =
    layers.find(
      (l) =>
        l.name.toLowerCase().includes('boundary') ||
        l.name.toLowerCase().includes('red_line') ||
        l.name.toLowerCase().includes('redline')
    ) || layers[0]

  let habitatParcels =
    layers.find(
      (l) =>
        l.name.toLowerCase().includes('parcel') ||
        l.name.toLowerCase().includes('habitat')
    ) || (layers.length > 1 ? layers[1] : layers[0])

  // Calculate areas in hectares
  const boundaryAreaHa = siteBoundary
    ? (siteBoundary.totalAreaSqm / 10000).toFixed(2)
    : 0
  const parcelsAreaHa = habitatParcels
    ? (habitatParcels.totalAreaSqm / 10000).toFixed(2)
    : 0

  // Build view data
  const viewData = {
    uploadSummary: {
      layerCountMessage: `File uploaded – ${layers.length} layer${layers.length !== 1 ? 's' : ''} found`
    },
    layers: {
      siteBoundary: {
        polygonCount: siteBoundary ? siteBoundary.featureCount : 0,
        areaHa: boundaryAreaHa,
        layerName: siteBoundary ? siteBoundary.name : 'Not found'
      },
      habitatParcels: {
        polygonCount: habitatParcels ? habitatParcels.featureCount : 0,
        areaHa: parcelsAreaHa,
        layerName: habitatParcels ? habitatParcels.name : 'Not found'
      }
    },
    coverage: {
      isFull: true // Simplified for prototype
    },
    location: {
      lpaName: req.session.data['lpaName'] || '<LPA Name>',
      nationalCharacterArea:
        req.session.data['ncaName'] || '<National Character Area>',
      lnrsName: req.session.data['lnrsName'] || '<LNRS Name>'
    },
    geometries: geometries,
    boundaryLayerName: siteBoundary ? siteBoundary.name : null,
    parcelsLayerName: habitatParcels ? habitatParcels.name : null
  }

  res.render('on-site-baseline/confirm-layers', viewData)
})

// Confirm Layers Page - POST
router.post('/on-site-baseline/confirm-layers', function (req, res) {
  // Mark layers as confirmed
  req.session.data['layersConfirmed'] = true

  // Redirect to habitats summary (future implementation)
  res.redirect('/on-site-baseline/habitats-summary')
})

// Habitats Summary page
router.get('/on-site-baseline/habitats-summary', function (req, res) {
  // Check which flow the user came from:
  // - GeoPackage flow: has geopackageLayers and geopackageGeometries
  // - Drawing flow: has redLineBoundary and habitatParcels

  const drawnBoundary = req.session.data['redLineBoundary']
  const drawnParcels = req.session.data['habitatParcels']
  const isDrawingFlow = drawnBoundary && drawnParcels

  // Debug logging
  console.log('Habitats summary - session state:', {
    hasBoundary: !!drawnBoundary,
    hasParcels: !!drawnParcels,
    parcelCount: drawnParcels?.features?.length || 0,
    isDrawingFlow: isDrawingFlow,
    hasHedgerows: !!(req.session.data['hedgerows']?.features?.length > 0),
    hasWatercourses: !!(req.session.data['watercourses']?.features?.length > 0)
  })

  let totalAreaHectares = 0
  let habitatParcels = []
  let mapData = {}
  let lpaName = req.session.data['lpaName'] || 'Not specified'
  let ncaName = req.session.data['ncaName'] || 'Not specified'

  if (isDrawingFlow) {
    // Drawing flow - use drawn geometries from session
    // Note: drawnBoundary is a single GeoJSON Feature (from saveBoundary)
    // drawnParcels is a FeatureCollection (from saveParcels)

    // Convert single Feature boundary to FeatureCollection for consistency
    let boundaryFeatureCollection = null
    if (
      drawnBoundary &&
      drawnBoundary.type === 'Feature' &&
      drawnBoundary.geometry
    ) {
      boundaryFeatureCollection = {
        type: 'FeatureCollection',
        features: [drawnBoundary]
      }
      // Calculate boundary area
      const totalAreaSqm = calculatePolygonArea(drawnBoundary.geometry)
      totalAreaHectares = (totalAreaSqm / 10000).toFixed(2)
    }

    // Build parcels data from drawn parcels (already a FeatureCollection)
    if (
      drawnParcels &&
      drawnParcels.features &&
      drawnParcels.features.length > 0
    ) {
      drawnParcels.features.forEach((feature, index) => {
        let parcelAreaHa = 0
        if (feature.geometry) {
          const areaSqm = calculatePolygonArea(feature.geometry)
          parcelAreaHa = (areaSqm / 10000).toFixed(2)
        }

        habitatParcels.push({
          parcelId: 'HP-' + (index + 1).toString().padStart(3, '0'),
          areaHectares: parcelAreaHa,
          habitatLabel: feature.properties?.habitatType || null,
          status: 'Not started',
          actionUrl: '/on-site-baseline/parcel/' + (index + 1) + '/habitat-type'
        })
      })
    }

    // Prepare map data from drawn geometries
    mapData = {
      siteBoundary: boundaryFeatureCollection,
      parcels: drawnParcels,
      hedgerows: req.session.data['hedgerows'] || {
        type: 'FeatureCollection',
        features: []
      },
      watercourses: req.session.data['watercourses'] || {
        type: 'FeatureCollection',
        features: []
      }
    }
  } else {
    // GeoPackage flow - use uploaded data
    const layers = req.session.data['geopackageLayers'] || []
    const geometries = req.session.data['geopackageGeometries'] || {}

    // Find boundary and parcels layers
    const boundaryLayerInfo = layers.find(
      (l) =>
        l.name.toLowerCase().includes('boundary') ||
        l.name.toLowerCase().includes('site')
    )
    const parcelsLayerInfo = layers.find(
      (l) =>
        l.name.toLowerCase().includes('parcel') ||
        l.name.toLowerCase().includes('habitat')
    )

    const boundaryLayer = boundaryLayerInfo
      ? geometries[boundaryLayerInfo.name]
      : null
    const parcelsLayer = parcelsLayerInfo
      ? geometries[parcelsLayerInfo.name]
      : null

    // Calculate total site area
    if (boundaryLayerInfo) {
      totalAreaHectares = (boundaryLayerInfo.totalAreaSqm / 10000).toFixed(2)
    }

    // Build parcels data with property extraction
    if (parcelsLayerInfo && parcelsLayerInfo.featureCount > 0) {
      for (let i = 1; i <= parcelsLayerInfo.featureCount; i++) {
        let areaHa = 0
        let feature = parcelsLayer.features[i - 1]
        if (
          feature.geometry.type === 'Polygon' ||
          feature.geometry.type === 'MultiPolygon'
        ) {
          const areaSqm = calculatePolygonArea(feature.geometry)
          areaHa = areaSqm / 10000
        }

        let status = 'Not started'

        let parcelId = feature.properties['Parcel Ref'] || 'HP-' + i.toString().padStart(3, '0')
        let habitat = feature.properties['Baseline Habitat Type'] || null
        let distinctiveness =
          feature.properties['Baseline Distinctiveness'] || null
        let condition = feature.properties['Baseline Condition'] || null

        // Remove the number and period from the condition
        if (condition !== null) {
          condition = condition.replace(/^\d+\.\s*/, '')
        }

        if (
          habitat !== null ||
          distinctiveness !== null ||
          condition !== null
        ) {
          status = 'In progress'
        }

        habitatParcels.push({
          parcelId: parcelId,
          areaHectares: areaHa.toFixed(2),
          habitatLabel: habitat,
          distinctiveness: distinctiveness,
          condition: condition,
          status: status,
          actionUrl: '/on-site-baseline/parcel/' + i + '/habitat-type'
        })
      }
    }

    // Prepare map data
    mapData = {
      siteBoundary: boundaryLayer,
      parcels: parcelsLayer,
      hedgerows: req.session.data['hedgerows'] || {
        type: 'FeatureCollection',
        features: []
      },
      watercourses: req.session.data['watercourses'] || {
        type: 'FeatureCollection',
        features: []
      }
    }
  }

  // Build parcel count message
  const parcelCount = habitatParcels.length
  let parcelCountMessage = 'No habitat parcels found.'
  if (parcelCount === 1) {
    parcelCountMessage = 'You have 1 habitat parcel to classify.'
  } else if (parcelCount > 1) {
    parcelCountMessage =
      'You have ' + parcelCount + ' habitat parcels to classify.'
  }


  // Build table rows for GovUK table component
  const tableRows = habitatParcels.map(function (parcel) {
    return [
      { text: parcel.parcelId },
      { text: parcel.areaHectares },
      { text: parcel.habitatLabel || 'Not specified' },
      { text: parcel.status },
      {
        html:
          '<a class="govuk-link" href="' +
          parcel.actionUrl +
          '">Add details<span class="govuk-visually-hidden"> for ' +
          parcel.parcelId +
          '</span></a>'
      }
    ]
  })

  // Build hedgerow table rows
  const hedgerows = mapData.hedgerows?.features || []
  const hedgerowTableRows = hedgerows.map(function (feature, index) {
    const lengthM = feature.properties?.lengthM || 0
    return [
      { text: 'H-' + (index + 1).toString().padStart(3, '0') },
      { text: lengthM.toFixed(1) },
      { text: 'Not started' },
      {
        html:
          '<a class="govuk-link" href="/on-site-baseline/hedgerow/' +
          (index + 1) +
          '/details">Add details<span class="govuk-visually-hidden"> for H-' +
          (index + 1).toString().padStart(3, '0') +
          '</span></a>'
      }
    ]
  })

  // Build watercourse table rows
  const watercourses = mapData.watercourses?.features || []
  const watercourseTableRows = watercourses.map(function (feature, index) {
    const lengthM = feature.properties?.lengthM || 0
    return [
      { text: 'W-' + (index + 1).toString().padStart(3, '0') },
      { text: lengthM.toFixed(1) },
      { text: 'Not started' },
      {
        html:
          '<a class="govuk-link" href="/on-site-baseline/watercourse/' +
          (index + 1) +
          '/details">Add details<span class="govuk-visually-hidden"> for W-' +
          (index + 1).toString().padStart(3, '0') +
          '</span></a>'
      }
    ]
  })

  res.render('on-site-baseline/habitats-summary', {
    baselineSummary: {
      parcelCountMessage: parcelCountMessage
    },
    siteSummary: {
      totalAreaHectares: totalAreaHectares + ' hectares',
      localPlanningAuthority: lpaName,
      nationalCharacterArea: ncaName
    },
    mapData: mapData,
    habitatParcels: habitatParcels,
    tableRows: tableRows,
    hedgerowTableRows: hedgerowTableRows,
    watercourseTableRows: watercourseTableRows,
    actions: {
      startFirstParcel: {
        url: habitatParcels.length > 0 ? habitatParcels[0].actionUrl : '#'
      }
    }
  })
})

// API endpoint for getting parsed geometries (for map display)
router.get('/api/on-site-baseline/geometries', function (req, res) {
  const geometries = req.session.data['geopackageGeometries'] || {}
  res.json(geometries)
})

// ============================================
// GeoPackage Parsing Helper Function
// ============================================

function parseGeoPackage(buffer) {
  // Create a temporary file path for better-sqlite3
  const fs = require('fs')
  const os = require('os')
  const path = require('path')

  const tempDir = os.tmpdir()
  const tempFile = path.join(tempDir, `gpkg-${Date.now()}.gpkg`)

  try {
    // Write buffer to temp file
    fs.writeFileSync(tempFile, buffer)

    // Open the GeoPackage database
    const db = new Database(tempFile, { readonly: true })

    // Query gpkg_contents for available layers
    const contentsQuery = db.prepare(`
      SELECT table_name, data_type, identifier, description, srs_id
      FROM gpkg_contents
      WHERE data_type = 'features'
    `)
    const contents = contentsQuery.all()

    // Query gpkg_geometry_columns for geometry info
    const geomColsQuery = db.prepare(`
      SELECT table_name, column_name, geometry_type_name, srs_id
      FROM gpkg_geometry_columns
    `)
    const geomCols = geomColsQuery.all()

    // Create a map of geometry columns
    const geomColMap = {}
    geomCols.forEach((gc) => {
      geomColMap[gc.table_name] = {
        columnName: gc.column_name,
        geometryType: gc.geometry_type_name,
        srsId: gc.srs_id
      }
    })

    const layers = []
    const geometries = {}

    // Process each layer
    contents.forEach((layer) => {
      const tableName = layer.table_name
      const geomInfo = geomColMap[tableName]

      if (!geomInfo) return

      const geomCol = geomInfo.columnName

      // Count features and get geometries
      const countQuery = db.prepare(
        `SELECT COUNT(*) as count FROM "${tableName}"`
      )
      const countResult = countQuery.get()
      const featureCount = countResult.count

      // Get all columns from the layer (including geometry and attributes)
      // First, get all column names
      const tableInfoQuery = db.prepare(`PRAGMA table_info("${tableName}")`)
      const tableInfo = tableInfoQuery.all()
      const columnNames = tableInfo.map((col) => col.name)

      // Build SELECT query with all columns
      const selectColumns = columnNames.map((col) => `"${col}"`).join(', ')
      const featuresQuery = db.prepare(
        `SELECT ${selectColumns} FROM "${tableName}" WHERE "${geomCol}" IS NOT NULL`
      )
      const features = featuresQuery.all()

      let totalAreaSqm = 0
      const geoJsonFeatures = []


      features.forEach((row, index) => {
        if (row[geomCol]) {
          try {
            // Parse WKB geometry using wkx
            const geomBuffer = Buffer.isBuffer(row[geomCol])
              ? row[geomCol]
              : Buffer.from(row[geomCol])


            // GeoPackage uses standard WKB with optional envelope
            // Check for GeoPackage WKB header (starts with 'GP')
            let wkbBuffer = geomBuffer
            if (
              geomBuffer.length > 8 &&
              geomBuffer[0] === 0x47 &&
              geomBuffer[1] === 0x50
            ) {
              // GeoPackage WKB - skip the header
              const flags = geomBuffer[3]
              const envelopeType = (flags >> 1) & 0x07
              let headerSize = 8 // Base header

              // Add envelope size based on type
              const envelopeSizes = [0, 32, 48, 48, 64]
              if (envelopeType > 0 && envelopeType < envelopeSizes.length) {
                headerSize += envelopeSizes[envelopeType]
              }

              wkbBuffer = geomBuffer.slice(headerSize)
            }

            const geometry = wkx.Geometry.parse(wkbBuffer)
            const geoJson = geometry.toGeoJSON()

            // Calculate area for polygons (rough approximation in sq meters)
            if (geoJson.type === 'Polygon' || geoJson.type === 'MultiPolygon') {
              const area = calculatePolygonArea(geoJson)
              totalAreaSqm += area
            }

            // Extract all attributes (excluding the geometry column)
            const properties = {}
            columnNames.forEach((col) => {
              if (col !== geomCol) {
                properties[col] = row[col]
              }
            })
            // Also add index for reference
            properties.index = index

            geoJsonFeatures.push({
              type: 'Feature',
              properties: properties,
              geometry: geoJson
            })
          } catch (geomErr) {
            console.warn(
              `Could not parse geometry in ${tableName}:`,
              geomErr.message
            )
          }
        }
      })

      layers.push({
        name: tableName,
        identifier: layer.identifier || tableName,
        description: layer.description,
        geometryType: geomInfo.geometryType,
        srsId: geomInfo.srsId,
        featureCount: featureCount,
        totalAreaSqm: totalAreaSqm
      })

      geometries[tableName] = {
        type: 'FeatureCollection',
        features: geoJsonFeatures
      }
    })

    db.close()

    // Clean up temp file
    fs.unlinkSync(tempFile)

    return { layers, geometries }
  } catch (err) {
    // Clean up temp file on error
    try {
      require('fs').unlinkSync(tempFile)
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    throw err
  }
}


// Simple polygon area calculation (for projected coordinates in meters)
function calculatePolygonArea(geoJson) {
  if (geoJson.type === 'Polygon') {
    return calculateRingArea(geoJson.coordinates[0])
  } else if (geoJson.type === 'MultiPolygon') {
    let totalArea = 0
    geoJson.coordinates.forEach((polygon) => {
      totalArea += calculateRingArea(polygon[0])
    })
    return totalArea
  }
  return 0
}

function calculateRingArea(ring) {
  // Shoelace formula for polygon area
  let area = 0
  const n = ring.length

  for (let i = 0; i < n - 1; i++) {
    const j = (i + 1) % n
    area += ring[i][0] * ring[j][1]
    area -= ring[j][0] * ring[i][1]
  }

  return Math.abs(area / 2)
}

async function queryArcgis(url, params) {
  const response = await fetch(
    `${url}?${new URLSearchParams(params).toString()}`
  )
  const data = await response.json()
  return data
}

/**
 * Check if the geometry is within the UK
 * @param {Object} features - The features to check. NOTE: Currently just checks the first feature.
 * @returns {boolean} - True if the geometry is within the UK, false otherwise
 */
async function isWithinUK(features) {
  const esrijson_str = JSON.stringify(geojsonToEsri(features[0].geometry))

  const queryParams = {
    layerDefs: '{"0":"CTRY24NM=\'England\'"}',
    geometry: esrijson_str,
    geometryType: 'esriGeometryPolygon',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
    resultType: 'standard',
    featureEncoding: 'esriDefault',
    applyVCSProjection: 'false',
    returnCountOnly: 'true',
    f: 'json'
  }

  // const response = await fetch(`${withinUKArcgisUrl}?${new URLSearchParams(withinUKArcgisParams).toString()}`);
  // const data = await response.json();
  const data = await queryArcgis(withinUKArcgisUrl, queryParams)

  if (data.count && data.count > 0) {
    return true
  } else {
    return false
  }
}

async function getLPA(features) {
  const esrijson_str = JSON.stringify(geojsonToEsri(features[0].geometry))

  const queryParams = {
    geometry: esrijson_str,
    geometryType: 'esriGeometryPolygon',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
    resultType: 'standard',
    featureEncoding: 'esriDefault',
    applyVCSProjection: 'false',
    returnGeometry: 'false',
    outFields: 'LPA22NM,LPA22CD',
    f: 'json'
  }

  const data = await queryArcgis(lpaQueryUrl, queryParams)

  if (data.features) {
    return data.features[0].attributes.LPA22NM
  } else {
    return 'No LPA found'
  }
}

async function getNCA(features) {
  const esrijson_str = JSON.stringify(geojsonToEsri(features[0].geometry))

  const queryParams = {
    geometry: esrijson_str,
    geometryType: 'esriGeometryPolygon',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
    resultType: 'standard',
    featureEncoding: 'esriDefault',
    applyVCSProjection: 'false',
    returnGeometry: 'false',
    outFields: 'JCACODE, JCANAME, NCA_Name, NAID, NANAME',
    f: 'json'
  }

  const data = await queryArcgis(ncaQueryUrl, queryParams)

  if (data.features) {
    return data.features[0].attributes.NCA_Name
  } else {
    return 'No NCA found'
  }
}

async function getLNRS(features) {
  const esrijson_str = JSON.stringify(geojsonToEsri(features[0].geometry))

  const queryParams = {
    geometry: esrijson_str,
    geometryType: 'esriGeometryPolygon',
    inSR: '27700',
    spatialRel: 'esriSpatialRelIntersects',
    resultType: 'standard',
    featureEncoding: 'esriDefault',
    applyVCSProjection: 'false',
    returnGeometry: 'false',
    outFields: 'Name, Resp_Auth',
    f: 'json'
  }

  const data = await queryArcgis(lnrsQueryUrl, queryParams)

  if (data.features) {
    return data.features[0].attributes.Name
  } else {
    return 'No LNR found'
  }
}

/**
 * Check if two line segments intersect (excluding endpoints)
 * @param {Array} a1 - First point of segment A [x, y]
 * @param {Array} a2 - Second point of segment A [x, y]
 * @param {Array} b1 - First point of segment B [x, y]
 * @param {Array} b2 - Second point of segment B [x, y]
 * @returns {boolean} True if segments intersect (not just touch at endpoints)
 */
function doLineSegmentsIntersect(a1, a2, b1, b2) {
  // Helper function to calculate orientation
  const orientation = (p, q, r) => {
    const val = (q[1] - p[1]) * (r[0] - q[0]) - (q[0] - p[0]) * (r[1] - q[1])
    if (val === 0) return 0 // Collinear
    return val > 0 ? 1 : 2 // Clockwise or Counterclockwise
  }

  const onSegment = (p, q, r) => {
    return (
      q[0] <= Math.max(p[0], r[0]) &&
      q[0] >= Math.min(p[0], r[0]) &&
      q[1] <= Math.max(p[1], r[1]) &&
      q[1] >= Math.min(p[1], r[1])
    )
  }

  // Find orientations
  const o1 = orientation(a1, a2, b1)
  const o2 = orientation(a1, a2, b2)
  const o3 = orientation(b1, b2, a1)
  const o4 = orientation(b1, b2, a2)

  // General case: segments intersect if orientations differ
  if (o1 !== o2 && o3 !== o4) {
    return true
  }

  // Special cases: collinear segments
  if (o1 === 0 && onSegment(a1, b1, a2)) return true
  if (o2 === 0 && onSegment(a1, b2, a2)) return true
  if (o3 === 0 && onSegment(b1, a1, b2)) return true
  if (o4 === 0 && onSegment(b1, a2, b2)) return true

  return false
}

/**
 * Check if a polygon is self-intersecting
 * @param {Object} geometry - GeoJSON Polygon or MultiPolygon geometry
 * @returns {boolean} True if polygon is self-intersecting
 */
function isPolygonSelfIntersecting(geometry) {
  // Handle GeoJSON Polygon
  if (geometry.type === 'Polygon') {
    const coordinates = geometry.coordinates[0] // Get exterior ring
    return checkPolygonRingSelfIntersecting(coordinates)
  }

  // Handle GeoJSON MultiPolygon
  if (geometry.type === 'MultiPolygon') {
    for (const polygon of geometry.coordinates) {
      if (checkPolygonRingSelfIntersecting(polygon[0])) {
        return true
      }
    }
    return false
  }

  return false
}

/**
 * Check if a polygon ring (exterior or interior) is self-intersecting
 * @param {Array} coordinates - Array of [lng, lat] coordinate pairs
 * @returns {boolean} True if ring is self-intersecting
 */
function checkPolygonRingSelfIntersecting(coordinates) {
  const numPoints = coordinates.length

  // Need at least 4 points (including closing point) to form a polygon
  if (numPoints < 4) {
    return false
  }

  // Check all pairs of non-adjacent edges
  for (let i = 0; i < numPoints - 1; i++) {
    const a1 = coordinates[i]
    const a2 = coordinates[i + 1]

    // Skip adjacent and next-to-adjacent edges (they share vertices)
    // Also skip the edge that would close the polygon with the starting edge
    for (let j = i + 2; j < numPoints - 1; j++) {
      // Skip the last edge if it's adjacent to the first edge
      if (i === 0 && j === numPoints - 2) {
        continue
      }

      const b1 = coordinates[j]
      const b2 = coordinates[j + 1]

      if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
        return true
      }
    }
  }

  return false
}

/**
 * Convert a GeoJSON geometry object to an ESRI geometry object
 * @param {Object} geojson - The GeoJSON geometry object
 * @returns {Object} The ESRI geometry object
 */
function geojsonToEsri(geojson) {
  if (!geojson || !geojson.type) {
    throw new Error('Input must be a valid GeoJSON geometry object')
  }

  switch (geojson.type) {
    case 'Point':
      return {
        x: geojson.coordinates[0],
        y: geojson.coordinates[1]
      }

    case 'MultiPoint':
      return {
        points: geojson.coordinates.map((c) => [c[0], c[1]])
      }

    case 'LineString':
      return {
        paths: [geojson.coordinates.map((c) => [c[0], c[1]])]
      }

    case 'MultiLineString':
      return {
        paths: geojson.coordinates.map((path) => path.map((c) => [c[0], c[1]]))
      }

    case 'Polygon':
      return {
        rings: geojson.coordinates.map((ring) => ring.map((c) => [c[0], c[1]]))
      }

    case 'MultiPolygon':
      return {
        rings: geojson.coordinates.flatMap((polygon) =>
          polygon.map((ring) => ring.map((c) => [c[0], c[1]]))
        )
      }

    default:
      throw new Error(`Unsupported GeoJSON geometry type: ${geojson.type}`)
  }
}
