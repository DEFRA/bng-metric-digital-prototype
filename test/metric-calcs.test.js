const test = require('node:test')
const assert = require('node:assert/strict')

const metricCalcs = require('../app/lib/metric-calcs')
const metric = require('bng-library/metric')

// metric-calcs.js used to reimplement the statutory metric, with its own copies
// of the reference tables. It is now an adapter over bng-library/metric — the
// same code the backend runs. These tests pin the two things that could quietly
// break: that the adapter still offers everything its callers use, and that the
// numbers it returns are the library's rather than a second implementation's.

const EXPECTED_EXPORTS = [
  'conditionScores',
  'creationTimeToTarget',
  'distinctivenesScores', // spelling is the prototype's own — call sites rely on it
  'distinctivenessCategories',
  'enhancementTimeToTarget',
  'getBaselineUnits',
  'getConditionMultiplier',
  'getCreationUnits',
  'getDifficultyMultiplier',
  'getDistinctivenessMultiplier',
  'getEnhancementUnits',
  'getTimeMultiplier',
  'habitatDifficulty',
  'habitatDifficultyMultiplier',
  'timeToTarget'
]

const GRASSLAND = 'Grassland - Modified grassland'
const NEUTRAL = 'Grassland - Other neutral grassland'

test('exposes exactly the surface its callers use', () => {
  assert.deepEqual(Object.keys(metricCalcs).sort(), EXPECTED_EXPORTS)
})

test('reference tables are the library’s, not copies of them', () => {
  // Identity, not deep equality: a copy would drift, and copies are what this
  // change removed.
  assert.equal(metricCalcs.conditionScores, metric.CONDITION_SCORES)
  assert.equal(
    metricCalcs.distinctivenessCategories,
    metric.DISTINCTIVENESS_CATEGORIES
  )
  assert.equal(metricCalcs.distinctivenesScores, metric.DISTINCTIVENESS_SCORES)
  assert.equal(metricCalcs.creationTimeToTarget, metric.TIME_TO_TARGET_CREATION)
  assert.equal(
    metricCalcs.enhancementTimeToTarget,
    metric.TIME_TO_TARGET_ENHANCEMENT
  )
  assert.equal(metricCalcs.habitatDifficulty, metric.HABITAT_DIFFICULTY)
  assert.equal(
    metricCalcs.habitatDifficultyMultiplier,
    metric.DIFFICULTY_MULTIPLIER
  )
  assert.equal(metricCalcs.timeToTarget, metric.TIME_TO_TARGET_MULTIPLIER)
})

test('baseline units match the library', () => {
  assert.equal(
    metricCalcs.getBaselineUnits(GRASSLAND, 1.36, 'Moderate'),
    metric.calculateAreaHabitatBaseline(1.36, GRASSLAND, 'Moderate').units
  )
})

test('creation units match the library, with the prototype’s year order', () => {
  // The prototype takes (delayYears, advanceYears); the library takes the
  // reverse. Getting this backwards would still return a number, so pin it.
  const delayYears = 5
  const advanceYears = 0
  assert.equal(
    metricCalcs.getCreationUnits(
      5.6,
      GRASSLAND,
      'Moderate',
      delayYears,
      advanceYears
    ),
    metric.calculateCreatedAreaHabitatPostIntervention(
      5.6,
      GRASSLAND,
      'Moderate',
      advanceYears,
      delayYears
    ).units
  )
})

test('enhancement units match the library', () => {
  assert.equal(
    metricCalcs.getEnhancementUnits(
      GRASSLAND,
      'Poor',
      NEUTRAL,
      2,
      'Moderate',
      0,
      3
    ),
    metric.calculateEnhancedAreaHabitatPostIntervention(
      2,
      GRASSLAND,
      NEUTRAL,
      'Poor',
      'Moderate',
      3,
      0
    ).units
  )
})

test('multipliers come from the library', () => {
  assert.equal(
    metricCalcs.getDistinctivenessMultiplier(GRASSLAND),
    metric.resolveDistinctiveness(GRASSLAND).distinctivenessScore
  )
  assert.equal(
    metricCalcs.getConditionMultiplier(GRASSLAND, 'Moderate'),
    metric.calculateAreaHabitatBaseline(1, GRASSLAND, 'Moderate').conditionScore
  )

  const created = metric.calculateCreatedAreaHabitatPostIntervention(
    1,
    GRASSLAND,
    'Moderate',
    0,
    0
  )
  assert.equal(
    metricCalcs.getTimeMultiplier(
      GRASSLAND,
      'Creation',
      null,
      'Moderate',
      0,
      0
    ),
    created.timeMultiplier
  )
  assert.equal(
    metricCalcs.getDifficultyMultiplier(
      GRASSLAND,
      'Creation',
      null,
      'Moderate',
      0,
      0
    ),
    created.difficultyMultiplier
  )
})

test('the time multiplier is full precision, not rounded to 3dp', () => {
  // The deleted table held year 25 as 0.41; the statutory value is 0.965^25.
  // That difference was enough to move a scenario across a rounding boundary.
  assert.equal(metric.TIME_TO_TARGET_MULTIPLIER['25'], 0.4103768311)
})

test('rejects advance and delay years used together', () => {
  // The library treats this as invalid input; the old implementation quietly
  // computed a figure for it.
  assert.throws(
    () => metricCalcs.getCreationUnits(1, GRASSLAND, 'Moderate', 5, 5),
    /cannot both be used/
  )
})
