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
    console.log('Red line boundary saved to session')
    console.log(
      'Boundary type:',
      boundary?.type,
      'Has geometry:',
      !!boundary?.geometry
    )

    // Fetch LPA, NCA, and LNRS based on the boundary location
    if (boundary && boundary.geometry) {
      // Wrap boundary in array as the API functions expect an array of features
      const boundaryFeatures = [boundary]

      try {
        console.log('Fetching location data from ArcGIS...')

        const lpaName = await getLPA(boundaryFeatures)
        req.session.data['lpaName'] = lpaName
        console.log('Fetched LPA name:', lpaName)

        const ncaName = await getNCA(boundaryFeatures)
        req.session.data['ncaName'] = ncaName
        console.log('Fetched NCA name:', ncaName)

        const lnrsName = await getLNRS(boundaryFeatures)
        req.session.data['lnrsName'] = lnrsName
        console.log('Fetched LNRS name:', lnrsName)
      } catch (err) {
        console.error('Error fetching location data from ArcGIS:', err)
        // Continue without failing - these are optional enhancements
      }
    } else {
      console.log('No valid boundary geometry - skipping ArcGIS queries')
    }

    // Explicitly save session to ensure data persists before redirect
    req.session.save(function (err) {
      if (err) {
        console.error('Session save error:', err)
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
