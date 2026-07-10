# UKHab styles tooling

Dev-only tooling behind the **UKHab styles** page (`/tools/ukhab-styles`). None
of this ships in the Docker image (only `./app` is copied); it lives here so the
page and the QGIS comparison file are reproducible.

## Source

- `qml/**/*.qml` — the QGIS layer styles from the BNG QGIS template, verbatim.
  These are the source of truth for everything below.

## Generators

### 1. HTML app data — `build-style-viewer.mjs`

```
node tools/ukhab-styles/build-style-viewer.mjs
```

Parses every `.qml` into `app/data/ukhab-styles.json`, which the route injects
into the page and `app/assets/javascripts/ukhab-styles.js` renders as searchable
cards (an approximate SVG swatch + the exact property tables).

### 2. QGIS comparison file — `build-qgis-gpkg.mjs`

```
node tools/ukhab-styles/build-qgis-gpkg.mjs
```

Writes `ukhab-symbology.gpkg` — a GeoPackage with one feature per category for
the three categorised styles, and the original `.qml` embedded as each layer's
**default style** (QGIS `layer_styles` table):

| Layer       | Geometry | Category column         | Style                      |
| ----------- | -------- | ----------------------- | -------------------------- |
| `habitats`  | polygon  | `Baseline Habitat Type` | `Habitats Master.qml`      |
| `hedgerows` | line     | `Proposed Hedge Type`   | `Hedgerows Master.qml`     |
| `rivers`    | line     | `Baseline River Type`   | `Watercourse baseline.qml` |

## Comparing QGIS vs the HTML app

1. Open QGIS, drag `ukhab-symbology.gpkg` onto the canvas, and add the layers.
   The symbology applies automatically (no manual "Load style" step).
2. In the **Layers** panel, expand a layer to see QGIS's own legend — one swatch
   per category, directly comparable to the cards on `/tools/ukhab-styles`.
3. The map canvas shows the same symbols drawn on features (a grid block per
   layer). Use Identify or turn on labels (the `label` field) to read each one.

## Coverage and limits

- Covers the **categorised** styles: 130 habitats, 15 hedgerows, 6 rivers.
- The **tree** (`Individual trees master.qml`) and **rivers-master**
  (`Rivers Master.qml`) styles are QGIS _rule-based_ renderers whose rules filter
  over several columns rather than one category field, so they aren't auto-bound
  here. Load those `.qml` onto a suitable layer manually if you need them.
- Features use EPSG:4326 on a small grid purely so QGIS has something to draw;
  positions are for layout only and carry no real-world meaning.
