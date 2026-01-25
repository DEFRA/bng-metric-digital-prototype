## 1. Dependencies

- [x] 1.1 Install `better-sqlite3` npm package for reading GeoPackage (SQLite) files

## 2. Backend Routes

- [x] 2.1 Add GET route for `/on-site-baseline/start` (upload choice page)
- [x] 2.2 Add POST route for `/on-site-baseline/start` to handle form submission and branching
- [x] 2.3 Add GET route for `/on-site-baseline/upload-single-file` (file upload page)
- [x] 2.4 Add POST route for `/on-site-baseline/upload-single-file` to handle GeoPackage upload
- [x] 2.5 Add API route `POST /api/parse-geopackage` to extract layers from uploaded GeoPackage
- [x] 2.6 Add GET route for `/on-site-baseline/confirm-layers` (layer confirmation page)
- [x] 2.7 Add POST route for `/on-site-baseline/confirm-layers` to proceed to summary

## 3. Frontend Views

- [x] 3.1 Create `app/views/on-site-baseline/start.html` with radio button choice
- [x] 3.2 Create `app/views/on-site-baseline/upload-single-file.html` with file upload form
- [x] 3.3 Create `app/views/on-site-baseline/confirm-layers.html` with map preview and summary list

## 4. Client-Side JavaScript

- [x] 4.1 Create `app/assets/javascripts/map-confirm-layers.js` for DefraMapClient integration

## 5. Navigation

- [x] 5.1 Add link to On-Site Baseline journey in `app/views/index.html`

## 6. Testing

- [x] 6.1 Manually verify journey flow in browser: start → upload → confirm
- [ ] 6.2 Verify GeoPackage upload and layer detection (requires test .gpkg file)
- [ ] 6.3 Verify map displays uploaded boundary and parcels correctly (requires test .gpkg file)
