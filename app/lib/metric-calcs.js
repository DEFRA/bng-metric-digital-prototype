const { conditionScores } = require('./metric-values-habitat-condition');
const { distinctivenesScores, distinctivenessCategories } = require('./metric-values-habitat-distinctiveness');
const { habitatDifficultyMultiplier, habitatDifficulty } = require('./metric-values-habitat-difficulty');
const { creationTimeToTarget } = require('./metric-values-habitat-creation-time');
const { enhancementTimeToTarget } = require('./metric-values-habitat-enhancement-time');
const { timeToTarget } = require('./metric-values-habitat-time'); 

/**
 * Validate the size parameter
 * @param {number} size - The size of the habitat
 * @throws {Error} If size is not a number or is less than or equal to 0
 */
function validateSize(size){
  if (size <= 0) {
    throw new Error(`Size must be greater than 0`)
  }
}

/**
 * Validate the habitat parameter
 * @param {string} habitat - The habitat name (e.g., "Grassland - Bracken")
 * @throws {Error} If habitat is not a string or is not a valid habitat
 */
function validateHabitat(habitat){
  if (!habitat){
    throw new Error(`habitat not specified`)
  }
  else if (typeof habitat !== 'string' || !Object.prototype.hasOwnProperty.call(distinctivenessCategories, habitat)) {
    throw new Error(`Habitat '${habitat}' is not a valid habitat`)
  }
}

/**
 * Validate the condition parameter
 * @param {string} habitat - The habitat name (e.g., "Grassland - Bracken")
 * @param {string} condition - The condition name (e.g., "Moderate")
 * @throws {Error} If condition is not a string or is not a valid condition for the habitat
 */
function validateCondition(habitat, condition){
  if (!condition){
    throw new Error(`condition not specified`)
  }
  else if (condition === null || condition === undefined || typeof condition !== 'string' || !Object.prototype.hasOwnProperty.call(conditionScores[habitat], condition)) {
    throw new Error(`Condition '${condition}' is not a valid condition for habitat: ${habitat}`)
  }
}

/**
 * 
 * @param {string} changeType - The type of habitat change (e.g., "Creation" or "Enhancement")
 * @throws {Error} If changeType is not a string or is not a valid change type
 */
function validateHabitatChange(changeType){

  if (!changeType){
    throw new Error(`changeType not specified`)
  }
  else if (typeof changeType !== 'string' || changeType !== 'Creation' && changeType !== 'Enhancement') {
    throw new Error(`Habitat change type '${changeType}' is not a valid change type`)
  }

}

/**
 * 
 * @param {any} years - The years to validate (e.g., 0, 10, 30, "30+")
 * @returns {number} The validated years, or 30 if years is "30+"
 * @throws {Error} If years is not a number or is not a valid number for years. Should be 0 to 30 or '30+'.
 */
function validateYears(years){
  if (typeof years !== 'number' && years !== '30+') {
    throw new Error(`${years} is not a valid number for years. Should be 0 to 30 or '30+'.`)
  }

  if (years === "30+") {
    years = 30
  } 

  return years
}


/**
 * Get the distinctiveness score for a given habitat
 * @param {string} habitat - The habitat name (e.g., "Grassland - Bracken")
 * @returns {number} The distinctiveness score, or 0 if habitat not found
 */
function getDistinctivenessMultiplier(habitat) {
  validateHabitat(habitat)

  // Look up the distinctiveness level (e.g., "Low", "Medium", etc.) from distinctivenessCategories
  const distinctivenessLevel = distinctivenessCategories[habitat]
  if (!distinctivenessLevel) {
    throw new Error(`Distinctiveness level not found for habitat: ${habitat}`)
  }
  
  // Look up the Score from distinctivenesScores using the distinctiveness level
  const distinctivenessData = distinctivenesScores[distinctivenessLevel]
  
  if (!distinctivenessData || typeof distinctivenessData.Score !== 'number') {
    throw new Error(`Distinctiveness data not found for habitat: ${habitat}`)
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
  validateHabitat(habitat)
  validateCondition(habitat, condition)

  // Look up the habitat in conditionScore
  const conditionScore = conditionScores[habitat][condition]
    
  // If the value is "Not Possible" or not a number, return 0
  if (conditionScore === "Not Possible"){
    throw new Error(`Condition '${condition}' is not a valid condition for habitat: ${habitat}`)
  }

  // Return the numeric conditionScore value
  if (typeof conditionScore === 'number') {
    return conditionScore
  }
  else {
    throw new Error(`Condition score is not a number for habitat: ${habitat}, condition: ${condition}`)
  }

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
  
  validateHabitat(habitat)
  validateHabitatChange(creationOrEnhancement)
  validateCondition(habitat, endCondition)
  advanceYears = validateYears(advanceYears)
  delayYears = validateYears(delayYears)

  let timeToTargetValue;
  if (creationOrEnhancement === 'Creation') {
    timeToTargetValue = creationTimeToTarget[habitat]?.[endCondition];
  } else {
    timeToTargetValue = enhancementTimeToTarget[habitat]?.[startCondition]?.[endCondition];
    // Return 0 if not found or "Not Possible"
    if (timeToTargetValue === undefined || timeToTargetValue === null ) {
      throw new Error(`Time to target not found for habitat: ${habitat}, creationOrEnhancement: ${creationOrEnhancement}, startCondition: ${startCondition}, endCondition: ${endCondition}`)
    }
    else if (timeToTargetValue === "Not Possible") {
      timeToTargetValue = 1
    }
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
  else if (timeToTargetValue > 30) {
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

  validateHabitat(habitat)
  validateHabitatChange(creationOrEnhancement)
  validateCondition(habitat, endCondition)
  advanceYears = validateYears(advanceYears)
  delayYears = validateYears(delayYears)

  // For Enhancement, startCondition is required
  if (creationOrEnhancement === 'Enhancement' && (!startCondition || typeof startCondition !== 'string')) {
    throw new Error(`Start condition not specified for enhancement of habitat: ${habitat}`)
  }

  const timeToTargetValue = getTimeToTargetValue(habitat, creationOrEnhancement, startCondition, endCondition, delayYears, advanceYears)

  const timeMultiplier =  timeToTarget[timeToTargetValue]
  
  if (timeMultiplier === undefined || timeMultiplier === null ) {
    throw new Error(`Time multiplier not found for habitat: ${habitat}, creationOrEnhancement: ${creationOrEnhancement}, startCondition: ${startCondition}, endCondition: ${endCondition}`)
  }
  else if (timeMultiplier === "Not Possible") {
    throw new Error(`Time multiplier for habitat '${habitat}' is not possible`)
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
  

  validateHabitat(habitat)
  validateHabitatChange(creationOrEnhancement)
  validateCondition(habitat, endCondition)
  advanceYears = validateYears(advanceYears)
  delayYears = validateYears(delayYears)

  // For Enhancement, startCondition is required
  if (creationOrEnhancement === 'Enhancement' && (!startCondition || typeof startCondition !== 'string')) {
    throw new Error(`Start condition not specified for enhancement of habitat: ${habitat}`)
  }

  let difficultyDesc

  const timeToTargetValue = getTimeToTargetValue(habitat, creationOrEnhancement, startCondition, endCondition, delayYears, advanceYears)
  if (advanceYears >= timeToTargetValue) {
    difficultyDesc = "Low"
  }
  else {
    if (creationOrEnhancement === 'Creation') {
      const poorTargetYears = getTimeToTargetValue(habitat, creationOrEnhancement, startCondition, "Poor", delayYears, advanceYears)
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

/**
 * Get the baseline units for a given habitat and condition
 * @param {string} habitat - The habitat name (e.g., "Grassland - Modified grassland")
 * @param {number} size - The size of the habitat
 * @param {string} condition - The condition name (e.g., "Moderate")
 * @returns {number} The baseline units
 * @throws {Error} If habitat/condition not found or not a valid habitat/condition
 */
function getBaselineUnits(habitat, size, condition) {

  validateHabitat(habitat)
  validateCondition(habitat, condition)
  validateSize(size)

  const distinctivenessScore = getDistinctivenessMultiplier(habitat);
  const conditionScore = getConditionMultiplier(habitat, condition);
  const strategicSignificanceScore = 1;

  return size * distinctivenessScore * conditionScore * strategicSignificanceScore;
}

/**
 * Get the creation units for a given habitat and condition
 * @param {number} areaHa - The area of the habitat in hectares
 * @param {string} habitatAfter - The habitat name after the change (e.g., "Grassland - Modified grassland")
 * @param {string} conditionAfter - The condition name after the change (e.g., "Moderate")
 * @param {number} delayYears - The number of years to delay the project
 * @param {number} advanceYears - The number of years to advance the project
 * @returns {number} The creation units
 * @throws {Error} If habitat/condition not found or not a valid habitat/condition
 */
function getCreationUnits(areaHa, habitatAfter, conditionAfter, delayYears, advanceYears) {
  
  validateSize(areaHa)
  validateHabitat(habitatAfter)
  validateCondition(habitatAfter, conditionAfter)
  delayYears = validateYears(delayYears)
  advanceYears = validateYears(advanceYears)

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
    advanceYears,
    delayYears
  );

  const afterUnits =
    areaHa *
    afterDistinctivenessScore *
    afterConditionScore *
    afterStrategicSignificanceScore *
    timeScore *
    difficultyScore;

  return afterUnits
}

/**
 * Get the enhancement units for a given habitat and condition
 * @param {string} habitatBefore - The habitat name before the change (e.g., "Grassland - Modified grassland")
 * @param {string} conditionBefore - The condition name before the change (e.g., "Moderate")
 * @param {string} habitatAfter - The habitat name after the change (e.g., "Grassland - Modified grassland")
 * @param {number} areaHa - The area of the habitat in hectares
 * @param {string} conditionAfter - The condition name after the change (e.g., "Moderate")
 * @param {number} delayYears - The number of years to delay the project
 * @param {number} advanceYears - The number of years to advance the project
 * @returns {number} The enhancement units
 * @throws {Error} If habitat/condition not found or not a valid habitat/condition
 */
function getEnhancementUnits(habitatBefore, conditionBefore, habitatAfter, areaHa, conditionAfter, delayYears, advanceYears) {
  
  validateHabitat(habitatBefore)
  validateCondition(habitatBefore, conditionBefore)
  validateHabitat(habitatAfter)
  validateCondition(habitatAfter, conditionAfter)
  validateSize(areaHa)
  delayYears = validateYears(delayYears)
  advanceYears = validateYears(advanceYears)
  
  let beforeDistinctivenessScore = getDistinctivenessMultiplier(habitatBefore)
  let beforeConditionScore = getConditionMultiplier(habitatBefore, conditionBefore)
  
  let afterDistinctivenessScore = getDistinctivenessMultiplier(habitatAfter)
  let afterConditionScore = getConditionMultiplier(habitatAfter, conditionAfter)
  let afterStrategicSignificanceScore = 1
  let timeScore = getTimeMultiplier(habitatAfter, "Enhancement", conditionBefore, conditionAfter, delayYears, advanceYears)
  let difficultyScore = getDifficultyMultiplier(habitatAfter, "Enhancement", conditionBefore, conditionAfter, delayYears, advanceYears)

  // let beforeUnits = areaHa * beforeDistinctivenessScore * beforeConditionScore * beforeStrategicSignificanceScore
  let afterUnits = 
    ((((areaHa * afterDistinctivenessScore * afterConditionScore)
    - (areaHa * beforeDistinctivenessScore * beforeConditionScore))
    * (timeScore * difficultyScore))
    + (areaHa * beforeDistinctivenessScore * beforeConditionScore))
    * afterStrategicSignificanceScore
  
  return afterUnits;
} 

module.exports = {
  getDistinctivenessMultiplier,
  getConditionMultiplier,
  getTimeMultiplier,
  getDifficultyMultiplier,
  getBaselineUnits,
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
