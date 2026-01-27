# Plan: Click-to-Highlight Map Features from Table

## Summary

Add interactive functionality where clicking a parcel/hedgerow/watercourse reference in the table highlights the corresponding feature on the map with a yellow outline and zooms to it.

## Files to Modify

1. **`app/routes/on-site-baseline.js`** (lines 587-653) - Make references clickable links with data attributes
2. **`app/assets/javascripts/map-habitats-summary.js`** - Add highlight layer, click handlers, and zoom logic
3. **`app/assets/sass/application.scss`** - Add table row highlight styles

## Implementation Steps

### Step 1: Update Routes File

Modify table row construction to make references clickable links:

**Parcels (line 589):**

```javascript
{
  html: '<a href="#" class="govuk-link habitat-ref-link" data-feature-type="parcel" data-feature-index="' +
    index +
    '">' +
    parcel.parcelId +
    '</a>'
}
```

Note: Need to add `index` parameter to the map callback.

**Hedgerows (line 617):**

```javascript
{
  html: '<a href="#" class="govuk-link habitat-ref-link" data-feature-type="hedgerow" data-feature-index="' +
    index +
    '">H-' +
    (index + 1).toString().padStart(3, '0') +
    '</a>'
}
```

**Watercourses (line 641):**

```javascript
{
  html: '<a href="#" class="govuk-link habitat-ref-link" data-feature-type="watercourse" data-feature-index="' +
    index +
    '">W-' +
    (index + 1).toString().padStart(3, '0') +
    '</a>'
}
```

### Step 2: Update JavaScript (`map-habitats-summary.js`)

1. **Store layer references at module scope:**

   ```javascript
   let parcelsLayer = null
   let hedgerowsLayer = null
   let watercoursesLayer = null
   let highlightSource = null
   let highlightLayer = null
   let currentHighlightedLink = null
   ```

2. **Assign to module variables when creating layers** (lines 123, 154, 182)

3. **Add highlight layer after other layers:**

   ```javascript
   highlightSource = new ol.source.Vector()
   highlightLayer = new ol.layer.Vector({
     source: highlightSource,
     style: function (feature) {
       const geomType = feature.getGeometry().getType()
       if (geomType === 'LineString' || geomType === 'MultiLineString') {
         return new ol.style.Style({
           stroke: new ol.style.Stroke({ color: '#ffdd00', width: 8 })
         })
       }
       return new ol.style.Style({
         stroke: new ol.style.Stroke({ color: '#ffdd00', width: 4 }),
         fill: new ol.style.Fill({ color: 'rgba(255, 221, 0, 0.35)' })
       })
     },
     zIndex: 29
   })
   map.addLayer(highlightLayer)
   ```

4. **Add click handler setup:**

   ```javascript
   function setupTableClickHandlers() {
     document.querySelectorAll('.habitat-ref-link').forEach(function (link) {
       link.addEventListener('click', function (e) {
         e.preventDefault()
         handleFeatureClick(
           this.dataset.featureType,
           parseInt(this.dataset.featureIndex, 10),
           this
         )
       })
     })
   }
   ```

5. **Add highlight/zoom handler:**

   ```javascript
   function handleFeatureClick(featureType, featureIndex, linkElement) {
     // Clear previous highlight
     highlightSource.clear()
     if (currentHighlightedLink) {
       currentHighlightedLink
         .closest('tr')
         ?.classList.remove('habitat-row--highlighted')
     }

     // Toggle off if same feature
     if (currentHighlightedLink === linkElement) {
       currentHighlightedLink = null
       return
     }

     // Get layer and feature
     const layer =
       featureType === 'parcel'
         ? parcelsLayer
         : featureType === 'hedgerow'
           ? hedgerowsLayer
           : watercoursesLayer
     const feature = layer?.getSource().getFeatures()[featureIndex]
     if (!feature) return

     // Add highlight
     highlightSource.addFeature(
       new ol.Feature({ geometry: feature.getGeometry().clone() })
     )

     // Highlight row
     linkElement.closest('tr')?.classList.add('habitat-row--highlighted')
     currentHighlightedLink = linkElement

     // Zoom to feature
     window.habitatsSummaryMapClient.zoomToExtent(
       feature.getGeometry().getExtent(),
       {
         padding: [80, 80, 80, 80],
         maxZoom: 17,
         minZoom: 14,
         duration: 500
       }
     )
   }
   ```

6. **Call `setupTableClickHandlers()` after map initialization** (after line 271)

### Step 3: Add CSS Styles (`application.scss`)

```scss
// Habitat summary table row highlighting
.habitat-row--highlighted {
  background-color: #fff7e6 !important;

  td {
    background-color: inherit !important;
  }

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background-color: #ffdd00;
  }
}

.govuk-table__body tr {
  position: relative;
}
```

## Design Decisions

- **Separate highlight layer** - Cleaner than modifying feature styles; no need to restore original styles
- **Yellow color (#ffdd00)** - GOV.UK focus color, high visibility against blue/green features
- **Toggle behavior** - Click same reference to deselect
- **Index-based lookup** - Feature order matches table row order (verified in routes file)

## Verification

1. Start dev server: `npm run dev`
2. Navigate to on-site baseline summary page with habitat data
3. Click a parcel reference (e.g., "HP-001") - should:
   - Highlight the polygon yellow on the map
   - Zoom to that parcel
   - Highlight the table row with yellow background
4. Click the same reference again - should deselect
5. Click a different parcel - should switch highlight
6. Repeat for hedgerows and watercourses
