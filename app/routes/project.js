//
// Project routes: project name and details
//

function registerProjectRoutes(router) {
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
    res.render('project/details', {
      projectName: req.session.data['projectName'] || ''
    })
  })

  router.get('/project/dashboard', function (req, res) {
    res.render('project/dashboard')
  })
}

module.exports = { registerProjectRoutes }
