/**
 * Red Line Boundary Routes
 * Handles saving and retrieving red line boundary data
 */

const { getLPA, getNCA, getLNRS } = require('../lib/arcgis-queries')

/**
 * Register boundary routes
 * @param {Router} router - Express router instance
 */
function registerBoundaryRoutes(router) {
  // Save red line boundary to session
  router.post('/api/save-red-line-boundary', async function (req, res) {
    const boundary = req.body
    req.session.data['redLineBoundary'] = boundary

    // Fetch LPA, NCA, and LNRS based on the boundary location
    // Handle both Feature and FeatureCollection formats
    let boundaryFeature = null
    if (boundary && boundary.type === 'Feature' && boundary.geometry) {
      boundaryFeature = boundary
    } else if (
      boundary &&
      boundary.type === 'FeatureCollection' &&
      boundary.features?.length > 0
    ) {
      boundaryFeature = boundary.features[0]
    }

    if (boundaryFeature && boundaryFeature.geometry) {
      // Wrap boundary in array as the API functions expect an array of features
      const boundaryFeatures = [boundaryFeature]

      try {
        const lpaName = await getLPA(boundaryFeatures)
        req.session.data['lpaName'] = lpaName

        const ncaName = await getNCA(boundaryFeatures)
        req.session.data['ncaName'] = ncaName

        const lnrsName = await getLNRS(boundaryFeatures)
        req.session.data['lnrsName'] = lnrsName
      } catch (err) {
        console.error('[Boundary] Error fetching location data:', err.message)
        // Continue without failing - these are optional enhancements
      }
    }

    // Explicitly save session to ensure data persists before redirect
    req.session.save(function (err) {
      if (err) {
        console.error('[Boundary] Session save error:', err)
        return res.status(500).json({ error: 'Failed to save session' })
      }
      res.json({ success: true, redirect: '/on-site-habitat-baseline' })
    })
  })

  // Get red line boundary from session
  router.get('/api/red-line-boundary', function (req, res) {
    const boundary = req.session.data['redLineBoundary'] || null
    res.json(boundary)
  })
}

module.exports = { registerBoundaryRoutes }
