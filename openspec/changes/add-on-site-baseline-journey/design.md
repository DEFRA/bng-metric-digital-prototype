## Context
This change adds a user journey for uploading on-site baseline habitat data as part of the BNG metric calculation prototype. The journey follows the flow defined in `site-specs/on-site-baseline/on-site-baseline.yaml` and uses existing page specifications in markdown format.

The GOV.UK Prototype Kit is the foundation, and the DefraMapClient library is used for map display since there is no standard GOV.UK map component.

## Goals / Non-Goals

### Goals
- Implement a functional 3-page journey: choice → upload → confirm
- Parse GeoPackage files server-side to extract layer information
- Display uploaded geometries on a map using DefraMapClient in read-only preview mode
- Store journey progress in session for prototype iteration
- Follow GOV.UK Design System patterns for all non-map UI elements

### Non-Goals
- Production-grade file validation or security hardening
- Support for other GIS formats (shapefile, GeoJSON) in this change
- Editing capabilities on the confirm page (view-only)
- Integration with external location lookup APIs (mock data for prototype)

## Decisions

### GeoPackage Parsing
- **Decision**: Use `better-sqlite3` to read GeoPackage files directly
- **Rationale**: GeoPackage is SQLite-based; `better-sqlite3` is fast, synchronous, and has no native compilation issues on most Node.js setups. It can query the `gpkg_contents` and `gpkg_geometry_columns` tables to discover layers, then read geometry as WKB which can be converted to GeoJSON.
- **Alternatives considered**:
  - `@ngageoint/geopackage` - Full-featured but heavier; may be overkill for layer discovery
  - `gdal-async` - Powerful but requires GDAL native binaries, complicating deployment

### Map Integration
- **Decision**: Use DefraMapClient in a simplified "preview" mode with boundary/parcel layers loaded from session
- **Rationale**: The existing library already handles OS basemap integration and polygon display. Adding a lightweight preview mode avoids duplicating mapping code.
- **Alternative**: New standalone map instance - rejected to maintain consistency with existing map pages

### Session Storage
- **Decision**: Store parsed GeoPackage layer data and geometries in `req.session.data`
- **Rationale**: Consistent with existing prototype patterns (`redLineBoundary`, `habitatParcels`). Sufficient for prototype iteration without database complexity.

### File Storage
- **Decision**: Store uploaded file in memory temporarily during parsing; store extracted GeoJSON in session
- **Rationale**: Prototype does not need persistent file storage. Extracted geometries are small enough for session.

## Risks / Trade-offs

### Risk: Large GeoPackage files may exceed session size limits
- **Mitigation**: Prototype is for small test files; document size limitation. Production would use proper file storage.

### Risk: WKB to GeoJSON conversion complexity
- **Mitigation**: Use `wkx` npm package for WKB parsing, which is lightweight and well-tested.

## Migration Plan
Not applicable - this is a new capability addition with no existing data to migrate.

## Open Questions
- Should the prototype support coordinate system detection/transformation from the GeoPackage, or assume all uploads are in EPSG:27700?
  - **Initial approach**: Assume EPSG:27700 for simplicity; log warning if different CRS detected.
