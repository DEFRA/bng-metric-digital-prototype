# Change: Switch dashboard map views without reloading

## Why

Switching between baseline and post-intervention currently reloads the whole dashboard map page. The installed interactive-map datasets plugin can replace GeoJSON in place, allowing the map and its controls to remain mounted while the selected view changes.

## What Changes

- Add a session-backed endpoint that returns map data for an available dashboard view.
- Replace radio-button navigation with an in-place dataset update.
- Keep the selected view, panel content, feature state, map extent, and browser URL consistent after a switch.
- Preserve the current disabled state for views that have not been uploaded.
- Retain the currently displayed view if loading another view fails.

## Impact

- Affected specs: `project-dashboard-map` (new capability)
- Affected code: `app/routes/project-dashboard.js`, `app/views/project-dashboard/map.html`, `app/assets/javascripts/interactive-map/habitats-summary/map-init.js`, and map route/client tests

