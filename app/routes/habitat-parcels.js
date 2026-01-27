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

    // If there's GeoPackage data but no hand-drawn boundary, migrate the boundary
    // This handles the case where user uploaded a GeoPackage then draws parcels manually
    const geopackageLayers = req.session.data['geopackageLayers']
    const geopackageGeometries = req.session.data['geopackageGeometries']
    const existingBoundary = req.session.data['redLineBoundary']

    if (geopackageLayers && geopackageGeometries) {
      // Migrate boundary if no hand-drawn boundary exists
      if (!existingBoundary) {
        const boundaryLayerInfo = geopackageLayers.find(
          (l) =>
            l.name.toLowerCase().includes('boundary') ||
            l.name.toLowerCase().includes('red_line') ||
            l.name.toLowerCase().includes('redline') ||
            l.name.toLowerCase().includes('site')
        )

        if (boundaryLayerInfo && geopackageGeometries[boundaryLayerInfo.name]) {
          const boundaryFeatureCollection =
            geopackageGeometries[boundaryLayerInfo.name]
          // Convert FeatureCollection to single Feature for consistency with drawing flow
          if (
            boundaryFeatureCollection.features &&
            boundaryFeatureCollection.features.length > 0
          ) {
            req.session.data['redLineBoundary'] =
              boundaryFeatureCollection.features[0]
            console.log(
              'Migrated boundary from GeoPackage to redLineBoundary for drawing flow'
            )
          }
        }
      }

      // Migrate hedgerows if no hand-drawn hedgerows exist
      const existingHedgerows = req.session.data['hedgerows']
      if (
        !existingHedgerows ||
        !existingHedgerows.features ||
        existingHedgerows.features.length === 0
      ) {
        const hedgerowLayerInfo = geopackageLayers.find(
          (l) =>
            l.name.toLowerCase().includes('hedgerow') ||
            l.name.toLowerCase().includes('hedge')
        )
        if (hedgerowLayerInfo && geopackageGeometries[hedgerowLayerInfo.name]) {
          req.session.data['hedgerows'] =
            geopackageGeometries[hedgerowLayerInfo.name]
          console.log('Migrated hedgerows from GeoPackage for drawing flow')
        }
      }

      // Migrate watercourses if no hand-drawn watercourses exist
      const existingWatercourses = req.session.data['watercourses']
      if (
        !existingWatercourses ||
        !existingWatercourses.features ||
        existingWatercourses.features.length === 0
      ) {
        const watercourseLayerInfo = geopackageLayers.find(
          (l) =>
            l.name.toLowerCase().includes('watercourse') ||
            l.name.toLowerCase().includes('river') ||
            l.name.toLowerCase().includes('stream')
        )
        if (
          watercourseLayerInfo &&
          geopackageGeometries[watercourseLayerInfo.name]
        ) {
          req.session.data['watercourses'] =
            geopackageGeometries[watercourseLayerInfo.name]
          console.log('Migrated watercourses from GeoPackage for drawing flow')
        }
      }
    }

    // Clear GeoPackage upload data when saving hand-drawn parcels
    // This ensures the drawing flow is used on the habitats-summary page
    req.session.data['layersConfirmed'] = null
    req.session.data['geopackageLayers'] = null
    req.session.data['geopackageGeometries'] = null
    req.session.data['uploadedFiles'] = null
    console.log('Cleared GeoPackage data - hand-drawn map is now authoritative')
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
