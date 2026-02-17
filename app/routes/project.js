//
// Project routes: project name and details
//

function registerProjectRoutes(router) {
  router.get('/project/new', function (req, res) {
    // Clear all project, baseline and post-intervention session data
    req.session.data = {}
    res.redirect('/project/name')
  })

  router.get('/project/name', function (req, res) {
    res.render('project/name', {
      projectName: req.session.data['projectName'] || ''
    })
  })

  router.post('/project/name', function (req, res) {
    const projectName = (req.body.projectName || '').trim()
    req.session.data['projectName'] = projectName || undefined
    res.redirect('/project/details')
  })

  router.get('/project/details', function (req, res) {
    const baselineUnits = req.session.data['baselineUnits']
    const baselineComplete =
      baselineUnits !== undefined && baselineUnits !== null

    const postInterventionUnits = req.session.data['postInterventionUnits']
    const postInterventionComplete =
      postInterventionUnits !== undefined && postInterventionUnits !== null

    res.render('project/details', {
      projectName: req.session.data['projectName'] || '',
      baselineComplete: baselineComplete,
      postInterventionComplete: postInterventionComplete
    })
  })

  router.get('/project/details/review', function (req, res) {
    res.render('project/review', {
      projectName: req.session.data['projectName'] || ''
    })
  })

  router.get('/project/dashboard', function (req, res) {
    res.render('project/dashboard')
  })
}

module.exports = { registerProjectRoutes }
