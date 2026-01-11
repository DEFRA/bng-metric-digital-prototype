## Context
This prototype uses OpenLayers + `ol-mapbox-style` to render Ordnance Survey NGD vector tiles in **EPSG:27700** and then overlays user-drawn geometries (boundary + parcels). Current client logic is split across multiple global scripts and mixes:

- Map bootstrapping (tile grid, styled vector tiles, CRS registration usage)
- Drawing + snapping to OS features and existing geometry
- Fill selection (select OS polygons and merge / add parcels)
- Slice tool (split polygon into two)
- Polygon validation (within boundary, overlap checks)
- BNG-specific page wiring (save endpoints, DOM updates, habitat attribution syncing)

## Goals / Non-Goals
- Goals:
  - Provide a **reusable**, **BNG-agnostic**, **class-based** mapping client library usable by other GOV.UK prototypes.
  - Provide **hooks/events** for clients to integrate with their own UI and data model.
  - Keep the backend unchanged; the library accepts URLs for backend resources.
  - Expose **read-only area measurement(s) in square meters** so clients can format to hectares/acres.
- Non-Goals:
  - Rebuild habitat attribution (stays in `habitat-attribution.js`).
  - Change server routes or persistence behaviour.
  - Introduce a bundler or require ESM modules; library should work as plain browser scripts.

## Decisions
- **Decision: Provide a single public parent class**
  - Export a single constructor on `window` (for example `window.DefraMapClient`), as the primary entry point.
  - Internally, implement multiple classes (MapCore, SnapDrawing, FillSelection, SliceTool, ParcelValidation, EventEmitter), but keep them private.
- **Decision: Event-driven integration**
  - The parent class will offer `on(eventName, handler)` / `off(...)` hooks.
  - Example events (non-exhaustive):
    - `map:ready`
    - `drawing:started`, `drawing:cancelled`
    - `boundary:changed` (draw/edit/fill/upload)
    - `parcel:added`, `parcel:removed`, `parcel:changed`
    - `parcel:selected` (click on polygon)
    - `fill:selectionChanged`, `fill:confirmed`
    - `slice:started`, `slice:completed`, `slice:cancelled`
    - `validation:error` (domain-neutral message)
- **Decision: URL configuration**
  - All backend interaction URLs (save boundary, save parcels, boundary fetch, OS proxy endpoints, style URL) are provided via constructor options.
  - No hard-coded `/api/...` paths in the reusable library.

## Risks / Trade-offs
- Refactor scope is cross-cutting and touches many behaviours. Mitigation: phase migration with compatibility shims or incremental page-by-page switch.
- Removing BNG parcel metadata from the mapping layer requires a clear handoff API. Mitigation: events + `setFeatureUserData(featureId, data)` style hooks.

## Migration Plan
- Phase 1: Introduce library with a minimal public surface and internal ports of existing logic.
- Phase 2: Update red-line boundary page to use the new class.
- Phase 3: Update habitat parcels page to use the new class and adapt `habitat-attribution.js` to subscribe to selection events.
- Phase 4: Remove legacy globals and old scripts from `map-layout.html`.

## Open Questions
- Should we preserve any compatibility globals (for example `window.SnapDrawing`) during migration to avoid a “big bang” switch?
- Do we want the library to expose OpenLayers objects (map/layers/features) or only serializable data and commands?

