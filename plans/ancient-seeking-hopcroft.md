# Plan: Add Self-Intersection Validation for Polygons

## Summary

Add validation to reject self-intersecting polygons when users complete drawing a ring. If the polygon overlaps itself, show an error and remove the invalid geometry.

## Files to Modify

### 1. `app/assets/javascripts/defra-map-lib/geometry-validation.js`

Add a new static method `isSelfIntersecting(polygon)` that checks if any non-adjacent edges of the polygon intersect.

**Algorithm:**

- Get the polygon's exterior ring coordinates
- For each edge (i, i+1), check against all non-adjacent edges (j, j+1) where j > i+1
- Skip adjacent edges (they share a vertex, so will trivially "intersect")
- Use the existing `doLineSegmentsIntersect()` method for edge comparison
- Return `true` if any intersection found, `false` otherwise

### 2. `app/assets/javascripts/defra-map-lib/defra-map-client.js`

Modify `_closePolygon()` method (line ~1506) to:

1. Create the polygon geometry (as currently done)
2. Call `GeometryValidation.isSelfIntersecting(polygon)`
3. If self-intersecting:
   - Emit `'validation:error'` with descriptive message
   - Clean up the incomplete drawing (remove vertices, polygon feature)
   - Reset drawing state
   - Return early (don't complete the polygon)
4. If valid, continue with existing logic

## Implementation Details

### New Method in geometry-validation.js

```javascript
GeometryValidation.isSelfIntersecting = function (polygon) {
  const coords = polygon.getCoordinates()[0]
  const n = coords.length

  // Need at least 4 points (3 vertices + closing point)
  if (n < 4) return false

  // Check each edge against non-adjacent edges
  for (let i = 0; i < n - 1; i++) {
    // Start j at i + 2 to skip adjacent edge
    for (let j = i + 2; j < n - 1; j++) {
      // Skip if j wraps around to be adjacent to i
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
```

### Modification to \_closePolygon()

At line ~1512, after creating `completedPolygon`:

```javascript
// Validate: reject self-intersecting polygons
if (GeometryValidation.isSelfIntersecting(completedPolygon)) {
  this._emitter.emit('validation:error', {
    message:
      'The shape you drew crosses over itself. Please draw a simple shape without overlapping lines.'
  })
  // Clean up
  this._placedVertices.forEach((v) => this._drawSource.removeFeature(v))
  this._placedVertices = []
  this._currentPolygonCoords = []
  if (this._polygonFeature) {
    this._drawSource.removeFeature(this._polygonFeature)
    this._polygonFeature = null
  }
  this._hoverSource.clear()
  this._isDrawing = false
  this._canClosePolygon = false
  this._polygonComplete = false
  return
}
```

## Verification

1. Start dev server: `npm run dev`
2. Navigate to red-line boundary page
3. Draw a valid polygon (e.g., simple rectangle) → should complete normally
4. Draw a self-intersecting polygon (figure-8 or bowtie shape) → should show error and reject
5. Test in habitat parcels mode as well
6. Verify error message appears in the status notification area
