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
    // Check all rings (exterior + any holes)
    const allRings = polygon.getCoordinates()
    for (let r = 0; r < allRings.length; r++) {
      const coords = allRings[r]
      for (let i = 0; i < coords.length - 1; i++) {
        const segStart = coords[i]
        const segEnd = coords[i + 1]
        if (GeometryValidation.isPointOnLineSegment(point, segStart, segEnd)) {
          return true
        }
      }
    }
    return false
  }

  GeometryValidation.isPointInsidePolygon = function (point, polygon) {
    if (GeometryValidation.isPointOnPolygonBoundary(point, polygon)) {
      return false
    }

    const allRings = polygon.getCoordinates()
    const x = point[0]
    const y = point[1]

    // Check if inside exterior ring
    const exteriorCoords = allRings[0]
    let insideExterior = false

    for (
      let i = 0, j = exteriorCoords.length - 2;
      i < exteriorCoords.length - 1;
      j = i++
    ) {
      const xi = exteriorCoords[i][0]
      const yi = exteriorCoords[i][1]
      const xj = exteriorCoords[j][0]
      const yj = exteriorCoords[j][1]

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        insideExterior = !insideExterior
      }
    }

    if (!insideExterior) {
      return false
    }

    // Check if inside any hole (if so, point is NOT inside the polygon)
    for (let r = 1; r < allRings.length; r++) {
      const holeCoords = allRings[r]
      let insideHole = false

      for (
        let i = 0, j = holeCoords.length - 2;
        i < holeCoords.length - 1;
        j = i++
      ) {
        const xi = holeCoords[i][0]
        const yi = holeCoords[i][1]
        const xj = holeCoords[j][0]
        const yj = holeCoords[j][1]

        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          insideHole = !insideHole
        }
      }

      if (insideHole) {
        return false // Point is in a hole, so not inside the polygon
      }
    }

    return true
  }

  GeometryValidation.isPointInsideOrOnBoundary = function (point, polygon) {
    if (GeometryValidation.isPointOnPolygonBoundary(point, polygon)) {
      return true
    }

    const allRings = polygon.getCoordinates()
    const x = point[0]
    const y = point[1]

    // Check if inside exterior ring
    const exteriorCoords = allRings[0]
    let insideExterior = false

    for (
      let i = 0, j = exteriorCoords.length - 2;
      i < exteriorCoords.length - 1;
      j = i++
    ) {
      const xi = exteriorCoords[i][0]
      const yi = exteriorCoords[i][1]
      const xj = exteriorCoords[j][0]
      const yj = exteriorCoords[j][1]

      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        insideExterior = !insideExterior
      }
    }

    if (!insideExterior) {
      return false
    }

    // Check if inside any hole (if so, point is NOT inside the polygon)
    for (let r = 1; r < allRings.length; r++) {
      const holeCoords = allRings[r]
      let insideHole = false

      for (
        let i = 0, j = holeCoords.length - 2;
        i < holeCoords.length - 1;
        j = i++
      ) {
        const xi = holeCoords[i][0]
        const yi = holeCoords[i][1]
        const xj = holeCoords[j][0]
        const yj = holeCoords[j][1]

        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
          insideHole = !insideHole
        }
      }

      if (insideHole) {
        return false // Point is in a hole, so not inside the polygon
      }
    }

    return true
  }

  GeometryValidation.isPolygonWithinBoundary = function (
    innerPolygon,
    outerPolygon
  ) {
    // Check all rings of the inner polygon (exterior + any holes)
    const allRings = innerPolygon.getCoordinates()

    // Check all vertices first (all rings)
    for (let r = 0; r < allRings.length; r++) {
      const ringCoords = allRings[r]
      for (let i = 0; i < ringCoords.length - 1; i++) {
        const coord = ringCoords[i]
        if (
          !GeometryValidation.isPointInsideOrOnBoundary(coord, outerPolygon)
        ) {
          return false
        }
      }
    }

    // Check midpoints with tolerance to handle floating-point precision
    // when parcel edges lie exactly on boundary edges (all rings)
    for (let r = 0; r < allRings.length; r++) {
      const ringCoords = allRings[r]
      for (let i = 0; i < ringCoords.length - 1; i++) {
        const midpoint = [
          (ringCoords[i][0] + ringCoords[i + 1][0]) / 2,
          (ringCoords[i][1] + ringCoords[i + 1][1]) / 2
        ]
        if (
          !GeometryValidation.isPointInsideOrOnBoundaryWithTolerance(
            midpoint,
            outerPolygon,
            EPSILON * 100
          )
        ) {
          return false
        }
      }
    }

    // Extent check
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

  /**
   * Check if a point is inside or on the boundary of a polygon,
   * with an additional tolerance for boundary edge proximity.
   * This handles floating-point precision issues when points should
   * be exactly on an edge but are slightly off due to calculations.
   */
  GeometryValidation.isPointInsideOrOnBoundaryWithTolerance = function (
    point,
    polygon,
    tolerance
  ) {
    // First try standard check
    if (GeometryValidation.isPointInsideOrOnBoundary(point, polygon)) {
      return true
    }

    // If failed, check if point is within tolerance of any boundary edge (all rings)
    const allRings = polygon.getCoordinates()
    for (let r = 0; r < allRings.length; r++) {
      const coords = allRings[r]
      for (let i = 0; i < coords.length - 1; i++) {
        const closest = GeometryValidation.getClosestPointOnSegment(
          point,
          coords[i],
          coords[i + 1]
        )
        const dx = point[0] - closest[0]
        const dy = point[1] - closest[1]
        const dist = Math.sqrt(dx * dx + dy * dy)
        if (dist <= tolerance) {
          return true
        }
      }
    }

    return false
  }

  GeometryValidation.doPolygonEdgesIntersect = function (polygon1, polygon2) {
    // Check all rings from both polygons (exterior + holes)
    const allRings1 = polygon1.getCoordinates()
    const allRings2 = polygon2.getCoordinates()

    for (let r1 = 0; r1 < allRings1.length; r1++) {
      const coords1 = allRings1[r1]
      for (let r2 = 0; r2 < allRings2.length; r2++) {
        const coords2 = allRings2[r2]

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

    // Check all rings from both polygons (exterior + holes)
    const allRings1 = polygon1.getCoordinates()
    const allRings2 = polygon2.getCoordinates()

    // Check if any vertex of polygon1 (any ring) is inside polygon2
    for (let r = 0; r < allRings1.length; r++) {
      const coords1 = allRings1[r]
      for (let i = 0; i < coords1.length - 1; i++) {
        if (GeometryValidation.isPointInsidePolygon(coords1[i], polygon2)) {
          return true
        }
      }
    }

    // Check if any vertex of polygon2 (any ring) is inside polygon1
    for (let r = 0; r < allRings2.length; r++) {
      const coords2 = allRings2[r]
      for (let i = 0; i < coords2.length - 1; i++) {
        if (GeometryValidation.isPointInsidePolygon(coords2[i], polygon1)) {
          return true
        }
      }
    }

    // Check if edges intersect
    if (GeometryValidation.doPolygonEdgesIntersect(polygon1, polygon2)) {
      return true
    }

    // Check midpoints of all rings from polygon1
    for (let r = 0; r < allRings1.length; r++) {
      const coords1 = allRings1[r]
      for (let i = 0; i < coords1.length - 1; i++) {
        const midpoint = [
          (coords1[i][0] + coords1[i + 1][0]) / 2,
          (coords1[i][1] + coords1[i + 1][1]) / 2
        ]
        if (GeometryValidation.isPointInsidePolygon(midpoint, polygon2)) {
          return true
        }
      }
    }

    // Check midpoints of all rings from polygon2
    for (let r = 0; r < allRings2.length; r++) {
      const coords2 = allRings2[r]
      for (let i = 0; i < coords2.length - 1; i++) {
        const midpoint = [
          (coords2[i][0] + coords2[i + 1][0]) / 2,
          (coords2[i][1] + coords2[i + 1][1]) / 2
        ]
        if (GeometryValidation.isPointInsidePolygon(midpoint, polygon1)) {
          return true
        }
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

    // Check each segment
    for (let i = 0; i < lineCoords.length - 1; i++) {
      const p1 = lineCoords[i]
      const p2 = lineCoords[i + 1]

      // If segment lies along boundary edge, it's valid (skip midpoint check)
      if (GeometryValidation.isSegmentOnBoundaryEdge(p1, p2, boundaryPolygon)) {
        continue
      }

      // For other segments, check midpoint is inside or on boundary
      const midpoint = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
      if (
        !GeometryValidation.isPointInsideOrOnBoundary(midpoint, boundaryPolygon)
      ) {
        return false
      }
    }

    return true
  }

  /**
   * Check if a line segment lies along the boundary edge.
   * Returns true if both points are on the same boundary edge, or if they
   * span two adjacent boundary edges (corner case).
   */
  GeometryValidation.isSegmentOnBoundaryEdge = function (
    p1,
    p2,
    boundaryPolygon
  ) {
    const boundaryCoords = boundaryPolygon.getCoordinates()[0]

    // Check if both points are on the same boundary edge
    for (let i = 0; i < boundaryCoords.length - 1; i++) {
      const edgeStart = boundaryCoords[i]
      const edgeEnd = boundaryCoords[i + 1]

      if (
        GeometryValidation.isPointOnLineSegment(p1, edgeStart, edgeEnd) &&
        GeometryValidation.isPointOnLineSegment(p2, edgeStart, edgeEnd)
      ) {
        return true
      }
    }

    // Check for segments spanning adjacent boundary edges (corner case)
    for (let i = 0; i < boundaryCoords.length - 1; i++) {
      const edgeStart = boundaryCoords[i]
      const edgeEnd = boundaryCoords[i + 1]
      const nextIdx = (i + 2) % (boundaryCoords.length - 1)
      const nextEdgeEnd = boundaryCoords[nextIdx === 0 ? 1 : nextIdx]

      const p1OnFirst = GeometryValidation.isPointOnLineSegment(
        p1,
        edgeStart,
        edgeEnd
      )
      const p2OnSecond = GeometryValidation.isPointOnLineSegment(
        p2,
        edgeEnd,
        nextEdgeEnd
      )
      const p2OnFirst = GeometryValidation.isPointOnLineSegment(
        p2,
        edgeStart,
        edgeEnd
      )
      const p1OnSecond = GeometryValidation.isPointOnLineSegment(
        p1,
        edgeEnd,
        nextEdgeEnd
      )

      if ((p1OnFirst && p2OnSecond) || (p2OnFirst && p1OnSecond)) {
        return true
      }
    }

    return false
  }

  /**
   * Correct a line's coordinates to ensure it stays within the boundary.
   * Points inside or on the boundary are kept as-is. Points outside are
   * clamped to the nearest point on the boundary edge.
   * Does NOT extend lines along the boundary - preserves the user's original
   * line length and shape.
   * Returns the corrected coordinate array.
   */
  GeometryValidation.correctLineToBoundary = function (
    lineCoords,
    boundaryPolygon
  ) {
    if (!lineCoords || lineCoords.length < 2 || !boundaryPolygon) {
      return lineCoords
    }

    const boundaryCoords = boundaryPolygon.getCoordinates()[0]
    const result = []

    for (let i = 0; i < lineCoords.length; i++) {
      const coord = lineCoords[i]

      // Check if point is inside or on boundary - if so, keep as-is
      if (
        GeometryValidation.isPointInsideOrOnBoundary(coord, boundaryPolygon)
      ) {
        result.push(coord.slice())
      } else {
        // Point is outside - clamp to nearest point on boundary edge
        const clamped = GeometryValidation.clampPointToBoundary(
          coord,
          boundaryCoords
        )
        result.push(clamped)
      }
    }

    return result
  }

  /**
   * Clamp a point to the nearest location on the boundary edge.
   * Returns the closest point on any boundary segment.
   */
  GeometryValidation.clampPointToBoundary = function (point, boundaryCoords) {
    let nearestPoint = null
    let nearestDist = Infinity

    for (let i = 0; i < boundaryCoords.length - 1; i++) {
      const edgeStart = boundaryCoords[i]
      const edgeEnd = boundaryCoords[i + 1]
      const closest = GeometryValidation.getClosestPointOnSegment(
        point,
        edgeStart,
        edgeEnd
      )
      const dx = point[0] - closest[0]
      const dy = point[1] - closest[1]
      const dist = Math.sqrt(dx * dx + dy * dy)

      if (dist < nearestDist) {
        nearestDist = dist
        nearestPoint = closest
      }
    }

    return nearestPoint || point.slice()
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

  // ============================
  // Self-intersection detection
  // ============================

  /**
   * Check if a polygon is self-intersecting (crosses over itself).
   * Returns true if any non-adjacent edges intersect.
   */
  GeometryValidation.isSelfIntersecting = function (polygon) {
    const coords = polygon.getCoordinates()[0]
    const n = coords.length

    // Need at least 4 points (3 vertices + closing point)
    if (n < 4) return false

    // Check each edge against non-adjacent edges
    for (let i = 0; i < n - 1; i++) {
      // Start j at i + 2 to skip adjacent edge
      for (let j = i + 2; j < n - 1; j++) {
        // Skip if j wraps around to be adjacent to i (first and last edge)
        if (i === 0 && j === n - 2) continue

        if (
          this.doLineSegmentsIntersect(
            coords[i],
            coords[i + 1],
            coords[j],
            coords[j + 1]
          )
        ) {
          return true
        }
      }
    }
    return false
  }

  window.DefraMapLib = window.DefraMapLib || {}
  window.DefraMapLib.GeometryValidation = GeometryValidation
})(window)
