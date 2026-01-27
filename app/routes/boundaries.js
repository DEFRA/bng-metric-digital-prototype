/**
 * Red Line Boundary Routes
 * Handles saving and retrieving red line boundary data
 */

/**
 * Register boundary routes
 * @param {Router} router - Express router instance
 */
function registerBoundaryRoutes(router) {
  // Save red line boundary to session
  router.post('/api/save-red-line-boundary', function (req, res) {
    req.session.data['redLineBoundary'] = req.body
    console.log('Red line boundary saved to session')
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
