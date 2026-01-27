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
}

module.exports = { registerOsApiRoutes }
