/**
 * Metric results journey (User Research)
 *
 * A standalone, self-contained mock journey reconstructed from the Figma
 * prototype page "118 AI prototype demo". It walks:
 *   upload choice -> upload baseline -> results summary -> area habitats detail
 *
 * This is a User Research prototype: there is no real GeoPackage parsing. The
 * dashboards are populated from the static config objects below, which are
 * passed straight into the reusable appDashboard / appSideNav Nunjucks macros
 * (app/views/dashboard/macro.njk) — demonstrating a config-driven dashboard.
 */

// Reusable status tags (map to stock govukTag colours)
const TAG_COMPLETE = { text: 'Complete', classes: 'govuk-tag--green' }
const TAG_NOT_UPLOADED = { text: 'Not uploaded', classes: 'govuk-tag--orange' }
const TAG_NOT_MET = { text: 'Not met', classes: 'govuk-tag--red' }

// The "results" card row shared by the Summary and Area habitats screens
const resultsCards = [
  {
    heading: { text: 'On-site baseline', href: '#' },
    value: '4.00 units',
    tag: TAG_COMPLETE
  },
  {
    heading: { text: 'On-site post-intervention', href: '#' },
    value: '0.00 units',
    tag: TAG_NOT_UPLOADED
  },
  {
    wide: true,
    metrics: [
      {
        label: 'Total on-site net unit change',
        value: '–4.00 units',
        valueModifier: 'error'
      },
      {
        label: 'Total on-site net percentage change',
        value: '–100.00%',
        valueModifier: 'error'
      }
    ],
    rows: [
      { key: { text: 'Target percentage', href: '#' }, value: '10%' },
      { key: { text: 'Units required' }, value: '4.40 units' },
      { key: { text: 'Unit deficit' }, value: '4.40 units' },
      { key: { text: 'Trading rules', href: '#' }, tag: TAG_NOT_MET }
    ]
  }
]

// Low-distinctiveness metric row on the Area habitats screen
const lowDistinctivenessCards = [
  {
    heading: { text: 'Units available to offset low distinctiveness deficit' },
    value: '0.00 units'
  },
  {
    heading: { text: 'Low distinctiveness net change in units' },
    value: '–4.00 units',
    valueModifier: 'error'
  },
  {
    heading: { text: 'Cumulative surplus of units' },
    value: '–4.00 units',
    valueModifier: 'error'
  }
]

const tradingRulesTable = {
  head: [
    { text: 'Distinctiveness group' },
    { text: 'Trading rule' },
    { text: 'Status' }
  ],
  rows: [
    [
      { text: 'Low' },
      {
        text: 'Losses must be replaced with area habitat units of the same or higher band.'
      },
      { html: '<strong class="govuk-tag govuk-tag--red">Not met</strong>' }
    ]
  ]
}

const habitatGroupTable = {
  head: [
    { text: 'Habitat group' },
    { text: 'On-site unit change', format: 'numeric' },
    { text: 'Project wide unit change', format: 'numeric' }
  ],
  rows: [
    [
      { text: 'Modified grassland' },
      { text: '–4.00', format: 'numeric' },
      { text: '–4.00', format: 'numeric' }
    ]
  ]
}

/**
 * Build the side navigation, marking the current section.
 * @param {string} current - "summary" or "area-habitats"
 */
function sideNav(current) {
  return {
    ariaLabel: 'Results sections',
    items: [
      {
        text: 'Summary',
        href: '/metric-results/summary',
        current: current === 'summary'
      },
      {
        text: 'Area habitats',
        href: '/metric-results/area-habitats',
        current: current === 'area-habitats',
        items:
          current === 'area-habitats'
            ? [
                { text: 'Baseline', href: '#' },
                { text: 'Post-intervention', href: '#' }
              ]
            : undefined
      }
    ]
  }
}

/**
 * Register metric results routes
 * @param {Router} router - Express router instance
 */
function registerMetricResultsRoutes(router) {
  // Screen 1000 — What would you like to upload?
  router.get('/metric-results/start', function (req, res) {
    res.render('metric-results/start', {
      error: req.query.error || null
    })
  })

  router.post('/metric-results/start', function (req, res) {
    const uploadChoice = req.body.uploadChoice

    if (!uploadChoice) {
      return res.redirect(
        '/metric-results/start?error=Select what you would like to upload'
      )
    }

    // Happy path: the Figma prototype only wires the baseline upload branch.
    req.session.data['metricUploadChoice'] = uploadChoice
    res.redirect('/metric-results/upload-baseline')
  })

  // Screens 1010 / 1020 — Upload a baseline metric GeoPackage
  router.get('/metric-results/upload-baseline', function (req, res) {
    res.render('metric-results/upload-baseline')
  })

  router.post('/metric-results/upload-baseline', function (req, res) {
    // UR mock: no real parsing — just record that a file was "uploaded".
    req.session.data['metricBaselineUploaded'] = true
    res.redirect('/metric-results/summary')
  })

  // Screen 1100 — Results summary dashboard
  router.get('/metric-results/summary', function (req, res) {
    res.render('metric-results/summary', {
      sideNav: sideNav('summary'),
      resultsDashboard: { headingLevel: 3, cards: resultsCards }
    })
  })

  // Screen 1110 — Area habitats detail dashboard
  router.get('/metric-results/area-habitats', function (req, res) {
    res.render('metric-results/area-habitats', {
      sideNav: sideNav('area-habitats'),
      resultsDashboard: { headingLevel: 3, cards: resultsCards },
      lowDistinctivenessDashboard: {
        headingLevel: 4,
        cards: lowDistinctivenessCards
      },
      tradingRulesTable: tradingRulesTable,
      habitatGroupTable: habitatGroupTable
    })
  })
}

module.exports = { registerMetricResultsRoutes }
