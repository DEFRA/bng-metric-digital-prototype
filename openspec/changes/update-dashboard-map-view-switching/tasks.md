## 1. Server

- [x] 1.1 Extract reusable access to session-backed dashboard map data.
- [x] 1.2 Add a JSON endpoint for resolving and returning an available map view.
- [x] 1.3 Pass union layer availability to the initial map page.
- [x] 1.4 Add unit coverage for endpoint/view data behaviour.
- [x] 1.5 Prevent caching of session-backed map-data responses.

## 2. Client

- [x] 2.1 Register stable datasets for every layer available across either view.
- [x] 2.2 Fetch and normalize a selected view without navigating away.
- [x] 2.3 Replace dataset sources and refresh feature, selection, filter, extent, panel, and URL state.
- [x] 2.4 Support browser Back and Forward and an accessible loading/error state.
- [x] 2.5 Hide layers absent from the active view while preserving user visibility preferences.
- [x] 2.6 Keep live status and error messages accessible within the interactive map container.

## 3. Verification

- [x] 3.1 Run unit and syntax checks.
- [x] 3.2 Manually verify baseline-to-post-intervention and reverse switching without a document reload.
- [x] 3.3 Verify unavailable views remain disabled and failed requests retain the current view.
- [x] 3.4 Add automated client coverage for successful and failed in-place switching.
