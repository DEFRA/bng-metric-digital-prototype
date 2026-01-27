# Plan: Enhanced Fill - Clipped OS Polygons and Gap Fills

## Summary

Enhance the fill functionality to:

1. **Clip OS polygons** to the boundary edge when they extend beyond
2. **Fill gaps** by clicking on unfilled areas within the boundary

Uses `turf.js` for polygon intersection/difference operations.

---

## Implementation

### Phase 1: Add turf.js dependency

**File: `app/views/layouts/map-layout.html`**

Add turf.js CDN after proj4 (line 92):

```html
<script src="https://cdn.jsdelivr.net/npm/@turf/turf@7/turf.min.js"></script>
```

---

### Phase 2: Create turf-helpers.js module

**New file: `app/assets/javascripts/defra-map-lib/turf-helpers.js`**

Provides OL ↔ turf.js conversion utilities:

| Function                               | Purpose                                           |
| -------------------------------------- | ------------------------------------------------- |
| `olPolygonToTurf(olPolygon)`           | Convert OL Polygon to turf.js                     |
| `turfToOlPolygonSingle(turfGeom)`      | Convert turf back to OL (largest if MultiPolygon) |
| `intersectPolygons(polygon, boundary)` | Clip polygon to boundary                          |
| `calculateGaps(boundary, parcels)`     | Compute remaining space (boundary - parcels)      |
| `findGapAtPoint(gapsGeom, point)`      | Find which gap contains click point               |
| `cleanPolygon(polygon, minAreaSqm)`    | Filter out tiny slivers                           |

Add to `map-layout.html` after geometry-validation.js (line 100):

```html
<script src="/public/javascripts/defra-map-lib/turf-helpers.js"></script>
```

---

### Phase 3: Modify fill module for clipped fills

**File: `app/assets/javascripts/defra-map-lib/defra-map-client.fill.js`**

#### 3.1 Add TurfHelpers dependency check (after line 21)

```javascript
const TurfHelpers = window.DefraMapLib && window.DefraMapLib.TurfHelpers
if (!TurfHelpers) {
  throw new Error('defra-map-client.fill.js requires TurfHelpers')
}
```

#### 3.2 Modify `_validatePolygonWithinBoundary()` (lines 501-521)

Change from boolean validation to returning clipping info:

- If polygon is within boundary: `{ valid: true, wasClipped: false }`
- If polygon extends beyond: clip it and return `{ valid: true, clipped: geometry, wasClipped: true }`
- If no intersection: `{ valid: false, error: 'does not intersect' }`

#### 3.3 Add `_handleOsPolygonFillClick(polygonInfo)` method

Handles OS polygon fill:

1. Validate (with clipping if needed)
2. Check overlap with existing parcels
3. Add clipped or original geometry as parcel
4. Emit info message if clipped

#### 3.4 Update `_handleFillClick()` (lines 115-154)

Route clicks to appropriate handler:

- If clicked on OS polygon: call `_handleOsPolygonFillClick()`
- If clicked on empty area: call `_handleGapFillClick()` (new)

---

### Phase 4: Add gap fill functionality

**File: `app/assets/javascripts/defra-map-lib/defra-map-client.fill.js`**

#### 4.1 Add `_handleGapFillClick(coordinate)` method

1. Check if click is within boundary (else error)
2. Check if click is inside an existing parcel (else info message)
3. Calculate remaining gaps: `TurfHelpers.calculateGaps(boundary, parcels)`
4. Find the specific gap containing the click: `TurfHelpers.findGapAtPoint()`
5. Clean the gap polygon (filter slivers)
6. Add as new parcel

#### 4.2 Add `_isPointInAnyParcel(coordinate)` helper

Returns true if coordinate is inside any existing parcel.

#### 4.3 Update `_handleFillHover()` for cursor feedback

- Over OS polygon: `pointer` cursor
- Over gap (unfilled area in boundary): `copy` cursor
- Elsewhere: `crosshair` cursor

---

### Phase 5: Update help text

**File: `app/views/on-site-habitat-baseline.html`**

Update "Option 1: Fill Parcel" section to document:

- Automatic clipping when OS polygons extend beyond boundary
- Click-to-fill gaps between existing parcels

---

## Files to Modify

| File                                                            | Changes                                    |
| --------------------------------------------------------------- | ------------------------------------------ |
| `app/views/layouts/map-layout.html`                             | Add turf.js CDN and turf-helpers.js script |
| `app/assets/javascripts/defra-map-lib/turf-helpers.js`          | **NEW** - OL/turf conversion utilities     |
| `app/assets/javascripts/defra-map-lib/defra-map-client.fill.js` | Clipping + gap fill logic                  |
| `app/views/on-site-habitat-baseline.html`                       | Updated help text                          |

---

## Edge Cases Handled

| Case                                 | Handling                       |
| ------------------------------------ | ------------------------------ |
| Intersection creates MultiPolygon    | Extract largest polygon        |
| Tiny sliver from clipping            | Filter out polygons < 10 sqm   |
| OS polygon entirely outside boundary | Error: "does not intersect"    |
| Click inside existing parcel         | Info: "Click on an empty area" |
| Multiple disconnected gaps           | Only fill the clicked gap      |

---

## Verification

1. **Start dev server**: `npm run dev`
2. **Navigate to**: http://localhost:3000/on-site-habitat-baseline
3. **Test clipped fill**:
   - Load/draw a boundary that cuts through an OS field polygon
   - Enter fill mode and click the field polygon
   - Verify the parcel is clipped to the boundary edge
   - See info message: "Polygon was clipped to fit within the boundary"
4. **Test gap fill**:
   - Add 2-3 parcels with gaps between them
   - Click on an unfilled area within the boundary
   - Verify that gap becomes a new parcel
   - Cursor should show `copy` icon when hovering over fillable gaps
5. **Test edge cases**:
   - Click OS polygon entirely outside boundary (should error)
   - Click inside existing parcel (should show info message)
   - Fill all remaining space, then try again (should show "No gaps remaining")
