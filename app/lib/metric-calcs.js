// Statutory metric calculations, delegated to bng-library.
//
// This file used to be a 411-line reimplementation of the metric, with its own
// copies of the reference tables beside it. The calculations now live in
// bng-library as `bng-library/metric` — the same code bng-metric-backend runs —
// so this is a thin adapter over that, kept only to preserve the shape the
// prototype's routes and cucumber steps already call.
//
// bng-library is ESM and this file is CommonJS. Node 24 (which package.json
// requires) can `require()` an ESM module directly, so no dynamic-import bridge
// is needed here — unlike geopackage-parser.js, which predates that support.
//
// The argument orders below are the prototype's, not the library's: several
// take (delayYears, advanceYears) where the library takes (advance, delay).
// Keeping them means no call site had to change.

const metric = require('bng-library/metric')

const CREATION = 'Creation'
const ENHANCEMENT = 'Enhancement'

/** Strategic significance is not modelled in the prototype; the library defaults it to 1. */

/**
 * Get the distinctiveness score for a habitat.
 *
 * @param {string} habitat - e.g. "Grassland - Modified grassland"
 * @returns {number} The distinctiveness score
 * @throws {Error} If the habitat is not recognised
 */
function getDistinctivenessMultiplier(habitat) {
  return metric.resolveDistinctiveness(habitat).distinctivenessScore
}

/**
 * Get the condition score for a habitat and condition.
 *
 * @param {string} habitat - e.g. "Grassland - Modified grassland"
 * @param {string} condition - e.g. "Moderate"
 * @returns {number} The condition score
 * @throws {Error} If the pairing is not scoreable
 */
function getConditionMultiplier(habitat, condition) {
  // The library has no standalone export for this, but every calculator
  // resolves it, so a baseline call over unit area returns it directly.
  return metric.calculateAreaHabitatBaseline(1, habitat, condition)
    .conditionScore
}

/**
 * Run the calculator for whichever intervention is being asked about, so the
 * multiplier getters below can read a field off the result.
 *
 * @param {string} habitat
 * @param {string} creationOrEnhancement - CREATION or ENHANCEMENT
 * @param {string} [startCondition] - Required for Enhancement
 * @param {string} endCondition
 * @param {number} advanceYears
 * @param {number} delayYears
 * @returns {object} The library's result object
 */
function calculateForIntervention(
  habitat,
  creationOrEnhancement,
  startCondition,
  endCondition,
  advanceYears,
  delayYears
) {
  if (creationOrEnhancement === ENHANCEMENT) {
    return metric.calculateEnhancedAreaHabitatPostIntervention(
      1,
      habitat,
      habitat,
      startCondition,
      endCondition,
      advanceYears,
      delayYears
    )
  }
  if (creationOrEnhancement === CREATION) {
    return metric.calculateCreatedAreaHabitatPostIntervention(
      1,
      habitat,
      endCondition,
      advanceYears,
      delayYears
    )
  }
  throw new Error(
    `Invalid habitat change type: ${creationOrEnhancement}. Expected '${CREATION}' or '${ENHANCEMENT}'`
  )
}

/**
 * Get the time multiplier for a habitat and intervention.
 *
 * @param {string} habitat
 * @param {string} creationOrEnhancement - "Creation" or "Enhancement"
 * @param {string} [startCondition] - Required for Enhancement
 * @param {string} endCondition
 * @param {number} delayYears
 * @param {number} advanceYears
 * @returns {number} The time multiplier
 */
function getTimeMultiplier(
  habitat,
  creationOrEnhancement,
  startCondition,
  endCondition,
  delayYears,
  advanceYears
) {
  return calculateForIntervention(
    habitat,
    creationOrEnhancement,
    startCondition,
    endCondition,
    advanceYears,
    delayYears
  ).timeMultiplier
}

/**
 * Get the difficulty multiplier for a habitat and intervention.
 *
 * Note the year arguments are the other way round from getTimeMultiplier —
 * that asymmetry is inherited from the original implementation and preserved
 * so call sites did not have to change.
 *
 * @param {string} habitat
 * @param {string} creationOrEnhancement - "Creation" or "Enhancement"
 * @param {string} [startCondition] - Required for Enhancement
 * @param {string} endCondition
 * @param {number} advanceYears
 * @param {number} delayYears
 * @returns {number} The difficulty multiplier
 */
function getDifficultyMultiplier(
  habitat,
  creationOrEnhancement,
  startCondition,
  endCondition,
  advanceYears,
  delayYears
) {
  return calculateForIntervention(
    habitat,
    creationOrEnhancement,
    startCondition,
    endCondition,
    advanceYears,
    delayYears
  ).difficultyMultiplier
}

/**
 * Get the baseline units for a habitat.
 *
 * @param {string} habitat
 * @param {number} size - Area in hectares
 * @param {string} condition
 * @returns {number} The baseline units
 */
function getBaselineUnits(habitat, size, condition) {
  return metric.calculateAreaHabitatBaseline(size, habitat, condition).units
}

/**
 * Get the creation units for a habitat.
 *
 * @param {number} areaHa - Area in hectares
 * @param {string} habitatAfter
 * @param {string} conditionAfter
 * @param {number} delayYears
 * @param {number} advanceYears
 * @returns {number} The creation units
 */
function getCreationUnits(
  areaHa,
  habitatAfter,
  conditionAfter,
  delayYears,
  advanceYears
) {
  return metric.calculateCreatedAreaHabitatPostIntervention(
    areaHa,
    habitatAfter,
    conditionAfter,
    advanceYears,
    delayYears
  ).units
}

/**
 * Get the enhancement units for a habitat.
 *
 * @param {string} habitatBefore
 * @param {string} conditionBefore
 * @param {string} habitatAfter
 * @param {number} areaHa - Area in hectares
 * @param {string} conditionAfter
 * @param {number} delayYears
 * @param {number} advanceYears
 * @returns {number} The enhancement units
 */
function getEnhancementUnits(
  habitatBefore,
  conditionBefore,
  habitatAfter,
  areaHa,
  conditionAfter,
  delayYears,
  advanceYears
) {
  return metric.calculateEnhancedAreaHabitatPostIntervention(
    areaHa,
    habitatBefore,
    habitatAfter,
    conditionBefore,
    conditionAfter,
    advanceYears,
    delayYears
  ).units
}

module.exports = {
  getDistinctivenessMultiplier,
  getConditionMultiplier,
  getTimeMultiplier,
  getDifficultyMultiplier,
  getBaselineUnits,
  getCreationUnits,
  getEnhancementUnits,
  // Raw tables, for routes that build dropdowns and summaries from them.
  // Local names are the prototype's own (including the `distinctivenesScores`
  // spelling) so no call site had to change.
  distinctivenesScores: metric.DISTINCTIVENESS_SCORES,
  distinctivenessCategories: metric.DISTINCTIVENESS_CATEGORIES,
  conditionScores: metric.CONDITION_SCORES,
  habitatDifficultyMultiplier: metric.DIFFICULTY_MULTIPLIER,
  habitatDifficulty: metric.HABITAT_DIFFICULTY,
  creationTimeToTarget: metric.TIME_TO_TARGET_CREATION,
  enhancementTimeToTarget: metric.TIME_TO_TARGET_ENHANCEMENT,
  timeToTarget: metric.TIME_TO_TARGET_MULTIPLIER
}
