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
const { registerTestRoutes } = require('./routes/test')

// Register all route modules
registerOsApiRoutes(router)
registerBoundaryRoutes(router)
registerHabitatParcelRoutes(router)
registerLinearFeatureRoutes(router)
registerFileConversionRoutes(router)
registerOnSiteBaselineRoutes(router)
registerTestRoutes(router)
