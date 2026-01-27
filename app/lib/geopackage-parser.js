const Database = require('better-sqlite3')
const wkx = require('wkx')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { calculatePolygonArea } = require('./geometry-utils')

/**
 * Parse a GeoPackage file buffer and extract layers and geometries
 * @param {Buffer} buffer - The GeoPackage file buffer
 * @returns {Object} Object containing layers metadata and geometries as GeoJSON
 */
function parseGeoPackage(buffer) {
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
      fs.unlinkSync(tempFile)
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    throw err
  }
}

module.exports = { parseGeoPackage }
