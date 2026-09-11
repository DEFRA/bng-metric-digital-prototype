# Project Context

## Purpose

This repository is a **prototype** for a Biodiversity Net Gain (BNG) metric user journey using the **GOV.UK Prototype Kit** and **GOV.UK Design System**.

The prototype focuses on a mapping-led flow that lets users:

- **Define a site “red line boundary”** on a map (draw or “fill” from OS features), then save it to session.
- **Create on-site habitat parcels** within that boundary, attribute baseline habitat data per parcel, and save to session.

This is intended for **rapid iteration and user testing**, not production use.

## Tech Stack

- **Runtime**: Node.js (README specifies `>= v22`), npm (`>= v11`).
- **App framework**: GOV.UK Prototype Kit `13.18.1` (Express-based), using session-backed `req.session.data`.
- **Templating/UI**: Nunjucks templates + GOV.UK Frontend `5.13.0` (Design System macros + GOV.UK classes).
- **Mapping**: OpenLayers (`ol` `^10.7.0`) + `ol-mapbox-style` (`^13.1.1`) for vector tile styling.
- **HTTP**: Node fetch + `undici` `7.16.0` (including optional proxy via `ProxyAgent`).
- **File uploads**: `multer` (`^1.4.5-lts.1`) for in-memory uploads.
- **Shapefile conversion**: `shpjs` (`^6.1.0`) to convert uploaded zipped shapefiles into GeoJSON.
- **Formatting**: Prettier `3.6.2` (scripts include `format` and `format:check`).

## Project Conventions

### Code Style

- **Templates**:
  - Templates live in `app/views/`.
  - Pages **extend a layout** (for example `app/views/layouts/main.html` or `app/views/layouts/map-layout.html`).
  - Prefer **GOV.UK Design System macros** and **GOV.UK CSS classes** (`govuk-*`) rather than custom markup.
- **Routes**:
  - Server routes are defined in `app/routes.js` using the Prototype Kit router (`govukPrototypeKit.requests.setupRouter()`).
  - Session-backed state is stored in `req.session.data[...]`.
- **Client-side JavaScript**:
  - Put browser JS in `app/assets/javascripts/` and reference it via `public/javascripts` in templates (Prototype Kit asset pipeline).
  - **Semicolons**: Use semicolons in JavaScript where expected in this codebase.
- **SCSS**:
  - Styling lives in `app/assets/sass/application.scss` (and/or imports from there).
  - Prefer GOV.UK styles first; add custom styles only where necessary (e.g., map layout/panels).
- **Formatting**:
  - Use Prettier via `npm run format` / `npm run format:check`.

### Architecture Patterns

- **Prototype Kit structure**:
  - Nunjucks views render server-side; user “journey state” is typically held in session.
  - API-like endpoints are implemented as Express routes (still within the Prototype Kit) and used by client-side JS.
- **Mapping pages**:
  - Map pages are rendered with a dedicated layout (`map-layout`) that creates a 3-column UI (left controls, center map, right details).
  - Map behaviour is driven by `data-*` attributes on the map container (for example `data-mode="red-line-boundary"` vs `data-mode="habitat-parcels"`).
- **Coordinate reference system choice**:
  - The map implementation uses **EPSG:27700 (British National Grid)** for vector tiles and features to reduce misalignment.
- **Session-backed persistence**:
  - Red line boundary and habitat parcels are saved via endpoints like `/api/save-red-line-boundary` and `/api/save-habitat-parcels`, stored in session, and later read back (e.g. `/api/red-line-boundary`).
- **Server-side proxying for external APIs**:
  - Ordnance Survey API calls are proxied via server endpoints under `/api/os/...` to keep API keys off the client.

### Testing Strategy

- **Current state**: No dedicated automated test suite is configured in this repository.
- **Expected approach (prototype)**:
  - Manual “happy path” smoke tests through the user journey in a browser.
  - Use `npm run format:check` (Prettier) as a lightweight consistency gate.

### Git Workflow

- **Not explicitly defined in-repo**. Recommended defaults for this prototype:
  - Small PRs on short-lived feature branches.
  - Keep commits focused and descriptive (no strict convention enforced here).

## Domain Context

- **BNG metric**: Biodiversity Net Gain assessment requires defining a site boundary and classifying habitat parcels for baseline calculations.
- **Red line boundary**: The site boundary used as the outer constraint for habitat parcels (parcels must be within boundary; parcels must not overlap).
- **Habitat attribution**: Parcels are assigned habitat metadata (broad habitat type, habitat type, condition, strategic significance, irreplaceable habitat flag, user comments).
- **Irreplaceable habitats**: Flagged as excluded from standard BNG calculations and require bespoke compensation (prototype surfaces a warning).

## Important Constraints

- **Prototype-only**: The README explicitly notes this is **not production-ready** and not intended to be resilient/secure/performant like a production service.
- **Secrets and environment variables**:
  - Do not commit `.env`; secrets are provided via CDP Portal “Secrets” in deployed environments.
  - Ordnance Survey API key is expected in environment as `OS_PROJECT_API_KEY` (server-side only).
- **No direct client exposure of API keys**: External map/API requests should go via server proxy routes.

## External Dependencies

- **Ordnance Survey APIs**:
  - NGD vector tiles + styles and OGC API Features (proxied via `/api/os/...` routes).
- **Defra CDP**:
  - Prototype runs on Defra’s Core Delivery Platform; basic auth is commonly enabled via Prototype Kit/CDP config.
- **Shapefile ingestion**:
  - User uploads `.zip` shapefile archives; server converts to GeoJSON (WGS84) which the frontend reprojects for display.
