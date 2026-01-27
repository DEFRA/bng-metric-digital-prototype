# Fix Linear Feature Boundary Validation

## Problem

Linear features (hedgerows/watercourses) fail validation even when drawn carefully near or on the red-line boundary. Two root causes:

1. **No clamping during drawing** - Unlike polygon drawing, linear features don't clamp vertices to the boundary, allowing users to place points outside and only discover the error at completion
2. **Strict midpoint validation** - When drawing along boundary edges that meet at a corner, the midpoint of a line segment can fall outside the polygon due to geometry

## Solution

### Change 1: Add boundary clamping to linear feature drawing

**File:** `app/assets/javascripts/defra-map-lib/defra-map-client.linear.js`

**Location:** `_handlePointerMove` override (lines 467-494)

Add boundary clamping logic after snap point detection, matching the polygon drawing behavior in `defra-map-client.js:1232-1242`:

```javascript
// After: let snapType = snapResult.snapType
// Add:
if (
  (this._snapToBoundaryVertices || this._snapToBoundaryEdges) &&
  this._mode === 'habitat-parcels' &&
  this._boundaryPolygon
) {
  const clamped = this._clampToBoundary(snapCoord)
  if (clamped[0] !== snapCoord[0] || clamped[1] !== snapCoord[1]) {
    snapCoord = clamped
    snapType = this._snapType.BOUNDARY_EDGE
  }
}
```

### Change 2: Add boundary-edge segment detection

**File:** `app/assets/javascripts/defra-map-lib/geometry-validation.js`

**Location:** After `isLineWithinBoundary` function (after line 498)

Add new helper function to detect when a line segment lies along the boundary edge:

```javascript
GeometryValidation.isSegmentOnBoundaryEdge = function (
  p1,
  p2,
  boundaryPolygon
) {
  const boundaryCoords = boundaryPolygon.getCoordinates()[0]

  for (let i = 0; i < boundaryCoords.length - 1; i++) {
    const edgeStart = boundaryCoords[i]
    const edgeEnd = boundaryCoords[i + 1]

    // Check if both points are on this boundary edge
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
```

### Change 3: Update line validation to skip midpoint check for boundary-edge segments

**File:** `app/assets/javascripts/defra-map-lib/geometry-validation.js`

**Location:** `isLineWithinBoundary` function (lines 485-496)

Replace the midpoint check loop with boundary-edge aware logic:

```javascript
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
```

## Files to Modify

1. `app/assets/javascripts/defra-map-lib/defra-map-client.linear.js` - Add clamping
2. `app/assets/javascripts/defra-map-lib/geometry-validation.js` - Fix validation

## Verification

1. Start dev server: `npm run dev`
2. Navigate to on-site habitat baseline map
3. Test scenarios:
   - Draw hedgerow/watercourse with cursor outside boundary - should clamp to edge
   - Draw linear feature exactly along boundary edge - should complete without error
   - Draw linear feature crossing a boundary corner - should complete without error
   - Draw linear feature entirely inside boundary - should still work (regression)
   - Draw with one vertex inside, one on boundary - should complete without error
