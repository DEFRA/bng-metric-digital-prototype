/**
 * OS API Proxy Routes
 * Proxies requests to Ordnance Survey APIs, keeping the API key secure on the server side
 */

const { proxyFetch } = require('../lib/proxy-fetch')

/**
 * Register OS API proxy routes
 * @param {Router} router - Express router instance
 */
function registerOsApiRoutes(router) {
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

      // Rewrite tile sources to go through our proxy.
      // The OS API returns sources with a TileJSON `url` reference — MapLibre would
      // fetch that directly from the browser (exposing the API key + CORS issues).
      // We convert `url` references to inline `tiles` arrays pointing at our proxy.
      // Tile URLs must be absolute because MapLibre resolves them inside a Web Worker
      // which has no document base URL to resolve relative paths against.
      // Pattern: https://api.os.uk/.../collections/{collection}/tiles/{crs}?key=...
      const osTileJsonPattern =
        /^https:\/\/api\.os\.uk\/maps\/vector\/ngd\/ota\/v1\/collections\/([^/?]+)\/tiles\/([^/?]+)/
      const baseUrl = `${req.protocol}://${req.get('host')}`

      if (data.sources) {
        Object.keys(data.sources).forEach((sourceKey) => {
          const source = data.sources[sourceKey]

          if (source.url) {
            const match = source.url.match(osTileJsonPattern)
            if (match) {
              const collection = match[1]
              const tileCrs = match[2]
              delete source.url
              source.tiles = [`${baseUrl}/api/os/tiles/${collection}/${tileCrs}/{z}/{y}/{x}`]
            }
          } else if (source.tiles && Array.isArray(source.tiles)) {
            source.tiles = source.tiles.map((tileUrl) => {
              const match = tileUrl.match(osTileJsonPattern)
              if (match) {
                const collection = match[1]
                const tileCrs = match[2]
                return `${baseUrl}/api/os/tiles/${collection}/${tileCrs}/{z}/{y}/{x}`
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

      try {
        const response = await proxyFetch(osUrl, { method: 'GET' })

        if (!response.ok) {
          console.error(
            `OS NGD Tiles API error: ${response.status} for tile ${crs}/${z}/${y}/${x}`
          )
          // Return 204 No Content instead of forwarding the error status.
          // This prevents OpenLayers flooding the console with errors when
          // the OS API has a partial outage for specific tile regions.
          return res.status(204).end()
        }

        // Get the tile data as a buffer
        // Note: Node.js fetch automatically decompresses gzip content
        const arrayBuffer = await response.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)

        // Set appropriate headers for MVT
        // DO NOT set Content-Encoding - the data is already decompressed by Node.js fetch
        res.set('Content-Type', 'application/vnd.mapbox-vector-tile')
        res.set('Access-Control-Allow-Origin', '*')
        res.set('Cache-Control', 'public, max-age=86400')

        res.send(buffer)
      } catch (error) {
        console.error('Error fetching OS NGD tile:', error.message)
        // Return 204 so the map still renders available tiles
        res.status(204).end()
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

  // Batch Features Endpoint - fetches multiple collections in parallel server-side
  // Reduces browser requests from N individual calls to 1 batch call per theme group
  router.post('/api/os/features/batch', async function (req, res) {
    const apiKey = process.env.OS_PROJECT_API_KEY

    if (!apiKey) {
      console.error('OS_PROJECT_API_KEY not found in environment variables')
      return res.status(500).json({ error: 'API key not configured' })
    }

    const { collections, bbox, limit } = req.body
    const bboxCrs =
      req.body['bbox-crs'] || 'http://www.opengis.net/def/crs/EPSG/0/27700'
    const crs = req.body.crs || 'http://www.opengis.net/def/crs/EPSG/0/27700'

    if (!Array.isArray(collections) || collections.length === 0) {
      return res
        .status(400)
        .json({ error: 'collections must be a non-empty array' })
    }

    if (collections.length > 40) {
      return res
        .status(400)
        .json({ error: 'Maximum 40 collections per batch request' })
    }

    // Validate collection IDs to prevent injection
    const collectionPattern = /^[a-z]{3}-[a-z]+-[a-z]+-\d+$/
    const invalidIds = collections.filter((id) => !collectionPattern.test(id))
    if (invalidIds.length > 0) {
      return res
        .status(400)
        .json({ error: 'Invalid collection IDs', invalid: invalidIds })
    }

    if (!bbox) {
      return res.status(400).json({ error: 'bbox is required' })
    }

    const pageLimit = limit || 100

    // Fetch all pages for a single collection
    async function fetchCollection(collectionId) {
      const features = []
      let offset = 0
      let hasMore = true

      while (hasMore && offset < 1000) {
        const params = new URLSearchParams({
          key: apiKey,
          bbox: bbox,
          'bbox-crs': bboxCrs,
          crs: crs,
          limit: String(pageLimit),
          offset: String(offset)
        })

        const osUrl = `https://api.os.uk/features/ngd/ofa/v1/collections/${collectionId}/items?${params.toString()}`
        const response = await proxyFetch(osUrl, { method: 'GET' })

        if (!response.ok) {
          throw new Error(`${collectionId}: HTTP ${response.status}`)
        }

        const geojson = await response.json()

        if (geojson.features && geojson.features.length > 0) {
          // Tag each feature with its source collection
          geojson.features.forEach((f) => {
            if (!f.properties) f.properties = {}
            f.properties._collectionId = collectionId
          })
          features.push(...geojson.features)

          if (geojson.features.length < pageLimit) {
            hasMore = false
          } else {
            offset += pageLimit
          }
        } else {
          hasMore = false
        }
      }

      return features
    }

    try {
      const results = await Promise.allSettled(
        collections.map((id) => fetchCollection(id))
      )

      const allFeatures = []
      const errors = []

      results.forEach((result, i) => {
        if (result.status === 'fulfilled') {
          allFeatures.push(...result.value)
        } else {
          errors.push({
            collection: collections[i],
            error: result.reason?.message || 'Unknown error'
          })
        }
      })

      if (errors.length > 0) {
        console.error('Batch features partial errors:', errors)
      }

      res.json({
        type: 'FeatureCollection',
        features: allFeatures,
        _errors: errors
      })
    } catch (error) {
      console.error('Error in batch features:', error)
      res.status(500).json({ error: 'Failed to fetch batch features' })
    }
  })
}

module.exports = { registerOsApiRoutes }
