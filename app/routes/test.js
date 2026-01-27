/**
 * Test Routes
 * Development and testing endpoints
 */

/**
 * Register test routes
 * @param {Router} router - Express router instance
 */
function registerTestRoutes(router) {
  // WFS API test page
  router.get('/test-wfs', function (req, res) {
    res.render('test-wfs')
  })
}

module.exports = { registerTestRoutes }
