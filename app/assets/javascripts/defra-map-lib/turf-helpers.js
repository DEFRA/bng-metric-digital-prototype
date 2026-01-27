//
// Turf.js helpers for polygon clipping and gap fill operations.
// Converts between OpenLayers and turf.js geometries.
// Not a module (loaded via <script> tags).
//

;(function (window) {
  'use strict'

  // Check for turf.js dependency
  if (typeof turf === 'undefined') {
    throw new Error('turf-helpers.js requires turf.js to be loaded first.')
  }

  function TurfHelpers() {}

  // Minimum area threshold for cleaning slivers (10 sqm)
  TurfHelpers.MIN_AREA_SQM = 10

  /**
   * Convert an OpenLayers Polygon to a turf.js polygon.
   * @param {ol.geom.Polygon} olPolygon - OpenLayers Polygon geometry
   * @returns {Object} turf.js polygon feature
   */
  TurfHelpers.olPolygonToTurf = function (olPolygon) {
    if (!olPolygon) return null
    const type = olPolygon.getType()
    if (type === 'Polygon') {
      const coords = olPolygon.getCoordinates()
      return turf.polygon(coords)
    }
    if (type === 'MultiPolygon') {
      const coords = olPolygon.getCoordinates()
      return turf.multiPolygon(coords)
    }
    return null
  }

  /**
   * Convert a turf.js polygon/multipolygon to an OpenLayers Polygon.
   * If the result is a MultiPolygon, returns the largest polygon.
   * @param {Object} turfGeom - turf.js geometry
   * @returns {ol.geom.Polygon|null} OpenLayers Polygon or null
   */
  TurfHelpers.turfToOlPolygonSingle = function (turfGeom) {
    if (!turfGeom) return null

    const geomType = turf.getType(turfGeom)

    if (geomType === 'Polygon') {
      const coords = turf.getCoords(turfGeom)
      return new ol.geom.Polygon(coords)
    }

    if (geomType === 'MultiPolygon') {
      // Extract the largest polygon from the MultiPolygon
      const coords = turf.getCoords(turfGeom)
      let largestPolygon = null
      let largestArea = 0

      for (const polyCoords of coords) {
        const poly = new ol.geom.Polygon(polyCoords)
        const area = poly.getArea()
        if (area > largestArea) {
          largestArea = area
          largestPolygon = poly
        }
      }
      return largestPolygon
    }

    return null
  }

  /**
   * Convert a turf.js geometry to OpenLayers, returning all polygons as an array.
   * @param {Object} turfGeom - turf.js geometry
   * @returns {Array<ol.geom.Polygon>} Array of OpenLayers Polygons
   */
  TurfHelpers.turfToOlPolygons = function (turfGeom) {
    if (!turfGeom) return []

    const geomType = turf.getType(turfGeom)

    if (geomType === 'Polygon') {
      const coords = turf.getCoords(turfGeom)
      return [new ol.geom.Polygon(coords)]
    }

    if (geomType === 'MultiPolygon') {
      const coords = turf.getCoords(turfGeom)
      return coords.map((polyCoords) => new ol.geom.Polygon(polyCoords))
    }

    return []
  }

  /**
   * Intersect (clip) a polygon with a boundary.
   * Returns the intersection or null if no intersection.
   * @param {ol.geom.Polygon} polygon - Polygon to clip
   * @param {ol.geom.Polygon} boundary - Boundary to clip to
   * @returns {ol.geom.Polygon|null} Clipped polygon or null
   */
  TurfHelpers.intersectPolygons = function (polygon, boundary) {
    try {
      const turfPoly = TurfHelpers.olPolygonToTurf(polygon)
      const turfBoundary = TurfHelpers.olPolygonToTurf(boundary)

      if (!turfPoly || !turfBoundary) return null

      const intersection = turf.intersect(
        turf.featureCollection([turfPoly, turfBoundary])
      )

      if (!intersection) return null

      return TurfHelpers.turfToOlPolygonSingle(intersection)
    } catch (e) {
      console.warn('TurfHelpers.intersectPolygons error:', e)
      return null
    }
  }

  /**
   * Check if two polygons intersect at all.
   * @param {ol.geom.Polygon} polygon1 - First polygon
   * @param {ol.geom.Polygon} polygon2 - Second polygon
   * @returns {boolean} True if they intersect
   */
  TurfHelpers.doPolygonsIntersect = function (polygon1, polygon2) {
    try {
      const turfPoly1 = TurfHelpers.olPolygonToTurf(polygon1)
      const turfPoly2 = TurfHelpers.olPolygonToTurf(polygon2)

      if (!turfPoly1 || !turfPoly2) return false

      return turf.booleanIntersects(turfPoly1, turfPoly2)
    } catch (e) {
      console.warn('TurfHelpers.doPolygonsIntersect error:', e)
      return false
    }
  }

  /**
   * Check if two polygons overlap (share interior area).
   * This is different from intersect - touching edges don't count as overlap.
   * Correctly handles donut geometry where a hole is filled by another parcel.
   * @param {ol.geom.Polygon} polygon1 - First polygon
   * @param {ol.geom.Polygon} polygon2 - Second polygon
   * @returns {boolean} True if they share interior area
   */
  TurfHelpers.doPolygonsOverlap = function (polygon1, polygon2) {
    try {
      const turfPoly1 = TurfHelpers.olPolygonToTurf(polygon1)
      const turfPoly2 = TurfHelpers.olPolygonToTurf(polygon2)

      if (!turfPoly1 || !turfPoly2) return false

      // Calculate the intersection
      const intersection = turf.intersect(
        turf.featureCollection([turfPoly1, turfPoly2])
      )

      if (!intersection) return false

      // Check if the intersection has significant area
      // (edges touching have zero area intersection)
      const area = turf.area(intersection)
      return area > TurfHelpers.MIN_AREA_SQM
    } catch (e) {
      console.warn('TurfHelpers.doPolygonsOverlap error:', e)
      return false
    }
  }

  /**
   * Calculate the remaining gaps within a boundary after subtracting parcels.
   * Returns a turf.js geometry representing the unfilled area.
   * @param {ol.geom.Polygon} boundary - The boundary polygon
   * @param {Array<ol.geom.Polygon>} parcels - Array of parcel polygons
   * @returns {Object|null} turf.js geometry of the gaps, or null if no gaps
   */
  TurfHelpers.calculateGaps = function (boundary, parcels) {
    try {
      let turfBoundary = TurfHelpers.olPolygonToTurf(boundary)
      if (!turfBoundary) return null

      // Sequentially subtract each parcel from the boundary
      for (const parcel of parcels) {
        const turfParcel = TurfHelpers.olPolygonToTurf(parcel)
        if (!turfParcel) continue

        const diff = turf.difference(
          turf.featureCollection([turfBoundary, turfParcel])
        )
        if (!diff) {
          // Entire boundary is covered
          return null
        }
        turfBoundary = diff
      }

      // Check if any area remains
      const area = turf.area(turfBoundary)
      if (area < TurfHelpers.MIN_AREA_SQM) {
        return null
      }

      return turfBoundary
    } catch (e) {
      console.warn('TurfHelpers.calculateGaps error:', e)
      return null
    }
  }

  /**
   * Find which gap polygon contains a given point.
   * Returns the gap as an OpenLayers Polygon or null.
   * @param {Object} gapsGeom - turf.js geometry of all gaps
   * @param {Array<number>} coordinate - [x, y] coordinate
   * @returns {ol.geom.Polygon|null} The gap polygon containing the point
   */
  TurfHelpers.findGapAtPoint = function (gapsGeom, coordinate) {
    if (!gapsGeom || !coordinate) return null

    try {
      const point = turf.point(coordinate)
      const geomType = turf.getType(gapsGeom)

      if (geomType === 'Polygon') {
        if (turf.booleanPointInPolygon(point, gapsGeom)) {
          return TurfHelpers.turfToOlPolygonSingle(gapsGeom)
        }
        return null
      }

      if (geomType === 'MultiPolygon') {
        const coords = turf.getCoords(gapsGeom)
        for (const polyCoords of coords) {
          const poly = turf.polygon(polyCoords)
          if (turf.booleanPointInPolygon(point, poly)) {
            return new ol.geom.Polygon(polyCoords)
          }
        }
        return null
      }

      return null
    } catch (e) {
      console.warn('TurfHelpers.findGapAtPoint error:', e)
      return null
    }
  }

  /**
   * Check if a point is within any of the gap polygons.
   * @param {Object} gapsGeom - turf.js geometry of all gaps
   * @param {Array<number>} coordinate - [x, y] coordinate
   * @returns {boolean} True if point is in a gap
   */
  TurfHelpers.isPointInGaps = function (gapsGeom, coordinate) {
    if (!gapsGeom || !coordinate) return false

    try {
      const point = turf.point(coordinate)
      return turf.booleanPointInPolygon(point, gapsGeom)
    } catch (e) {
      return false
    }
  }

  /**
   * Clean a polygon by filtering out small slivers.
   * Returns the polygon if it meets the minimum area, null otherwise.
   * @param {ol.geom.Polygon} polygon - Polygon to clean
   * @param {number} [minAreaSqm] - Minimum area in square meters (default: MIN_AREA_SQM)
   * @returns {ol.geom.Polygon|null} Cleaned polygon or null if too small
   */
  TurfHelpers.cleanPolygon = function (polygon, minAreaSqm) {
    if (!polygon) return null

    const threshold = minAreaSqm || TurfHelpers.MIN_AREA_SQM
    const area = polygon.getArea()

    if (area < threshold) {
      return null
    }

    return polygon
  }

  /**
   * Check if a polygon is fully within a boundary (no clipping needed).
   * Uses a tolerant check: the parcel is valid if it doesn't extend
   * significantly outside the boundary. This correctly handles parcels
   * that have vertices on the boundary edge.
   * @param {ol.geom.Polygon} polygon - Polygon to check
   * @param {ol.geom.Polygon} boundary - Boundary polygon
   * @returns {boolean} True if polygon is entirely within boundary
   */
  TurfHelpers.isPolygonWithinBoundary = function (polygon, boundary) {
    try {
      const turfPoly = TurfHelpers.olPolygonToTurf(polygon)
      const turfBoundary = TurfHelpers.olPolygonToTurf(boundary)

      if (!turfPoly || !turfBoundary) return false

      // Try strict within first
      if (turf.booleanWithin(turfPoly, turfBoundary)) {
        return true
      }

      // For parcels on the boundary edge, check if the difference
      // (parcel minus boundary) has negligible area
      const difference = turf.difference(
        turf.featureCollection([turfPoly, turfBoundary])
      )

      if (!difference) {
        // No difference means parcel is entirely within boundary
        return true
      }

      // If the area outside boundary is negligible, consider it valid
      const outsideArea = turf.area(difference)
      return outsideArea < TurfHelpers.MIN_AREA_SQM
    } catch (e) {
      console.warn('TurfHelpers.isPolygonWithinBoundary error:', e)
      return false
    }
  }

  /**
   * Check if a point is within a polygon.
   * @param {Array<number>} coordinate - [x, y] coordinate
   * @param {ol.geom.Polygon} polygon - Polygon to check
   * @returns {boolean} True if point is inside polygon
   */
  TurfHelpers.isPointInPolygon = function (coordinate, polygon) {
    try {
      const point = turf.point(coordinate)
      const turfPoly = TurfHelpers.olPolygonToTurf(polygon)

      if (!turfPoly) return false

      return turf.booleanPointInPolygon(point, turfPoly)
    } catch (e) {
      return false
    }
  }

  /**
   * Clip a polygon to the available space within a boundary, excluding existing parcels.
   * This is used when filling with an OS polygon that may overlap existing parcels.
   * @param {ol.geom.Polygon} polygon - Polygon to clip
   * @param {ol.geom.Polygon} boundary - Boundary to clip to
   * @param {Array<ol.geom.Polygon>} existingParcels - Array of existing parcel polygons to exclude
   * @param {Array<number>} [clickCoordinate] - Optional click coordinate to select the correct polygon part
   * @returns {ol.geom.Polygon|null} Clipped polygon fitting available space, or null
   */
  TurfHelpers.clipToAvailableSpace = function (
    polygon,
    boundary,
    existingParcels,
    clickCoordinate
  ) {
    try {
      let turfPoly = TurfHelpers.olPolygonToTurf(polygon)
      const turfBoundary = TurfHelpers.olPolygonToTurf(boundary)

      if (!turfPoly || !turfBoundary) return null

      // First, intersect with boundary
      let clipped = turf.intersect(
        turf.featureCollection([turfPoly, turfBoundary])
      )

      if (!clipped) return null

      // Then subtract each existing parcel
      if (existingParcels && existingParcels.length > 0) {
        for (const parcel of existingParcels) {
          const turfParcel = TurfHelpers.olPolygonToTurf(parcel)
          if (!turfParcel) continue

          // Check if they intersect before attempting difference
          if (!turf.booleanIntersects(clipped, turfParcel)) continue

          const diff = turf.difference(
            turf.featureCollection([clipped, turfParcel])
          )
          if (!diff) {
            // Entire clipped area is covered by this parcel
            return null
          }
          clipped = diff
        }
      }

      // Check if any area remains
      const area = turf.area(clipped)
      if (area < TurfHelpers.MIN_AREA_SQM) {
        return null
      }

      // If result is a MultiPolygon, select the polygon containing the click point
      // or fall back to the largest polygon
      return TurfHelpers.turfToOlPolygonAtPoint(clipped, clickCoordinate)
    } catch (e) {
      console.warn('TurfHelpers.clipToAvailableSpace error:', e)
      return null
    }
  }

  /**
   * Convert a turf.js polygon/multipolygon to an OpenLayers Polygon.
   * If given a coordinate, returns the polygon containing that point.
   * Otherwise returns the largest polygon.
   * @param {Object} turfGeom - turf.js geometry
   * @param {Array<number>} [coordinate] - Optional coordinate to find containing polygon
   * @returns {ol.geom.Polygon|null} OpenLayers Polygon or null
   */
  TurfHelpers.turfToOlPolygonAtPoint = function (turfGeom, coordinate) {
    if (!turfGeom) return null

    const geomType = turf.getType(turfGeom)

    if (geomType === 'Polygon') {
      const coords = turf.getCoords(turfGeom)
      return new ol.geom.Polygon(coords)
    }

    if (geomType === 'MultiPolygon') {
      const coords = turf.getCoords(turfGeom)

      // If we have a coordinate, find the polygon that contains it
      if (coordinate) {
        const point = turf.point(coordinate)
        for (const polyCoords of coords) {
          const poly = turf.polygon(polyCoords)
          if (turf.booleanPointInPolygon(point, poly)) {
            return new ol.geom.Polygon(polyCoords)
          }
        }
      }

      // Fall back to largest polygon if coordinate not found or not provided
      let largestPolygon = null
      let largestArea = 0

      for (const polyCoords of coords) {
        const poly = new ol.geom.Polygon(polyCoords)
        const area = poly.getArea()
        if (area > largestArea) {
          largestArea = area
          largestPolygon = poly
        }
      }
      return largestPolygon
    }

    return null
  }

  // Export to global namespace
  window.DefraMapLib = window.DefraMapLib || {}
  window.DefraMapLib.TurfHelpers = TurfHelpers
})(window)
