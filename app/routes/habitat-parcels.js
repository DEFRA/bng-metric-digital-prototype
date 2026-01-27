/**
 * Habitat Parcels Routes
 * Handles saving and retrieving habitat parcel data
 */

/**
 * Register habitat parcel routes
 * @param {Router} router - Express router instance
 */
function registerHabitatParcelRoutes(router) {
  // Save habitat parcels to session
  router.post('/api/save-habitat-parcels', function (req, res) {
    req.session.data['habitatParcels'] = req.body
    console.log('Habitat parcels saved to session')
    // Explicitly save session to ensure data persists before redirect
    req.session.save(function (err) {
      if (err) {
        console.error('Session save error:', err)
        return res.status(500).json({ error: 'Failed to save session' })
      }
      res.json({ success: true, redirect: '/on-site-baseline/habitats-summary' })
    })
  })

  // Get habitat parcels from session
  router.get('/api/habitat-parcels', function (req, res) {
    const parcels = req.session.data['habitatParcels'] || null
    res.json(parcels)
  })
}

module.exports = { registerHabitatParcelRoutes }
