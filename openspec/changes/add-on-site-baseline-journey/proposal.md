# Change: Add On-Site Baseline Upload Journey

## Why
Users need to upload GIS data containing site boundaries and habitat parcels as part of the BNG metric calculation process. This journey provides a streamlined way to upload a single GeoPackage file, confirm the detected layers on a map preview, and proceed with the baseline assessment.

## What Changes
- Add new upload choice page at `/on-site-baseline/start` with three options (single file, separate files, no files)
- Add single file upload page at `/on-site-baseline/upload-single-file` for GeoPackage uploads
- Add layer confirmation page at `/on-site-baseline/confirm-layers` with map preview using DefraMapClient
- Add backend routes for handling GeoPackage file uploads and layer extraction
- Add session storage for journey progress
- Add navigation link to main layout for accessing the new journey
- Install `better-sqlite3` npm package for reading GeoPackage files (SQLite format)

## Impact
- Affected specs: on-site-baseline (new capability)
- Affected code:
  - `app/routes.js` - New routes for upload journey and GeoPackage handling
  - `app/views/on-site-baseline/` - New Nunjucks templates (3 pages)
  - `app/views/layouts/main.html` - Navigation link to journey
  - `app/assets/javascripts/` - Client-side map integration for confirm-layers page
  - `package.json` - New dependency for GeoPackage parsing
