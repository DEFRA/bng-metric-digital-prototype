const fs = require('fs')
const os = require('os')
const path = require('path')

// bng-library is ESM; this file is CommonJS, so bridge with a cached dynamic
// import (same pattern as app/routes/gen-gpkg.js). The GeoPackage-Binary header
// parsing and WKB→GeoJSON decode that used to live here now live in the library
// (bng-library/gpkg-io), which is the single source of truth for the format.
let readerPromise = null
function getReader() {
  if (!readerPromise) {
    readerPromise = import('bng-library/gpkg-io')
  }
  return readerPromise
}

/**
 * Parse a GeoPackage file buffer and extract layers and geometries.
 *
 * better-sqlite3 opens a file, not a buffer, so the upload is written to a temp
 * file, read via the library, then cleaned up. The returned shape is unchanged:
 *   { layers: [{ name, identifier, description, geometryType, srsId,
 *                featureCount, totalAreaSqm }],
 *     geometries: { [layerName]: <GeoJSON FeatureCollection> } }
 *
 * @param {Buffer} buffer - The GeoPackage file buffer
 * @returns {Promise<Object>} layers metadata and geometries as GeoJSON
 */
async function parseGeoPackage(buffer) {
  const { readGeoPackage } = await getReader()
  const tempFile = path.join(os.tmpdir(), `gpkg-${Date.now()}.gpkg`)

  try {
    fs.writeFileSync(tempFile, buffer)
    return readGeoPackage(tempFile)
  } finally {
    try {
      fs.unlinkSync(tempFile)
    } catch {
      // Ignore cleanup errors — the OS will reap the temp file eventually.
    }
  }
}

module.exports = { parseGeoPackage }
