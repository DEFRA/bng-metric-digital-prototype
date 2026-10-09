/**
 * UKHab / BNG layer style reference. Renders a GOV.UK-templated page that lets
 * you search and inspect the QGIS symbology (colours, outlines, hatching,
 * markers) for every UKHab habitat, hedgerow, river and tree type.
 *
 * The style data is pre-built from the QGIS `.qml` templates by
 * `tools/ukhab-styles/build-style-viewer.mjs` into `app/data/ukhab-styles.json`
 * (committed, so no build step runs at deploy time). The route injects that
 * JSON into the view; `app/assets/javascripts/ukhab-styles.js` renders it.
 * Regenerate the data whenever the source `.qml` files change:
 *
 *   node tools/ukhab-styles/build-style-viewer.mjs
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const STYLES_JSON_PATH = join(__dirname, '..', 'data', 'ukhab-styles.json')

// Read once and cache — the file is static for the life of the process. The
// `<` escape keeps the JSON safe to embed inside a <script> element in the view.
let cachedData = null
function getStylesData() {
  if (cachedData === null) {
    cachedData = readFileSync(STYLES_JSON_PATH, 'utf-8').replaceAll(
      '<',
      '\\u003c'
    )
  }
  return cachedData
}

function registerUkhabStylesRoutes(router) {
  router.get('/tools/ukhab-styles', function (req, res) {
    res.render('ukhab-styles/index', { ukhabData: getStylesData() })
  })
}

module.exports = { registerUkhabStylesRoutes }
