const test = require('node:test')
const assert = require('node:assert/strict')
const {
  getTimeMultiplier,
  getCreationUnits
} = require('../app/lib/metric-calcs')

// 3.5% of habitat value is lost for each year until target condition is reached.
const ANNUAL_RETENTION = 0.965

// A habitat whose creation time to target is a known number of years, so the
// multiplier can be driven to an exact year count via delay / advance.
const WOODLAND = 'Woodland and forest - Lowland mixed deciduous woodland' // 30+ years
const SCREE = 'Sparsely vegetated land - Inland rock outcrop and scree habitats' // 20 years

const timeMultiplier = (habitat, delayYears, advanceYears) =>
  getTimeMultiplier(
    habitat,
    'Creation',
    null,
    'Moderate',
    delayYears,
    advanceYears
  )

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100

test('time multiplier is 0.965 raised to the years to target', () => {
  // Woodland takes 30+ years, capped at 30 for the base value.
  assert.equal(timeMultiplier(WOODLAND, 0, 0), Math.pow(ANNUAL_RETENTION, 30))
  assert.equal(timeMultiplier(WOODLAND, 0, 5), Math.pow(ANNUAL_RETENTION, 25))
  assert.equal(timeMultiplier(WOODLAND, 0, 30), 1)
})

test('time multiplier keeps full precision rather than a rounded table value', () => {
  // The old lookup table held 0.41 for year 25, losing four decimal places.
  const twentyFive = timeMultiplier(WOODLAND, 0, 5)
  assert.equal(twentyFive.toFixed(6), '0.410377')
  assert.notEqual(twentyFive, 0.41)
})

test('time multiplier keeps depreciating beyond 30 years', () => {
  // The old table collapsed every year past 30 into a single ">30" value of 0.32,
  // so a 32 year wait and a 42 year wait scored identically.
  assert.equal(timeMultiplier(SCREE, 12, 0), Math.pow(ANNUAL_RETENTION, 32))
  assert.equal(timeMultiplier(SCREE, 22, 0), Math.pow(ANNUAL_RETENTION, 42))
  assert.ok(timeMultiplier(SCREE, 22, 0) < timeMultiplier(SCREE, 12, 0))
})

test('time multiplier is 1 when the target condition is already met', () => {
  assert.equal(timeMultiplier(SCREE, 0, 20), 1)
  assert.equal(timeMultiplier(SCREE, 0, 25), 1) // advance beyond time to target
})

test('creation units match the published metric for the two long-dated cases', () => {
  // Both previously disagreed with the reference spreadsheet in the last penny:
  // 9.09 instead of 9.10, and 6.67 instead of 6.66.
  assert.equal(round2(getCreationUnits(5.6, WOODLAND, 'Moderate', 0, 5)), 9.1)
  assert.equal(round2(getCreationUnits(5.26, SCREE, 'Moderate', 12, 0)), 6.66)
})
