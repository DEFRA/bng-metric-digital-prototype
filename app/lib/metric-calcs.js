import { conditionScores, conditionMultiplier } from './metric-values-habitat-condition'
import { distinctivenesScores, distinctivenessCategories } from './metric-values-habitat-distinctiveness'
import { habitatDifficultyMultiplier, habitatDifficulty } from './metric-values-habitat-difficulty'
import { creationTimeToTarget } from './metric-values-habitat-creation-time'
import { enhancementTimeToTarget } from './metric-values-habitat-enhancement-time'
import { timeToTarget } from './metric-values-habitat-time' 

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

  // Look up the habitat in conditionMultiplier
  const habitatConditions = conditionMultiplier[habitat]
  
  if (!habitatConditions) {
    return 0
  }

  // Look up the condition for this habitat
  const multiplier = habitatConditions[condition]
  
  // If the value is "Not Possible" or not a number, return 0
  if (multiplier === "Not Possible" || multiplier === null || multiplier === undefined) {
    return 0
  }

  // Return the numeric multiplier value
  if (typeof multiplier === 'number') {
    return multiplier
  }

  return 0
}

/**
 * Get the time multiplier for a given habitat and creation/enhancement type
 * @param {string} habitat - The habitat name (e.g., "Grassland - Modified grassland")
 * @param {string} creationOrEnhancement - Either "Creation" or "Enhancement"
 * @returns {number} The time multiplier, or 0 if habitat/type not found
 */
function getTimeMultiplier(habitat, creationOrEnhancement) {
  if (!habitat || typeof habitat !== 'string' || !creationOrEnhancement || typeof creationOrEnhanced !== 'string') {
    return 0
  }
  
  // Only accept "Creation" or "Enhancement"
  if (creationOrEnhancement !== 'Creation' && creationOrEnhancement !== 'Enhancement') {
    return 0
  }

  if (creationOrEnhancement === 'Creation') {
  }
  else {
  }

  // Look up the habitat in habitatDifficulty
  const habitatData = habitatDifficulty[habitat]
  
  if (!habitatData) {
    return 0
  }

  // Look up the creation/enhancement difficulty level
  const difficultyLevel = habitatData[creationOrEnhancement]
  
  if (!difficultyLevel) {
    return 0
  }

  // Look up the multiplier from habitatDifficultyMultiplier using the difficulty level
  const multiplier = habitatDifficultyMultiplier[difficultyLevel]
  
  if (multiplier === undefined || multiplier === null || typeof multiplier !== 'number') {
    return 0
  }

  return multiplier
}

export {
  getDistinctivenessMultiplier,
  getConditionMultiplier,
  getTimeMultiplier,
}
