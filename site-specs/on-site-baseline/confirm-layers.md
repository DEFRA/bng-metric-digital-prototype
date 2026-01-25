# Page: Confirm site boundary and habitat parcels

## Page ID

parcels-confirm

## Route

/on-site-baseline/confirm-layers

## Purpose

Allow the user to review the site boundary and habitat parcel layers detected in the uploaded GIS file, confirm coverage, and review automatically derived location information before continuing.

---

## Page content

### Notification banner

- **Component:** GovUK Notification Banner (success)
- **Title:** Success
- **Heading:** `{{ uploadSummary.layerCountMessage }}`

---

### Heading

- **Component:** GovUK Heading (large)
- **Text:** Check your site boundary and habitat parcels

### Body text

- **Component:** GovUK Body
- **Text:**  
  We found the following layers in your file.

---

## Map preview

- **Component:** Custom map container (non-GovUK)
- **Data source:** `mapPreview`

### Legend

- Site boundary → `mapPreview.legend.boundary`
- Habitat parcels → `mapPreview.legend.parcels`

---

## Layers identified

### Summary list

- **Component:** GovUK Summary List

#### Row: Site boundary

- **Value:**
  - Polygon count: `layers.siteBoundary.polygonCount`
  - Area (hectares): `layers.siteBoundary.areaHa`
  - Layer name: `layers.siteBoundary.layerName`
- **Action:** Change layer

#### Row: Habitat parcels

- **Value:**
  - Polygon count: `layers.habitatParcels.polygonCount`
  - Area (hectares): `layers.habitatParcels.areaHa`
  - Layer name: `layers.habitatParcels.layerName`
- **Action:** Change layer

---

## Coverage check

- **Component:** GovUK Inset Text (success)
- **Condition:** `coverage.isFull === true`
- **Content:**  
  **✓ Full coverage** – Your habitat parcels cover the entire site boundary.

---

## Location information

### Section heading

- **Component:** GovUK Heading (medium)
- **Text:** Location information

### Auto-looked-up values

- **Component:** GovUK Summary List (no border)
- **Label:** Looked up automatically

- Local Planning Authority: `location.lpaName`
- National Character Area: `location.nationalCharacterArea`
- Local Nature Recovery Strategy: `location.lnrsName`

---

## Actions

### Primary action

- **Component:** GovUK Button
- **Text:** Continue
- **Action:** Proceed to next step

---

## Data contract

This page does not collect new user input.

Expected data available to the view:

```json
{
  "uploadSummary": {
    "layerCountMessage": "File uploaded – 2 layers found"
  },
  "mapPreview": {
    "legend": {
      "boundary": "Site boundary",
      "parcels": "Habitat parcels (5)"
    }
  },
  "layers": {
    "siteBoundary": {
      "polygonCount": 1,
      "areaHa": 7.87,
      "layerName": "red_line_boundary"
    },
    "habitatParcels": {
      "polygonCount": 5,
      "areaHa": 7.87,
      "layerName": "habitat_parcels"
    }
  },
  "coverage": {
    "isFull": true
  },
  "location": {
    "lpaName": "South Oxfordshire District Council",
    "nationalCharacterArea": "108: Upper Thames Clay Vales",
    "lnrsName": "Oxfordshire LNRS (published)"
  }
}
```
