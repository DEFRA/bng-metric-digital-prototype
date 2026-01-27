# Bug Fixes: Removal Tool State + Donut Fill Geometry

## Summary

Fix two bugs in the DEFRA map client:

1. Removal tool stays active after accepting/canceling or switching tools
2. Clipped fill doesn't create "donut" shapes around interior parcels

---

## Bug 1: Removal Tool Stays Active

### Root Causes

1. **Missing Escape handler** in `defra-map-client.js` (line 1002-1008) - doesn't call `cancelRemove()`
2. **Incomplete tool switching** in `defra-map-client.controls.js` (lines 684-711) - Draw, Fill-boundary, Fill-parcels, Slice tools don't call `cancelRemove()` before starting

### Files to Modify

- `app/assets/javascripts/defra-map-lib/defra-map-client.js`
- `app/assets/javascripts/defra-map-lib/defra-map-client.controls.js`

### Changes

**Change 1: defra-map-client.js (lines 1002-1008)**

Add `cancelRemove()` to the Escape key handler:

```javascript
document.addEventListener('keydown', (evt) => {
  if (evt.key === 'Escape') {
    if (this._sliceActive) this.cancelSlice()
    if (this._fillActive) this.cancelFill()
    if (this._isDrawing) this.cancelDrawing()
    if (this._removeActive) this.cancelRemove() // ADD THIS LINE
  }
})
```

**Change 2: defra-map-client.controls.js (lines 684-711)**

Add `cancelRemove()` call before starting each tool:

- Line ~686 (draw): Add `if (this._removeActive) this.cancelRemove()`
- Line ~693 (fill-boundary): Add `if (this._removeActive) this.cancelRemove()`
- Line ~700 (fill-parcels): Add `if (this._removeActive) this.cancelRemove()`
- Line ~707 (slice): Add `if (this._removeActive) this.cancelRemove()`

---

## Bug 2: Donut Geometry Fill Not Working

### Root Cause

When converting OpenLayers geometry to coordinates for parcel creation, the code uses `getCoordinates()[0]` which extracts only the exterior ring, discarding any interior holes (donut shapes).

### Files to Modify

- `app/assets/javascripts/defra-map-lib/defra-map-client.fill.js`

### Changes

**Change 1: Line 665 in `_handleOsPolygonFillClick`**

```javascript
// BEFORE:
const coords = cleanedGeom.getCoordinates()[0]
const success = this.addParcelFromCoordinates(coords)

// AFTER:
const coords = cleanedGeom.getCoordinates()
const success = this.addParcelFromPolygonCoordinates(coords)
```

**Change 2: Line 749 in `_handleGapFillClick`**

```javascript
// BEFORE:
const coords = cleanedGap.getCoordinates()[0]
const success = this.addParcelFromCoordinates(coords)

// AFTER:
const coords = cleanedGap.getCoordinates()
const success = this.addParcelFromPolygonCoordinates(coords)
```

**Change 3: Line 794 in `_addFillPolygonAsParcel`**

```javascript
// BEFORE:
const coords = poly.getCoordinates()[0]
return this.addParcelFromCoordinates(coords)

// AFTER:
const coords = poly.getCoordinates()
return this.addParcelFromPolygonCoordinates(coords)
```

**Change 4: Add new method `addParcelFromPolygonCoordinates`**

Add after `addParcelFromCoordinates` (around line 855):

```javascript
/**
 * Add a parcel from full polygon coordinates (including holes for donut shapes).
 * @param {Array} polygonCoords - Full polygon coordinates [exterior, hole1, hole2, ...]
 * @returns {boolean} True if parcel was added successfully
 */
DefraMapClient.prototype.addParcelFromPolygonCoordinates = function (
  polygonCoords
) {
  if (this._mode !== 'habitat-parcels') return false
  if (!polygonCoords || polygonCoords.length === 0) return false

  // Ensure exterior ring is closed
  const exteriorRing = polygonCoords[0].map((c) => [...c])
  const first = exteriorRing[0]
  const last = exteriorRing[exteriorRing.length - 1]
  if (first[0] !== last[0] || first[1] !== last[1]) {
    exteriorRing.push([...first])
  }

  // Process hole rings - ensure each is closed
  const processedCoords = [exteriorRing]
  for (let i = 1; i < polygonCoords.length; i++) {
    const holeRing = polygonCoords[i].map((c) => [...c])
    const holeFirst = holeRing[0]
    const holeLast = holeRing[holeRing.length - 1]
    if (holeFirst[0] !== holeLast[0] || holeFirst[1] !== holeLast[1]) {
      holeRing.push([...holeFirst])
    }
    processedCoords.push(holeRing)
  }

  const completedPolygon = new ol.geom.Polygon(processedCoords)
  const colorIndex = this._habitatParcels.length % this._parcelColors.length

  const parcelFeature = new ol.Feature({
    geometry: completedPolygon,
    type: 'parcel',
    colorIndex: colorIndex
  })
  this._drawSource.addFeature(parcelFeature)

  // Create vertex features only for exterior ring (holes don't need visible vertices)
  const vertexFeatures = []
  for (let i = 0; i < exteriorRing.length - 1; i++) {
    const vertexFeature = new ol.Feature({
      geometry: new ol.geom.Point(exteriorRing[i]),
      type: 'vertex',
      isFirst: i === 0,
      highlighted: false,
      colorIndex: colorIndex
    })
    vertexFeatures.push(vertexFeature)
    this._drawSource.addFeature(vertexFeature)
  }

  const id = `parcel-${Date.now()}-${Math.random().toString(16).slice(2)}`
  const parcel = {
    id,
    feature: parcelFeature,
    coords: exteriorRing, // Store exterior ring for editing
    vertices: vertexFeatures,
    colorIndex,
    meta: {}
  }
  this._habitatParcels.push(parcel)

  const index = this._habitatParcels.length - 1
  this._emitter.emit('parcel:added', {
    index,
    id,
    areaSqm: completedPolygon.getArea(),
    source: 'fill'
  })
  this._emitter.emit('parcels:changed', {
    count: this._habitatParcels.length,
    totalAreaSqm: this.parcelsTotalAreaSqm
  })
  return true
}
```

---

## Verification Steps

### Bug 1: Removal Tool

1. Navigate to `/on-site-habitat-baseline` page
2. Draw or fill some parcels
3. Click the Remove tool button
4. Press Escape - verify removal mode deactivates
5. Activate Remove again, click Accept button - verify mode deactivates
6. Activate Remove, then click Draw/Fill/Slice - verify removal mode deactivates and new tool activates

### Bug 2: Donut Fill

1. Navigate to `/on-site-habitat-baseline` page
2. Draw a small parcel (representing a pond) in the middle of the boundary
3. Click "Fill parcel" tool
4. Click on an OS polygon that covers both the boundary area AND the pond
5. Verify the fill creates a donut shape that excludes the pond parcel
6. Check that the parcel area calculation is correct (boundary minus pond)
