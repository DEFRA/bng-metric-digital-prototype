/**
 * Linear Features Routes
 * Handles saving and retrieving hedgerow and watercourse data
 */

/**
 * Register linear feature routes
 * @param {Router} router - Express router instance
 */
function registerLinearFeatureRoutes(router) {
  // Save linear features to session
  router.post('/api/save-linear-features', function (req, res) {
    req.session.data['hedgerows'] = req.body.hedgerows
    req.session.data['watercourses'] = req.body.watercourses
    console.log('Linear features saved to session')
    // Explicitly save session to ensure data persists
    req.session.save(function (err) {
      if (err) {
        console.error('Session save error:', err)
        return res.status(500).json({ error: 'Failed to save session' })
      }
      res.json({ success: true })
    })
  })

  // Get linear features from session
  router.get('/api/linear-features', function (req, res) {
    res.json({
      hedgerows: req.session.data['hedgerows'] || {
        type: 'FeatureCollection',
        features: []
      },
      watercourses: req.session.data['watercourses'] || {
        type: 'FeatureCollection',
        features: []
      }
    })
  })
}

module.exports = { registerLinearFeatureRoutes }
