# Change: Refactor client-side mapping into a reusable class-based library

## Why
The current mapping implementation is split across multiple global “modules” (`map.js`, `snapping.js`, `fill.js`, `slice.js`, `validation.js`) and mixes generic mapping behaviours with BNG-specific workflow wiring. This makes it hard to reuse the mapping features in other prototypes and difficult to evolve the mapping code without breaking unrelated pages.

## What Changes
- Introduce a **reusable client-side mapping library** implemented as a **class-based API** (no JS modules required).
- Provide **one public parent class** (the primary entry point) that exposes all mapping features via methods and events.
- Move **generic mapping functionality only** (map bootstrapping, snapping, drawing/editing, fill selection, slicing, geometry validation) into the new library.
- Ensure the new library is **BNG-agnostic**:
  - **No habitat attribution logic**.
  - No hard-coded parcel “bng” payload shape; clients can attach their own metadata via hooks.
- The library MUST accept configuration parameters for backend resources (URLs) rather than hard-coding prototype routes.
- Update the BNG prototype pages to use the new class API for both:
  - Red-line boundary map page.
  - Habitat parcels map page.

## Impact
- **Affected UI**: `app/views/layouts/map-layout.html`, `app/views/define-red-line-boundary.html`, `app/views/on-site-habitat-baseline.html`.
- **Affected client JS (current)**:
  - `app/assets/javascripts/map.js`
  - `app/assets/javascripts/snapping.js`
  - `app/assets/javascripts/fill.js`
  - `app/assets/javascripts/slice.js`
  - `app/assets/javascripts/validation.js`
  - `app/assets/javascripts/upload-boundary.js` (will integrate with new API)
  - `app/assets/javascripts/habitat-attribution.js` (remains, but will consume selection hooks instead of relying on mapping globals)
- **BREAKING (client)**:
  - Existing globals like `window.SnapDrawing`, `window.FillTool`, `window.SliceTool`, `window.ParcelValidation`, and orchestration inside `map.js` will be replaced/retired.

