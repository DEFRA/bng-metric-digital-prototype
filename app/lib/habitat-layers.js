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
 * The stage of a layer from the suffix of its name, ignoring case. Each
 * layer of a BNG Service file ends with its stage, for example
 * "Hedgerows Baseline".
 * @param {string} name - The layer name
 * @returns {string|undefined} The stage, or undefined for a legacy layer
 */
function layerStage(name) {
  const lowerName = name.toLowerCase()
  return [STAGE_BASELINE, STAGE_POST_INTERVENTION].find((stage) =>
    lowerName.endsWith(' ' + stage)
  )
}

/**
 * Whether the layers come from a BNG Service file, which holds both stages.
 * @param {Array} layers - Layers, each with a name
 * @returns {boolean}
 */
function hasStageLayers(layers) {
  return layers.some((l) => layerStage(l.name))
}

/**
 * Find the layer of a stage whose name contains one of the keywords.
 * In a BNG Service file, only a layer of the stage matches, so a missing
 * layer gives undefined and never the layer of the other stage.
 * @param {Array} layers - Layers, each with a name
 * @param {string} stage - "baseline" or "post-intervention"
 * @param {Array<string>} keywords - Lower case parts of the layer name
 * @returns {Object|undefined} The layer, or undefined if there is none
 */
function findStageLayer(layers, stage, keywords) {
  const matchesKeyword = (l) =>
    keywords.some((keyword) => l.name.toLowerCase().includes(keyword))

  if (hasStageLayers(layers)) {
    return layers.find((l) => layerStage(l.name) === stage && matchesKeyword(l))
  }

  // Legacy template: the file holds one stage, so take its layer.
  return layers.find(matchesKeyword)
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

  // A BNG Service file without the layer of the stage: do not take the
  // layer of the other stage.
  if (hasStageLayers(layers)) {
    return undefined
  }

  // Legacy template: the file holds one stage, so take its habitat layer.
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
  layerStage,
  hasStageLayers,
  findStageLayer,
  findHabitatLayer
}
