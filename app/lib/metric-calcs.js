const { conditionScores } = require('./metric-values-habitat-condition');
const { distinctivenesScores, distinctivenessCategories } = require('./metric-values-habitat-distinctiveness');
const { habitatDifficultyMultiplier, habitatDifficulty } = require('./metric-values-habitat-difficulty');
const { creationTimeToTarget } = require('./metric-values-habitat-creation-time');
const { enhancementTimeToTarget } = require('./metric-values-habitat-enhancement-time');
const { timeToTarget } = require('./metric-values-habitat-time'); 

/**
 * Get the distinctiveness score for a given habitat
 * @param {string} habitat - The habitat name (e.g., "Grassland - Bracken")
 * @returns {number} The distinctiveness score, or 0 if habitat not found
 */
function getDistinctivenessMultiplier(habitat) {
  if (!habitat || typeof habitat !== 'string') {
    return 0
  }

  // Look up the distinctiveness level (e.g., "Low", "Medium", etc.) from distinctivenessCategories
  const distinctivenessLevel = distinctivenessCategories[habitat]
  
  if (!distinctivenessLevel) {
    return 0
  }

  // Look up the Score from distinctivenesScores using the distinctiveness level
  const distinctivenessData = distinctivenesScores[distinctivenessLevel]
  
  if (!distinctivenessData || typeof distinctivenessData.Score !== 'number') {
    return 0
  }

  return distinctivenessData.Score
}

/**
 * Get the condition multiplier for a given habitat and condition
 * @param {string} habitat - The habitat name (e.g., "Grassland - Modified grassland")
 * @param {string} condition - The condition name (e.g., "Moderate")
 * @returns {number} The condition multiplier, or 0 if habitat/condition not found or "Not Possible"
 */
function getConditionMultiplier(habitat, condition) {
  if (!habitat || typeof habitat !== 'string' || !condition || typeof condition !== 'string') {
    return 0
  }

  // Look up the habitat in conditionScore
  const conditionScore = conditionScores[habitat][condition]
  
  if (!conditionScore) {
    return 0
  }

  // If the value is "Not Possible" or not a number, return 0
  if (conditionScore === "Not Possible" || conditionScore === null || conditionScore === undefined) {
    return 0
  }

  // Return the numeric conditionScore value
  if (typeof conditionScore === 'number') {
    return conditionScore
  }

  return 0
}

/**
 * Get the time to target value for a given habitat and creation/enhancement type
 * @param {string} habitat - The habitat name (e.g., "Grassland - Modified grassland")
 * @param {string} creationOrEnhancement - Either "Creation" or "Enhancement"
 * @param {string} [startCondition] - The starting condition (optional, only needed for Enhancement)
 * @param {string} endCondition - The target condition (required for both Creation and Enhancement)
 * @param {number} delayYears - The number of years to delay the project
 * @param {number} advanceYears - The number of years to advance the project
 * @returns {number} The time to target value, or 0 if habitat/type not found
 * @throws {Error} If time to target not found for habitat/type
 */

function getTimeToTargetValue(habitat, creationOrEnhancement, startCondition, endCondition, delayYears, advanceYears) {
  if (!habitat || typeof habitat !== 'string' || !creationOrEnhancement || typeof creationOrEnhancement !== 'string' || !endCondition || typeof endCondition !== 'string' || !delayYears || typeof delayYears !== 'number' || !advanceYears || typeof advanceYears !== 'number') {
    return 0
  }
  
  // Only accept "Creation" or "Enhancement"
  if (creationOrEnhancement !== 'Creation' && creationOrEnhancement !== 'Enhancement') {
    return 0
  }

  // For Enhancement, startCondition is required
  if (creationOrEnhancement === 'Enhancement' && (!startCondition || typeof startCondition !== 'string')) {
    return 0
  }

  let timeToTargetValue;
  if (creationOrEnhancement === 'Creation') {
    timeToTargetValue = creationTimeToTarget[habitat]?.[endCondition];
  } else {
    timeToTargetValue = enhancementTimeToTarget[habitat]?.[startCondition]?.[endCondition];
  }
  
  // Return 0 if not found or "Not Possible"
  if (timeToTargetValue === undefined || timeToTargetValue === null || timeToTargetValue === "Not Possible") {
    throw new Error(`Time to target not found for habitat: ${habitat}, creationOrEnhancement: ${creationOrEnhancement}, startCondition: ${startCondition}, endCondition: ${endCondition}`)
  }

  // If timeToTarget is not a number or "30+", return 0
  if (typeof timeToTargetValue !== 'number' && timeToTargetValue === "30+") {
    return 0
  }

  // Considering "30+" as 30 years (not sure if this is correct)
  if (timeToTargetValue === "30+") {
    timeToTargetValue = 30
  } 

  // Now need to factor in the delay and advance years
  timeToTargetValue = timeToTargetValue + delayYears - advanceYears
  
  if (timeToTargetValue < 0) {
    timeToTargetValue = 0
  }
  
  if (timeToTargetValue > 30) {
    timeToTargetValue = ">30"
  }

  return timeToTargetValue
}


/**
 * Get the time multiplier for a given habitat and creation/enhancement type
 * @param {string} habitat - The habitat name (e.g., "Grassland - Modified grassland")
 * @param {string} creationOrEnhancement - Either "Creation" or "Enhancement"
 * @param {string} [startCondition] - The starting condition (optional, only needed for Enhancement)
 * @param {string} endCondition - The target condition (required for both Creation and Enhancement)
 * @param {number} delayYears - The number of years to delay the project
 * @param {number} advanceYears - The number of years to advance the project
 * @returns {number} The time multiplier, or 0 if habitat/type not found
 */
function getTimeMultiplier(habitat, creationOrEnhancement, startCondition, endCondition, delayYears, advanceYears) {
  if (!habitat || typeof habitat !== 'string' || !creationOrEnhancement || typeof creationOrEnhancement !== 'string') {
    return 0
  }
  
  // Only accept "Creation" or "Enhancement"
  if (creationOrEnhancement !== 'Creation' && creationOrEnhancement !== 'Enhancement') {
    return 0
  }

  // endCondition is required for both Creation and Enhancement
  if (!endCondition || typeof endCondition !== 'string') {
    return 0
  }

  // For Enhancement, startCondition is required
  if (creationOrEnhancement === 'Enhancement' && (!startCondition || typeof startCondition !== 'string')) {
    return 0
  }

  let timeToTargetValue = getTimeToTargetValue(habitat, creationOrEnhancement, startCondition, endCondition, delayYears, advanceYears)
  if (timeToTargetValue === 0) {
    return 0
  }

  let timeMultiplier =  timeToTarget[timeToTargetValue]
  if (timeMultiplier === undefined || timeMultiplier === null || timeMultiplier === "Not Possible") {
    throw new Error(`Time multiplier not found for habitat: ${habitat}, creationOrEnhancement: ${creationOrEnhancement}, startCondition: ${startCondition}, endCondition: ${endCondition}, delayYears: ${delayYears}, advanceYears: ${advanceYears}`)
  }

  return timeMultiplier
}

/**
 * Get the difficulty multiplier for a given habitat and creation/enhancement type
 * @param {string} habitat - The habitat name (e.g., "Grassland - Modified grassland")
 * @param {string} creationOrEnhancement - Either "Creation" or "Enhancement"
 * @param {string} [startCondition] - The starting condition (optional, only needed for Enhancement)
 * @param {string} endCondition - The target condition (required for both Creation and Enhancement)
 * @param {number} advanceYears - The number of years to advance the project
 * @param {number} delayYears - The number of years to delay the project
 * @returns {number} The difficulty multiplier, or 0 if habitat/type not found
 */
function getDifficultyMultiplier(habitat, creationOrEnhancement, startCondition, endCondition, advanceYears, delayYears) {
  if (!habitat || typeof habitat !== 'string' || !creationOrEnhancement || typeof creationOrEnhancement !== 'string' || !advanceYears || typeof advanceYears !== 'number' || !delayYears || typeof delayYears !== 'number') {    
    return 0
  }

  // Only accept "Creation" or "Enhancement"
  if (creationOrEnhancement !== 'Creation' && creationOrEnhancement !== 'Enhancement') {
    return 0
  }

  // endCondition is required for both Creation and Enhancement
  if (!endCondition || typeof endCondition !== 'string') {
    return 0
  }

  // For Enhancement, startCondition is required
  if (creationOrEnhancement === 'Enhancement' && (!startCondition || typeof startCondition !== 'string')) {
    return 0
  }

  let difficultyDesc

  let timeToTargetValue = getTimeToTargetValue(habitat, creationOrEnhancement, startCondition, endCondition, delayYears, advanceYears)
  if (advanceYears >= timeToTargetValue) {
    difficultyDesc = "Low"
  }
  else {
    if (creationOrEnhancement === 'Creation') {
      let poorTargetYears = getTimeToTargetValue(habitat, creationOrEnhancement, startCondition, "Poor", delayYears, advanceYears)
      if (advanceYears >= poorTargetYears) {
        creationOrEnhancement = "Enhancement"
      }
    }

    // Look up the habitat in habitatDifficulty
    difficultyDesc = habitatDifficulty[habitat][creationOrEnhancement]
    if (!difficultyDesc) {
      throw new Error(`Difficulty not found for habitat: ${habitat}, creationOrEnhancement: ${creationOrEnhancement}`)
    }

  }
  
  let difficultyMultiplier = habitatDifficultyMultiplier[difficultyDesc]
  
  if (difficultyMultiplier === undefined || difficultyMultiplier === null || difficultyMultiplier === "Not Possible") {
    throw new Error(`Difficulty multiplier not found for habitat: ${habitat}, creationOrEnhancement: ${creationOrEnhancement}`)
  }

  return difficultyMultiplier
}

function getBaselineUnits(habitat, size, condition) {
  if (
    !habitat ||
    typeof habitat !== 'string' ||
    typeof size !== 'number' ||
    size <= 0 ||
    !condition ||
    typeof condition !== 'string'
  ) {
    return 0;
  }

  const distinctivenessScore = getDistinctivenessMultiplier(habitat);
  const conditionScore = getConditionMultiplier(habitat, condition);
  const strategicSignificanceScore = 1;

  return size * distinctivenessScore * conditionScore * strategicSignificanceScore;
}

function getRetentionUnits(habitat, areaHa, condition, habitatBefore, conditionBefore) {
  if (
    !habitat ||
    typeof habitat !== 'string' ||
    typeof areaHa !== 'number' ||
    !condition ||
    typeof condition !== 'string' ||
    !habitatBefore ||
    typeof habitatBefore !== 'string' ||
    !conditionBefore ||
    typeof conditionBefore !== 'string'
  ) {
    return 0;
  }

  const distinctivenessScore = getDistinctivenessMultiplier(habitat);
  const conditionScore = getConditionMultiplier(habitat, condition);
  const strategicSignificanceScore = 1;

  const beforeDistinctivenessScore = getDistinctivenessMultiplier(habitatBefore);
  const beforeConditionScore = getConditionMultiplier(habitatBefore, conditionBefore);

  const afterUnits =
    areaHa * distinctivenessScore * conditionScore * strategicSignificanceScore;
  const beforeUnits =
    areaHa * beforeDistinctivenessScore * beforeConditionScore * strategicSignificanceScore;

  //const retentionUnits = afterUnits - beforeUnits;
  //return retentionUnits;
  return afterUnits;
}

function getCreationUnits(
  habitatBefore,
  areaHa,
  conditionBefore,
  habitatAfter,
  conditionAfter,
  delayYears,
  advanceYears
) {
  if (
    !habitatBefore ||
    typeof habitatBefore !== 'string' ||
    !habitatAfter ||
    typeof habitatAfter !== 'string' ||
    !conditionBefore ||
    typeof conditionBefore !== 'string' ||
    !conditionAfter ||
    typeof conditionAfter !== 'string' ||
    typeof delayYears !== 'number' ||
    typeof advanceYears !== 'number'
  ) {
    return 0;
  }

  const beforeDistinctivenessScore = getDistinctivenessMultiplier(habitatBefore);
  const beforeConditionScore = getConditionMultiplier(habitatBefore, conditionBefore);
  const beforeStrategicSignificanceScore = 1;

  const afterDistinctivenessScore = getDistinctivenessMultiplier(habitatAfter);
  const afterConditionScore = getConditionMultiplier(habitatAfter, conditionAfter);
  const afterStrategicSignificanceScore = 1;
  const timeScore = getTimeMultiplier(
    habitatAfter,
    'Creation',
    null,
    conditionAfter,
    delayYears,
    advanceYears
  );
  const difficultyScore = getDifficultyMultiplier(
    habitatAfter,
    'Creation',
    null,
    conditionAfter,
    delayYears,
    advanceYears
  );

  const beforeUnits =
    areaHa *
    beforeDistinctivenessScore *
    beforeConditionScore *
    beforeStrategicSignificanceScore;
  const afterUnits =
    areaHa *
    afterDistinctivenessScore *
    afterConditionScore *
    afterStrategicSignificanceScore *
    timeScore *
    difficultyScore;

  //const creationUnits = afterUnits - beforeUnits;
  //return creationUnits;
  return afterUnits
}

function getEnhancementUnits(habitatBefore, conditionBefore, habitatAfter, areaHa, conditionAfter, delayYears, advanceYears) {
  
  // if (!habitatBefore || typeof habitatBefore !== 'string' || !conditionBefore || typeof conditionBefore !== 'string' || !habitatAfter || typeof habitatAfter !== 'string' || !areaHa || typeof areaHa !== 'number' || !conditionAfter || typeof conditionAfter !== 'string' || !delayYears || typeof delayYears !== 'number' || !advanceYears || typeof advanceYears !== 'number') {
  //   return 0
  // }
  
  let beforeDistinctivenessScore = getDistinctivenessMultiplier(habitatBefore)
  let beforeConditionScore = getConditionMultiplier(habitatBefore, conditionBefore)
  let beforeStrategicSignificanceScore = 1

  let afterDistinctivenessScore = getDistinctivenessMultiplier(habitatAfter)
  let afterConditionScore = getConditionMultiplier(habitatAfter, conditionAfter)
  let afterStrategicSignificanceScore = 1
  let timeScore = getTimeMultiplier(habitatAfter, "Enhancement", conditionBefore, conditionAfter, delayYears, advanceYears)
  let difficultyScore = getDifficultyMultiplier(habitatAfter, "Enhancement", conditionBefore, conditionAfter, delayYears, advanceYears)

  let beforeUnits = areaHa * beforeDistinctivenessScore * beforeConditionScore * beforeStrategicSignificanceScore
  let afterUnits = (((areaHa * afterDistinctivenessScore * afterConditionScore)
    - (areaHa * beforeDistinctivenessScore * beforeConditionScore)
    * (timeScore * difficultyScore))
    + (areaHa * beforeDistinctivenessScore * beforeConditionScore))
    * afterStrategicSignificanceScore
  
  //let enhancementUnits = afterUnits - beforeUnits
  //return enhancementUnits
  return afterUnits;
} 

module.exports = {
  getDistinctivenessMultiplier,
  getConditionMultiplier,
  getTimeMultiplier,
  getDifficultyMultiplier,
  getBaselineUnits,
  getRetentionUnits,
  getCreationUnits,
  getEnhancementUnits,
  // expose raw tables for routes that need them
  distinctivenesScores,
  distinctivenessCategories,
  conditionScores,
  habitatDifficultyMultiplier,
  habitatDifficulty,
  creationTimeToTarget,
  enhancementTimeToTarget,
  timeToTarget
};
