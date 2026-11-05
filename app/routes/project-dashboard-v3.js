/**
 * Project dashboard v3 journey (User Research round 6)
 *
 * Round 6 iteration of project-dashboard-v2, reconstructed from the Figma
 * "Private Beta - Exploration" page (node 5140:13218). It walks:
 *   start -> sign in -> project name -> choose upload -> upload -> checking
 *   -> overview -> flags / area habitats / hedgerows (each with a summary,
 *   trading summary, baseline and post intervention) / project details
 *   -> area habitat detail
 *
 * Changes from v2: "Orange flags" becomes "Flags" (grouped per habitat, with
 * a flags box on each post-intervention detail page), the Export page is
 * replaced by a "Download spreadsheet" overview action, baseline tables and
 * detail pages show what was retained, enhanced and lost, trading rules sit
 * in a Details component, habitat references are editable, and advance /
 * delay become two selects that can't both be set.
 *
 * Kept separate from v2 so Round 5 stays as tested. The Figma page has no
 * on-page prototype wiring, so transitions are inferred from the frame
 * numbering (0xxx onboarding, 1000 overview, 2000 flags, 3xxx area habitats,
 * 4xxx hedgerows, 5000 project details).
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

const BASE = '/project-dashboard-v3'
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
    // Baseline table and detail page show what was retained, enhanced and
    // lost (Figma 3200 / 3210). The hedgerow screens don't, this round.
    showsInterventionSplit: true,
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
      // No Met / Not met tag (Figma 3000 / 4000, round 6): the sign of the
      // number already says whether the target is reached.
      {
        label: { text: 'Unit surplus (or deficit)' },
        value: complete ? units(surplus) : 'Not applicable'
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
  "Habitats are always of 'Low' strategic significance unless designated as otherwise in a Local Nature Recovery Strategy (LNRS)."

// Baseline detail wording (Figma 3210); post-intervention pages keep the
// LNRS hint above.
const BASELINE_STRATEGIC_SIGNIFICANCE_HINT =
  'Strategic significance is always ‘Low’ for baseline habitats'

// --- Tables ------------------------------------------------------------------

// Habitat tables (baseline, post intervention, flags) use MOJ
// Frontend's sortable table, rendered through appTable
// (app/views/table/macro.njk) so the totals row can live in a <tfoot> —
// MOJ re-orders every <tbody> row. Cells whose display text wouldn't sort
// correctly ("0.4164ha", "Low (2)") carry the underlying number as
// data-sort-value.

const sortValue = (value) => ({ 'data-sort-value': String(value) })

/**
 * @param {object} table - govukTable params plus `foot`. A head item with
 *   `sortable: false` gets no sort button: MOJ only adds one to headings
 *   that carry aria-sort.
 * @param {number} [initialColumn=0] - column sorted ascending on load
 */
function sortable(table, initialColumn = 0) {
  return {
    ...table,
    attributes: { 'data-module': 'moj-sortable-table' },
    head: table.head.map(({ sortable: canSort = true, ...item }, i) =>
      canSort
        ? {
            ...item,
            attributes: {
              'aria-sort': i === initialColumn ? 'ascending' : 'none'
            }
          }
        : item
    )
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

/**
 * How much of a baseline habitat was retained, enhanced and lost, as
 * { retained, enhanced, lost } each { area, units }. The workbook records
 * area retained and enhanced and units retained; baseline units scale with
 * area, so units enhanced follow from the enhanced share of the area.
 * Before a post-intervention file is uploaded nothing is known, so all are 0.
 */
function interventionSplit(h, complete) {
  if (!complete || !h.area) {
    const none = { area: 0, units: 0 }
    return { retained: none, enhanced: none, lost: none }
  }
  const baseUnits = h.units ?? 0
  const retained = { area: h.areaRetained, units: h.unitsRetained }
  const enhanced = {
    area: h.areaEnhanced,
    units: (baseUnits * h.areaEnhanced) / h.area
  }
  return {
    retained: retained,
    enhanced: enhanced,
    lost: {
      area: h.area - retained.area - enhanced.area,
      units: baseUnits - retained.units - enhanced.units
    }
  }
}

const SPLIT_COLUMNS = [
  ['retained', 'Baseline area retained', 'Baseline units retained'],
  ['enhanced', 'Baseline area enhanced', 'Baseline units enhanced'],
  ['lost', 'Area habitat lost', 'Units lost']
]

function baselineTable(section, complete) {
  const rows = section.data.baseline
  const measure = section.measure
  const split = section.showsInterventionSplit
  const splits = rows.map((h) => interventionSplit(h, complete))
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
    .concat(
      split
        ? SPLIT_COLUMNS.flatMap(([, areaLabel, unitsLabel]) => [
            { text: areaLabel, format: 'numeric' },
            { text: unitsLabel, format: 'numeric' }
          ])
        : []
    )

  const splitCells = (values) =>
    SPLIT_COLUMNS.flatMap(([key]) => [
      {
        text: hectares(values[key].area),
        format: 'numeric',
        attributes: sortValue(values[key].area)
      },
      {
        text: fixed(values[key].units),
        format: 'numeric',
        attributes: sortValue(values[key].units)
      }
    ])

  // Totals for the split columns sit after the shared Units / Size totals.
  const splitTotals = () => {
    const total = (key, field) =>
      splits.reduce((acc, sp) => acc + sp[key][field], 0)
    return SPLIT_COLUMNS.flatMap(([key]) => [
      {
        html: `<strong>${hectares(total(key, 'area'))}</strong>`,
        format: 'numeric'
      },
      {
        html: `<strong>${fixed(total(key, 'units'))}</strong>`,
        format: 'numeric'
      }
    ])
  }

  return sortable({
    head: head,
    rows: rows.map((h, i) =>
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
        .concat(split ? splitCells(splits[i]) : [])
    ),
    foot: [
      split
        ? totalRow(
            head.length - SPLIT_COLUMNS.length * 2,
            2,
            3,
            sum(rows, 'units'),
            measure.format(sum(rows, measure.key))
          ).concat(splitTotals())
        : totalRow(
            head.length,
            2,
            3,
            sum(rows, 'units'),
            measure.format(sum(rows, measure.key))
          )
    ]
  })
}

// Baseline detail "Intervention / Units (hectares)" table (Figma 3210).
function interventionSplitTable(h, complete) {
  const split = interventionSplit(h, complete)
  return {
    classes: 'govuk-!-margin-bottom-7',
    head: [{ text: 'Intervention' }, { text: 'Units (hectares)' }],
    rows: [
      ['retained', 'Baseline habitat retained'],
      ['enhanced', 'Baseline habitat enhanced'],
      ['lost', 'Habitat lost']
    ].map(([key, label]) => [
      { text: label, classes: 'govuk-!-font-weight-bold' },
      { text: `${fixed(split[key].units)} (${hectares(split[key].area)})` }
    ])
  }
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
  flags: `${BASE}/flags`
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
  return `${sectionHref(section, page)}/${slug(flag.ref)}?from=flags`
}

// Flags shown for the upload state: baseline only, or everything.
function visibleFlags(complete) {
  return metric.flags.filter((f) => complete || f.phase === 'Baseline')
}

// Baseline, or the post-intervention habitat's intervention (Figma 2000
// "Stage" column: Baseline / Created / Enhanced / Retained).
const flagStage = (f) => (f.phase === 'Baseline' ? 'Baseline' : f.intervention)

// The workbook raises one flag per check, so a habitat can have several.
// The Flags page shows one row per habitat (and stage) with all its flags.
function groupedFlags(complete) {
  const groups = new Map()
  for (const f of visibleFlags(complete)) {
    const key = `${flagStage(f)}|${f.unitType}|${f.ref}`
    if (!groups.has(key)) {
      groups.set(key, { ...f, stage: flagStage(f), details: [] })
    }
    groups.get(key).details.push(f.detail)
  }
  return [...groups.values()]
}

// Several flags in one cell show as separate paragraphs, not a bulleted list
// (a list inside a table cell reads badly). A single flag is plain text.
function flagCell(details) {
  if (details.length === 1) {
    return { text: details[0], classes: MIN_WIDTH }
  }
  return {
    html: details
      .map(
        (detail, i) =>
          `<p class="govuk-body ${i === details.length - 1 ? 'govuk-!-margin-bottom-0' : 'govuk-!-margin-bottom-2'}">${detail}</p>`
      )
      .join(''),
    classes: MIN_WIDTH
  }
}

/**
 * Flags raised against one habitat, for the detail page "Flags" box.
 * @param {object} section
 * @param {string} ref
 * @param {string} stage - "Baseline" or the intervention
 */
function habitatFlags(section, ref, stage) {
  return metric.flags
    .filter(
      (f) =>
        f.unitType === section.unitType &&
        f.ref === ref &&
        flagStage(f) === stage
    )
    .map((f) => f.detail)
}

// Flags wraps freely (.app-scrollable-table--wrap); Flag keeps a minimum
// width so its text isn't squeezed into very short lines.
const MIN_WIDTH = 'app-scrollable-table__min-width'
const NOWRAP = 'app-scrollable-table__nowrap'

// Stage sorts in journey order rather than alphabetically.
const STAGE_ORDER = ['Baseline', 'Retained', 'Enhanced', 'Created']

function flagsTable(complete) {
  const section = (f) =>
    Object.values(SECTIONS).find((s) => s.unitType === f.unitType)
  return sortable({
    head: [
      { text: 'Stage' },
      { text: 'Ref', classes: NOWRAP },
      { text: 'Unit type' },
      { text: 'Habitat type' },
      // Free text: sorting it isn't useful.
      { text: 'Flag', classes: MIN_WIDTH, sortable: false },
      { text: 'Supporting information', sortable: false }
    ],
    rows: groupedFlags(complete).map((f) => [
      { text: f.stage, attributes: sortValue(STAGE_ORDER.indexOf(f.stage)) },
      {
        ...refCell(flagHref(f), f.ref),
        classes: `govuk-!-font-weight-bold ${NOWRAP}`
      },
      { text: section(f) ? section(f).title : f.unitType },
      { text: f.habitatType },
      flagCell(f.details),
      // No supporting information is imported for flagged habitats yet, so
      // every cell uses the Figma "No data" variant (grey text).
      NO_DATA
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

// Advance / delay selects (Figma 3320 / 3330): whole years, 0 = none.
const MAX_ADVANCE_OR_DELAY_YEARS = 30

function yearItems(selected) {
  return Array.from({ length: MAX_ADVANCE_OR_DELAY_YEARS + 1 }, (_, n) => ({
    value: String(n),
    text: n === 0 ? 'None' : years(n),
    selected: n === (selected || 0)
  }))
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

// --- File errors (dropout pages) ---------------------------------------------

const METRIC_TOOL_HREF =
  'https://www.gov.uk/government/publications/statutory-biodiversity-metric-tools-and-guides'

/**
 * Dropout pages shown when an uploaded file can't be used (Figma 6000-6080),
 * in Figma order. Each is keyed by the service's error code. Errors with a
 * `category` can be fixed and re-uploaded; the rest are a single paragraph.
 * Shown as a standalone series for research: "Next" steps through them and
 * the upload flow itself always succeeds.
 */
const FILE_ERRORS = [
  {
    code: '34',
    category: 'Habitat parcels',
    // Figma uses "{Habitat ref} / {Tree ref}"; a ref from the data reads
    // more naturally in research.
    message:
      'AH-003-1 has both advance and delay years. Enter either advance or delay years, not both.'
  },
  {
    code: '39',
    html: `Your project contains habitats that have been enhanced to a level which is not yet included in this service. Use the <a class="govuk-link" href="${METRIC_TOOL_HREF}">metric tool (spreadsheet)</a> to calculate biodiversity value.`
  },
  {
    code: '5',
    category: 'Geopackage layers',
    message: 'A layer uses the wrong map projection.'
  },
  {
    code: '6',
    category: 'Geopackage layers',
    message:
      "A layer's shape column is missing, misnamed, duplicated or of the wrong type."
  },
  {
    code: '7',
    category: 'Template',
    message: 'A column is missing or set up differently from the template.'
  },
  {
    code: '13',
    category: 'Geometry',
    message:
      'Your hedgerows or watercourses cannot be read, or are not drawn as lines.'
  },
  { code: '15', html: "There was a problem with your file's metadata." },
  {
    code: '37',
    html: 'Your habitat data does not match the required structure. Check your file against the Natural England template.'
  },
  {
    code: '42',
    html: 'Your file contains a comment which uses invalid characters. Comments can only use UTF8 characters.'
  }
]

const fileErrorHref = (error) => `${BASE}/file-error/${error.code}`

// --- Side navigation ---------------------------------------------------------

/**
 * @param {string} current - "overview", "flags", "project-details" or a
 *   section id
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
        text: 'Flags',
        href: `${BASE}/flags`,
        current: current === 'flags'
      },
      sectionItem(SECTIONS['area-habitats']),
      sectionItem(SECTIONS.hedgerows),
      {
        text: 'Project details',
        href: `${BASE}/project-details`,
        current: current === 'project-details'
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
      description: `${incomplete} incomplete baseline habitat ${incomplete === 1 ? 'record' : 'records'}. (Entries may have been removed as part of the data validation process)`,
      link: {
        text: 'View baseline habitat list',
        href: sectionHref(area, 'baseline')
      }
    })
  }
  const flags = visibleFlags(complete).length
  if (flags) {
    actions.push({
      description: `${flags} ${flags === 1 ? 'flag' : 'flags'} to review`,
      link: { text: 'View flags', href: `${BASE}/flags` }
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
  // Replaces v2's Export page. No real workbook is generated this round, so
  // both links are placeholders.
  actions.push({
    description: 'Download spreadsheet',
    links: [
      { text: 'Macro enabled', href: '#' },
      { text: 'Macro disabled', href: '#' }
    ]
  })
  return {
    // Equal-width columns.
    head: [
      { text: 'Description', classes: 'govuk-!-width-one-half' },
      { text: 'Link', classes: 'govuk-!-width-one-half' }
    ],
    rows: actions.map((a) => [
      { text: a.description },
      {
        html: (a.links || [a.link])
          .map((l) => `<a class="govuk-link" href="${l.href}">${l.text}</a>`)
          .join(' / ')
      }
    ])
  }
}

/**
 * Register project dashboard v3 routes
 * @param {Router} router - Express router instance
 */
function registerProjectDashboardV3Routes(router) {
  // The v2/v3 service name (Figma header: "Calculate biodiversity net gain"),
  // without renaming the other journeys that share app/config.json.
  router.use(BASE, function (req, res, next) {
    res.locals.serviceName = 'Calculate biodiversity net gain'
    // The service name links back to the start of the round 6 prototype.
    res.locals.serviceNameHref = BASE
    // Lets facilitators open the dropout pages from anywhere in the journey.
    res.locals.footerLinks = [
      { href: fileErrorHref(FILE_ERRORS[0]), text: 'File errors' }
    ]
    next()
  })

  router.get(BASE, function (req, res) {
    res.render('project-dashboard-v3/start')
  })

  router.get(`${BASE}/sign-in`, function (req, res) {
    res.render('project-dashboard-v3/sign-in')
  })

  router.post(`${BASE}/sign-in`, function (req, res) {
    res.redirect(`${BASE}/project-name`)
  })

  router.get(`${BASE}/project-name`, function (req, res) {
    res.render('project-dashboard-v3/project-name')
  })

  router.post(`${BASE}/project-name`, function (req, res) {
    res.redirect(`${BASE}/upload/choose`)
  })

  router.get(`${BASE}/upload/choose`, function (req, res) {
    res.render('project-dashboard-v3/upload-choose', {
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
    res.render('project-dashboard-v3/upload')
  })

  router.post(`${BASE}/upload`, function (req, res) {
    res.redirect(`${BASE}/upload/checking`)
  })

  router.get(`${BASE}/upload/checking`, function (req, res) {
    res.render('project-dashboard-v3/upload-checking', {
      destination: `${BASE}/overview`
    })
  })

  router.get(`${BASE}/overview`, function (req, res) {
    const complete = isComplete(req)
    const areaResults = results(area, complete, 'overview')
    const hedgerowResults = results(SECTIONS.hedgerows, complete, 'overview')
    res.render('project-dashboard-v3/overview', {
      sideNav: sideNav('overview'),
      actionsTable: overviewActions(req, complete),
      areaResultsHeadline: areaResults.headline,
      areaResultsBreakdown: areaResults.breakdown,
      hedgerowResultsHeadline: hedgerowResults.headline,
      hedgerowResultsBreakdown: hedgerowResults.breakdown,
      projectTargets: projectTargets
    })
  })

  router.get(`${BASE}/flags`, function (req, res) {
    res.render('project-dashboard-v3/flags', {
      sideNav: sideNav('flags'),
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
        res.render(`project-dashboard-v3/${view}`, {
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
      render('baseline', 'baseline', (complete) => ({
        baselineTable: baselineTable(section, complete)
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
      res.render('project-dashboard-v3/baseline-habitat', {
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
        interventionTable: section.showsInterventionSplit
          ? interventionSplitTable(habitat, isComplete(req))
          : null,
        strategicSignificanceHint: BASELINE_STRATEGIC_SIGNIFICANCE_HINT,
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
    // `submitted` is the posted form when re-showing it with an error.
    function renderPostHabitat(req, res, habitat, submitted) {
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
      res.render('project-dashboard-v3/post-intervention-habitat', {
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
        flags: habitatFlags(section, habitat.ref, intervention),
        strategicSignificance: habitat.strategicSignificance
          ? strategicSignificance(
              habitat.strategicSignificance,
              habitat.strategicSignificanceMultiplier
            )
          : NO_DATA_TEXT,
        advanceYearsItems: yearItems(
          submitted ? submitted.advanceYears : habitat.advanceYears
        ),
        delayYearsItems: yearItems(
          submitted ? submitted.delayYears : habitat.delayYears
        ),
        errors: submitted ? submitted.errors : null,
        baselineHref: baseline
          ? `${baselineList}/${slug(baseline.ref)}`
          : baselineList,
        baselineCondition: habitat.baselineCondition
          ? condition(habitat.baselineCondition, habitat.baselineConditionScore)
          : 'Not recorded',
        strategicSignificanceHint: STRATEGIC_SIGNIFICANCE_HINT,
        broadHabitatItems: toItems(options.broadHabitats, habitat.broadHabitat),
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
    }

    const findPostHabitat = (req) =>
      postHabitats.find((h) => slug(h.ref) === req.params.ref)

    router.get(`${postList}/:ref`, function (req, res, next) {
      const habitat = findPostHabitat(req)
      if (!habitat) {
        return next() // unknown ref: fall through to the 404 handler
      }
      renderPostHabitat(req, res, habitat)
    })

    // Figma 3320 error state: a habitat can't be both created in advance
    // and delayed.
    router.post(`${postList}/:ref`, function (req, res, next) {
      const habitat = findPostHabitat(req)
      if (!habitat) {
        return next()
      }
      const advanceYears = Number(req.body.advanceYears) || 0
      const delayYears = Number(req.body.delayYears) || 0
      if (advanceYears > 0 && delayYears > 0) {
        return renderPostHabitat(req, res, habitat, {
          advanceYears: advanceYears,
          delayYears: delayYears,
          errors: [
            {
              text: 'A habitat cannot be created both in advance and with a delay',
              href: '#advanceYears'
            }
          ]
        })
      }
      res.redirect(returnTo(req, postList).href)
    })
  }

  // Dropout pages (Figma 6000-6080) as a standalone series.
  router.get(`${BASE}/file-error`, function (req, res) {
    res.redirect(fileErrorHref(FILE_ERRORS[0]))
  })

  router.get(`${BASE}/file-error/:code`, function (req, res, next) {
    const index = FILE_ERRORS.findIndex((e) => e.code === req.params.code)
    if (index === -1) {
      return next() // unknown code: fall through to the 404 handler
    }
    const previous = FILE_ERRORS[index - 1]
    const following = FILE_ERRORS[index + 1]
    res.render('project-dashboard-v3/file-error', {
      error: FILE_ERRORS[index],
      // The first page has no back link in Figma (6000); the last "Next"
      // returns to the research homepage.
      backHref: previous ? fileErrorHref(previous) : null,
      nextHref: following ? fileErrorHref(following) : '/',
      uploadHref: UPLOAD_HREF
    })
  })

  router.get(`${BASE}/project-details`, function (req, res) {
    res.render('project-dashboard-v3/project-details', {
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
}

module.exports = { registerProjectDashboardV3Routes }
