/**
 * The BNG Service template holds both stages in one file, with an area
 * habitat layer for each stage. The legacy template has one stage per file.
 */
const STAGE_HABITAT_LAYERS = {
  baseline: 'area habitats baseline',
  'post-intervention': 'area habitats post-intervention'
}

/**
 * Find the area habitat layer for a stage.
 * @param {Array} layers - Layers, each with a name
 * @param {string} stage - "baseline" or "post-intervention"
 * @returns {Object|undefined} The layer, or undefined if there is none
 */
function findHabitatLayer(layers, stage) {
  const stageLayerName = STAGE_HABITAT_LAYERS[stage]
  const stageLayer = layers.find(
    (l) => l.name.toLowerCase() === stageLayerName
  )
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
  STAGE_HABITAT_LAYERS,
  findHabitatLayer
}
