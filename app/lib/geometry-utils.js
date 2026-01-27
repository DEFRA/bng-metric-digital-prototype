/**
 * Simple polygon area calculation (for projected coordinates in meters)
 * @param {Object} geoJson - GeoJSON geometry object
 * @returns {number} Area in square meters
 */
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

/**
 * Calculate area of a polygon ring using Shoelace formula
 * @param {Array} ring - Array of coordinate pairs
 * @returns {number} Area in square meters
 */
function calculateRingArea(ring) {
  let area = 0
  const n = ring.length

  for (let i = 0; i < n - 1; i++) {
    const j = (i + 1) % n
    area += ring[i][0] * ring[j][1]
    area -= ring[j][0] * ring[i][1]
  }

  return Math.abs(area / 2)
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
  if (geometry.type === 'Polygon') {
    const coordinates = geometry.coordinates[0]
    return checkPolygonRingSelfIntersecting(coordinates)
  }

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

  if (numPoints < 4) {
    return false
  }

  for (let i = 0; i < numPoints - 1; i++) {
    const a1 = coordinates[i]
    const a2 = coordinates[i + 1]

    for (let j = i + 2; j < numPoints - 1; j++) {
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

module.exports = {
  calculatePolygonArea,
  calculateRingArea,
  doLineSegmentsIntersect,
  isPolygonSelfIntersecting,
  checkPolygonRingSelfIntersecting,
  geojsonToEsri
}
