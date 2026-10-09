/**
 * Project dashboard v2 journey (User Research)
 *
 * The next iteration of the project-dashboard journey, reconstructed from
 * the Figma "Private Beta - Exploration" page (node 4950:34437). It walks:
 *   start -> sign in -> project name -> choose upload -> upload -> checking
 *   -> overview -> orange flags / area habitats / hedgerows (each with a
 *   summary, trading summary, baseline and post intervention) / project
 *   details / export -> area habitat detail
 *
 * Kept separate from app/routes/project-dashboard.js so both iterations can
 * be compared in research. The Figma page has no on-page prototype wiring, so
 * transitions are inferred from the frame numbering (0xxx onboarding, 1000
 * overview, 2000 flags/export, 3xxx area habitats, 4xxx hedgerows, 5000
 * project details).
 *
 * Area habitats and Hedgerows are the same four screens with different data,
 * so both run through one SECTIONS config and the same views.
 *
 * Data comes from app/data/project-dashboard-v2.json, generated from a
 * completed Statutory Biodiversity Metric workbook by
 * `npm run import:metric -- <workbook.xlsm>` (tools/metric-workbook). Nothing
 * is parsed at request time — uploads in the journey are never read.
 *
 * The "What would you like to upload?" answer picks one of two states:
 *   baseline - only the baseline is known; post-intervention results show as
 *              0.00 with "Upload post intervention file" prompts (the state
 *              drawn in Figma)
 *   complete - baseline and post-intervention results from the workbook
 * Visiting a dashboard page directly (no answer yet) shows the complete state.
 */

const metric = require('../data/project-dashboard-v2.json')

const BASE = '/project-dashboard-v2'
const UPLOAD_HREF = `${BASE}/upload/choose`

// Shared appDashboard settings. "app-dashboard--tight" is the Figma tile
// spacing (4950:34912, 4950:34922): 10px between the number or title and the
// link or tag that follows, with tags not pinned to the card foot.
const DASHBOARD = { headingLevel: 3, classes: 'app-dashboard--tight' }

const TAG_NOT_MET = { text: 'Not met', classes: 'govuk-tag--red' }
const TAG_MET = { text: 'Met', classes: 'govuk-tag--green' }

// --- Formatting --------------------------------------------------------------

const MINUS = '−'

function fixed(value, dp = 2) {
  const s = Math.abs(value).toFixed(dp)
  return value < 0 && Number(s) !== 0 ? MINUS + s : s
}

const units = (value) => `${fixed(value)} units`
const percent = (value) => `${fixed(value * 100)}%`
const hectares = (value, dp = 2) => `${fixed(value, dp)}ha`
const kilometres = (value, dp = 2) => `${fixed(value, dp)}km`
const years = (value) => `${value} ${value === 1 ? 'year' : 'years'}`

function sentenceCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase()
}

const DISTINCTIVENESS_LABELS = { 'V.Low': 'Very low', 'V.High': 'Very high' }

function distinctiveness(band, score) {
  return `${DISTINCTIVENESS_LABELS[band] || sentenceCase(band)} (${score})`
}

const CONDITION_LABELS = { 'Condition Assessment N/A': 'N/A' }

function condition(name, score) {
  return name
    ? `${CONDITION_LABELS[name] || sentenceCase(name)} (${score})`
    : ''
}

function strategicSignificance(band, multiplier) {
  return `${band} (${multiplier})`
}

const slug = (ref) => ref.toLowerCase()
// Missing values (null) are left out of totals.
const sum = (rows, key) =>
  rows.reduce((total, row) => total + (row[key] ?? 0), 0)

function tagHtml(tag) {
  return `<strong class="govuk-tag ${tag.classes}">${tag.text}</strong>`
}

const metTag = (met) => (met ? TAG_MET : TAG_NOT_MET)

const targetPercentage = percent(metric.project.targetPercentage).replace(
  '.00',
  ''
)

// --- Sections ----------------------------------------------------------------

const SECTIONS = {
  'area-habitats': {
    id: 'area-habitats',
    data: metric.area,
    title: 'Area habitats',
    unitType: 'Area habitat',
    noun: 'area',
    detailsHeading: 'Area habitat details',
    hasBroadHabitat: true,
    hasDetailPages: true,
    itemName: 'Habitat',
    measure: {
      label: 'Size',
      detailLabel: 'Size (hectares)',
      key: 'area',
      format: hectares
    },
    // Area habitat condition categories (statutory metric).
    conditions: [
      ['Good', 3],
      ['Fairly Good', 2.5],
      ['Moderate', 2],
      ['Fairly Poor', 1.5],
      ['Poor', 1],
      ['Condition Assessment N/A', 1],
      ['N/A - Other', 0]
    ],
    pageNames: {
      summary: 'Area habitats',
      'trading-summary': 'Area habitats trading summary',
      baseline: 'Baseline for area habitats',
      'post-intervention': 'Post intervention for area habitats'
    }
  },
  hedgerows: {
    id: 'hedgerows',
    data: metric.hedgerows,
    title: 'Hedgerows',
    unitType: 'Hedgerow',
    noun: 'hedgerows',
    detailsHeading: 'Hedgerow details',
    hasBroadHabitat: false,
    hasDetailPages: true,
    itemName: 'Hedgerow',
    measure: {
      label: 'Length',
      detailLabel: 'Length (kilometres)',
      key: 'length',
      format: kilometres
    },
    // Hedgerows are assessed Good / Moderate / Poor only.
    conditions: [
      ['Good', 3],
      ['Moderate', 2],
      ['Poor', 1]
    ],
    pageNames: {
      summary: 'Hedgerows',
      'trading-summary': 'Hedgerows trading rules',
      baseline: 'Baseline for hedgerows',
      'post-intervention': 'Post intervention for hedgerows'
    }
  }
}

const sectionHref = (section, page) =>
  page === 'summary' ? `${BASE}/${section.id}` : `${BASE}/${section.id}/${page}`

// --- Dashboard cards ---------------------------------------------------------

/**
 * The "Results" cards. On the overview, missing post-intervention data
 * prompts an upload; inside a section, the cards link to that section's
 * pages — except the card for the page you are already on (Figma 3200/3300).
 * @param {object} section
 * @param {boolean} complete
 * @param {string} page - "overview", "summary", "baseline" or "post-intervention"
 */
function results(section, complete, page) {
  const r = section.data.results
  const onOverview = page === 'overview'
  const baselineLink =
    page === 'baseline'
      ? undefined
      : {
          text: `View on-site ${section.noun} baseline`,
          href: sectionHref(section, 'baseline')
        }
  let postLink
  if (onOverview && !complete) {
    postLink = { text: 'Upload post intervention file', href: UPLOAD_HREF }
  } else if (page !== 'post-intervention') {
    postLink = {
      text: `View on-site ${section.noun} post intervention`,
      href: sectionHref(section, 'post-intervention')
    }
  }

  return {
    headline: {
      ...DASHBOARD,
      cards: [
        {
          label: { text: 'Total on-site net percentage change' },
          value: percent(complete ? r.netPercentChange : -1),
          tag: metTag(
            complete && r.netPercentChange >= metric.project.targetPercentage
          )
        },
        {
          valueFirst: true,
          value: 'Trading rules',
          caption: complete
            ? {
                text: 'View trading summary',
                href: sectionHref(section, 'trading-summary')
              }
            : { text: 'Upload post intervention file', href: UPLOAD_HREF },
          tag: metTag(complete && tradingRulesMet(section))
        }
      ]
    },
    breakdown: {
      ...DASHBOARD,
      cards: [
        {
          label: { text: 'On-site baseline' },
          value: units(r.baselineUnits),
          link: baselineLink
        },
        {
          label: { text: 'On-site post intervention' },
          value: units(complete ? r.postInterventionUnits : 0),
          link: postLink
        },
        {
          label: { text: 'Total on-site net change' },
          value: units(complete ? r.netUnitChange : -r.baselineUnits)
        }
      ]
    }
  }
}

function targets(section, complete) {
  const r = section.data.results
  const surplus = r.postInterventionUnits - r.unitsRequired
  return {
    ...DASHBOARD,
    cards: [
      {
        label: { text: `Units required to meet ${targetPercentage}` },
        value: units(r.unitsRequired)
      },
      {
        label: { text: 'Unit surplus (or deficit)' },
        value: complete ? units(surplus) : 'Not applicable',
        tag: complete ? metTag(surplus >= 0) : undefined
      }
    ]
  }
}

const projectTargets = {
  ...DASHBOARD,
  cards: [
    {
      label: { text: 'Biodiversity Net Gain target percentage' },
      value: targetPercentage
    },
    {
      label: { text: 'Red line boundary area' },
      value: hectares(metric.project.siteArea)
    }
  ]
}

// --- Content ------------------------------------------------------------------

// Trading rule copy per distinctiveness band, from the Figma content review:
// a short label for the baseline table "Trading rules" column, and a sentence
// for "Required action to meet trading rules" on the habitat detail page.
// Keyed on band rather than the workbook's own (terser) wording.
const TRADING_RULE_COPY = {
  'area-habitats': {
    'V.Low': {
      short: 'Compensation not required',
      long: 'Compensation not required.'
    },
    Low: {
      short: 'Same distinctiveness or better',
      long: 'Losses must be replaced with area habitat units of the same or higher band.'
    },
    Medium: {
      short: 'Same broad habitat or higher distinctiveness',
      long: 'Losses must be replaced by area habitat units of either medium band habitats within the same broad habitat type or, any habitat from a higher band from any broad habitat type.'
    }
  },
  hedgerows: {
    Low: {
      short: 'Same distinctiveness or better',
      long: 'Losses must be replaced with hedgerow units of the same or a higher distinctiveness band.'
    },
    Medium: {
      short: 'Same distinctiveness or better',
      long: 'Losses must be replaced with hedgerow units of the same distinctiveness band or a higher band.'
    }
  }
}

function tradingRuleCopy(section, h) {
  return (
    TRADING_RULE_COPY[section.id][h.distinctiveness] || {
      short: h.tradingRule,
      long: h.tradingRule
    }
  )
}

const STRATEGIC_SIGNIFICANCE_HINT =
  "Habitats are always 'Low' unless designated as otherwise in an authority-approved local strategy."

// --- Tables ------------------------------------------------------------------

// Habitat tables (baseline, post intervention, orange flags) use MOJ
// Frontend's sortable table, rendered through appTable
// (app/views/table/macro.njk) so the totals row can live in a <tfoot> —
// MOJ re-orders every <tbody> row. Cells whose display text wouldn't sort
// correctly ("0.4164ha", "Low (2)") carry the underlying number as
// data-sort-value.

const sortValue = (value) => ({ 'data-sort-value': String(value) })

/**
 * @param {object} table - govukTable params plus `foot`
 * @param {number} [initialColumn=0] - column sorted ascending on load
 */
function sortable(table, initialColumn = 0) {
  return {
    ...table,
    attributes: { 'data-module': 'moj-sortable-table' },
    head: table.head.map((item, i) => ({
      ...item,
      attributes: { 'aria-sort': i === initialColumn ? 'ascending' : 'none' }
    }))
  }
}

// Reference cells are bold (GOV.UK override class), linked or not.
function refCell(href, ref) {
  return {
    ...(href
      ? { html: `<a class="govuk-link" href="${href}">${ref}</a>` }
      : { text: ref }),
    classes: 'govuk-!-font-weight-bold',
    attributes: sortValue(ref)
  }
}

function totalRow(columns, unitsColumn, measureColumn, unitTotal, measure) {
  return Array.from({ length: columns }, (_, i) => {
    if (i === 0) {
      return { html: '<strong>Total</strong>' }
    }
    if (i === unitsColumn) {
      return { html: `<strong>${fixed(unitTotal)}</strong>`, format: 'numeric' }
    }
    if (i === measureColumn) {
      return { html: `<strong>${measure}</strong>`, format: 'numeric' }
    }
    return {}
  })
}

// Shared habitat cells, each sorting on its score / multiplier.
// Habitat type wraps at 13em (see .app-scrollable-table__wrap): wide enough
// for every habitat type in the data, and 137 of the metric's 140, to fit on
// two lines.
const WRAP_HABITAT_TYPE = 'app-scrollable-table__wrap'

// Baseline habitat cells. Any value missing from the data shows "No data".
function habitatCells(section, h, conditionName, conditionScore) {
  return (
    section.hasBroadHabitat
      ? [h.broadHabitat ? { text: h.broadHabitat } : NO_DATA]
      : []
  ).concat([
    h.habitatType
      ? { text: h.habitatType, classes: WRAP_HABITAT_TYPE }
      : { ...NO_DATA, classes: WRAP_HABITAT_TYPE },
    h.distinctiveness
      ? {
          text: distinctiveness(h.distinctiveness, h.distinctivenessScore),
          attributes: sortValue(h.distinctivenessScore)
        }
      : NO_DATA,
    conditionName
      ? {
          text: condition(conditionName, conditionScore),
          attributes: sortValue(conditionScore)
        }
      : NO_DATA,
    h.strategicSignificance
      ? {
          text: strategicSignificance(
            h.strategicSignificance,
            h.strategicSignificanceMultiplier
          ),
          attributes: sortValue(h.strategicSignificanceMultiplier)
        }
      : NO_DATA
  ])
}

// Units the metric couldn't calculate (missing inputs) show "No data".
function unitsCell(h) {
  return h.units == null
    ? { ...NO_DATA, format: 'numeric' }
    : {
        text: fixed(h.units),
        format: 'numeric',
        attributes: sortValue(h.units)
      }
}

function measureCell(section, h) {
  const measure = section.measure
  return {
    text: measure.format(h[measure.key], 4),
    format: 'numeric',
    attributes: sortValue(h[measure.key])
  }
}

// A baseline record is incomplete if any input the metric needs is missing
// (and so its units couldn't be calculated).
const isIncomplete = (h) =>
  !h.habitatType || !h.condition || !h.strategicSignificance || h.units == null

function statusCell(incomplete) {
  return incomplete
    ? {
        html: tagHtml({ text: 'Incomplete', classes: 'govuk-tag--blue' }),
        attributes: sortValue('Incomplete')
      }
    : {
        html: tagHtml({
          text: 'Complete',
          classes: 'govuk-tag--grey app-tag--complete'
        }),
        attributes: sortValue('Complete')
      }
}

const NO_DATA_TEXT = 'No data'

const NO_DATA = {
  html: '<span class="app-no-data">No data</span>',
  attributes: sortValue(-1)
}

function baselineTable(section) {
  const rows = section.data.baseline
  const measure = section.measure
  const head = [
    { text: 'Ref' },
    { text: 'Status' },
    { text: 'Units', format: 'numeric' },
    { text: measure.label, format: 'numeric' }
  ]
    .concat(section.hasBroadHabitat ? [{ text: 'Broad habitat' }] : [])
    .concat([
      { text: 'Habitat type', classes: WRAP_HABITAT_TYPE },
      { text: 'Distinctiveness' },
      { text: 'Condition' },
      { text: 'Strategic significance' },
      { text: 'Trading rules' }
    ])

  return sortable({
    head: head,
    rows: rows.map((h) =>
      [
        refCell(
          section.hasDetailPages &&
            `${sectionHref(section, 'baseline')}/${slug(h.ref)}`,
          h.ref
        ),
        statusCell(isIncomplete(h)),
        unitsCell(h),
        measureCell(section, h)
      ]
        .concat(habitatCells(section, h, h.condition, h.conditionScore))
        .concat([
          tradingRuleCopy(section, h).short
            ? { text: tradingRuleCopy(section, h).short }
            : NO_DATA
        ])
    ),
    foot: [
      totalRow(
        head.length,
        2,
        3,
        sum(rows, 'units'),
        measure.format(sum(rows, measure.key))
      )
    ]
  })
}

const INTERVENTIONS = ['Retained', 'Enhanced', 'Created']

// Standard difficulty multipliers from the statutory metric (the workbook
// stores only the label for standard difficulty).
const DIFFICULTY_MULTIPLIERS = {
  Low: 1,
  Medium: 0.67,
  High: 0.33,
  'Very High': 0.1
}

// A post-intervention row is incomplete if a value the metric needs is missing.
function isPostInterventionIncomplete(h, changed) {
  return (
    !h.strategicSignificance ||
    (changed ? !h.targetCondition : !h.baselineCondition)
  )
}

/**
 * Post intervention table — columns per the Figma "Post intervention table"
 * components (4970:10636 header, 4970:11143 row). Retained shows the habitat
 * as it stands; Enhanced and Created add target condition, time to target
 * and difficulty. Missing values show "No data".
 */
function postInterventionTable(section, intervention) {
  const rows = section.data.postIntervention[intervention.toLowerCase()]
  if (!rows.length) {
    return null
  }
  const measure = section.measure
  const changed = intervention !== 'Retained'
  const head = [
    { text: 'Ref' },
    { text: 'Status' },
    { text: 'Units', format: 'numeric' },
    { text: measure.label, format: 'numeric' }
  ]
    .concat(section.hasBroadHabitat ? [{ text: 'Broad habitat' }] : [])
    .concat([
      { text: 'Habitat type', classes: WRAP_HABITAT_TYPE },
      { text: 'Distinctiveness' },
      { text: 'Condition' },
      { text: 'Strategic significance' }
    ])
    .concat(
      changed
        ? [
            { text: 'Target condition' },
            { text: 'Standard time to target' },
            { text: 'Advance' },
            { text: 'Delay' },
            { text: 'Final time to target' },
            { text: 'Standard difficulty' },
            { text: 'Applied difficulty' }
          ]
        : []
    )

  const conditionCell = (h) => {
    if (intervention === 'Created') {
      // A newly created habitat has no existing condition.
      return {
        html: '<span class="app-no-data">Not applicable</span>',
        attributes: sortValue(-1)
      }
    }
    return h.baselineCondition
      ? {
          text: condition(h.baselineCondition, h.baselineConditionScore),
          attributes: sortValue(h.baselineConditionScore)
        }
      : NO_DATA
  }

  const yearsCell = (value) => ({
    text: years(value),
    attributes: sortValue(value)
  })

  return sortable({
    caption: `${intervention} ${section.noun === 'area' ? 'area habitats' : 'hedgerows'}`,
    captionClasses: 'govuk-table__caption--s',
    head: head,
    rows: rows.map((h) =>
      [
        refCell(
          section.hasDetailPages &&
            `${sectionHref(section, 'post-intervention')}/${slug(h.ref)}`,
          h.ref
        ),
        statusCell(isPostInterventionIncomplete(h, changed)),
        unitsCell(h),
        measureCell(section, h)
      ]
        .concat(
          section.hasBroadHabitat
            ? [h.broadHabitat ? { text: h.broadHabitat } : NO_DATA]
            : []
        )
        .concat([
          h.habitatType
            ? { text: h.habitatType, classes: WRAP_HABITAT_TYPE }
            : NO_DATA,
          h.distinctiveness
            ? {
                text: distinctiveness(
                  h.distinctiveness,
                  h.distinctivenessScore
                ),
                attributes: sortValue(h.distinctivenessScore)
              }
            : NO_DATA,
          conditionCell(h),
          h.strategicSignificance
            ? {
                text: strategicSignificance(
                  h.strategicSignificance,
                  h.strategicSignificanceMultiplier
                ),
                attributes: sortValue(h.strategicSignificanceMultiplier)
              }
            : NO_DATA
        ])
        .concat(
          changed
            ? [
                h.targetCondition
                  ? {
                      text: condition(
                        h.targetCondition,
                        h.targetConditionScore
                      ),
                      attributes: sortValue(h.targetConditionScore)
                    }
                  : NO_DATA,
                yearsCell(h.standardTime),
                yearsCell(h.advanceYears),
                yearsCell(h.delayYears),
                h.finalTime == null || h.finalTimeMultiplier == null
                  ? NO_DATA
                  : {
                      text: `${years(h.finalTime)} (${h.finalTimeMultiplier.toFixed(3)})`,
                      attributes: sortValue(h.finalTime)
                    },
                {
                  text: `${h.standardDifficulty} (${DIFFICULTY_MULTIPLIERS[h.standardDifficulty]})`,
                  attributes: sortValue(
                    DIFFICULTY_MULTIPLIERS[h.standardDifficulty]
                  )
                },
                {
                  text: `${h.appliedDifficulty} (${h.appliedDifficultyMultiplier})`,
                  attributes: sortValue(h.appliedDifficultyMultiplier)
                }
              ]
            : []
        )
    ),
    foot: [
      totalRow(
        head.length,
        2,
        3,
        sum(rows, 'units'),
        measure.format(sum(rows, measure.key))
      )
    ]
  })
}

// Pages a detail page can return to, named by ?from= on the link that opened
// it. Only these values are honoured, so ?from= can't redirect anywhere else.
const RETURN_PAGES = {
  'orange-flags': `${BASE}/orange-flags`
}

/**
 * Where a detail page's Back, Cancel and Save go, and the query string its
 * form must carry so that survives Save.
 * @param {object} req
 * @param {string} fallback - the page to return to when not opened from elsewhere
 */
function returnTo(req, fallback) {
  const from = Object.hasOwn(RETURN_PAGES, req.query.from)
    ? req.query.from
    : null
  return {
    href: from ? RETURN_PAGES[from] : fallback,
    query: from ? `?from=${from}` : ''
  }
}

function flagHref(flag) {
  const section = Object.values(SECTIONS).find(
    (s) => s.unitType === flag.unitType
  )
  if (!section || !section.hasDetailPages) {
    return null
  }
  const page = flag.phase === 'Baseline' ? 'baseline' : 'post-intervention'
  return `${sectionHref(section, page)}/${slug(flag.ref)}?from=orange-flags`
}

// Orange flags wraps freely (.app-scrollable-table--wrap); Detail and Note
// share a minimum width so neither is squeezed into very short lines.
const MIN_WIDTH = 'app-scrollable-table__min-width'

function flagsTable(complete) {
  const flags = metric.flags.filter((f) => complete || f.phase === 'Baseline')
  return sortable({
    head: [
      { text: 'Ref' },
      { text: 'Phase' },
      { text: 'Unit type' },
      { text: 'Broad habitat' },
      { text: 'Habitat type' },
      { text: 'Detail', classes: MIN_WIDTH },
      { text: 'Note', classes: MIN_WIDTH }
    ],
    rows: flags.map((f) => [
      refCell(flagHref(f), f.ref),
      { text: f.phase },
      { text: f.unitType },
      { text: f.broadHabitat || '–' },
      { text: f.habitatType },
      { text: f.detail, classes: MIN_WIDTH },
      { text: f.note, classes: MIN_WIDTH }
    ])
  })
}

// --- Trading summary ---------------------------------------------------------

// Rule wording from the Figma trading screens (3100 / 4100), which is fuller
// than the workbook's short labels.
const TRADING_RULES = {
  'area-habitats': {
    Medium:
      'Losses must be replaced by area habitat units of either medium band habitats within the same broad habitat type or, any habitat from a higher band from any broad habitat type.',
    Low: 'Losses must be replaced with area habitat units of the same or higher distinctiveness band.'
  },
  hedgerows: {
    Medium:
      'Losses must be replaced with hedgerow units of the same distinctiveness band or a higher band.',
    Low: 'Losses must be replaced with hedgerow units of the same or a higher distinctiveness band.'
  }
}

function tradingGroup(section, bandName) {
  return (
    section.data.tradingSummary.groups.find((g) => g.band === bandName) || {
      met: false
    }
  )
}

/**
 * Medium units available to offset a Low deficit.
 *
 * Deliberately differs from the workbook: a Medium loss has to be fixed by
 * the user before going further, so it is never netted off against gains.
 * Only gains count — per broad habitat for area habitats (the Medium rule is
 * "same broad habitat"), per habitat type for hedgerows.
 */
function mediumSurplus(section) {
  const items = section.data.tradingSummary.medium.items
  const groupTotals =
    section.id === 'area-habitats'
      ? [...new Set(items.map((i) => i.broadHabitat))].map((broadHabitat) =>
          sum(
            items.filter((i) => i.broadHabitat === broadHabitat),
            'change'
          )
        )
      : items.map((i) => i.change)
  return groupTotals.filter((total) => total > 0).reduce((a, b) => a + b, 0)
}

function lowSurplus(section) {
  return section.data.tradingSummary.low.netChange + mediumSurplus(section)
}

// Low is met when the Medium surplus covers the Low net change; Medium (and
// the higher bands) keep the workbook's status.
function bandMet(section, bandName) {
  return bandName === 'Low'
    ? lowSurplus(section) >= 0
    : tradingGroup(section, bandName).met
}

function tradingRulesMet(section) {
  return bandMet(section, 'Medium') && bandMet(section, 'Low')
}

function changeTable(head, items, total, totalLabel, classes) {
  return {
    classes: classes,
    head: head,
    rows: items.concat([
      [{ html: `<strong>${totalLabel}</strong>` }]
        .concat(Array.from({ length: head.length - 2 }, () => ({})))
        .concat([
          { html: `<strong>${fixed(total)}</strong>`, format: 'numeric' }
        ])
    ])
  }
}

const UNIT_CHANGE_HEAD = { text: 'Unit change', format: 'numeric' }
const SMALL_TABLE = 'govuk-table--small-text-until-tablet'

// Area habitats (Figma 3100): Medium losses must be replaced within the same
// broad habitat, so its changes are shown one table per broad habitat.
function areaTradingBands(section) {
  const ts = section.data.tradingSummary
  const rules = TRADING_RULES[section.id]
  const broadHabitats = [...new Set(ts.medium.items.map((i) => i.broadHabitat))]
  return [
    {
      heading: 'Medium distinctiveness',
      rule: rules.Medium,
      dashboard: {
        ...DASHBOARD,
        cards: [
          {
            label: { text: 'Medium distinctiveness deficit' },
            value: units(ts.medium.unitDeficit),
            tag: metTag(bandMet(section, 'Medium'))
          }
        ]
      },
      tables: broadHabitats.map((broadHabitat) => {
        const items = ts.medium.items.filter(
          (i) => i.broadHabitat === broadHabitat
        )
        return {
          heading: broadHabitat,
          table: changeTable(
            [{ text: 'Habitat type' }, UNIT_CHANGE_HEAD],
            items.map((i) => [
              { text: i.habitatType },
              { text: fixed(i.change), format: 'numeric' }
            ]),
            sum(items, 'change'),
            'Total broad habitat change',
            SMALL_TABLE
          )
        }
      })
    },
    {
      heading: 'Low distinctiveness',
      rule: rules.Low,
      dashboard: {
        ...DASHBOARD,
        cards: [
          {
            label: { text: 'Low distinctiveness net change' },
            value: units(ts.low.netChange)
          },
          {
            label: { text: 'Medium units surplus' },
            value: units(mediumSurplus(section))
          },
          {
            label: { text: 'Total surplus (or deficit)' },
            value: units(lowSurplus(section)),
            tag: metTag(bandMet(section, 'Low'))
          }
        ]
      },
      tables: [
        {
          table: changeTable(
            [
              { text: 'Broad habitat' },
              { text: 'Habitat type' },
              UNIT_CHANGE_HEAD
            ],
            ts.low.items.map((i) => [
              { text: i.broadHabitat },
              { text: i.habitatType },
              { text: fixed(i.change), format: 'numeric' }
            ]),
            ts.low.total,
            'Total unit change',
            SMALL_TABLE
          )
        }
      ]
    }
  ]
}

// Hedgerows (Figma 4100): no broad habitats — one table per band.
function hedgerowTradingBands(section) {
  const ts = section.data.tradingSummary
  const rules = TRADING_RULES[section.id]
  const bandTable = (band) =>
    changeTable(
      [{ text: 'Habitat type' }, UNIT_CHANGE_HEAD],
      band.items.map((i) => [
        { text: i.habitatType },
        { text: fixed(i.change), format: 'numeric' }
      ]),
      band.total,
      'Total unit change'
    )
  return [
    {
      heading: 'Medium distinctiveness',
      rule: rules.Medium,
      dashboard: {
        ...DASHBOARD,
        cards: [
          {
            label: {
              text: 'Medium distinctiveness unit deficit required to meet trading rules'
            },
            value: units(ts.medium.netChange),
            tag: metTag(bandMet(section, 'Medium'))
          }
        ]
      },
      tables: [{ table: bandTable(ts.medium) }]
    },
    {
      heading: 'Low distinctiveness',
      rule: rules.Low,
      dashboard: {
        ...DASHBOARD,
        cards: [
          {
            label: { text: 'Low distinctiveness net change' },
            value: units(ts.low.netChange)
          },
          {
            label: {
              text: 'Medium units available to offset low distinctiveness deficit'
            },
            value: units(mediumSurplus(section))
          },
          {
            label: { text: 'Cumulative surplus' },
            value: units(lowSurplus(section)),
            tag: metTag(bandMet(section, 'Low'))
          }
        ]
      },
      tables: [{ table: bandTable(ts.low) }]
    }
  ]
}

function tradingStatusTable(section) {
  return {
    head: [{ text: 'Distinctiveness group' }, { text: 'Status' }],
    rows: ['Medium', 'Low'].map((bandName) => [
      { text: bandName },
      { html: tagHtml(metTag(bandMet(section, bandName))) }
    ])
  }
}

// --- Select options ----------------------------------------------------------

function toItems(values, selected, placeholder) {
  const items = values.map((v) => ({
    value: v,
    text: v,
    selected: v === selected
  }))
  if (placeholder) {
    items.unshift({ value: '', text: placeholder, selected: !selected })
  }
  return items
}

const area = SECTIONS['area-habitats']
const uniqueSorted = (values) => [...new Set(values.filter(Boolean))].sort()

function postInterventionHabitats(section) {
  return INTERVENTIONS.flatMap(
    (i) => section.data.postIntervention[i.toLowerCase()]
  )
}

// Select options for a section's detail pages, from the imported data.
function sectionOptions(section) {
  const habitats = section.data.baseline.concat(
    postInterventionHabitats(section)
  )
  return {
    broadHabitats: uniqueSorted(habitats.map((h) => h.broadHabitat)),
    habitatTypes: uniqueSorted(habitats.map((h) => h.habitatType)),
    conditions: section.conditions.map(([name, score]) =>
      condition(name, score)
    )
  }
}

const STRATEGIC_SIGNIFICANCE = [
  ['Low', 1],
  ['Medium', 1.1],
  ['High', 1.15]
].map(([band, multiplier]) => strategicSignificance(band, multiplier))

// Illustrative list for the Project details select.
const LOCAL_PLANNING_AUTHORITIES = [
  'Cambridge City Council',
  'East Cambridgeshire District Council',
  'Fenland District Council',
  'Huntingdonshire District Council',
  'South Cambridgeshire District Council'
]

const PROJECT_DETAIL_FIELDS = [
  'projectName',
  'surveyCompletedBy',
  'surveyDate-day',
  'surveyDate-month',
  'surveyDate-year',
  'planningPermissionApplicantName',
  'localPlanningAuthority'
]

// --- Side navigation ---------------------------------------------------------

/**
 * @param {string} current - "overview", "orange-flags", "project-details",
 *   "export", or a section id
 * @param {string} [sub] - "trading-summary", "baseline" or "post-intervention"
 */
function sideNav(current, sub) {
  const sectionItem = (section) => ({
    text: section.title,
    href: sectionHref(section, 'summary'),
    current: current === section.id && !sub,
    items:
      current === section.id
        ? ['trading-summary', 'baseline', 'post-intervention'].map((page) => ({
            text: {
              'trading-summary': 'Trading summary',
              baseline: 'Baseline',
              'post-intervention': 'Post intervention'
            }[page],
            href: sectionHref(section, page),
            current: sub === page
          }))
        : undefined
  })

  return {
    ariaLabel: 'Project sections',
    classes: 'app-side-nav--plain',
    noVisitedState: true,
    items: [
      {
        text: 'Overview',
        href: `${BASE}/overview`,
        current: current === 'overview'
      },
      {
        text: 'Orange flags',
        href: `${BASE}/orange-flags`,
        current: current === 'orange-flags'
      },
      sectionItem(SECTIONS['area-habitats']),
      sectionItem(SECTIONS.hedgerows),
      {
        text: 'Project details',
        href: `${BASE}/project-details`,
        current: current === 'project-details'
      },
      {
        text: 'Export',
        href: `${BASE}/export`,
        current: current === 'export'
      }
    ]
  }
}

function isComplete(req) {
  return req.session.data.uploadChoice !== 'baseline'
}

// Overview "Actions" (Figma 1000): outstanding work derived from the data.
function overviewActions(req, complete) {
  const actions = []
  const incomplete = area.data.baseline.filter(isIncomplete).length
  if (incomplete) {
    actions.push({
      description: `${incomplete} incomplete baseline habitat ${incomplete === 1 ? 'record' : 'records'}`,
      link: {
        text: 'View baseline habitat list',
        href: sectionHref(area, 'baseline')
      }
    })
  }
  const flags = metric.flags.filter(
    (f) => complete || f.phase === 'Baseline'
  ).length
  if (flags) {
    actions.push({
      description: `${flags} orange ${flags === 1 ? 'flag' : 'flags'} to review`,
      link: { text: 'View orange flags', href: `${BASE}/orange-flags` }
    })
  }
  if (PROJECT_DETAIL_FIELDS.some((field) => !req.session.data[field])) {
    actions.push({
      description: 'Complete your project details',
      link: {
        text: 'View and update project details',
        href: `${BASE}/project-details`
      }
    })
  }
  return {
    head: [{ text: 'Description' }, { text: 'Link' }],
    rows: actions.map((a) => [
      { text: a.description },
      {
        html: `<a class="govuk-link" href="${a.link.href}">${a.link.text}</a>`
      }
    ])
  }
}

/**
 * Register project dashboard v2 routes
 * @param {Router} router - Express router instance
 */
function registerProjectDashboardV2Routes(router) {
  // The v2 service name (Figma header: "Calculate biodiversity net gain"),
  // without renaming the other journeys that share app/config.json.
  router.use(BASE, function (req, res, next) {
    res.locals.serviceName = 'Calculate biodiversity net gain'
    next()
  })

  router.get(BASE, function (req, res) {
    res.render('project-dashboard-v2/start')
  })

  router.get(`${BASE}/sign-in`, function (req, res) {
    res.render('project-dashboard-v2/sign-in')
  })

  router.post(`${BASE}/sign-in`, function (req, res) {
    res.redirect(`${BASE}/project-name`)
  })

  router.get(`${BASE}/project-name`, function (req, res) {
    res.render('project-dashboard-v2/project-name')
  })

  router.post(`${BASE}/project-name`, function (req, res) {
    res.redirect(`${BASE}/upload/choose`)
  })

  router.get(`${BASE}/upload/choose`, function (req, res) {
    res.render('project-dashboard-v2/upload-choose', {
      error: req.query.error || null
    })
  })

  router.post(`${BASE}/upload/choose`, function (req, res) {
    if (!req.body.uploadChoice) {
      return res.redirect(
        `${BASE}/upload/choose?error=Select what you would like to upload`
      )
    }
    res.redirect(`${BASE}/upload`)
  })

  router.get(`${BASE}/upload`, function (req, res) {
    res.render('project-dashboard-v2/upload')
  })

  router.post(`${BASE}/upload`, function (req, res) {
    res.redirect(`${BASE}/upload/checking`)
  })

  router.get(`${BASE}/upload/checking`, function (req, res) {
    res.render('project-dashboard-v2/upload-checking', {
      destination: `${BASE}/overview`
    })
  })

  router.get(`${BASE}/overview`, function (req, res) {
    const complete = isComplete(req)
    const areaResults = results(area, complete, 'overview')
    const hedgerowResults = results(SECTIONS.hedgerows, complete, 'overview')
    res.render('project-dashboard-v2/overview', {
      sideNav: sideNav('overview'),
      actionsTable: overviewActions(req, complete),
      areaResultsHeadline: areaResults.headline,
      areaResultsBreakdown: areaResults.breakdown,
      hedgerowResultsHeadline: hedgerowResults.headline,
      hedgerowResultsBreakdown: hedgerowResults.breakdown,
      projectTargets: projectTargets
    })
  })

  router.get(`${BASE}/orange-flags`, function (req, res) {
    res.render('project-dashboard-v2/orange-flags', {
      sideNav: sideNav('orange-flags'),
      flagsTable: flagsTable(isComplete(req))
    })
  })

  // Area habitats and Hedgerows: summary, trading summary, baseline and
  // post intervention, rendered through the same views.
  for (const section of Object.values(SECTIONS)) {
    const render = (page, view, extra) =>
      function (req, res) {
        const complete = isComplete(req)
        const sectionResults = results(section, complete, page)
        res.render(`project-dashboard-v2/${view}`, {
          section: section,
          pageName: section.pageNames[page],
          complete: complete,
          sideNav: sideNav(section.id, page === 'summary' ? undefined : page),
          resultsHeadline: sectionResults.headline,
          resultsBreakdown: sectionResults.breakdown,
          ...extra(complete)
        })
      }

    router.get(
      sectionHref(section, 'summary'),
      render('summary', 'area-habitats', (complete) => ({
        targets: targets(section, complete)
      }))
    )

    router.get(
      sectionHref(section, 'trading-summary'),
      render('trading-summary', 'trading-summary', () => ({
        tradingStatusTable: tradingStatusTable(section),
        bands:
          section.id === 'hedgerows'
            ? hedgerowTradingBands(section)
            : areaTradingBands(section)
      }))
    )

    router.get(
      sectionHref(section, 'baseline'),
      render('baseline', 'baseline', () => ({
        baselineTable: baselineTable(section)
      }))
    )

    router.get(
      sectionHref(section, 'post-intervention'),
      render('post-intervention', 'post-intervention', () => ({
        // Only interventions with data get a tab (e.g. hedgerows here have
        // no retained or enhanced rows). The view drops the tab strip when
        // just one is left.
        tabs: INTERVENTIONS.map((intervention) => ({
          id: intervention.toLowerCase(),
          label: intervention,
          table: postInterventionTable(section, intervention)
        })).filter((tab) => tab.table),
        emptyText: `There are no post-intervention ${section.noun === 'area' ? 'area habitats' : 'hedgerows'}.`
      }))
    )
  }

  // Detail pages — area habitats (Figma 3210, 3310-3330) and hedgerows,
  // which have no Figma screens of their own and reuse the same views.
  for (const section of Object.values(SECTIONS)) {
    if (!section.hasDetailPages) {
      continue
    }
    const options = sectionOptions(section)
    const baselineList = sectionHref(section, 'baseline')
    const postList = sectionHref(section, 'post-intervention')
    const postHabitats = postInterventionHabitats(section)

    router.get(`${baselineList}/:ref`, function (req, res, next) {
      const habitat = section.data.baseline.find(
        (h) => slug(h.ref) === req.params.ref
      )
      if (!habitat) {
        return next() // unknown ref: fall through to the 404 handler
      }
      const back = returnTo(req, baselineList)
      res.render('project-dashboard-v2/baseline-habitat', {
        section: section,
        habitat: habitat,
        returnHref: back.href,
        formAction: `${baselineList}/${slug(habitat.ref)}${back.query}`,
        measureValue: fixed(habitat[section.measure.key], 4),
        units: habitat.units == null ? NO_DATA_TEXT : fixed(habitat.units),
        distinctiveness: habitat.distinctiveness
          ? distinctiveness(
              habitat.distinctiveness,
              habitat.distinctivenessScore
            )
          : NO_DATA_TEXT,
        strategicSignificance: habitat.strategicSignificance
          ? strategicSignificance(
              habitat.strategicSignificance,
              habitat.strategicSignificanceMultiplier
            )
          : NO_DATA_TEXT,
        tradingRule: tradingRuleCopy(section, habitat).long || NO_DATA_TEXT,
        strategicSignificanceHint: STRATEGIC_SIGNIFICANCE_HINT,
        broadHabitatItems: toItems(
          options.broadHabitats,
          habitat.broadHabitat,
          'Choose broad habitat'
        ),
        habitatTypeItems: toItems(
          options.habitatTypes,
          habitat.habitatType,
          'Choose habitat type'
        ),
        conditionItems: toItems(
          options.conditions,
          condition(habitat.condition, habitat.conditionScore),
          'Choose condition'
        )
      })
    })

    router.post(`${baselineList}/:ref`, function (req, res) {
      res.redirect(returnTo(req, baselineList).href)
    })

    // Renders the variant for the habitat's own intervention (Created /
    // Enhanced / Retained). ?intervention= previews another variant — there's
    // no Calculate button this UR round, so it's for setting up sessions.
    router.get(`${postList}/:ref`, function (req, res, next) {
      const habitat = postHabitats.find((h) => slug(h.ref) === req.params.ref)
      if (!habitat) {
        return next() // unknown ref: fall through to the 404 handler
      }
      const intervention = INTERVENTIONS.includes(req.query.intervention)
        ? req.query.intervention
        : habitat.intervention
      const baseline = section.data.baseline.find(
        (h) => h.ref === habitat.baselineRef
      )
      const targetCondition = condition(
        habitat.targetCondition,
        habitat.targetConditionScore
      )
      const back = returnTo(req, `${postList}#${intervention.toLowerCase()}`)
      res.render('project-dashboard-v2/post-intervention-habitat', {
        section: section,
        habitat: habitat,
        returnHref: back.href,
        formAction: `${postList}/${slug(habitat.ref)}${back.query}`,
        intervention: intervention,
        measureValue: section.measure.format(habitat[section.measure.key], 4),
        units: habitat.units == null ? NO_DATA_TEXT : fixed(habitat.units),
        distinctiveness: habitat.distinctiveness
          ? distinctiveness(
              habitat.distinctiveness,
              habitat.distinctivenessScore
            )
          : NO_DATA_TEXT,
        standardTime:
          habitat.standardTime == null ? '' : years(habitat.standardTime),
        finalTime:
          habitat.finalTime == null
            ? ''
            : habitat.finalTimeMultiplier == null
              ? years(habitat.finalTime)
              : `${years(habitat.finalTime)} (${habitat.finalTimeMultiplier.toFixed(3)})`,
        appliedDifficulty: habitat.appliedDifficulty
          ? `${habitat.appliedDifficulty} (${habitat.appliedDifficultyMultiplier})`
          : '',
        advanceOrDelay:
          habitat.advanceYears > 0
            ? 'advance'
            : habitat.delayYears > 0
              ? 'delay'
              : 'neither',
        baselineHref: baseline
          ? `${baselineList}/${slug(baseline.ref)}`
          : baselineList,
        baselineCondition: habitat.baselineCondition
          ? condition(habitat.baselineCondition, habitat.baselineConditionScore)
          : 'Not recorded',
        strategicSignificanceHint: STRATEGIC_SIGNIFICANCE_HINT,
        interventionItems: toItems(INTERVENTIONS, intervention),
        habitatTypeItems: toItems(options.habitatTypes, habitat.habitatType),
        strategicSignificanceItems: toItems(
          STRATEGIC_SIGNIFICANCE,
          strategicSignificance(
            habitat.strategicSignificance,
            habitat.strategicSignificanceMultiplier
          )
        ),
        targetConditionItems: toItems(
          options.conditions,
          targetCondition,
          targetCondition ? undefined : 'Choose target condition'
        )
      })
    })

    router.post(`${postList}/:ref`, function (req, res) {
      res.redirect(returnTo(req, postList).href)
    })
  }

  router.get(`${BASE}/project-details`, function (req, res) {
    res.render('project-dashboard-v2/project-details', {
      sideNav: sideNav('project-details'),
      localPlanningAuthorityItems: toItems(
        LOCAL_PLANNING_AUTHORITIES,
        req.session.data.localPlanningAuthority,
        'Choose local planning authority'
      )
    })
  })

  router.post(`${BASE}/project-details`, function (req, res) {
    res.redirect(`${BASE}/overview`)
  })

  router.get(`${BASE}/export`, function (req, res) {
    res.render('project-dashboard-v2/export', { sideNav: sideNav('export') })
  })
}

module.exports = { registerProjectDashboardV2Routes }
