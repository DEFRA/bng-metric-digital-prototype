/**
 * The BNG Service template holds both stages in one file, with an area
 * habitat layer for each stage. The legacy template has one stage per file.
 */
const STAGE_BASELINE = 'baseline'
const STAGE_POST_INTERVENTION = 'post-intervention'

/**
 * Layer names in lower case: compare them with `isStageHabitatLayer`.
 */
const STAGE_HABITAT_LAYERS = {
  [STAGE_BASELINE]: 'area habitats baseline',
  [STAGE_POST_INTERVENTION]: 'area habitats post-intervention'
}

/**
 * Whether a layer is the area habitat layer of a stage, ignoring case.
 * @param {string} name - The layer name
 * @param {string} stage - "baseline" or "post-intervention"
 * @returns {boolean}
 */
function isStageHabitatLayer(name, stage) {
  return name.toLowerCase() === STAGE_HABITAT_LAYERS[stage]
}

/**
 * Find the area habitat layer for a stage.
 * @param {Array} layers - Layers, each with a name
 * @param {string} stage - "baseline" or "post-intervention"
 * @returns {Object|undefined} The layer, or undefined if there is none
 */
function findHabitatLayer(layers, stage) {
  const stageLayer = layers.find((l) => isStageHabitatLayer(l.name, stage))
  if (stageLayer) {
    return stageLayer
  }

  // Legacy template: the file holds one stage, so take its habitat layer.
  // An unknown stage also uses this rule.
  return layers.find(
    (l) =>
      l.name.toLowerCase().includes('parcel') ||
      l.name.toLowerCase().includes('habitat')
  )
}

module.exports = {
  STAGE_BASELINE,
  STAGE_POST_INTERVENTION,
  STAGE_HABITAT_LAYERS,
  isStageHabitatLayer,
  findHabitatLayer
}
