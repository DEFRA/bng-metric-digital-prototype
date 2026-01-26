//
// Geometry validation utilities (ported from validation.js) for polygon boundary/overlap checks.
// Not a module (loaded via <script> tags).
//

;(function (window) {
  'use strict'

  // Tolerance for floating-point comparisons (1mm in map units).
  const EPSILON = 0.001

  function GeometryValidation() {}

  GeometryValidation.EPSILON = EPSILON

  GeometryValidation.correctGeometryToBoundary = function (
    parcelGeom,
    boundaryPolygon
  ) {
    if (!boundaryPolygon) {
      return parcelGeom
    }

    const parcelCoords = parcelGeom.getCoordinates()[0]
    const boundaryCoords = boundaryPolygon.getCoordinates()[0]
    const correctedCoords = []
    const snapTolerance = EPSILON * 10 // 1cm snap tolerance.

    for (let i = 0; i < parcelCoords.length; i++) {
      const coord = parcelCoords[i]
      let snapped = false
      let snappedCoord = coord

      // Snap to boundary vertices first.
      for (let j = 0; j < boundaryCoords.length - 1; j++) {
        const boundaryVertex = boundaryCoords[j]
        const dx = coord[0] - boundaryVertex[0]
        const dy = coord[1] - boundaryVertex[1]
        const distance = Math.sqrt(dx * dx + dy * dy)

        if (distance < snapTolerance) {
          snappedCoord = boundaryVertex.slice()
          snapped = true
          break
        }
      }

      // If not snapped to a vertex, snap to boundary edges.
      if (!snapped) {
        for (let j = 0; j < boundaryCoords.length - 1; j++) {
          const edgeStart = boundaryCoords[j]
          const edgeEnd = boundaryCoords[j + 1]
          const closestPoint = GeometryValidation.getClosestPointOnSegment(
            coord,
            edgeStart,
            edgeEnd
          )
          const dx = coord[0] - closestPoint[0]
          const dy = coord[1] - closestPoint[1]
          const distance = Math.sqrt(dx * dx + dy * dy)

          if (distance < snapTolerance) {
            snappedCoord = closestPoint
            snapped = true
            break
          }
        }
      }

      correctedCoords.push(snappedCoord)
    }

    return new ol.geom.Polygon([correctedCoords])
  }

  GeometryValidation.getClosestPointOnSegment = function (
    point,
    segStart,
    segEnd
  ) {
    const x = point[0]
    const y = point[1]
    const x1 = segStart[0]
    const y1 = segStart[1]
    const x2 = segEnd[0]
    const y2 = segEnd[1]

    const dx = x2 - x1
    const dy = y2 - y1

    if (dx === 0 && dy === 0) {
      return segStart.slice()
    }

    const t = Math.max(
      0,
      Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy))
    )
    return [x1 + t * dx, y1 + t * dy]
  }

  GeometryValidation.isPointOnLineSegment = function (point, segStart, segEnd) {
    const x = point[0]
    const y = point[1]
    const x1 = segStart[0]
    const y1 = segStart[1]
    const x2 = segEnd[0]
    const y2 = segEnd[1]

    const minX = Math.min(x1, x2) - EPSILON
    const maxX = Math.max(x1, x2) + EPSILON
    const minY = Math.min(y1, y2) - EPSILON
    const maxY = Math.max(y1, y2) + EPSILON

    if (x < minX || x > maxX || y < minY || y > maxY) {
      return false
    }

    const crossProduct = (y - y1) * (x2 - x1) - (x - x1) * (y2 - y1)
    return Math.abs(crossProduct) < EPSILON
  }

  GeometryValidation.isPointOnPolygonBoundary = function (point, polygon) {
    const coords = polygon.getCoordinates()[0]
    for (let i = 0; i < coords.length - 1; i++) {
      const segStart = coords[i]
      const segEnd = coords[i + 1]
      if (GeometryValidation.isPointOnLineSegment(point, segStart, segEnd)) {
        return true
      }
    }
    return false
  }

  GeometryValidation.isPointInsidePolygon = function (point, polygon) {
    if (GeometryValidation.isPointOnPolygonBoundary(point, polygon)) {
      return false
    }

    const coords = polygon.getCoordinates()[0]
    const x = point[0]
    const y = point[1]
    let inside = false

    for (let i = 0, j = coords.length - 2; i < coords.length - 1; j = i++) {
      const xi = coords[i][0]
      const yi = coords[i][1]
      const xj = coords[j][0]
      const yj = coords[j][1]

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }

    return inside
  }

  GeometryValidation.isPointInsideOrOnBoundary = function (point, polygon) {
    if (GeometryValidation.isPointOnPolygonBoundary(point, polygon)) {
      return true
    }

    const coords = polygon.getCoordinates()[0]
    const x = point[0]
    const y = point[1]
    let inside = false

    for (let i = 0, j = coords.length - 2; i < coords.length - 1; j = i++) {
      const xi = coords[i][0]
      const yi = coords[i][1]
      const xj = coords[j][0]
      const yj = coords[j][1]

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }

    return inside
  }

  GeometryValidation.isPolygonWithinBoundary = function (
    innerPolygon,
    outerPolygon
  ) {
    const innerCoords = innerPolygon.getCoordinates()[0]

    for (let i = 0; i < innerCoords.length - 1; i++) {
      const coord = innerCoords[i]
      if (!GeometryValidation.isPointInsideOrOnBoundary(coord, outerPolygon)) {
        return false
      }
    }

    for (let i = 0; i < innerCoords.length - 1; i++) {
      const midpoint = [
        (innerCoords[i][0] + innerCoords[i + 1][0]) / 2,
        (innerCoords[i][1] + innerCoords[i + 1][1]) / 2
      ]
      if (
        !GeometryValidation.isPointInsideOrOnBoundary(midpoint, outerPolygon)
      ) {
        return false
      }
    }

    const innerExtent = innerPolygon.getExtent()
    const outerExtent = outerPolygon.getExtent()
    const buffer = EPSILON * 10

    if (
      innerExtent[0] < outerExtent[0] - buffer ||
      innerExtent[1] < outerExtent[1] - buffer ||
      innerExtent[2] > outerExtent[2] + buffer ||
      innerExtent[3] > outerExtent[3] + buffer
    ) {
      return false
    }

    return true
  }

  GeometryValidation.doPolygonEdgesIntersect = function (polygon1, polygon2) {
    const coords1 = polygon1.getCoordinates()[0]
    const coords2 = polygon2.getCoordinates()[0]

    for (let i = 0; i < coords1.length - 1; i++) {
      const a1 = coords1[i]
      const a2 = coords1[i + 1]

      for (let j = 0; j < coords2.length - 1; j++) {
        const b1 = coords2[j]
        const b2 = coords2[j + 1]
        if (GeometryValidation.doLineSegmentsIntersect(a1, a2, b1, b2)) {
          return true
        }
      }
    }

    return false
  }

  GeometryValidation.direction = function (p1, p2, p3) {
    return (p3[0] - p1[0]) * (p2[1] - p1[1]) - (p2[0] - p1[0]) * (p3[1] - p1[1])
  }

  GeometryValidation.doLineSegmentsIntersect = function (a1, a2, b1, b2) {
    const d1 = GeometryValidation.direction(b1, b2, a1)
    const d2 = GeometryValidation.direction(b1, b2, a2)
    const d3 = GeometryValidation.direction(a1, a2, b1)
    const d4 = GeometryValidation.direction(a1, a2, b2)

    const allCollinear =
      Math.abs(d1) < EPSILON &&
      Math.abs(d2) < EPSILON &&
      Math.abs(d3) < EPSILON &&
      Math.abs(d4) < EPSILON

    if (allCollinear) {
      return false
    }

    const endpointsMatch =
      (Math.abs(a1[0] - b1[0]) < EPSILON &&
        Math.abs(a1[1] - b1[1]) < EPSILON) ||
      (Math.abs(a1[0] - b2[0]) < EPSILON &&
        Math.abs(a1[1] - b2[1]) < EPSILON) ||
      (Math.abs(a2[0] - b1[0]) < EPSILON &&
        Math.abs(a2[1] - b1[1]) < EPSILON) ||
      (Math.abs(a2[0] - b2[0]) < EPSILON && Math.abs(a2[1] - b2[1]) < EPSILON)

    if (endpointsMatch) {
      return false
    }

    if (
      ((d1 > EPSILON && d2 < -EPSILON) || (d1 < -EPSILON && d2 > EPSILON)) &&
      ((d3 > EPSILON && d4 < -EPSILON) || (d3 < -EPSILON && d4 > EPSILON))
    ) {
      return true
    }

    return false
  }

  GeometryValidation.doPolygonsOverlap = function (polygon1, polygon2) {
    const extent1 = polygon1.getExtent()
    const extent2 = polygon2.getExtent()
    if (!ol.extent.intersects(extent1, extent2)) {
      return false
    }

    const coords1 = polygon1.getCoordinates()[0]
    const coords2 = polygon2.getCoordinates()[0]

    for (let i = 0; i < coords1.length - 1; i++) {
      if (GeometryValidation.isPointInsidePolygon(coords1[i], polygon2)) {
        return true
      }
    }

    for (let i = 0; i < coords2.length - 1; i++) {
      if (GeometryValidation.isPointInsidePolygon(coords2[i], polygon1)) {
        return true
      }
    }

    if (GeometryValidation.doPolygonEdgesIntersect(polygon1, polygon2)) {
      return true
    }

    for (let i = 0; i < coords1.length - 1; i++) {
      const midpoint = [
        (coords1[i][0] + coords1[i + 1][0]) / 2,
        (coords1[i][1] + coords1[i + 1][1]) / 2
      ]
      if (GeometryValidation.isPointInsidePolygon(midpoint, polygon2)) {
        return true
      }
    }

    for (let i = 0; i < coords2.length - 1; i++) {
      const midpoint = [
        (coords2[i][0] + coords2[i + 1][0]) / 2,
        (coords2[i][1] + coords2[i + 1][1]) / 2
      ]
      if (GeometryValidation.isPointInsidePolygon(midpoint, polygon1)) {
        return true
      }
    }

    return false
  }

  // Fill-tool helpers (ported).
  GeometryValidation.coordsNearlyEqual = function (c1, c2) {
    if (!c1 || !c2) return false
    return (
      Math.abs(c1[0] - c2[0]) < EPSILON * 10 &&
      Math.abs(c1[1] - c2[1]) < EPSILON * 10
    )
  }

  GeometryValidation.doSegmentsOverlap = function (a1, a2, b1, b2) {
    const d1 = GeometryValidation.direction(a1, a2, b1)
    const d2 = GeometryValidation.direction(a1, a2, b2)

    if (Math.abs(d1) > EPSILON || Math.abs(d2) > EPSILON) {
      return false
    }

    const useY = Math.abs(a2[0] - a1[0]) < EPSILON
    const axis = useY ? 1 : 0

    const aMin = Math.min(a1[axis], a2[axis])
    const aMax = Math.max(a1[axis], a2[axis])
    const bMin = Math.min(b1[axis], b2[axis])
    const bMax = Math.max(b1[axis], b2[axis])

    const overlapStart = Math.max(aMin, bMin)
    const overlapEnd = Math.min(aMax, bMax)
    const overlapLength = overlapEnd - overlapStart

    return overlapLength > EPSILON * 10
  }

  GeometryValidation.arePolygonsAdjacent = function (polygon1, polygon2) {
    if (!polygon1 || !polygon2) return false

    const extent1 = polygon1.getExtent()
    const extent2 = polygon2.getExtent()
    const buffer = EPSILON * 10

    const bufferedExtent1 = [
      extent1[0] - buffer,
      extent1[1] - buffer,
      extent1[2] + buffer,
      extent1[3] + buffer
    ]

    if (!ol.extent.intersects(bufferedExtent1, extent2)) {
      return false
    }

    const coords1 = polygon1.getCoordinates()[0]
    const coords2 = polygon2.getCoordinates()[0]

    for (let i = 0; i < coords1.length - 1; i++) {
      const seg1Start = coords1[i]
      const seg1End = coords1[i + 1]
      for (let j = 0; j < coords2.length - 1; j++) {
        const seg2Start = coords2[j]
        const seg2End = coords2[j + 1]
        if (
          GeometryValidation.doSegmentsOverlap(
            seg1Start,
            seg1End,
            seg2Start,
            seg2End
          )
        ) {
          return true
        }
      }
    }

    let sharedVertexCount = 0
    for (let i = 0; i < coords1.length - 1; i++) {
      const coord1 = coords1[i]
      for (let j = 0; j < coords2.length - 1; j++) {
        const coord2 = coords2[j]
        if (GeometryValidation.coordsNearlyEqual(coord1, coord2)) {
          sharedVertexCount++
        }
      }
    }

    return sharedVertexCount >= 2
  }

  GeometryValidation.arePolygonsContiguous = function (polygons) {
    if (!polygons || polygons.length === 0) return false
    if (polygons.length === 1) return true

    const n = polygons.length
    const adjacencyList = new Array(n).fill(null).map(() => [])

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        if (GeometryValidation.arePolygonsAdjacent(polygons[i], polygons[j])) {
          adjacencyList[i].push(j)
          adjacencyList[j].push(i)
        }
      }
    }

    const visited = new Array(n).fill(false)
    const queue = [0]
    visited[0] = true
    let visitedCount = 1

    while (queue.length > 0) {
      const current = queue.shift()
      for (const neighbor of adjacencyList[current]) {
        if (!visited[neighbor]) {
          visited[neighbor] = true
          visitedCount++
          queue.push(neighbor)
        }
      }
    }

    return visitedCount === n
  }

  // ============================
  // Linear feature (line) validation
  // ============================

  /**
   * Check if a line (array of coordinates) is entirely within a boundary polygon.
   * Returns true if all vertices and all edge midpoints are inside or on the boundary.
   */
  GeometryValidation.isLineWithinBoundary = function (
    lineCoords,
    boundaryPolygon
  ) {
    if (!lineCoords || lineCoords.length < 2 || !boundaryPolygon) {
      return false
    }

    // Check all vertices are inside or on boundary
    for (let i = 0; i < lineCoords.length; i++) {
      if (
        !GeometryValidation.isPointInsideOrOnBoundary(
          lineCoords[i],
          boundaryPolygon
        )
      ) {
        return false
      }
    }

    // Check midpoints of all segments are inside or on boundary
    for (let i = 0; i < lineCoords.length - 1; i++) {
      const midpoint = [
        (lineCoords[i][0] + lineCoords[i + 1][0]) / 2,
        (lineCoords[i][1] + lineCoords[i + 1][1]) / 2
      ]
      if (
        !GeometryValidation.isPointInsideOrOnBoundary(midpoint, boundaryPolygon)
      ) {
        return false
      }
    }

    return true
  }

  /**
   * Validate a linear feature (hedgerow/watercourse) against a boundary.
   * Returns { valid: boolean, error?: string }
   */
  GeometryValidation.validateLinearFeature = function (
    lineCoords,
    boundaryPolygon,
    featureType
  ) {
    const typeName = featureType || 'Linear feature'

    if (!lineCoords || lineCoords.length < 2) {
      return { valid: false, error: `${typeName} must have at least 2 points.` }
    }

    if (!boundaryPolygon) {
      return { valid: false, error: 'No boundary defined.' }
    }

    if (!GeometryValidation.isLineWithinBoundary(lineCoords, boundaryPolygon)) {
      return {
        valid: false,
        error: `${typeName} must be entirely within the red line boundary.`
      }
    }

    return { valid: true }
  }

  window.DefraMapLib = window.DefraMapLib || {}
  window.DefraMapLib.GeometryValidation = GeometryValidation
})(window)
