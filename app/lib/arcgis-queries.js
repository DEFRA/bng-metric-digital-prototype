const { geojsonToEsri } = require('./geometry-utils')
const { proxyFetch } = require('./proxy-fetch')

const withinUKArcgisUrl =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Countries_December_2024_Boundaries_UK_BFE/FeatureServer/0/query'
const lpaQueryUrl =
  'https://services1.arcgis.com/ESMARspQHYMw9BZ9/ArcGIS/rest/services/Local_Planning_Authorities_April_2022_UK_BFE_2022/FeatureServer/0/query'
const ncaQueryUrl =
  'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/National_Character_Areas_England/FeatureServer/0/query'
const lnrsQueryUrl =
  'https://services.arcgis.com/JJzESW51TqeY9uat/ArcGIS/rest/services/Local_Nature_Recovery_Strategy_Areas_England/FeatureServer/0/query'

/**
 * Query an ArcGIS REST API endpoint
 * Uses POST to avoid URL length limits with large geometries
 * @param {string} url - The ArcGIS endpoint URL
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>} The response data
 */
async function queryArcgis(url, params) {
  // Use POST with form-encoded body to avoid URL length limits
  const response = await proxyFetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(params).toString()
  })

  // Check if response is OK
  if (!response.ok) {
    console.error('ArcGIS API error:', response.status, response.statusText)
    throw new Error(
      `ArcGIS API returned ${response.status}: ${response.statusText}`
    )
  }

  // Check content type
  const contentType = response.headers.get('content-type')
  if (!contentType || !contentType.includes('application/json')) {
    const text = await response.text()
    console.error(
      'ArcGIS API returned non-JSON response:',
      text.substring(0, 500)
    )
    throw new Error(`ArcGIS API returned non-JSON content: ${contentType}`)
  }

  const data = await response.json()
  if (data.error) {
    console.error('[ArcGIS] API error:', JSON.stringify(data.error))
  }
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

  const data = await queryArcgis(withinUKArcgisUrl, queryParams)

  if (data.count && data.count > 0) {
    return true
  } else {
    return false
  }
}

/**
 * Get the Local Planning Authority for the given features
 * @param {Array} features - Array of GeoJSON features
 * @returns {Promise<string>} The LPA name
 */
async function getLPA(features) {
  if (!features || !features[0] || !features[0].geometry) {
    console.error('[getLPA] Invalid features input')
    return 'No LPA found'
  }

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

  if (
    data.features &&
    data.features.length > 0 &&
    data.features[0].attributes
  ) {
    return data.features[0].attributes.LPA22NM
  } else {
    console.log('[getLPA] No features returned from ArcGIS')
    return 'No LPA found'
  }
}

/**
 * Get the National Character Area for the given features
 * @param {Array} features - Array of GeoJSON features
 * @returns {Promise<string>} The NCA name
 */
async function getNCA(features) {
  if (!features || !features[0] || !features[0].geometry) {
    console.error('[getNCA] Invalid features input')
    return 'No NCA found'
  }

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

  if (
    data.features &&
    data.features.length > 0 &&
    data.features[0].attributes
  ) {
    return data.features[0].attributes.NCA_Name
  } else {
    console.log('[getNCA] No features returned from ArcGIS')
    return 'No NCA found'
  }
}

/**
 * Get the Local Nature Recovery Strategy area for the given features
 * @param {Array} features - Array of GeoJSON features
 * @returns {Promise<string>} The LNRS name
 */
async function getLNRS(features) {
  if (!features || !features[0] || !features[0].geometry) {
    console.error('[getLNRS] Invalid features input')
    return 'No LNRS found'
  }

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

  if (
    data.features &&
    data.features.length > 0 &&
    data.features[0].attributes
  ) {
    return data.features[0].attributes.Name
  } else {
    console.log('[getLNRS] No features returned from ArcGIS')
    return 'No LNRS found'
  }
}

module.exports = {
  queryArcgis,
  isWithinUK,
  getLPA,
  getNCA,
  getLNRS
}
