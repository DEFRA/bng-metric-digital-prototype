## Context

The dashboard route currently serializes only the selected map data into the page. Selecting a view radio navigates to the same page with a different `view` query parameter, rebuilding the full interactive map. The installed datasets plugin exposes `setData`, which updates an existing GeoJSON source without rebuilding the map.

## Goals / Non-Goals

- Goals:
  - Switch between uploaded baseline and post-intervention data without a page reload.
  - Avoid embedding both potentially large GeoJSON payloads in the initial HTML.
  - Preserve the existing URL and browser-history behaviour.
  - Keep map interaction and filtering state consistent with the displayed data.
- Non-Goals:
  - Change upload handling or GeoPackage parsing.
  - Add a combined baseline and post-intervention view.
  - Change map styling or key ordering.

## Decisions

- Add a JSON endpoint backed by the existing session map data. This avoids doubling the initial HTML payload.
- Reuse the existing view resolution rules so the HTML route and data endpoint cannot diverge.
- Register the union of datasets present across available views when the map initializes. This allows `setData` to update optional layers that are empty in the initial view.
- Keep unavailable datasets registered but invisible, hide their custom panel controls, and restore each user's layer visibility preference when that layer becomes available again.
- Update the five stable dashboard dataset IDs in place with normalized GeoJSON.
- Clear selection and hover state before changing data, rebuild `datasetsByType`, reset or reapply feature filters, recalculate the full extent, and update the panel and URL after a successful switch.
- Use `history.pushState` for user-triggered changes and handle `popstate` so browser Back and Forward also switch data without reloading.
- Mark the interactive container as an accessible region so status and error messages inside it remain exposed to assistive technology.
- Send `Cache-Control: private, no-store` from the session-backed map-data endpoint.

## Risks / Trade-offs

- A view can contain an optional layer that is absent from the other view. Registering the union with empty FeatureCollections prevents `setData` from silently doing nothing.
- Unavailable registered datasets are hidden from the active view's controls and map key without overwriting the user's visibility preference.
- Feature identifiers are index-based and can overlap between views. Selection and feature filters must be cleared before new data is installed.
- Network or session failure can occur during a switch. The current map remains visible, the previous radio selection is restored, and an accessible error message is shown.
- Switching requires a request, unlike embedding both views. The smaller initial response is preferred because uploaded GeoPackages can be large.

## Migration Plan

The existing server-rendered initial view remains unchanged. The map panel and its view controls continue to be created only after the interactive map JavaScript initializes; the enhancement changes those controls from page navigation to an in-place refresh.

## Open Questions

- None.
