/**
 * The summary page's figures: the static statutory formula
 * (size × distinctiveness × condition × strategic significance), the
 * on-site filter, the proposed-falls-back-to-baseline rule, and the
 * arithmetic of net and percentage change.
 *
 * All geometry is hand-sized so the expected units are exact: a 100 m
 * square is one hectare, a straight kilometre is one kilometre.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_TARGET_PERCENTAGE, meetsTarget, summariseUnitTypes, UNIT_TYPES
} from '../../app/lib/pdf-report/unit-summary.mjs'

const ONE_HECTARE_SQUARE = {
  type: 'Polygon',
  coordinates: [[[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]]]
}

const ONE_KILOMETRE_LINE = {
  type: 'LineString',
  coordinates: [[0, 0], [1000, 0]]
}

function site({ habitats = [], hedgerows = [], watercourses = [] } = {}) {
  return {
    layers: {
      habitats: { features: habitats },
      hedgerows: { features: hedgerows },
      watercourses: { features: watercourses }
    }
  }
}

function areaParcel(properties) {
  return { geometry: ONE_HECTARE_SQUARE, properties }
}

function linearParcel(properties) {
  return { geometry: ONE_KILOMETRE_LINE, properties }
}

function summaryFor(baseline, postIntervention = null, key = 'habitats') {
  return summariseUnitTypes(baseline, postIntervention).find(
    (unitType) => unitType.key === key
  )
}

test('one summary per unit type, in the summary page order', () => {
  const summaries = summariseUnitTypes(site(), null)
  assert.deepEqual(
    summaries.map(({ key, title }) => ({ key, title })),
    UNIT_TYPES.map(({ key, title }) => ({ key, title }))
  )
})

test('baseline units are size × distinctiveness × condition × significance', () => {
  const baseline = site({
    habitats: [
      areaParcel({
        'Baseline Distinctiveness': 'Medium', // 4
        'Baseline Condition': 'Good', // 3
        'Baseline Strategic Significance': 'Formally identified in local strategy' // 1.15
      })
    ]
  })

  assert.equal(summaryFor(baseline).baselineUnits, 1 * 4 * 3 * 1.15)
})

test('linear units are measured per kilometre', () => {
  const baseline = site({
    hedgerows: [
      linearParcel({
        'Baseline Distinctiveness': 'Low', // 2
        'Baseline Condition': 'Moderate' // 2; no significance column → neutral 1
      })
    ]
  })

  assert.equal(summaryFor(baseline, null, 'hedgerows').baselineUnits, 1 * 2 * 2)
})

test('an explicitly off-site parcel is excluded; an unlocated one is not', () => {
  const properties = {
    'Baseline Distinctiveness': 'Low', // 2
    'Baseline Condition': 'Poor' // 1
  }
  const baseline = site({
    habitats: [
      areaParcel({ ...properties, Location: 'Off-site' }),
      areaParcel({ ...properties, Location: 'On-site' }),
      areaParcel(properties)
    ]
  })

  assert.equal(summaryFor(baseline).baselineUnits, 2 * 2)
})

test('dashboard data keeps the dropdown numbering, and still scores', () => {
  const baseline = site({
    habitats: [
      areaParcel({
        'Baseline Distinctiveness': 'Medium', // 4
        'Baseline Condition': '3. Moderate' // 2, once the number is stripped
      })
    ]
  })

  assert.equal(summaryFor(baseline).baselineUnits, 4 * 2)
})

test('sealed surface — "N/A - Other" — scores zero on purpose', () => {
  const baseline = site({
    habitats: [
      areaParcel({
        'Baseline Distinctiveness': 'V.Low',
        'Baseline Condition': '6. N/A - Other'
      })
    ]
  })

  assert.equal(summaryFor(baseline).baselineUnits, 0)
})

test('a literal "Null" proposed value falls back to the baseline, like a blank', () => {
  const postIntervention = site({
    habitats: [
      areaParcel({
        'Baseline Distinctiveness': 'Medium', // 4
        'Baseline Condition': 'Moderate', // 2
        'Proposed Distinctiveness': 'Null',
        'Proposed Condition': 'Null'
      })
    ]
  })

  const summary = summaryFor(site(), postIntervention)
  assert.equal(summary.postInterventionUnits, 4 * 2)
})

test('an unrecognised score zeroes the parcel rather than guessing', () => {
  const baseline = site({
    habitats: [
      areaParcel({
        'Baseline Distinctiveness': 'Astounding',
        'Baseline Condition': 'Good'
      })
    ]
  })

  assert.equal(summaryFor(baseline).baselineUnits, 0)
})

test('post-intervention prefers proposed values and falls back to baseline', () => {
  const baseline = site()
  const postIntervention = site({
    habitats: [
      // A changed parcel: proposed values win.
      areaParcel({
        'Baseline Distinctiveness': 'Low',
        'Baseline Condition': 'Poor',
        'Proposed Distinctiveness': 'High', // 6
        'Proposed Condition': 'Good' // 3
      }),
      // A retained parcel: baseline values carry over.
      areaParcel({
        'Baseline Distinctiveness': 'Medium', // 4
        'Baseline Condition': 'Moderate' // 2
      })
    ]
  })

  const summary = summaryFor(baseline, postIntervention)
  assert.equal(summary.postInterventionUnits, 6 * 3 + 4 * 2)
})

test('net and percentage change compare post-intervention with baseline', () => {
  const parcel = (condition) =>
    areaParcel({
      'Baseline Distinctiveness': 'Low', // 2
      'Baseline Condition': condition
    })
  const baseline = site({ habitats: [parcel('Moderate')] }) // 2 × 2 = 4
  const postIntervention = site({ habitats: [parcel('Good')] }) // 2 × 3 = 6

  const summary = summaryFor(baseline, postIntervention)
  assert.equal(summary.baselineUnits, 4)
  assert.equal(summary.postInterventionUnits, 6)
  assert.equal(summary.netChange, 2)
  assert.equal(summary.percentageChange, 50)
})

test('without a post-intervention file the change figures are null, not zero', () => {
  const baseline = site({
    habitats: [
      areaParcel({ 'Baseline Distinctiveness': 'Low', 'Baseline Condition': 'Poor' })
    ]
  })

  const summary = summaryFor(baseline)
  assert.equal(summary.postInterventionUnits, null)
  assert.equal(summary.netChange, null)
  assert.equal(summary.percentageChange, null)
})

test('a zero baseline yields no percentage — division would invent one', () => {
  const summary = summaryFor(site(), site())
  assert.equal(summary.baselineUnits, 0)
  assert.equal(summary.percentageChange, null)
})

test('the target is met at the threshold, not only above it', () => {
  assert.equal(meetsTarget(DEFAULT_TARGET_PERCENTAGE, DEFAULT_TARGET_PERCENTAGE), true)
  assert.equal(meetsTarget(9.99, DEFAULT_TARGET_PERCENTAGE), false)
  assert.equal(meetsTarget(null, DEFAULT_TARGET_PERCENTAGE), false)
})
