/**
 * Project dashboard journey (User Research)
 *
 * A standalone, self-contained mock journey reconstructed from the Figma
 * prototype page "Private Beta - Exploration". It walks:
 *   start -> sign in -> project details -> choose file -> upload -> summary
 *   -> area habitats -> flags / trading rules / baseline / post-intervention
 *   -> habitat detail
 *
 * This is a User Research prototype: there is no real GeoPackage parsing or
 * live metric calculation. All dashboards, tables and form values are
 * populated from the static config objects below, passed straight into the
 * reusable appDashboard / appSideNav Nunjucks macros
 * (app/views/dashboard/macro.njk) and stock govuk-frontend components.
 *
 * The Figma design shows the Area habitats dashboard in two states: before
 * and after a post-intervention GeoPackage has been uploaded (different
 * percentages, an extra "Flags" / "Post-intervention" side-nav item, an
 * extra "flags for review" action card). That state is tracked in
 * req.session.data.postInterventionUploaded and flips when the upload
 * wizard's post-intervention branch completes.
 */

const TAG_NOT_MET = { text: 'Not met', classes: 'govuk-tag--red' }
const TAG_MET = { text: 'Met', classes: 'govuk-tag--green' }

// The "Area habitats results" card grid (Figma component ".123 Results") is
// built as two separate rows — 2 taller cards with a status tag, then 3
// shorter cards without one — not a single 5-card row. Rendered as two
// stacked appDashboard() calls so the split holds at every viewport width
// instead of relying on flex-wrap to land on 2-then-3 by chance.
function areaHabitatsHeadlineCards(filled) {
  return [
    {
      valueFirst: true,
      value: filled ? '7.72%' : '-100.00%',
      caption: { text: 'Total on-site net percentage change' },
      tag: TAG_NOT_MET
    },
    {
      valueFirst: true,
      value: 'Trading rules',
      caption: {
        text: 'View trading rules',
        href: '/project-dashboard/area-habitats/trading-rules'
      },
      tag: TAG_NOT_MET
    }
  ]
}

function areaHabitatsBreakdownCards(filled) {
  return [
    {
      valueFirst: true,
      value: '1.52 units',
      caption: {
        text: 'View on-site baseline',
        href: '/project-dashboard/area-habitats/baseline'
      }
    },
    filled
      ? {
          valueFirst: true,
          value: '1.64 units',
          caption: {
            text: 'View on-site post intervention',
            href: '/project-dashboard/area-habitats/post-intervention'
          }
        }
      : {
          valueFirst: true,
          value: '0.00 units',
          caption: {
            text: 'Upload post intervention file',
            href: '/project-dashboard/upload/post-intervention'
          }
        },
    {
      valueFirst: true,
      value: filled ? '0.12 units' : '-1.52 units',
      caption: { text: 'Total on-site net unit change' }
    }
  ]
}

// "Area habitats size" cards. Baseline always shows 2 (total baseline area,
// site area) — the Post-intervention screen is the only one with a 3rd
// "Total post intervention habitat area" card in the middle; that page is
// only ever reached once filled, so this set doesn't vary by state.
const AREA_HABITATS_SIZE_SITE = {
  valueFirst: true,
  value: '0.69ha',
  caption: {
    text: 'Site Area (excluding area of individual trees, green walls, intertidal hard structures)'
  }
}

const baselineSizeCards = [
  {
    valueFirst: true,
    value: '0.69ha',
    caption: { text: 'Total baseline habitat area' }
  },
  AREA_HABITATS_SIZE_SITE
]

const postInterventionSizeCards = [
  {
    valueFirst: true,
    value: '0.69ha',
    caption: { text: 'Total baseline habitat area' }
  },
  {
    valueFirst: true,
    value: '0.78ha',
    caption: { text: 'Total post intervention habitat area' }
  },
  AREA_HABITATS_SIZE_SITE
]

function targetsCards(filled) {
  return [
    {
      valueFirst: true,
      value: '10%',
      caption: { text: 'View or update target percentage', href: '#' }
    },
    {
      valueFirst: true,
      value: '1.67 units',
      caption: { text: 'Units required' }
    },
    {
      valueFirst: true,
      value: filled ? '0.03 units' : '1.67 units',
      caption: { text: 'Unit deficit' }
    }
  ]
}

function actionsCards(filled) {
  const cards = []
  if (filled) {
    cards.push({
      heading: { text: 'You have 5 flags for review' },
      link: {
        text: 'View flags',
        href: '/project-dashboard/area-habitats/flags'
      }
    })
  }
  cards.push({
    heading: { text: 'You need to make updates to meet trading rules' },
    link: {
      text: 'View unmet trading rules',
      href: '/project-dashboard/area-habitats/trading-rules'
    }
  })
  return cards
}

const flagsPostInterventionTable = {
  head: [
    { text: 'Reference' },
    { text: 'Habitat type' },
    { text: 'Detail' },
    { text: 'Note' }
  ],
  rows: [
    ['P–A2', 'Other neutral grassland'],
    ['P–A3', 'Mixed scrub'],
    ['P–A4', 'Urban tree'],
    ['P–A5', 'Modified grassland'],
    ['P–A6', 'Other woodland; broadleaved']
  ].map(([ref, habitatType]) => [
    {
      html: `<a class="govuk-link" href="/project-dashboard/area-habitats/post-intervention/habitat/${ref.replace('–', '-').toLowerCase()}">${ref}</a>`
    },
    { text: habitatType },
    { text: 'Delay in starting habitat creation' },
    {
      text: 'Justification/evidence is required for the delay period (phasing plans/agreements) so the delay length can be verified.'
    }
  ])
}

// "Baseline" — Area habitat details table on the Baseline screen (1500/1501).
// Baseline habitat units and detail don't change once a post-intervention
// file is uploaded, so this table is the same in both dashboard states.
const areaHabitatDetailsTable = {
  head: [
    { text: 'Ref' },
    { text: 'Units', format: 'numeric' },
    { text: 'Size', format: 'numeric' },
    { text: 'Broad habitat' },
    { text: 'Habitat type' },
    { text: 'Distinctiveness' },
    { text: 'Condition' },
    { text: 'Strategic significance' },
    { text: 'Trading rules' }
  ],
  rows: [
    [
      {
        html: '<a class="govuk-link" href="/project-dashboard/area-habitats/habitat/b-a1">B–A1</a>'
      },
      { text: '1.33', format: 'numeric' },
      { text: '0.6629ha', format: 'numeric' },
      { text: 'Cropland' },
      { text: 'Cereal crops' },
      { text: 'Low (2)' },
      { text: 'Condition assessment N/A (1)' },
      { text: 'Low (1)' },
      { text: 'Same distinctiveness or better habitat required' }
    ],
    [
      {
        html: '<a class="govuk-link" href="/project-dashboard/area-habitats/habitat/b-a2">B–A2</a>'
      },
      { text: '0.22', format: 'numeric' },
      { text: '0.0242ha', format: 'numeric' },
      { text: 'Woodland and forest' },
      { text: 'Other woodland; broadleaved' },
      { text: 'Medium (4)' },
      { text: 'Moderate (2)' },
      { text: 'Low (1)' },
      {
        text: 'Same broad habitat or a higher distinctiveness habitat required'
      }
    ],
    [
      { html: '<strong>Total</strong>' },
      { html: '<strong>1.55</strong>', format: 'numeric' },
      { html: '<strong>0.69ha</strong>', format: 'numeric' },
      {},
      {},
      {},
      {},
      {},
      {}
    ]
  ]
}

// Post intervention habitat details table (2500) — only ever shown once a
// post-intervention file has been uploaded, so there is no "empty" variant.
// Column set matches the Figma "Post-table" component, which is wider than
// its card and scrolls horizontally (see .app-scrollable-table).
const postInterventionHabitatRows = [
  {
    ref: 'P–A1',
    unitsDelivered: '0.00',
    size: '0.4363ha',
    broadHabitat: 'Urban',
    habitatType: 'Developed land; sealed surface',
    distinctiveness: 'Very low (0)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'N/A - Other (0)',
    standardTime: '0 years',
    advance: '0 years',
    delay: '0 years',
    finalTime: '0 years (1.000)',
    standardDifficulty: 'Low (1)',
    appliedDifficulty: 'Low (1)'
  },
  {
    ref: 'P–A2',
    unitsDelivered: '0.98',
    size: '0.1523ha',
    broadHabitat: 'Grassland',
    habitatType: 'Other neutral grassland',
    distinctiveness: 'Medium (4)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Moderate (2)',
    standardTime: '5 years',
    advance: '0 years',
    delay: '1 year',
    finalTime: '6 years (0.808)',
    standardDifficulty: 'Low (1)',
    appliedDifficulty: 'Low (1)'
  },
  {
    ref: 'P–A3',
    unitsDelivered: '0.30',
    size: '0.0808ha',
    broadHabitat: 'Heathland and shrub',
    habitatType: 'Mixed scrub',
    distinctiveness: 'Medium (4)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Poor (1)',
    standardTime: '1 year',
    advance: '0 years',
    delay: '1 year',
    finalTime: '2 years (0.931)',
    standardDifficulty: 'Low (1)',
    appliedDifficulty: 'Low (1)'
  },
  {
    ref: 'P–A4',
    unitsDelivered: '0.28',
    size: '0.0936ha',
    broadHabitat: 'Individual trees',
    habitatType: 'Urban tree',
    distinctiveness: 'Medium (4)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Moderate (2)',
    standardTime: '27 years',
    advance: '0 years',
    delay: '1 year',
    finalTime: '28 years (0.369)',
    standardDifficulty: 'Low (1)',
    appliedDifficulty: 'Low (1)'
  },
  {
    ref: 'P–A5',
    unitsDelivered: '0.01',
    size: '0.0049ha',
    broadHabitat: 'Grassland',
    habitatType: 'Modified grassland',
    distinctiveness: 'Low (2)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Poor (1)',
    standardTime: '1 year',
    advance: '0 years',
    delay: '1 year',
    finalTime: '2 years (0.931)',
    standardDifficulty: 'Low (1)',
    appliedDifficulty: 'Low (1)'
  },
  {
    ref: 'P–A6',
    unitsDelivered: '0.07',
    size: '0.0128ha',
    broadHabitat: 'Woodland and forest',
    habitatType: 'Other woodland; broadleaved',
    distinctiveness: 'Medium (2)',
    strategicSignificance: 'High (1.15)',
    targetCondition: 'Moderate (2)',
    standardTime: '15 years',
    advance: '0 years',
    delay: '1 year',
    finalTime: '16 years (0.566)',
    standardDifficulty: 'Low (1)',
    appliedDifficulty: 'Low (1)'
  }
]

const postInterventionHabitatDetailsTable = {
  head: [
    { text: 'Ref' },
    { text: 'Units', format: 'numeric' },
    { text: 'Size', format: 'numeric' },
    { text: 'Intervention' },
    { text: 'Broad habitat' },
    { text: 'Habitat type' },
    { text: 'Distinctiveness' },
    { text: 'Strategic significance' },
    { text: 'Target condition' },
    { text: 'Standard time to target' },
    { text: 'Advance' },
    { text: 'Delay' },
    { text: 'Final time to target' },
    { text: 'Standard difficulty' },
    { text: 'Applied difficulty' }
  ],
  rows: postInterventionHabitatRows
    .map((row) => [
      {
        html: `<a class="govuk-link" href="/project-dashboard/area-habitats/post-intervention/habitat/${row.ref.replace('–', '-').toLowerCase()}">${row.ref}</a>`
      },
      { text: row.unitsDelivered, format: 'numeric' },
      { text: row.size, format: 'numeric' },
      { text: 'Created' },
      { text: row.broadHabitat },
      { text: row.habitatType },
      { text: row.distinctiveness },
      { text: row.strategicSignificance },
      { text: row.targetCondition },
      { text: row.standardTime },
      { text: row.advance },
      { text: row.delay },
      { text: row.finalTime },
      { text: row.standardDifficulty },
      { text: row.appliedDifficulty }
    ])
    .concat([
      [
        { html: '<strong>Total</strong>' },
        { html: '<strong>1.64</strong>', format: 'numeric' },
        { html: '<strong>0.78ha</strong>', format: 'numeric' },
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {}
      ]
    ])
}

const tradingSummaryTable = (filled) => ({
  head: [{ text: 'Distinctiveness group' }, { text: 'Status' }],
  rows: [
    [
      { text: 'Medium' },
      { html: '<strong class="govuk-tag govuk-tag--red">Not met</strong>' }
    ],
    [
      { text: 'Low' },
      filled
        ? { html: '<strong class="govuk-tag govuk-tag--green">Met</strong>' }
        : { html: '<strong class="govuk-tag govuk-tag--red">Not met</strong>' }
    ]
  ]
})

const mediumDistinctivenessSummary = {
  rows: [
    {
      key: { text: 'Status' },
      value: {
        html: '<strong class="govuk-tag govuk-tag--red">Not met</strong>'
      }
    },
    {
      key: { text: 'Trading rule' },
      value: {
        text: 'Losses must be replaced by area habitat units of either medium band habitats within the same broad habitat type or, any habitat from a higher band from any broad habitat type'
      }
    }
  ]
}

// Medium distinctiveness broad-habitat breakdown tables — the empty state
// only has a "Woodland and forest" loss; the filled state adds three more
// broad-habitat groups gained through post-intervention creation.
function mediumDistinctivenessTables(filled) {
  const groups = filled
    ? [
        {
          heading: 'Grassland',
          habitatType: 'Other neutral grassland',
          value: '0.98'
        },
        {
          heading: 'Heathland and shrub',
          habitatType: 'Mixed scrub',
          value: '0.30'
        },
        {
          heading: 'Individual trees',
          habitatType: 'Urban tree',
          value: '0.28'
        },
        {
          heading: 'Woodland and forest',
          habitatType: 'Other woodland; broadleaved',
          value: '-0.13'
        }
      ]
    : [
        {
          heading: 'Woodland and forest',
          habitatType: 'Other woodland; broadleaved',
          value: '-0.22'
        }
      ]

  return groups.map((group) => ({
    heading: group.heading,
    table: {
      head: [
        { text: 'Habitat type' },
        { text: 'On-site unit change', format: 'numeric' }
      ],
      rows: [
        [{ text: group.habitatType }, { text: group.value, format: 'numeric' }],
        [
          { html: '<strong>Cumulative broad habitat change</strong>' },
          { html: `<strong>${group.value}</strong>`, format: 'numeric' }
        ]
      ]
    }
  }))
}

function mediumDistinctivenessCards(filled) {
  return filled
    ? [
        {
          valueFirst: true,
          value: '1.56 units',
          caption: {
            text: 'Medium distinctiveness units available to offset lower distinctiveness deficit'
          }
        },
        {
          valueFirst: true,
          value: '-0.13 units',
          caption: {
            text: 'Medium distinctiveness broad habitat losses to be offset by trading up'
          }
        },
        {
          valueFirst: true,
          value: '-0.13 units',
          caption: {
            text: 'Higher distinctiveness surplus units minus medium distinctiveness broad habitat deficit'
          }
        },
        {
          valueFirst: true,
          value: '1.43 units',
          caption: { text: 'Cumulative surplus of units' }
        }
      ]
    : [
        {
          valueFirst: true,
          value: '0.00 units',
          caption: {
            text: 'Medium distinctiveness units available to offset lower distinctiveness deficit'
          }
        },
        {
          valueFirst: true,
          value: '-0.22 units',
          caption: {
            text: 'Medium distinctiveness broad habitat losses to be offset by trading up'
          }
        },
        {
          valueFirst: true,
          value: '-0.22 units',
          caption: {
            text: 'Higher distinctiveness surplus units minus medium distinctiveness broad habitat deficit'
          }
        },
        {
          valueFirst: true,
          value: '-0.22 units',
          caption: { text: 'Cumulative surplus of units' }
        }
      ]
}

const lowDistinctivenessSummary = (filled) => ({
  rows: [
    {
      key: { text: 'Status' },
      value: filled
        ? { html: '<strong class="govuk-tag govuk-tag--green">Met</strong>' }
        : { html: '<strong class="govuk-tag govuk-tag--red">Not met</strong>' }
    },
    {
      key: { text: 'Trading rule' },
      value: {
        text: 'Losses must be replaced with area habitat units of the same or higher band'
      }
    }
  ]
})

function lowDistinctivenessTable(filled) {
  const rows = filled
    ? [
        [
          { text: 'Cropland' },
          { text: 'Cereal crops' },
          { text: '-1.33', format: 'numeric' }
        ],
        [
          { text: 'Grassland' },
          { text: 'Modified grassland' },
          { text: '0.01', format: 'numeric' }
        ]
      ]
    : [
        [
          { text: 'Cropland' },
          { text: 'Cereal crops' },
          { text: '-1.33', format: 'numeric' }
        ]
      ]
  return {
    head: [
      { text: 'Group' },
      { text: 'Habitat group' },
      { text: 'On-site unit change', format: 'numeric' }
    ],
    rows: rows.concat([
      [
        { html: '<strong>Total on-site unit change</strong>' },
        {},
        {
          html: `<strong>${filled ? '-1.32' : '-1.33'}</strong>`,
          format: 'numeric'
        }
      ]
    ])
  }
}

function lowDistinctivenessCards(filled) {
  return [
    {
      valueFirst: true,
      value: filled ? '-1.32 units' : '-1.33 units',
      caption: { text: 'Low distinctiveness net change in units' }
    },
    {
      valueFirst: true,
      value: filled ? '0.12 units' : '-1.33 units',
      caption: { text: 'Cumulative surplus of units' }
    }
  ]
}

const broadHabitatItems = [
  { value: 'Grassland', text: 'Grassland' },
  { value: 'Cropland', text: 'Cropland' },
  { value: 'Heathland and shrub', text: 'Heathland and shrub' },
  { value: 'Woodland and forest', text: 'Woodland and forest' },
  { value: 'Urban', text: 'Urban' }
]

const habitatTypeItems = [
  { value: 'Cereal crops', text: 'Cereal crops' },
  { value: 'Modified grassland', text: 'Modified grassland' },
  { value: 'Other neutral grassland', text: 'Other neutral grassland' },
  { value: 'Other woodland; broadleaved', text: 'Other woodland; broadleaved' },
  { value: 'Semi-improved grassland', text: 'Semi-improved grassland' }
]

const conditionItems = [
  { value: 'Good (3)', text: 'Good (3)' },
  { value: 'Moderate (2)', text: 'Moderate (2)' },
  { value: 'Poor (1)', text: 'Poor (1)' },
  {
    value: 'Condition assessment N/A (1)',
    text: 'Condition assessment N/A (1)'
  }
]

const strategicSignificanceItems = [
  { value: 'Low (1)', text: 'Low (1)' },
  { value: 'High (1.15)', text: 'High (1.15)' }
]

const targetConditionItems = [
  { value: 'N/A - Other (0)', text: 'N/A - Other (0)' },
  { value: 'Poor (1)', text: 'Poor (1)' },
  { value: 'Moderate (2)', text: 'Moderate (2)' }
]

// Baseline habitat detail records (screens 1510 / 1511 — B-A1 / B-A2)
const baselineHabitats = {
  'b-a1': {
    ref: 'B–A1',
    size: '0.6629',
    broadHabitat: 'Cropland',
    habitatType: 'Cereal crops',
    distinctiveness: 'Low (2)',
    condition: 'Condition assessment N/A (1)',
    strategicSignificance: 'Low (1)',
    tradingRule:
      'Losses must be replaced with area habitat units of the same or higher band.',
    units: '1.33',
    supportingInformation:
      'Existing cropland to be lost to the development footprint and new landscaping. See BNG report v2 for details.'
  },
  'b-a2': {
    ref: 'B–A2',
    size: '0.0242',
    broadHabitat: 'Woodland and forest',
    habitatType: 'Other woodland; broadleaved',
    distinctiveness: 'Medium (4)',
    condition: 'Moderate (2)',
    strategicSignificance: 'Low (1)',
    tradingRule:
      'Losses must be replaced by area habitat units of either medium band habitats within the same broad habitat type or, any habitat from a higher band from any broad habitat type.',
    units: '0.22',
    supportingInformation:
      'Existing woodland on eastern field boundary to be lost to the new access to Cherry Hinton Road. The site location has been identified as desirable for woodland creation in a local strategy. See BNG report v2 for specific species details and condition assessment criteria.'
  }
}

// Post-intervention habitat detail records (screens 2610-2615 — P-A1..P-A6).
// advanceOrDelay/delayYears drive the pre-selected "Advance or delay?" radio
// and its conditional "Years" reveal; the rest mirrors what's shown once a
// choice is made (final time to target, applied difficulty, units delivered).
const postInterventionHabitats = {
  'p-a1': {
    ref: 'P–A1',
    area: '0.4363ha',
    broadHabitat: 'Urban',
    habitatType: 'Developed land; sealed surface',
    distinctiveness: 'Very low (0)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'N/A - Other (0)',
    standardTime: '0 years',
    standardDifficulty: 'Low (1)',
    advanceOrDelay: 'neither',
    delayYears: '',
    finalTime: '0 years (1.000)',
    appliedDifficulty: 'Low (1)',
    unitsDelivered: '0.00',
    supportingInformation:
      'Proposed substation footprint including access, site compound, and 2m shingle buffer between substation compound and proposed boundary planting.'
  },
  'p-a2': {
    ref: 'P–A2',
    area: '0.1523ha',
    broadHabitat: 'Grassland',
    habitatType: 'Other neutral grassland',
    distinctiveness: 'Medium (4)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Moderate (2)',
    standardTime: '5 years',
    standardDifficulty: 'Low (1)',
    advanceOrDelay: 'delay',
    delayYears: '1',
    finalTime: '6 years (0.808)',
    appliedDifficulty: 'Low (1)',
    unitsDelivered: '0.98',
    supportingInformation:
      'Proposed grassland as part of the landscaping, see report and condition assessment sheets for suitable species list and predicted condition.'
  },
  'p-a3': {
    ref: 'P–A3',
    area: '0.0808ha',
    broadHabitat: 'Heathland and shrub',
    habitatType: 'Mixed scrub',
    distinctiveness: 'Medium (4)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Poor (1)',
    standardTime: '1 year',
    standardDifficulty: 'Low (1)',
    advanceOrDelay: 'delay',
    delayYears: '1',
    finalTime: '2 years (0.931)',
    appliedDifficulty: 'Low (1)',
    unitsDelivered: '0.30',
    supportingInformation:
      "Proposed mixed scrub as part of the landscaping (areas marked as 'copse mix' on the specification document). See BNG report and the condition assessment sheets for suitable species list and predicted condition. No specific strategy for scrub in this location but this habitat will provide additional connectivity and structural diversity between existing offsite tree belts/woodland areas."
  },
  'p-a4': {
    ref: 'P–A4',
    area: '0.0936ha',
    broadHabitat: 'Individual trees',
    habitatType: 'Urban tree',
    distinctiveness: 'Medium (4)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Moderate (2)',
    standardTime: '27 years',
    standardDifficulty: 'Low (1)',
    advanceOrDelay: 'delay',
    delayYears: '1',
    finalTime: '28 years (0.369)',
    appliedDifficulty: 'Low (1)',
    unitsDelivered: '0.28',
    supportingInformation:
      'Proposed individual tree planting around the new development. 23 small native trees. No specific strategy on individual tree planting in this location, but these will provide additional connectivity and structural diversity between existing offsite tree belts. See report and condition assessment for details on species and predicted condition.'
  },
  'p-a5': {
    ref: 'P–A5',
    area: '0.0049ha',
    broadHabitat: 'Grassland',
    habitatType: 'Modified grassland',
    distinctiveness: 'Low (2)',
    strategicSignificance: 'Low (1)',
    targetCondition: 'Poor (1)',
    standardTime: '1 year',
    standardDifficulty: 'Low (1)',
    advanceOrDelay: 'delay',
    delayYears: '1',
    finalTime: '2 years (0.931)',
    appliedDifficulty: 'Low (1)',
    unitsDelivered: '0.01',
    supportingInformation:
      'Area above underground cabling to be seeded with amenity grassland mix.'
  },
  'p-a6': {
    ref: 'P–A6',
    area: '0.0128ha',
    broadHabitat: 'Woodland and forest',
    habitatType: 'Other woodland; broadleaved',
    distinctiveness: 'Medium (2)',
    strategicSignificance: 'High (1.15)',
    targetCondition: 'Moderate (2)',
    standardTime: '15 years',
    standardDifficulty: 'Low (1)',
    advanceOrDelay: 'delay',
    delayYears: '1',
    finalTime: '16 years (0.566)',
    appliedDifficulty: 'Low (1)',
    unitsDelivered: '0.07',
    supportingInformation:
      'Created woodland to replace that lost for cable works. Expected to achieve moderate condition.'
  }
}

/**
 * Build the side navigation, marking the current top-level section and,
 * when inside Area habitats, the current sub-section. "Flags" and
 * "Post-intervention" only appear once a post-intervention file has been
 * uploaded — matching the Figma design, where those sub-items and their
 * screens don't exist until then.
 * @param {string} section - "summary" or "area-habitats"
 * @param {string} [sub] - "flags", "trading-rules", "baseline" or "post-intervention"
 * @param {boolean} filled - whether a post-intervention file has been uploaded
 */
function sideNav(section, sub, filled) {
  const areaHabitatsItems = [
    {
      text: 'Trading rules',
      href: '/project-dashboard/area-habitats/trading-rules',
      current: sub === 'trading-rules'
    },
    {
      text: 'Baseline',
      href: '/project-dashboard/area-habitats/baseline',
      current: sub === 'baseline'
    }
  ]
  if (filled) {
    areaHabitatsItems.unshift({
      text: 'Flags',
      href: '/project-dashboard/area-habitats/flags',
      current: sub === 'flags'
    })
    areaHabitatsItems.push({
      text: 'Post intervention',
      href: '/project-dashboard/area-habitats/post-intervention',
      current: sub === 'post-intervention'
    })
  }

  return {
    ariaLabel: 'Results sections',
    items: [
      {
        text: 'Summary',
        href: '/project-dashboard/summary',
        current: section === 'summary'
      },
      {
        text: 'Area habitats',
        href: '/project-dashboard/area-habitats',
        current: section === 'area-habitats' && !sub,
        items: section === 'area-habitats' ? areaHabitatsItems : undefined
      }
    ]
  }
}

/**
 * Register project dashboard routes
 * @param {Router} router - Express router instance
 */
function registerProjectDashboardRoutes(router) {
  router.get('/project-dashboard', function (req, res) {
    res.render('project-dashboard/start')
  })

  router.get('/project-dashboard/sign-in', function (req, res) {
    res.render('project-dashboard/sign-in')
  })

  router.post('/project-dashboard/sign-in', function (req, res) {
    res.redirect('/project-dashboard/project-details')
  })

  router.get('/project-dashboard/project-details', function (req, res) {
    res.render('project-dashboard/project-details')
  })

  router.post('/project-dashboard/project-details', function (req, res) {
    res.redirect('/project-dashboard/upload/choose')
  })

  router.get('/project-dashboard/upload/choose', function (req, res) {
    res.render('project-dashboard/upload-choose', {
      error: req.query.error || null
    })
  })

  router.post('/project-dashboard/upload/choose', function (req, res) {
    const uploadChoice = req.body.uploadChoice
    if (!uploadChoice) {
      return res.redirect(
        '/project-dashboard/upload/choose?error=Select what you would like to upload'
      )
    }
    res.redirect(`/project-dashboard/upload/${uploadChoice}`)
  })

  router.get('/project-dashboard/upload/:kind', function (req, res) {
    res.render('project-dashboard/upload', { kind: req.params.kind })
  })

  router.post('/project-dashboard/upload/:kind', function (req, res) {
    res.redirect(`/project-dashboard/upload/${req.params.kind}/processing`)
  })

  router.get('/project-dashboard/upload/:kind/processing', function (req, res) {
    // UR mock: no real parsing — record that a file was "uploaded" and, for
    // the post-intervention branch, flip the dashboard into its filled state.
    if (req.params.kind === 'post-intervention') {
      req.session.data.postInterventionUploaded = true
    }
    res.render('project-dashboard/upload-processing', {
      destination: '/project-dashboard/summary'
    })
  })

  router.get('/project-dashboard/summary', function (req, res) {
    const filled = Boolean(req.session.data.postInterventionUploaded)
    res.render('project-dashboard/summary', {
      sideNav: sideNav('summary', null, filled),
      areaHabitatsHeadlineDashboard: {
        headingLevel: 3,
        cards: areaHabitatsHeadlineCards(filled)
      },
      areaHabitatsBreakdownDashboard: {
        headingLevel: 3,
        cards: areaHabitatsBreakdownCards(filled)
      }
    })
  })

  router.get('/project-dashboard/area-habitats', function (req, res) {
    const filled = Boolean(req.session.data.postInterventionUploaded)
    res.render('project-dashboard/area-habitats', {
      sideNav: sideNav('area-habitats', null, filled),
      resultsHeadlineDashboard: {
        headingLevel: 3,
        cards: areaHabitatsHeadlineCards(filled)
      },
      resultsBreakdownDashboard: {
        headingLevel: 3,
        cards: areaHabitatsBreakdownCards(filled)
      },
      targetsDashboard: { headingLevel: 3, cards: targetsCards(filled) },
      actionsDashboard: { headingLevel: 3, cards: actionsCards(filled) }
    })
  })

  router.get('/project-dashboard/area-habitats/flags', function (req, res) {
    const filled = Boolean(req.session.data.postInterventionUploaded)
    res.render('project-dashboard/flags', {
      sideNav: sideNav('area-habitats', 'flags', filled),
      filled: filled,
      postInterventionTable: flagsPostInterventionTable
    })
  })

  router.get('/project-dashboard/area-habitats/baseline', function (req, res) {
    const filled = Boolean(req.session.data.postInterventionUploaded)
    res.render('project-dashboard/baseline', {
      sideNav: sideNav('area-habitats', 'baseline', filled),
      resultsHeadlineDashboard: {
        headingLevel: 3,
        cards: areaHabitatsHeadlineCards(filled)
      },
      resultsBreakdownDashboard: {
        headingLevel: 3,
        cards: areaHabitatsBreakdownCards(filled)
      },
      sizeDashboard: { headingLevel: 3, cards: baselineSizeCards },
      areaHabitatDetailsTable: areaHabitatDetailsTable
    })
  })

  router.get(
    '/project-dashboard/area-habitats/trading-rules',
    function (req, res) {
      const filled = Boolean(req.session.data.postInterventionUploaded)
      res.render('project-dashboard/trading-rules', {
        sideNav: sideNav('area-habitats', 'trading-rules', filled),
        tradingSummaryTable: tradingSummaryTable(filled),
        mediumDistinctivenessSummary: mediumDistinctivenessSummary,
        mediumDistinctivenessTables: mediumDistinctivenessTables(filled),
        mediumDistinctivenessDashboard: {
          headingLevel: 3,
          cards: mediumDistinctivenessCards(filled)
        },
        lowDistinctivenessSummary: lowDistinctivenessSummary(filled),
        lowDistinctivenessTable: lowDistinctivenessTable(filled),
        lowDistinctivenessDashboard: {
          headingLevel: 3,
          cards: lowDistinctivenessCards(filled)
        }
      })
    }
  )

  router.get(
    '/project-dashboard/area-habitats/post-intervention',
    function (req, res) {
      const filled = Boolean(req.session.data.postInterventionUploaded)
      res.render('project-dashboard/post-intervention', {
        sideNav: sideNav('area-habitats', 'post-intervention', filled),
        resultsHeadlineDashboard: {
          headingLevel: 3,
          cards: areaHabitatsHeadlineCards(filled)
        },
        resultsBreakdownDashboard: {
          headingLevel: 3,
          cards: areaHabitatsBreakdownCards(filled)
        },
        sizeDashboard: {
          headingLevel: 3,
          cards: postInterventionSizeCards
        },
        postInterventionHabitatDetailsTable: postInterventionHabitatDetailsTable
      })
    }
  )

  router.get(
    '/project-dashboard/area-habitats/habitat/:ref',
    function (req, res) {
      const habitat =
        baselineHabitats[req.params.ref] || baselineHabitats['b-a1']
      res.render('project-dashboard/habitat-edit', {
        habitat: habitat,
        broadHabitatItems: broadHabitatItems,
        habitatTypeItems: habitatTypeItems,
        conditionItems: conditionItems
      })
    }
  )

  router.post(
    '/project-dashboard/area-habitats/habitat/:ref',
    function (req, res) {
      res.redirect('/project-dashboard/area-habitats/baseline')
    }
  )

  router.get(
    '/project-dashboard/area-habitats/post-intervention/habitat/:ref',
    function (req, res) {
      const habitat =
        postInterventionHabitats[req.params.ref] ||
        postInterventionHabitats['p-a1']
      res.render('project-dashboard/post-intervention-habitat-edit', {
        habitat: habitat,
        strategicSignificanceItems: strategicSignificanceItems,
        targetConditionItems: targetConditionItems
      })
    }
  )

  router.post(
    '/project-dashboard/area-habitats/post-intervention/habitat/:ref',
    function (req, res) {
      res.redirect('/project-dashboard/area-habitats/post-intervention')
    }
  )
}

module.exports = { registerProjectDashboardRoutes }
