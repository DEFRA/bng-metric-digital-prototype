# Fix Plan: Habitat Map Issues

## Issues Summary

1. **Vertex editing not working** - Cannot edit vertices of polygons on habitat map
2. **Linear features being extended** - Lines along red-line boundary are incorrectly extended
3. **Save button stays disabled** - Button disabled even at 100% area coverage

---

## Issue 1: Vertex Editing Not Working

### Root Cause

The `startEditingParcel()` method exists but there's no UI trigger to activate it:

- `_handleDblClick()` at line 1326-1328 in `defra-map-client.js` is an empty stub
- Clicking on parcels only calls `selectParcel()` which highlights but doesn't enable editing
- The infrastructure for vertex dragging and editing exists, but no user action triggers it

### Fix Location

`app/assets/javascripts/defra-map-lib/defra-map-client.js` lines 1326-1328

### Implementation

Implement double-click to toggle editing mode for parcels:

```javascript
DefraMapClient.prototype._handleDblClick = function (evt) {
  // Don't trigger edit during other active modes
  if (
    this._isDrawing ||
    this._fillActive ||
    this._sliceActive ||
    this._removeActive ||
    this._isLineDrawing
  )
    return

  if (this._mode === 'habitat-parcels') {
    const clickedIndex = this._findParcelAtPixel(evt.pixel)
    if (clickedIndex >= 0) {
      evt.preventDefault()
      evt.stopPropagation()

      if (this._editingParcelIndex === clickedIndex) {
        // Already editing this parcel - stop editing
        this.stopEditingParcel()
      } else {
        // Start editing this parcel
        this.startEditingParcel(clickedIndex)
      }
    }
  }
}
```

---

## Issue 2: Linear Features Being Extended

### Root Cause

The `correctLineToBoundary` function in `geometry-validation.js` (lines 574-665):

1. Snaps ALL line vertices to nearest boundary vertices (lines 586-611)
2. When two consecutive vertices are on the boundary, it traces the ENTIRE boundary path between them (lines 621-658)
3. This inserts intermediate boundary vertices, extending the line beyond user's intent

### Fix Location

`app/assets/javascripts/defra-map-lib/geometry-validation.js` lines 574-665

### Implementation

Rewrite `correctLineToBoundary` with correct behavior:

- Keep the user's original line endpoints (only clamp if truly outside boundary)
- For line segments along the boundary, add vertices WHERE the user's line INTERSECTS the boundary edge, not trace the boundary path
- Never extend the line length

```javascript
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
    if (GeometryValidation.isPointInsideOrOnBoundary(coord, boundaryPolygon)) {
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

// New helper function
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

  return nearestPoint || point
}
```

---

## Issue 3: Save Button Stays Disabled at 100%

### Root Cause

**Confirmed:** The UI shows "Remaining: 0.00 ha" (green) but Save is still disabled. This means the area tolerance check passes, but `validateAllParcels()` returns `valid: false`.

The issue is in `isPolygonWithinBoundary()` (geometry-validation.js lines 183-222). When parcel edges lie exactly on the boundary edge, floating-point precision issues cause the midpoint check to fail:

```javascript
// Line 196-206: Midpoint check
for (let i = 0; i < innerCoords.length - 1; i++) {
  const midpoint = [
    (innerCoords[i][0] + innerCoords[i + 1][0]) / 2,
    (innerCoords[i][1] + innerCoords[i + 1][1]) / 2
  ]
  if (!GeometryValidation.isPointInsideOrOnBoundary(midpoint, outerPolygon)) {
    return false // <-- Fails here due to floating-point precision
  }
}
```

When a parcel edge perfectly matches a boundary edge, the midpoint should be "on boundary" but floating-point errors (e.g., 0.0000001 off) cause `isPointOnLineSegment()` to return false.

### Fix Location

`app/assets/javascripts/defra-map-lib/geometry-validation.js` - `isPolygonWithinBoundary()` function

### Implementation

Add a tolerance buffer when checking if midpoints are within boundary:

```javascript
GeometryValidation.isPolygonWithinBoundary = function (innerPolygon, outerPolygon) {
  const innerCoords = innerPolygon.getCoordinates()[0]

  // Check all vertices first
  for (let i = 0; i < innerCoords.length - 1; i++) {
    const coord = innerCoords[i]
    if (!GeometryValidation.isPointInsideOrOnBoundary(coord, outerPolygon)) {
      return false
    }
  }

  // Check midpoints with tolerance
  for (let i = 0; i < innerCoords.length - 1; i++) {
    const midpoint = [
      (innerCoords[i][0] + innerCoords[i + 1][0]) / 2,
      (innerCoords[i][1] + innerCoords[i + 1][1]) / 2
    ]

    // Use expanded tolerance check for midpoints on boundary edges
    if (!GeometryValidation.isPointInsideOrOnBoundaryWithTolerance(midpoint, outerPolygon, EPSILON * 100)) {
      return false
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

// New helper with tolerance
GeometryValidation.isPointInsideOrOnBoundaryWithTolerance = function (point, polygon, tolerance) {
  // First try standard check
  if (GeometryValidation.isPointInsideOrOnBoundary(point, polygon)) {
    return true
  }

  // If failed, check if point is within tolerance of any boundary edge
  const coords = polygon.getCoordinates()[0]
  for (let i = 0; i < coords.length - 1; i++) {
    const closest = GeometryValidation.getClosestPointOnSegment(point, coords[i], coords[i + 1])
    const dx = point[0] - closest[0]
    const dy = point[1] - closest[1]
    const dist = Math.sqrt(dx * dx + dy * dy)
    if (dist <= tolerance) {
      return true
    }
  }

  return false
}

---

## Files to Modify

1. `app/assets/javascripts/defra-map-lib/defra-map-client.js` (line 1326-1328)
   - Implement `_handleDblClick()` to enable vertex editing on double-click

2. `app/assets/javascripts/defra-map-lib/geometry-validation.js` (lines 574-665, 183-222)
   - Rewrite `correctLineToBoundary()` to not extend lines along boundary
   - Add tolerance to `isPolygonWithinBoundary()` midpoint check

---

## Verification

### Issue 1 (Vertex Editing)
1. Draw a parcel on the habitat map
2. Double-click on the parcel
3. Verify vertices become draggable (cursor changes to 'grab' on hover)
4. Drag a vertex and verify the parcel shape updates
5. Double-click again to stop editing

### Issue 2 (Linear Features)
1. Draw a hedgerow/watercourse along the red-line boundary
2. Verify the line length matches what was drawn (no extension)
3. Verify vertices are only at user-placed points, not at boundary corners

### Issue 3 (Save Button)
1. Fill boundary to exactly 100% coverage
2. Verify "Save parcels" button becomes enabled
3. Verify "Remaining: 0.00 ha" is displayed
```
