/**
 * Project dashboard v4 journey (User Research round 7)
 *
 * Round 7 is round 6 (project-dashboard-v3, copied here so round 6 stays as
 * tested) narrowed to the baseline flow, plus standalone trading rules pages
 * (Figma page 5522:86273):
 *   - The dashboard always shows the baseline-only state, whatever is
 *     chosen on "What would you like to upload?" (see isComplete).
 *   - Trading rules scenarios (Figma 6000-6041) are tested one by one, like
 *     the dropout pages, from the footer's "Trading rules" link.
 * The round 7 Figma screens for the rest of the journey are unchanged from
 * round 6.
 *
 * Round 6 notes follow.
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

// Cloned so the Round 6 adjustments below don't leak into the v2 journey,
// which shares the same cached require().
const metric = structuredClone(require('../data/project-dashboard-v2.json'))

// Round 6 moves the incomplete records from the baseline to the enhanced area
// habitats: the two baseline rows the workbook couldn't score are dropped (as
// if removed during data validation; neither has units, so totals are
// unchanged), and two enhanced rows lose their target condition and so
// their units. Those units then come off the workbook's post-intervention
// results and trading summary, so the cards agree with the table totals.
const DROPPED_BASELINE_REFS = ['AH-006', 'AH-011']
const INCOMPLETE_ENHANCED_REFS = ['AH-008', 'AH-017']
metric.area.baseline = metric.area.baseline.filter(
  (h) => !DROPPED_BASELINE_REFS.includes(h.ref)
)
metric.area.postIntervention.enhanced
  .filter((h) => INCOMPLETE_ENHANCED_REFS.includes(h.ref))
  .forEach((h) => {
    // A regenerated data file may not have this row as expected; leave it
    // complete rather than stop the server for every journey.
    if (!removePostInterventionUnits(metric.area, h)) {
      console.warn(
        `project-dashboard-v4: ${h.ref} not in the trading summary as expected; left complete`
      )
      return
    }
    Object.assign(h, {
      targetCondition: '',
      targetConditionScore: null,
      units: null
    })
  })

/**
 * Take one post-intervention row's units out of the workbook results and
 * the trading summary, recalculating the figures derived from them.
 * Medium and Low are the only bands the trading summary itemises.
 * Returns false, changing nothing, if the row has no units or no matching
 * trading summary item.
 */
function removePostInterventionUnits(sectionData, h) {
  const ts = sectionData.tradingSummary
  const band = h.distinctiveness && ts[h.distinctiveness.toLowerCase()]
  const item =
    band &&
    band.items &&
    band.items.find(
      (i) =>
        i.broadHabitat === h.broadHabitat && i.habitatType === h.habitatType
    )
  if (h.units == null || !item) {
    return false
  }

  const r = sectionData.results
  r.postInterventionUnits -= h.units
  r.netUnitChange = r.postInterventionUnits - r.baselineUnits
  r.netPercentChange = r.netUnitChange / r.baselineUnits
  r.unitDeficit = r.unitsRequired - r.postInterventionUnits

  item.change -= h.units
  band.total -= h.units
  band.cumulativeSurplus -= h.units

  // Medium: losses and gains are netted per broad habitat (same broad
  // habitat rule), and Low draws on what Medium has left over.
  const broadTotals = [
    ...new Set(ts.medium.items.map((i) => i.broadHabitat))
  ].map((broadHabitat) =>
    ts.medium.items
      .filter((i) => i.broadHabitat === broadHabitat)
      .reduce((total, i) => total + i.change, 0)
  )
  const losses = broadTotals.filter((t) => t < 0).reduce((a, b) => a + b, 0)
  ts.medium.broadHabitatLosses = losses
  ts.medium.unitDeficit = losses
  ts.medium.unitsAvailableToOffsetLower = broadTotals
    .filter((t) => t > 0)
    .reduce((a, b) => a + b, 0)
  ts.low.netChange = ts.low.total
  ts.low.unitsAvailableFromHigher = ts.medium.total
  return true
}

const BASE = '/project-dashboard-v4'
const UPLOAD_HREF = `${BASE}/upload/choose`

// Shared appDashboard settings. "app-dashboard--tight" is the Figma tile
// spacing (4950:34912, 4950:34922): 10px between the number or title and the
// link or tag that follows, with tags not pinned to the card foot.
// Round 7 adds "app-dashboard--compact", the tweaked card padding from
// Figma 5610:137771.
const DASHBOARD = {
  headingLevel: 3,
  classes: 'app-dashboard--tight app-dashboard--compact'
}

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
 * The "Results" cards. Missing post-intervention data prompts an upload,
 * on the overview and inside a section alike (round 7, Figma 3000 / 3200 /
 * 4000 / 4200); otherwise the cards link to that section's pages — except
 * the card for the page you are already on.
 * @param {object} section
 * @param {boolean} complete
 * @param {string} page - "overview", "summary", "baseline" or "post-intervention"
 */
function results(section, complete, page) {
  const r = section.data.results
  const baselineLink =
    page === 'baseline'
      ? undefined
      : {
          text: `View on-site ${section.noun} baseline`,
          href: sectionHref(section, 'baseline')
        }
  let postLink
  if (!complete) {
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
// Round 7 drops the Broad habitat column from the baseline table.
function habitatCells(h, conditionName, conditionScore) {
  return [
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
  ]
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

/**
 * The baseline table's columns, in order. Each has a `key` (for the column
 * filter), a `label`, its `head` cell, a `cell(h, i)` builder and an
 * optional `foot` (totals) cell, so any column but Ref can be left out.
 */
function baselineColumns(section, complete) {
  const rows = section.data.baseline
  const measure = section.measure
  const splits = rows.map((h) => interventionSplit(h, complete))
  const habitat = rows.map((h) =>
    habitatCells(h, h.condition, h.conditionScore)
  )
  const strong = (text) => ({
    html: `<strong>${text}</strong>`,
    format: 'numeric'
  })

  const columns = [
    {
      key: 'ref',
      label: 'Ref',
      head: { text: 'Ref' },
      cell: (h) =>
        refCell(
          section.hasDetailPages &&
            `${sectionHref(section, 'baseline')}/${slug(h.ref)}`,
          h.ref
        ),
      foot: { html: '<strong>Total</strong>' }
    },
    {
      key: 'status',
      label: 'Status',
      head: { text: 'Status' },
      cell: (h) => statusCell(isIncomplete(h))
    },
    {
      key: 'units',
      label: 'Units',
      head: { text: 'Units', format: 'numeric' },
      cell: (h) => unitsCell(h),
      foot: strong(fixed(sum(rows, 'units')))
    },
    {
      key: 'measure',
      label: measure.label,
      head: { text: measure.label, format: 'numeric' },
      cell: (h) => measureCell(section, h),
      foot: strong(measure.format(sum(rows, measure.key)))
    },
    // Round 7: no Broad habitat or Trading rules columns.
    ...[
      ['habitat-type', 'Habitat type', WRAP_HABITAT_TYPE],
      ['distinctiveness', 'Distinctiveness'],
      ['condition', 'Condition'],
      ['strategic-significance', 'Strategic significance']
    ].map(([key, label, classes], n) => ({
      key,
      label,
      head: { text: label, classes },
      cell: (h, i) => habitat[i][n]
    }))
  ]

  if (section.showsInterventionSplit) {
    const total = (key, field) =>
      splits.reduce((acc, sp) => acc + sp[key][field], 0)
    // Without a post-intervention file the split can't be calculated, so
    // its cells show "No data" and have no total (always so in round 7).
    const noData = { ...NO_DATA, format: 'numeric' }
    for (const [key, areaLabel, unitsLabel] of SPLIT_COLUMNS) {
      columns.push(
        {
          key: `${key}-area`,
          label: areaLabel,
          head: { text: areaLabel, format: 'numeric' },
          cell: (h, i) =>
            complete
              ? {
                  text: hectares(splits[i][key].area),
                  format: 'numeric',
                  attributes: sortValue(splits[i][key].area)
                }
              : noData,
          foot: complete ? strong(hectares(total(key, 'area'))) : undefined
        },
        {
          key: `${key}-units`,
          label: unitsLabel,
          head: { text: unitsLabel, format: 'numeric' },
          cell: (h, i) =>
            complete
              ? {
                  text: fixed(splits[i][key].units),
                  format: 'numeric',
                  attributes: sortValue(splits[i][key].units)
                }
              : noData,
          foot: complete ? strong(fixed(total(key, 'units'))) : undefined
        }
      )
    }
  }
  return columns
}

/**
 * @param {object} section
 * @param {boolean} complete
 * @param {string[]} [hidden] - keys of columns to leave out (column filter)
 */
function baselineTable(section, complete, hidden = []) {
  const rows = section.data.baseline
  const columns = baselineColumns(section, complete).filter(
    (c) => !hidden.includes(c.key)
  )
  return sortable({
    head: columns.map((c) => c.head),
    rows: rows.map((h, i) => columns.map((c) => c.cell(h, i))),
    foot: [columns.map((c) => c.foot || {})]
  })
}

// --- Baseline column filter (round 7) ------------------------------------------

/*
 * MOJ filter component (design-patterns.service.justice.gov.uk/components/
 * filter) used to show and hide the baseline table's columns. Ref always
 * shows, as it links to each habitat. The hidden columns are kept in the
 * session per section; the form is a GET to the baseline page itself.
 */

// The baseline table section's id, so the filter returns users to it.
const BASELINE_TABLE_ID = 'habitat-details'

function hiddenBaselineColumns(req, section) {
  const stored = req.session.data.baselineHiddenColumns || {}
  return stored[section.id] || []
}

function setHiddenBaselineColumns(req, section, hidden) {
  req.session.data.baselineHiddenColumns = {
    ...(req.session.data.baselineHiddenColumns || {}),
    [section.id]: hidden
  }
}

// View model for the filter: checkboxes for each column but Ref, and the
// hidden columns as removable tags under "Selected filters".
function baselineFilter(section, complete, hidden) {
  const href = sectionHref(section, 'baseline')
  const optional = baselineColumns(section, complete).filter(
    (c) => c.key !== 'ref'
  )
  const hiddenColumns = optional.filter((c) => hidden.includes(c.key))
  return {
    action: href,
    items: optional.map((c) => ({
      value: c.key,
      text: c.label,
      checked: !hidden.includes(c.key)
    })),
    selectedFilters: hiddenColumns.length
      ? {
          heading: { text: 'Selected filters' },
          clearLink: {
            text: 'Clear filters',
            href: `${href}?showColumn=all`
          },
          categories: [
            {
              heading: { text: 'Hidden columns' },
              items: hiddenColumns.map((c) => ({
                text: c.label,
                href: `${href}?showColumn=${c.key}`
              }))
            }
          ]
        }
      : null
  }
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
      // As in the baseline table: no post-intervention file, no split.
      complete
        ? { text: `${fixed(split[key].units)} (${hectares(split[key].area)})` }
        : NO_DATA
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
    // The view shows the caption as a heading above the scrollable pane, so it
    // doesn't scroll sideways with the table; the caption still names the
    // table for screen readers.
    captionClasses: 'govuk-visually-hidden',
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
  // A value saved in another journey (the session is shared) may not be one
  // of these options. Keep it as an option so the select still shows it and
  // saving the form doesn't clear it.
  if (selected && !values.includes(selected)) {
    values = [...values, selected]
  }
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

// --- Trading rules scenarios (round 7) ---------------------------------------

/*
 * Trading rules pages (Figma 6000-6041, page 5522:86273), tested one by one
 * like the dropout pages: each has its own figures from the Figma rather
 * than the project data. "Next" steps through them; the 6xx1 frames are the
 * same pages with their boxes open.
 *
 * Each band lists its boxes in order:
 *   deficit / surplus - grey header that opens to show `tables`
 *   result            - white box with a heavy border (after trading)
 * A deficit in a band that isn't met gets a red bar, as do its broad
 * habitat totals.
 */

const MEDIUM_RULE_PRIVATE_BETA =
  'Losses must be replaced by area habitat units of other medium band habitats within the same broad habitat type.'
const LOW_RULE_AREA =
  'Losses must be replaced with area habitat units of the same or higher distinctiveness band.'
const HEDGEROW_RULE =
  'Losses must be replaced with hedgerow units of the same or a higher band.'

// One table per broad habitat: [habitat type, unit change] rows.
const broadHabitat = (name, rows, total, totalLabel) => ({
  type: 'broad-habitat',
  name,
  rows,
  total,
  totalLabel: totalLabel || 'Total broad habitat change'
})
// One table with a broad habitat column: [broad habitat, type, change] rows.
const habitatList = (rows, total, totalLabel) => ({
  type: 'list',
  rows,
  total,
  totalLabel: totalLabel || 'Total unit change'
})
// Habitat type only (hedgerows, watercourses); total row optional.
const habitatTypes = (rows, total) => ({
  type: 'types',
  rows,
  total,
  totalLabel: 'Total unit change'
})

const TRADING_SCENARIOS = [
  {
    code: '6000',
    section: 'area-habitats',
    title: 'Area habitats trading summary',
    bands: [
      {
        heading: 'Medium distinctiveness',
        met: false,
        rule: MEDIUM_RULE_PRIVATE_BETA,
        boxes: [
          {
            kind: 'deficit',
            title: 'Medium distinctiveness deficit',
            value: -6.74,
            tables: [
              broadHabitat(
                'Grassland',
                [['Other neutral grassland', -2.32]],
                -2.32,
                'Total grassland change'
              ),
              // Figma shows −2.32 here; the rows add up to −3.85, which is
              // also what the −6.74 deficit needs.
              broadHabitat(
                'Heathland and shrub',
                [
                  ['Bramble scrub', -0.71],
                  ['Hawthorn scrub', -2.69],
                  ['Mixed scrub', -0.45]
                ],
                -3.85,
                'Total heathland and shrub change'
              ),
              broadHabitat(
                'Lakes',
                [['Ponds (non-priority habitat)', -0.57]],
                -0.57,
                'Total lakes change'
              )
            ]
          },
          { kind: 'result', title: 'Deficit after trading', value: -6.74 },
          {
            kind: 'surplus',
            title: 'Medium distinctiveness surplus',
            value: 1.8,
            tables: [
              broadHabitat(
                'Woodland and forest',
                [['Other woodland; broadleaved', 1.8]],
                1.8,
                'Total woodland and forest change'
              )
            ]
          },
          {
            kind: 'result',
            title: 'Surplus after trading',
            hint: 'Units available to trade down',
            value: 1.8
          }
        ]
      },
      {
        heading: 'Low distinctiveness',
        met: true,
        rule: LOW_RULE_AREA,
        boxes: [
          {
            kind: 'deficit',
            title: 'Low distinctiveness deficit',
            value: -1.52,
            tables: [
              habitatList(
                [
                  ['Grassland', 'Modified grassland', -5.39],
                  ['Sparsely vegetated land', 'Tall forbs', 0.07],
                  ['Urban', 'Introduced shrub', 0.21],
                  ['Urban', 'Rain garden', 0.6],
                  ['Urban', 'Vegetated garden', 2.99]
                ],
                -1.52
              )
            ]
          },
          { kind: 'result', title: 'Surplus after trading', value: 0.28 }
        ]
      }
    ]
  },
  {
    code: '6010',
    section: 'area-habitats',
    title: 'Area habitats trading summary',
    bands: [
      {
        heading: 'Medium distinctiveness',
        met: true,
        rule: MEDIUM_RULE_PRIVATE_BETA,
        boxes: [
          {
            kind: 'surplus',
            title: 'Medium distinctiveness surplus',
            value: 0.53,
            tables: [
              broadHabitat(
                'Heathland and shrub',
                [
                  ['Bramble scrub', -0.64],
                  ['Mixed scrub', 0.67]
                ],
                0.03
              ),
              broadHabitat('Individual trees', [['Urban tree', 0.5]], 0.5)
            ]
          },
          {
            kind: 'result',
            title: 'Units available to trade down',
            value: 0.53
          }
        ]
      },
      {
        heading: 'Low distinctiveness',
        met: true,
        rule: LOW_RULE_AREA,
        boxes: [
          {
            kind: 'deficit',
            title: 'Low distinctiveness deficit',
            value: -0.05,
            tables: [
              habitatList(
                [
                  ['Grassland', 'Modified grassland', -0.42],
                  ['Urban', 'Other green roof', 0.15],
                  ['Urban', 'Introduced shrub', 0.15],
                  ['Urban', 'Sustainable drainage system', 0.01],
                  ['Urban', 'Vegetated garden', 0.05]
                ],
                -0.05,
                'Total on-site unit change'
              )
            ]
          },
          { kind: 'result', title: 'Surplus after trading', value: 0.48 }
        ]
      }
    ]
  },
  {
    code: '6020',
    section: 'hedgerows',
    title: 'Hedgerows trading rules',
    bands: [
      {
        heading: 'Medium distinctiveness',
        met: true,
        rule: HEDGEROW_RULE,
        boxes: [
          {
            kind: 'surplus',
            title: 'Medium distinctiveness surplus',
            value: 0.41,
            tables: [
              habitatTypes(
                [
                  ['Species rich native hedgerow', -1.68],
                  ['Native hedgerow - associate with bank or ditch', 1.29],
                  ['Native hedgerow with trees', 0.8]
                ],
                0.41
              )
            ]
          },
          { kind: 'result', title: 'Available for trading', value: 0.41 }
        ]
      },
      {
        heading: 'Low distinctiveness',
        met: false,
        rule: HEDGEROW_RULE,
        boxes: [
          {
            kind: 'deficit',
            title: 'Low distinctiveness deficit',
            value: -2.55,
            tables: [
              habitatTypes(
                [
                  ['Native hedgerow', -1.98],
                  ['Line of trees', 0.16],
                  ['Line of trees - associate with bank or ditch', -0.73]
                ],
                -2.55
              )
            ]
          },
          { kind: 'result', title: 'Deficit after trading', value: -2.14 }
        ]
      },
      {
        heading: 'Very low distinctiveness',
        met: false,
        rule: HEDGEROW_RULE,
        boxes: [
          {
            kind: 'deficit',
            title: 'Very low distinctiveness deficit',
            value: -0.35,
            tables: [
              habitatTypes(
                [['Non-native and ornamental hedgerow', -0.35]],
                -0.35
              )
            ]
          },
          { kind: 'result', title: 'Deficit after trading', value: -0.35 }
        ]
      }
    ]
  },
  {
    code: '6030',
    section: 'watercourses',
    title: 'Watercourses trading rules',
    bands: [
      {
        heading: 'Medium distinctiveness',
        met: false,
        rule: 'Losses must be replaced with watercourse units of the same habitat type.',
        boxes: [
          {
            kind: 'deficit',
            title: 'Medium distinctiveness deficit',
            value: -6.18,
            tables: [habitatTypes([['Canals', -6.18]])]
          },
          {
            kind: 'surplus',
            title: 'Medium distinctiveness surplus',
            value: 12.92,
            tables: [habitatTypes([['Ditches', 12.92]])]
          },
          {
            kind: 'result',
            title: 'Units available to trade down',
            value: 12.92
          }
        ]
      },
      {
        heading: 'Low distinctiveness',
        met: false,
        rule: 'Losses must be replaced with watercourse units of a higher band.',
        boxes: [
          {
            kind: 'deficit',
            title: 'Low distinctiveness deficit',
            value: -21.49,
            tables: [habitatTypes([['Culvert', -21.49]])]
          },
          // Figma shows "Surplus after trading 12.92 units", which doesn't
          // fit "Not met": 12.92 units available against a 21.49 deficit
          // leaves 8.57 short.
          { kind: 'result', title: 'Deficit after trading', value: -8.57 }
        ]
      }
    ]
  },
  {
    code: '6040',
    section: 'area-habitats',
    title: 'Area habitats trading summary',
    bands: [
      {
        heading: 'Very high distinctiveness',
        met: true,
        rule: 'Priority should be given to replacing losses with area habitat units of the same habitat type.',
        boxes: [
          {
            kind: 'surplus',
            title: 'Very high distinctiveness surplus',
            value: 0.19,
            tables: [
              broadHabitat(
                'Heathland and shrub',
                [['Mountain heaths and willow scrub', 0.19]],
                0.19
              )
            ]
          },
          {
            kind: 'result',
            title: 'Units available to trade down',
            value: 0.19
          }
        ]
      },
      {
        heading: 'High distinctiveness',
        met: true,
        rule: 'Losses must be replaced with area habitat units of the same habitat type.',
        boxes: [
          {
            kind: 'surplus',
            title: 'High distinctiveness surplus',
            value: 11.18,
            tables: [
              broadHabitat('Grassland', [['Traditional orchards', 4.83]], 4.83),
              broadHabitat('Lakes', [['Marl lakes', 6.35]], 6.35)
            ]
          },
          {
            kind: 'result',
            title: 'Units available to trade down',
            value: 11.37
          }
        ]
      },
      {
        heading: 'Medium distinctiveness',
        met: true,
        // This scenario includes the higher bands, so it keeps the full rule.
        rule: 'Losses must be replaced by area habitat units of other medium band habitats within the same broad habitat type or, any habitat from a higher band from any broad habitat type.',
        boxes: [
          {
            kind: 'deficit',
            title: 'Medium distinctiveness deficit',
            value: -4,
            tables: [
              broadHabitat(
                'Sparsely vegetated land',
                [['Other inland rock and scree', -4]],
                -4
              )
            ]
          },
          { kind: 'result', title: 'Deficit after trading', value: 0 },
          {
            kind: 'surplus',
            title: 'Medium distinctiveness surplus',
            value: 9.28,
            tables: [
              broadHabitat(
                'Grassland',
                [['Other neutral grassland', 9.28]],
                9.28
              )
            ]
          },
          {
            kind: 'result',
            title: 'Surplus after trading',
            hint: 'Units available to trade down',
            value: 16.65
          }
        ]
      },
      {
        heading: 'Low distinctiveness',
        met: true,
        rule: LOW_RULE_AREA,
        boxes: [
          {
            kind: 'deficit',
            title: 'Low distinctiveness deficit',
            value: -2,
            tables: [habitatList([['Grassland', 'Modified grassland', -2]], -2)]
          },
          { kind: 'result', title: 'Surplus after trading', value: 14.65 }
        ]
      }
    ]
  }
]

const tradingScenarioHref = (scenario) =>
  `${BASE}/trading-rules/${scenario.code}`

const numberCell = (value) => ({ text: fixed(value), format: 'numeric' })
const boldCell = (text, classes) => ({
  html: `<strong>${text}</strong>`,
  classes
})

// govukTable params for one scenario table. `lossBars` marks negative
// broad habitat totals with a red bar (a band that isn't met).
function scenarioTable(table, lossBars) {
  let head
  let rows
  if (table.type === 'broad-habitat') {
    head = [{ text: `${table.name} habitat types` }, UNIT_CHANGE_HEAD]
    rows = table.rows.map(([type, change]) => [
      { text: type },
      numberCell(change)
    ])
  } else if (table.type === 'list') {
    head = [
      { text: 'Broad habitat' },
      { text: 'Habitat type' },
      UNIT_CHANGE_HEAD
    ]
    rows = table.rows.map(([broad, type, change]) => [
      { text: broad },
      { text: type },
      numberCell(change)
    ])
  } else {
    head = [{ text: 'Habitat type' }, UNIT_CHANGE_HEAD]
    rows = table.rows.map(([type, change]) => [
      { text: type },
      numberCell(change)
    ])
  }
  if (table.total != null) {
    const loss = lossBars && table.type === 'broad-habitat' && table.total < 0
    rows.push(
      [boldCell(table.totalLabel, loss ? 'app-unit-box__loss' : undefined)]
        .concat(Array.from({ length: head.length - 2 }, () => ({})))
        .concat([{ ...boldCell(fixed(table.total)), format: 'numeric' }])
    )
  }
  return { head, rows }
}

// View model for a scenario page: values formatted, tables built.
function tradingScenarioView(scenario) {
  return {
    ...scenario,
    bands: scenario.bands.map((band) => ({
      heading: band.heading,
      tag: metTag(band.met),
      rule: band.rule,
      boxes: band.boxes.map((box) => ({
        kind: box.kind,
        title: box.title,
        hint: box.hint,
        value: units(box.value),
        alert: box.kind === 'deficit' && !band.met,
        tables: (box.tables || []).map((t) => scenarioTable(t, !band.met))
      }))
    }))
  }
}

// Side nav for a scenario: its section is the current item (the side menu
// has no trading rules link). Watercourses isn't a section in this journey,
// so it gets an item of its own.
function scenarioSideNav(scenario) {
  if (scenario.section !== 'watercourses') {
    // The section is highlighted, but this page isn't its summary: tell
    // screen readers it's the current section ("location"), not the page.
    const nav = sideNav(scenario.section)
    for (const item of nav.items) {
      if (item.current) {
        item.ariaCurrent = 'location'
      }
    }
    return nav
  }
  const nav = sideNav('watercourses')
  nav.items.splice(nav.items.length - 1, 0, {
    text: 'Watercourses',
    href: tradingScenarioHref(scenario),
    current: true
  })
  return nav
}

// --- Side navigation ---------------------------------------------------------

/**
 * @param {string} current - "overview", "flags", "project-details" or a
 *   section id
 * @param {string} [sub] - "baseline"
 *
 * Round 7 (Figma 3200) lists only Baseline under each section: the trading
 * summary and post-intervention pages aren't part of the baseline flow.
 */
function sideNav(current, sub) {
  const sectionItem = (section) => ({
    text: section.title,
    href: sectionHref(section, 'summary'),
    current: current === section.id && !sub,
    items:
      current === section.id
        ? [
            {
              text: 'Baseline',
              href: sectionHref(section, 'baseline'),
              current: sub === 'baseline'
            }
          ]
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

// Round 7 tests the baseline flow only: post-intervention results are never
// shown, even if "Complete project" is chosen at upload.
function isComplete() {
  return false
}

// Overview "Actions" (Figma 1000): outstanding work derived from the data.
function overviewActions(req, complete) {
  const actions = []
  // Enhanced records only exist once the post-intervention file is uploaded.
  const incomplete = complete
    ? area.data.postIntervention.enhanced.filter((h) =>
        isPostInterventionIncomplete(h, true)
      ).length
    : 0
  if (incomplete) {
    actions.push({
      description: `${incomplete} incomplete enhanced area habitat ${incomplete === 1 ? 'record' : 'records'}. (Entries may have been removed as part of the data validation process)`,
      link: {
        text: 'View enhanced area habitats list',
        // The tabs component opens the tab named in the URL fragment.
        href: `${sectionHref(area, 'post-intervention')}#enhanced`
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
 * Register project dashboard v4 routes
 * @param {Router} router - Express router instance
 */
function registerProjectDashboardV4Routes(router) {
  // The v2/v3 service name (Figma header: "Calculate biodiversity net gain"),
  // without renaming the other journeys that share app/config.json.
  router.use(BASE, function (req, res, next) {
    res.locals.serviceName = 'Calculate biodiversity net gain'
    // The service name links back to the start of the round 7 prototype.
    res.locals.serviceNameHref = BASE
    // Lets facilitators open the trading rules pages from anywhere.
    // (Round 6's file error pages were tested in round 6, so they aren't
    // carried over.)
    res.locals.footerLinks = [
      {
        href: `${BASE}/trading-rules`,
        text: 'Trading rules'
      }
    ]
    next()
  })

  router.get(BASE, function (req, res) {
    res.render('project-dashboard-v4/start')
  })

  router.get(`${BASE}/sign-in`, function (req, res) {
    res.render('project-dashboard-v4/sign-in')
  })

  router.post(`${BASE}/sign-in`, function (req, res) {
    res.redirect(`${BASE}/project-name`)
  })

  router.get(`${BASE}/project-name`, function (req, res) {
    res.render('project-dashboard-v4/project-name')
  })

  router.post(`${BASE}/project-name`, function (req, res) {
    res.redirect(`${BASE}/upload/choose`)
  })

  router.get(`${BASE}/upload/choose`, function (req, res) {
    res.render('project-dashboard-v4/upload-choose', {
      // ?error=1 from the POST below; the message itself stays here so a
      // link can't put its own text in the error summary.
      error: req.query.error ? 'Select what you would like to upload' : null
    })
  })

  router.post(`${BASE}/upload/choose`, function (req, res) {
    if (!req.body.uploadChoice) {
      return res.redirect(`${BASE}/upload/choose?error=1`)
    }
    res.redirect(`${BASE}/upload`)
  })

  router.get(`${BASE}/upload`, function (req, res) {
    res.render('project-dashboard-v4/upload')
  })

  router.post(`${BASE}/upload`, function (req, res) {
    res.redirect(`${BASE}/upload/checking`)
  })

  router.get(`${BASE}/upload/checking`, function (req, res) {
    res.render('project-dashboard-v4/upload-checking', {
      destination: `${BASE}/overview`
    })
  })

  router.get(`${BASE}/overview`, function (req, res) {
    const complete = isComplete(req)
    const areaResults = results(area, complete, 'overview')
    const hedgerowResults = results(SECTIONS.hedgerows, complete, 'overview')
    res.render('project-dashboard-v4/overview', {
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
    res.render('project-dashboard-v4/flags', {
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
        res.render(`project-dashboard-v4/${view}`, {
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
      // Column filter: "Apply filters" and the tags come back here with a
      // query, which is saved and then dropped with a redirect.
      function (req, res, next) {
        const href = sectionHref(section, 'baseline')
        const optional = baselineColumns(section, isComplete(req))
          .map((c) => c.key)
          .filter((key) => key !== 'ref')
        if (req.query.columnsApplied) {
          const shown = [].concat(req.query.baselineColumns || [])
          setHiddenBaselineColumns(
            req,
            section,
            optional.filter((key) => !shown.includes(key))
          )
          // Keep the filter open to show what was applied.
          req.session.baselineFilterOpen = true
          // Land back on the table, not the top of the page.
          return res.redirect(`${href}#${BASELINE_TABLE_ID}`)
        }
        if (req.query.showColumn) {
          setHiddenBaselineColumns(
            req,
            section,
            req.query.showColumn === 'all'
              ? []
              : hiddenBaselineColumns(req, section).filter(
                  (key) => key !== req.query.showColumn
                )
          )
          req.session.baselineFilterOpen = true
          // Land back on the table, not the top of the page.
          return res.redirect(`${href}#${BASELINE_TABLE_ID}`)
        }
        next()
      },
      function (req, res, next) {
        const hidden = hiddenBaselineColumns(req, section)
        const filterOpen = Boolean(req.session.baselineFilterOpen)
        delete req.session.baselineFilterOpen
        render('baseline', 'baseline', (complete) => ({
          baselineTable: baselineTable(section, complete, hidden),
          baselineFilter: {
            ...baselineFilter(section, complete, hidden),
            open: filterOpen
          }
        }))(req, res, next)
      }
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
      res.render('project-dashboard-v4/baseline-habitat', {
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
    // `submitted` is the posted form (req.body) when re-showing it with an
    // error, so the user's answers are kept rather than reset to the file's.
    function renderPostHabitat(req, res, habitat, submitted, errors) {
      const previewing = INTERVENTIONS.includes(req.query.intervention)
      const intervention = previewing
        ? req.query.intervention
        : habitat.intervention
      const answer = (field, stored) =>
        submitted && field in submitted ? submitted[field] : stored
      // No band: no answer (as condition() does), not "undefined (undefined)".
      const storedStrategicSignificance = habitat.strategicSignificance
        ? strategicSignificance(
            habitat.strategicSignificance,
            habitat.strategicSignificanceMultiplier
          )
        : ''
      const baseline = section.data.baseline.find(
        (h) => h.ref === habitat.baselineRef
      )
      const targetCondition = answer(
        'targetCondition',
        condition(habitat.targetCondition, habitat.targetConditionScore)
      )
      const back = returnTo(req, `${postList}#${intervention.toLowerCase()}`)
      // Keep ?from= and a previewed ?intervention= across the POST.
      const query = new URLSearchParams(back.query)
      if (previewing) {
        query.set('intervention', intervention)
      }
      res.render('project-dashboard-v4/post-intervention-habitat', {
        section: section,
        habitat: habitat,
        returnHref: back.href,
        formAction: `${postList}/${slug(habitat.ref)}${query.size ? `?${query}` : ''}`,
        intervention: intervention,
        habitatReference: answer('habitatReference', habitat.ref),
        supportingInformation: answer(
          'supportingInformation',
          habitat.comments
        ),
        measureValue: fixed(habitat[section.measure.key], 4),
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
          Number(answer('advanceYears', habitat.advanceYears)) || 0
        ),
        delayYearsItems: yearItems(
          Number(answer('delayYears', habitat.delayYears)) || 0
        ),
        errors: errors || null,
        baselineHref: baseline
          ? `${baselineList}/${slug(baseline.ref)}`
          : baselineList,
        baselineCondition: habitat.baselineCondition
          ? condition(habitat.baselineCondition, habitat.baselineConditionScore)
          : 'Not recorded',
        strategicSignificanceHint: STRATEGIC_SIGNIFICANCE_HINT,
        broadHabitatItems: toItems(
          options.broadHabitats,
          answer('broadHabitat', habitat.broadHabitat)
        ),
        habitatTypeItems: toItems(
          options.habitatTypes,
          answer('habitatType', habitat.habitatType)
        ),
        strategicSignificanceItems: toItems(
          STRATEGIC_SIGNIFICANCE,
          answer('strategicSignificance', storedStrategicSignificance)
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
        return renderPostHabitat(req, res, habitat, req.body, [
          {
            text: 'A habitat cannot be created both in advance and with a delay',
            href: '#advanceYears'
          }
        ])
      }
      res.redirect(returnTo(req, postList).href)
    })
  }

  // Trading rules scenarios (Figma 6000-6041) as a standalone series.
  // Index of the scenarios (Figma 5674:165980), so the researcher can pick
  // one rather than stepping through them in order.
  router.get(`${BASE}/trading-rules`, function (req, res) {
    res.render('project-dashboard-v4/trading-rules', {
      scenarios: TRADING_SCENARIOS.map((scenario, i) => ({
        text: `Scenario ${i + 1}`,
        href: tradingScenarioHref(scenario)
      }))
    })
  })

  router.get(`${BASE}/trading-rules/:code`, function (req, res, next) {
    const index = TRADING_SCENARIOS.findIndex((s) => s.code === req.params.code)
    if (index === -1) {
      return next() // unknown code: fall through to the 404 handler
    }
    const scenario = TRADING_SCENARIOS[index]
    res.render('project-dashboard-v4/trading-scenario', {
      scenario: tradingScenarioView(scenario),
      sideNav: scenarioSideNav(scenario),
      backHref: `${BASE}/trading-rules`
    })
  })

  router.get(`${BASE}/project-details`, function (req, res) {
    res.render('project-dashboard-v4/project-details', {
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

module.exports = { registerProjectDashboardV4Routes }
