/**
 * UKHab / BNG layer style reference. Serves a single self-contained HTML page
 * that lets you search and inspect the QGIS symbology (colours, outlines,
 * hatching, markers) for every UKHab habitat, hedgerow, river and tree type.
 *
 * The page is pre-built from the QGIS `.qml` templates by
 * `tools/ukhab-styles/build-style-viewer.mjs` into `app/data/ukhab-styles.html`
 * (committed, so no build step runs at deploy time). Regenerate it whenever the
 * source `.qml` files change:
 *
 *   node tools/ukhab-styles/build-style-viewer.mjs
 */

const { readFileSync } = require('node:fs')
const { join } = require('node:path')

const STYLES_HTML_PATH = join(__dirname, '..', 'data', 'ukhab-styles.html')

// Read once and cache — the file is static for the life of the process.
let cachedHtml = null
function getStylesHtml() {
  if (cachedHtml === null) {
    cachedHtml = readFileSync(STYLES_HTML_PATH, 'utf-8')
  }
  return cachedHtml
}

function isEnabled() {
  return process.env.SHOW_TOOLS === 'true'
}

function registerUkhabStylesRoutes(router) {
  router.get('/tools/ukhab-styles', function (req, res) {
    if (!isEnabled()) return res.status(404).send('Not found')
    res.set('Content-Type', 'text/html; charset=utf-8')
    res.send(getStylesHtml())
  })
}

module.exports = { registerUkhabStylesRoutes }
