//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

// Load environment variables from .env file
require('dotenv').config()

const proj4 = require('proj4')
const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

// Define British National Grid (EPSG:27700) for server-side reprojection
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
    '+x_0=400000 +y_0=-100000 +ellps=airy ' +
    '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 ' +
    '+units=m +no_defs'
)

// Polyfill `self` for shpjs which expects a browser-like global
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis
}

// Note: proj4 and EPSG:27700 definition kept for potential future use
// Currently, shpjs automatically converts shapefiles to WGS84 (EPSG:4326)
// and we pass this through to the frontend which handles projection to EPSG:3857 for display

// Import route modules
const { registerOsApiRoutes } = require('./routes/os-api')
const { registerBoundaryRoutes } = require('./routes/boundaries')
const { registerHabitatParcelRoutes } = require('./routes/habitat-parcels')
const { registerLinearFeatureRoutes } = require('./routes/linear-features')
const { registerFileConversionRoutes } = require('./routes/file-conversion')
const { registerOnSiteBaselineRoutes } = require('./routes/on-site-baseline')
const { registerOnSitePostInterventionRoutes } = require('./routes/on-site-post-intervention')
const { registerProjectRoutes } = require('./routes/project')
const { registerTestRoutes } = require('./routes/test')
const { registerGenGpkgRoutes } = require('./routes/gen-gpkg')

// Expose env-derived flags to every template render.
router.use(function (req, res, next) {
  res.locals.showTools = process.env.SHOW_TOOLS === 'true'
  next()
})

// Register all route modules
registerOsApiRoutes(router)
registerBoundaryRoutes(router)
registerHabitatParcelRoutes(router)
registerLinearFeatureRoutes(router)
registerFileConversionRoutes(router)
registerProjectRoutes(router)
registerOnSiteBaselineRoutes(router)
registerOnSitePostInterventionRoutes(router)
registerTestRoutes(router)
registerGenGpkgRoutes(router)

router.get('/TradingRules', function (req, res) {
  if (req.query.v !== '9') {
    res.redirect('/TradingRules?v=9');
    return;
  }

  res.render('TradingRules');
});

router.get('/TradingRulesSimulator', function (req, res) {
  res.render('TradingRulesSimulator');
});

router.get('/EnhancementRules', function (req, res) {
  res.render('EnhancementRules');
});

// Import metric calculation functions for API endpoint
const metricCalcs = require('./lib/metric-calcs')
//const getRetentionUnits = metricCalcs.getRetentionUnits
const getBaselineUnits = metricCalcs.getBaselineUnits
const getCreationUnits = metricCalcs.getCreationUnits
const getEnhancementUnits = metricCalcs.getEnhancementUnits

// API endpoint for calculating post-intervention units (added directly to main routes for reliability)
router.get('/api/on-site-post-intervention/calculate-units', function (req, res) {
  const retentionCategory = req.query.retentionCategory || null
  const fullHabitatBefore = req.query.fullHabitatBefore || null
  const conditionBefore = req.query.conditionBefore || null
  const fullHabitatAfter = req.query.fullHabitatAfter || null
  const conditionAfter = req.query.conditionAfter || null
  const area = parseFloat(req.query.area) || 0
  const delayYears = parseInt(req.query.delayYears, 10) || 0
  const advanceYears = parseInt(req.query.advanceYears, 10) || 0

  let units = 0
  try {
    if (retentionCategory === 'Retained') {
      //units = getRetentionUnits(fullHabitatAfter, area, conditionAfter, fullHabitatBefore, conditionBefore)
      units = getBaselineUnits(fullHabitatBefore, area, conditionBefore)
    } else if (retentionCategory === 'Enhanced') {
      units = getEnhancementUnits(fullHabitatBefore, conditionBefore, fullHabitatAfter, area, conditionAfter, delayYears, advanceYears)
    } else if (retentionCategory === 'Lost') {
      //units = getCreationUnits(fullHabitatBefore, area, conditionBefore, fullHabitatAfter, conditionAfter, delayYears, advanceYears)
      units = getCreationUnits(area, fullHabitatAfter, conditionAfter, delayYears, advanceYears)
    }
  } catch (err) {
    console.error('[Routes] Error calculating units via API:', err.message)
    units = 0
  }

  res.json({ units: units })
})
