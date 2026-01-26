# Linear Feature Drawing Implementation Plan

## Summary
Add hedgerow and watercourse drawing tools to the habitat baseline map (`on-site-habitat-baseline.html`), allowing users to draw linear features alongside area-based habitat parcels.



## Files to Modify

### New File
- `app/assets/javascripts/defra-map-lib/defra-map-client.linear.js` - Core linear drawing module

### Modified Files
1. `app/assets/javascripts/defra-map-lib/defra-map-client.js` - Add state variables
2. `app/assets/javascripts/defra-map-lib/defra-map-client.controls.js` - Add tool buttons and SVG icons
3. `app/assets/javascripts/defra-map-lib/defra-map-client.keyboard.js` - Extend for line drawing
4. `app/assets/javascripts/defra-map-lib/defra-map-client.snapping.js` - Add linear feature snapping
5. `app/assets/javascripts/map-habitat-parcels.js` - Enable tools, handle events, save linear features
6. `app/routes.js` - Add API endpoints, update summary route
7. `app/views/on-site-baseline/habitats-summary.html` - Add linear feature tables
8. `app/views/on-site-habitat-baseline.html` - Add linear feature display rows
9. `app/assets/javascripts/map-habitats-summary.js` - Render linear features on map
10. `app/views/layouts/map-layout.html` - Load new linear.js module

---

## Implementation Steps

### Step 1: Core State Variables (`defra-map-client.js`)

Add to constructor (around line 104-135):
```javascript
// Linear features
this._hedgerows = []        // [{ id, feature, coords, vertices, meta }]
this._watercourses = []     // [{ id, feature, coords, vertices, meta }]
this._isLineDrawing = false
this._currentLineType = null // 'hedgerow' | 'watercourse'
this._currentLineCoords = []
this._placedLineVertices = []
this._lineFeature = null

// Colors for linear features
this._linearColors = {
  hedgerow: { stroke: '#00703c', strokeWidth: 4 },      // GOV.UK green
  watercourse: { stroke: '#1d70b8', strokeWidth: 4, lineDash: [8, 4] }  // GOV.UK blue
}

// Snap toggles
this._snapToHedgerows = true
this._snapToWatercourses = true
```

Add snap types:
```javascript
this._snapType = {
  // ... existing ...
  HEDGEROW_VERTEX: 'hedgerow-vertex',
  HEDGEROW_EDGE: 'hedgerow-edge',
  WATERCOURSE_VERTEX: 'watercourse-vertex',
  WATERCOURSE_EDGE: 'watercourse-edge'
}
```

---

### Step 2: New Linear Module (`defra-map-client.linear.js`)

Create prototype augmentation module following existing patterns (fill.js, slice.js):

**Public API:**
- `startDrawHedgerow()` - Start hedgerow drawing
- `startDrawWatercourse()` - Start watercourse drawing
- `cancelLineDraw()` - Cancel active line drawing
- `finishLineDraw()` - Complete line (2+ points required)
- `removeHedgerow(index)` - Remove hedgerow by index
- `removeWatercourse(index)` - Remove watercourse by index
- `getHedgerowCount()` / `getWatercourseCount()` - Get counts
- `getTotalHedgerowLengthM()` / `getTotalWatercourseLengthM()` - Get total lengths
- `exportLinearFeaturesGeoJSON(options)` - Export as GeoJSON

**Internal Methods:**
- `_startLineDraw(lineType)` - Internal start handler
- `_placeLineVertex(coordinate)` - Place vertex on line
- `_updateLiveLine(snapCoord)` - Update preview while drawing
- `_completeLine()` - Validate and complete line
- `_styleLinearFeature(feature)` - Style function for rendering

**Drawing Flow:**
1. User clicks tool button -> `startDrawHedgerow()` or `startDrawWatercourse()`
2. Sets `_isLineDrawing = true`, `_currentLineType = 'hedgerow'|'watercourse'`
3. Each click places vertex via `_placeLineVertex(snapCoord)`
4. Live preview updates via `_updateLiveLine()` showing LineString
5. Enter/confirm with 2+ points calls `_completeLine()`
6. Creates LineString feature, adds to `_hedgerows` or `_watercourses` array
7. Emits `hedgerow:added` or `watercourse:added` event

Additionally, the remove shape control works for linear features. When the user has selected the 'remove' tool
and hovers over the linear feature, the line should change colour to indicate removal. 
When the user clicks the linear feature with remove control active, the linear feature is removed from the map
and data.
---

### Step 3: Controls Module (`defra-map-client.controls.js`)

**Add SVG icons (around line 19-48):**
```javascript
// Hedgerow icon - stylized hedge/branch
hedgerow: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v20"/><path d="M8 6c-2 2-4 1-4 1s1 4 4 4"/><path d="M16 6c2 2 4 1 4 1s-1 4-4 4"/><path d="M8 14c-2 2-4 1-4 1s1 4 4 4"/><path d="M16 14c2 2 4 1 4 1s-1 4-4 4"/></svg>`,

// Watercourse icon - wavy water lines
watercourse: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/><path d="M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0"/></svg>`
```

**Add tool buttons (around line 180-230):**
- Parse `tools` config for `'hedgerow'` and `'watercourse'`
- Create buttons with color-coded borders (green/blue)
- Add click handlers that call `startDrawHedgerow()` / `startDrawWatercourse()`
- Show floating actions when tool active

**Add event listeners (around line 767-816):**
- `linedraw:started`, `linedraw:cancelled`, `linedraw:completed`
- `hedgerow:added`, `hedgerow:removed`
- `watercourse:added`, `watercourse:removed`

---

### Step 4: Keyboard Module (`defra-map-client.keyboard.js`)

**Update `_isToolActive()` (line 413):**
```javascript
return this._isDrawing || this._fillActive || this._sliceActive || this._isLineDrawing
```

**Update `_handleKeyboardAction()` (line 663):**
Add branch for `this._isLineDrawing` that calls `_handleKeyboardPlaceLinePoint()`

**Add new method:**
```javascript
DefraMapClient.prototype._handleKeyboardPlaceLinePoint = function () {
  if (!this._isLineDrawing) return
  const snapCoord = this._lastSnapCoord || this._map.getView().getCenter()
  this._placeLineVertex(snapCoord)
  this._announceAction(`Point ${this._currentLineCoords.length} placed`)
  this._updateKeyboardSnapIndicator()
}
```

**Update `_handleKeyboardConfirm()`:**
Add case for `_isLineDrawing` to call `_completeLine()` when 2+ points

---

### Step 5: Snapping Module (`defra-map-client.snapping.js`)

**Add toggle methods:**
```javascript
setSnapToHedgerows(enabled)
setSnapToWatercourses(enabled)
```

**Update `_findSnapPoint()` (around line 191-324):**
After parcel snapping, add:
- Hedgerow vertex/edge snapping (if `_snapToHedgerows` enabled)
- Watercourse vertex/edge snapping (if `_snapToWatercourses` enabled)

Use existing edge snapping logic pattern but for LineString coordinates.

---

### Step 6: API Routes (`app/routes.js`)

**Add new endpoints (around line 260-270):**
```javascript
// Save linear features
router.post('/api/save-linear-features', function (req, res) {
  req.session.data['hedgerows'] = req.body.hedgerows
  req.session.data['watercourses'] = req.body.watercourses
  res.json({ success: true })
})

// Get linear features
router.get('/api/linear-features', function (req, res) {
  res.json({
    hedgerows: req.session.data['hedgerows'] || { type: 'FeatureCollection', features: [] },
    watercourses: req.session.data['watercourses'] || { type: 'FeatureCollection', features: [] }
  })
})
```

**Update habitats-summary route (around line 576-728):**
- Include `hedgerows` and `watercourses` in `mapData`
- Build `hedgerowTableRows` and `watercourseTableRows` arrays
- Pass to template for separate tables

---

### Step 7: Summary Page View (`habitats-summary.html`)

**Add tables after parcel table (around line 84-96):**
```html
{% if hedgerowTableRows and hedgerowTableRows.length > 0 %}
<h2 class="govuk-heading-m">Hedgerows</h2>
{{ govukTable({
  firstCellIsHeader: true,
  head: [
    { text: "Reference" },
    { text: "Length (metres)" },
    { text: "Status" },
    { text: "Action", classes: "govuk-visually-hidden" }
  ],
  rows: hedgerowTableRows
}) }}
{% endif %}

{% if watercourseTableRows and watercourseTableRows.length > 0 %}
<h2 class="govuk-heading-m">Watercourses</h2>
{{ govukTable({...}) }}
{% endif %}
```

---

### Step 8: Habitat Baseline View (`on-site-habitat-baseline.html`)

**Update area display (around line 24-36):**
Add rows for hedgerow and watercourse lengths:
```html
<div class="map-area-display__row">
  <span class="map-area-display__label">Hedgerows:</span>
  <span class="map-area-display__data" id="hedgerow-length">0.0 m</span>
</div>
<div class="map-area-display__row">
  <span class="map-area-display__label">Watercourses:</span>
  <span class="map-area-display__data" id="watercourse-length">0.0 m</span>
</div>
```

---

### Step 9: Summary Map Script (`map-habitats-summary.js`)

**Update `createMap()` (around line 50-170):**
Add layers for hedgerows (green lines) and watercourses (blue dashed lines):
```javascript
// Hedgerows layer
if (mapData.hedgerows?.features?.length > 0) {
  const hedgerowsLayer = new ol.layer.Vector({
    source: new ol.source.Vector({
      features: format.readFeatures(mapData.hedgerows, {...})
    }),
    style: new ol.style.Style({
      stroke: new ol.style.Stroke({ color: '#00703c', width: 4 })
    }),
    zIndex: 25
  })
  map.addLayer(hedgerowsLayer)
}

// Watercourses layer (with dash pattern)
if (mapData.watercourses?.features?.length > 0) {
  // Similar, with lineDash: [8, 4]
}
```

---

### Step 10: Page Integration (`map-habitat-parcels.js`)

**Update controls config (line 90-96):**
```javascript
controls: {
  enabled: true,
  tools: 'draw,fill-parcels,slice,remove,hedgerow,watercourse',
  snappingToggles: 'os,boundary-vertices,boundary-edges,parcel-vertices,parcel-edges'
}
```

**Add event listeners:**
```javascript
client.on('hedgerow:added', () => { showStatus('Hedgerow added', 'success'); renderAreaDisplay() })
client.on('watercourse:added', () => { showStatus('Watercourse added', 'success'); renderAreaDisplay() })
```

**Update `saveParcels()` to also save linear features:**
```javascript
const linearData = client.exportLinearFeaturesGeoJSON({ dataProjection: 'EPSG:27700' })
await fetch('/api/save-linear-features', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(linearData)
})
```

**Update `renderAreaDisplay()` to show lengths:**
```javascript
const hedgerowLengthEl = document.getElementById('hedgerow-length')
if (hedgerowLengthEl) {
  hedgerowLengthEl.textContent = client.getTotalHedgerowLengthM().toFixed(1) + ' m'
}
```

---

### Step 11: Load New Module (`map-layout.html`)

Add script after other modules (around line 106):
```html
<script src="/public/javascripts/defra-map-lib/defra-map-client.linear.js"></script>
```

---

## New Events

| Event | Data | Description |
|-------|------|-------------|
| `linedraw:started` | `{ lineType }` | Line drawing started |
| `linedraw:cancelled` | `{}` | Line drawing cancelled |
| `linedraw:completed` | `{ lineType, lengthM }` | Line completed |
| `hedgerow:added` | `{ index, id, lengthM }` | Hedgerow added |
| `hedgerow:removed` | `{ index }` | Hedgerow removed |
| `watercourse:added` | `{ index, id, lengthM }` | Watercourse added |
| `watercourse:removed` | `{ index }` | Watercourse removed |

---

## Verification

1. **Start dev server**: `npm run dev`
2. **Navigate to**: Define red line boundary page, draw boundary, proceed to habitat baseline
3. **Test hedgerow tool**:
   - Click hamburger menu -> "Draw hedgerow" button visible with green styling
   - Draw 2+ point line, verify green line appears
   - Confirm with floating action button
   - Verify "Hedgerow added" status message
4. **Test watercourse tool**:
   - Same flow, blue dashed line styling
5. **Test keyboard**:
   - Use Ctrl+Space to place points, Enter to finish
6. **Test snapping**:
   - Lines snap to boundary, parcels, and other linear features
7. **Test save**:
   - Click Save -> redirects to summary page
   - Summary shows separate tables for hedgerows and watercourses
   - Map preview shows linear features with correct colors
8. **Test configuration**:
   - Modify `controls.tools` in `map-habitat-parcels.js` to exclude one tool
   - Verify tool button not shown
