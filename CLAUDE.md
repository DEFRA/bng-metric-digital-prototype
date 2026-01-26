# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

The project is an important part of preserving biodiversity within England, as part of the official planning
process.

Biodiversity Net Gain (BNG) metric prototype built on GOV.UK Prototype Kit. Allows users to define red-line boundaries and habitat parcels on OS maps, upload habitat data from GeoPackage/shapefiles, and calculate biodiversity metrics.

## Development Commands

```bash
# Start development server with hot reload
npm run dev

# Format code with Prettier
npm run format
npm run format:check
```

No test framework is configured (expected for prototype phase).

## Technology Stack

- **Backend**: GOV.UK Prototype Kit 13.18.1 (Express), Node.js 22.16.0
- **Frontend**: GOV.UK Frontend 5.13.0, Nunjucks templates
- **Mapping**: OpenLayers 10.7.0, ol-mapbox-style, OS NGD vector tiles
- **Database**: better-sqlite3
- **File Processing**: multer (uploads), shpjs (shapefiles), proj4 (coordinate transforms), wkx (geometry parsing)

## Architecture

### Server Routes (`app/routes.js`)

All routes in single file using GOV.UK Prototype Kit router. Session state via `req.session.data[...]`.

**API Route Groups:**

- `/api/os/*` - OS API proxy (tiles, styles, features)
- `/api/save-red-line-boundary`, `/api/red-line-boundary` - Boundary management
- `/api/save-habitat-parcels`, `/api/habitat-parcels` - Parcel management
- `/api/convert` - Shapefile to GeoJSON conversion
- `/on-site-baseline/*` - Habitat baseline workflow

### Views (`app/views/`)

- Extend `layouts/main.html` (standard) or `layouts/map-layout.html` (3-column map pages)
- Use GOV.UK Design System macros: `govukInput`, `govukSelect`, `govukButton`, etc.

### Mapping Client (`app/assets/javascripts/defra-map-lib/`)

Reusable class-based library with event-emitter pattern:

- Core: `defra-map-client.js`
- Modules: controls, fill, slice, snapping, keyboard, geometry-validation
- Page integrations: `map-*.js` scripts

### Coordinate Reference System

Primary: **EPSG:27700 (British National Grid)** - chosen to reduce misalignment with OS feature data. Fallback: EPSG:3857.

## Code Style

- Always add semicolons in JavaScript
- Use GOV.UK CSS classes (`govuk-form-group`, `govuk-input`, etc.)
- Prefer GOV.UK macros over raw HTML
- 2-space indentation (see `.editorconfig`)
- Prettier: no semicolons in config, single quotes, no trailing commas

## Security

- API keys handled server-side only (OS_PROJECT_API_KEY)
- Never inspect `.env` directly - it contains secrets
- Secrets managed via CDP Portal Frontend in deployment
