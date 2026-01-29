# Keyboard Accessibility Fixes for On-site Habitat Baseline Map

## Overview

Three keyboard accessibility issues in the habitat baseline map page need fixing:

1. Ctrl+Space for clipped polygon fill not working
2. Edit mode buttons disappearing after single fill operation
3. Remove polygon mode has no keyboard support

---

## Issue 1: Ctrl+Space for Clipped Polygon Fill

**Problem:** Keyboard handler ignores clipped geometry, using original unclipped polygon.

**File:** `app/assets/javascripts/defra-map-lib/defra-map-client.keyboard.js`

**Location:** Lines 991-1010 in `_handleKeyboardFillSelect()`

**Root Cause:** The validation at line 992-994 returns `{ valid, clipped, wasClipped }` but the handler ignores `clipped` and passes the original polygon to `_addFillPolygonAsParcel()`.

**Fix:** Replace the simple validation with proper clipping logic (matching the mouse handler in `fill.js:638-678`):

```javascript
if (this._fillMode === 'parcels') {
  const poly = this._geometryToPolygon(clickedPolygon.geometry)
  if (!poly) {
    this._announceAction('Invalid polygon geometry')
    return
  }

  const TurfHelpers = window.DefraMapLib && window.DefraMapLib.TurfHelpers
  if (!TurfHelpers.doPolygonsIntersect(poly, this._fillConstraintBoundary)) {
    this._announceAction(
      'This polygon does not intersect the red-line boundary'
    )
    return
  }

  const existingParcelGeoms = this._habitatParcels
    ? this._habitatParcels.map((p) => p.feature.getGeometry())
    : []
  const mapCenter = this._map.getView().getCenter()

  const clippedGeom = TurfHelpers.clipToAvailableSpace(
    poly,
    this._fillConstraintBoundary,
    existingParcelGeoms,
    mapCenter
  )

  if (!clippedGeom) {
    this._announceAction('No available space to fill')
    return
  }

  const cleanedGeom = TurfHelpers.cleanPolygon(clippedGeom)
  if (!cleanedGeom) {
    this._announceAction('Available area is too small to fill')
    return
  }

  const coords = cleanedGeom.getCoordinates()
  const success = this.addParcelFromPolygonCoordinates(coords)

  if (success) {
    const wasClipped = Math.abs(poly.getArea() - cleanedGeom.getArea()) > 1
    this._announceAction(
      wasClipped
        ? 'Parcel added. Polygon was clipped to fit available space'
        : 'Parcel added'
    )
  }
  return
}
```

---

## Issue 2: Edit Mode Buttons Disappearing

**Problem:** Accept/Cancel buttons hide after every fill operation.

**File:** `app/assets/javascripts/defra-map-lib/defra-map-client.controls.js`

**Location:** Lines 885-888

**Root Cause:** `parcel:added` event unconditionally calls `hideFloatingActions()`.

**Fix:** Check if fill-parcels mode is active and preserve buttons:

```javascript
this.on('parcel:added', () => {
  const dbg = this.getDebugInfo ? this.getDebugInfo() : null
  const fillActive = dbg && dbg.fill ? !!dbg.fill.active : false
  const fillMode = dbg && dbg.fill ? dbg.fill.mode : null

  if (fillActive && fillMode === 'parcels') {
    // Keep floating actions visible for continued filling
    updateButtons()
  } else {
    hideFloatingActions()
    updateButtons()
  }
})
```

---

## Issue 3: Remove Mode Keyboard Support

**Problem:** No keyboard interaction for remove mode - only mouse works.

**File:** `app/assets/javascripts/defra-map-lib/defra-map-client.keyboard.js`

### Changes Required:

**1. Add `_removeActive` to `_isToolActive()` (line 420-426):**

```javascript
DefraMapClient.prototype._isToolActive = function () {
  return (
    this._isDrawing ||
    this._fillActive ||
    this._sliceActive ||
    this._isLineDrawing ||
    this._removeActive
  )
}
```

**2. Add `_removeActive` to `_enterKeyboardMode()` (around line 396):**
Add `this._removeActive` to the condition that shows the keyboard target.

**3. Add remove mode to `_handleKeyboardAction()` (line 680-690):**

```javascript
} else if (this._removeActive) {
  this._handleKeyboardRemoveSelect()
}
```

**4. Add new method `_handleKeyboardRemoveSelect()`:**

- Find parcel/boundary at map center using `_findParcelAtPixel()`
- For boundary mode: call `clearBoundary()`
- For parcels mode: call `removeParcel(index)`, stay active for more removals
- Announce action via screen reader

**5. Add new method `_updateKeyboardRemoveHover()`:**

- Find feature at map center
- Apply `removeHover` property for red highlight styling
- Clear previous highlight when moving to new feature

**6. Update `_updateKeyboardSnapIndicator()` (line 460):**
Add early handling for remove mode to call `_updateKeyboardRemoveHover()`.

**7. Add event listeners for remove mode:**

- `remove:started` - show keyboard target if in keyboard mode
- `remove:cancelled`/`remove:finished` - hide target and clear highlights

---

## Files to Modify

| File                           | Changes                                                               |
| ------------------------------ | --------------------------------------------------------------------- |
| `defra-map-client.keyboard.js` | Issue 1: rewrite lines 991-1010; Issue 3: all keyboard remove support |
| `defra-map-client.controls.js` | Issue 2: modify lines 885-888                                         |

---

## Verification

### Issue 1 - Clipped polygon fill:

1. Start fill-parcels mode
2. Use Ctrl+Space on OS polygon extending beyond boundary
3. Verify polygon clips to boundary
4. Verify announcement: "Polygon was clipped to fit available space"

### Issue 2 - Edit mode buttons:

1. Start fill-parcels mode
2. Add parcel via fill
3. Verify Accept/Cancel buttons remain visible
4. Add another parcel
5. Verify buttons still visible
6. Click Accept - buttons should disappear

### Issue 3 - Remove mode keyboard:

1. With parcels on map, start remove mode
2. Press Tab to focus map
3. Verify crosshair appears
4. Use arrow keys to pan
5. Verify parcel under crosshair gets red highlight
6. Press Ctrl+Space to remove
7. Verify announcement and parcel removal
8. Press Enter/Escape to finish
