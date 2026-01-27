/**
 * File Conversion Routes
 * Handles shapefile to GeoJSON conversion
 */

const multer = require('multer')

const upload = multer({ storage: multer.memoryStorage() })

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

/**
 * Register file conversion routes
 * @param {Router} router - Express router instance
 */
function registerFileConversionRoutes(router) {
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
}

module.exports = { registerFileConversionRoutes }
