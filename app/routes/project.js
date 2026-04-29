//
// Project routes: project name and details
//

const existingProjects = [
  {
    name: 'Project one',
    reference: 'PRJ-001',
    lastModified: '28 April 2026',
    dateCreated: '10 April 2026'
  },
  {
    name: 'Project two',
    reference: 'PRJ-002',
    lastModified: '26 April 2026',
    dateCreated: '8 April 2026'
  },
  {
    name: 'Project three',
    reference: 'PRJ-003',
    lastModified: '24 April 2026',
    dateCreated: '5 April 2026'
  },
  {
    name: 'Project four',
    reference: 'PRJ-004',
    lastModified: '21 April 2026',
    dateCreated: '1 April 2026'
  },
  {
    name: 'Project five',
    reference: 'PRJ-005',
    lastModified: '19 April 2026',
    dateCreated: '27 March 2026'
  }
]

function registerProjectRoutes(router) {
  router.get('/government-gateway', function (req, res) {
    res.render('project/government-gateway', {
      gatewayUserId: req.session.data['gatewayUserId'] || ''
    })
  })

  router.post('/government-gateway', function (req, res) {
    req.session.data['gatewayUserId'] = (req.body.gatewayUserId || '').trim() || undefined
    req.session.data['userJourneyType'] = 'existing'
    res.redirect('/project/dashboard')
  })

  router.get('/government-gateway/create-sign-in-details', function (req, res) {
    req.session.data['userJourneyType'] = 'new'
    res.redirect('/project/new')
  })

  router.get('/project/new', function (req, res) {
    // Clear all project, baseline and post-intervention session data
    const userJourneyType = req.session.data['userJourneyType']
    const gatewayUserId = req.session.data['gatewayUserId']

    req.session.data = {}

    if (userJourneyType) {
      req.session.data['userJourneyType'] = userJourneyType
    }

    if (gatewayUserId) {
      req.session.data['gatewayUserId'] = gatewayUserId
    }

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
    const projectReference = (req.query.projectRef || req.session.data['projectReference'] || '').trim()
    const projectName = (req.query.projectName || req.session.data['projectName'] || '').trim()

    if (projectReference) {
      req.session.data['projectReference'] = projectReference
    }

    if (projectName) {
      req.session.data['projectName'] = projectName
    }

    const baselineUnits = req.session.data['baselineUnits']
    const baselineComplete =
      baselineUnits !== undefined && baselineUnits !== null

    const postInterventionUnits = req.session.data['postInterventionUnits']
    const postInterventionComplete =
      postInterventionUnits !== undefined && postInterventionUnits !== null

    res.render('project/details', {
      projectName: req.session.data['projectName'] || '',
      projectReference: req.session.data['projectReference'] || '',
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
    const projectRows = existingProjects.map(function (project) {
      return [
        {
          html:
            '<a class="govuk-link" href="/project/details?projectRef=' +
            encodeURIComponent(project.reference) +
            '&projectName=' +
            encodeURIComponent(project.name) +
            '">' +
            project.name +
            '</a>'
        },
        { text: project.lastModified },
        { text: project.dateCreated }
      ]
    })

    res.render('project/dashboard', {
      projectRows: projectRows
    })
  })
}

module.exports = { registerProjectRoutes }
