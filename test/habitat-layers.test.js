const test = require('node:test')
const assert = require('node:assert/strict')
const {
  STAGE_BASELINE,
  STAGE_POST_INTERVENTION,
  isStageHabitatLayer,
  layerStage,
  findStageLayer,
  findHabitatLayer
} = require('../app/lib/habitat-layers')

// The layers of a BNG Service file, which holds both stages.
const bngServiceLayers = [
  { name: 'Red Line Boundary' },
  { name: 'Area Habitats Baseline' },
  { name: 'Area Habitats Post-Intervention' },
  { name: 'Vertical Area Habitats Baseline' },
  { name: 'Hedgerows Baseline' },
  { name: 'Hedgerows Post-Intervention' }
]

// The layers of a legacy file, which holds one stage.
const legacyLayers = [
  { name: 'Red Line Boundary' },
  { name: 'Habitats' },
  { name: 'Hedgerows' }
]

test('findHabitatLayer gives the area habitat layer of each stage of a BNG Service file', () => {
  assert.equal(
    findHabitatLayer(bngServiceLayers, STAGE_BASELINE).name,
    'Area Habitats Baseline'
  )
  assert.equal(
    findHabitatLayer(bngServiceLayers, STAGE_POST_INTERVENTION).name,
    'Area Habitats Post-Intervention'
  )
})

test('findHabitatLayer ignores the case of the layer names', () => {
  const layers = [
    { name: 'area habitats post-intervention' },
    { name: 'AREA HABITATS BASELINE' }
  ]
  assert.equal(
    findHabitatLayer(layers, STAGE_BASELINE).name,
    'AREA HABITATS BASELINE'
  )
  assert.equal(
    findHabitatLayer(layers, STAGE_POST_INTERVENTION).name,
    'area habitats post-intervention'
  )
})

test('findHabitatLayer gives the Habitats layer of a legacy file for each stage', () => {
  assert.equal(findHabitatLayer(legacyLayers, STAGE_BASELINE).name, 'Habitats')
  assert.equal(
    findHabitatLayer(legacyLayers, STAGE_POST_INTERVENTION).name,
    'Habitats'
  )
  assert.equal(
    findHabitatLayer([{ name: 'Habitat Parcels' }], STAGE_BASELINE).name,
    'Habitat Parcels'
  )
})

test('findHabitatLayer gives undefined when no layer holds habitats', () => {
  assert.equal(
    findHabitatLayer([{ name: 'Red Line Boundary' }], STAGE_BASELINE),
    undefined
  )
})

test('findHabitatLayer does not give the other stage when a BNG Service file lacks the stage', () => {
  assert.equal(
    findHabitatLayer(
      [{ name: 'Red Line Boundary' }, { name: 'Area Habitats Baseline' }],
      STAGE_POST_INTERVENTION
    ),
    undefined
  )
  assert.equal(
    findHabitatLayer(
      [
        { name: 'Red Line Boundary' },
        { name: 'Area Habitats Post-Intervention' }
      ],
      STAGE_BASELINE
    ),
    undefined
  )
})

test('findStageLayer gives the layer of each stage of a BNG Service file', () => {
  assert.equal(
    findStageLayer(bngServiceLayers, STAGE_BASELINE, ['hedgerow']).name,
    'Hedgerows Baseline'
  )
  assert.equal(
    findStageLayer(bngServiceLayers, STAGE_POST_INTERVENTION, ['hedgerow'])
      .name,
    'Hedgerows Post-Intervention'
  )
})

test('findStageLayer does not give the other stage when a BNG Service file lacks the stage', () => {
  const layers = [{ name: 'Red Line Boundary' }, { name: 'Hedgerows Baseline' }]
  assert.equal(
    findStageLayer(layers, STAGE_POST_INTERVENTION, ['hedgerow']),
    undefined
  )
  assert.equal(
    findStageLayer([{ name: 'Hedgerows Post-Intervention' }], STAGE_BASELINE, [
      'hedgerow'
    ]),
    undefined
  )
})

test('findStageLayer gives the layer of a legacy file for each stage', () => {
  assert.equal(
    findStageLayer(legacyLayers, STAGE_BASELINE, ['hedgerow']).name,
    'Hedgerows'
  )
  assert.equal(
    findStageLayer(legacyLayers, STAGE_POST_INTERVENTION, ['hedgerow']).name,
    'Hedgerows'
  )
  assert.equal(
    findStageLayer(legacyLayers, STAGE_BASELINE, ['river']),
    undefined
  )
})

test('layerStage reads the stage from the end of the layer name', () => {
  assert.equal(layerStage('Hedgerows Baseline'), STAGE_BASELINE)
  assert.equal(
    layerStage('AREA HABITATS POST-INTERVENTION'),
    STAGE_POST_INTERVENTION
  )
  assert.equal(layerStage('Hedgerows'), undefined)
  assert.equal(layerStage('Red Line Boundary'), undefined)
})

test('isStageHabitatLayer matches only the layer of the stage', () => {
  assert.equal(
    isStageHabitatLayer('Area Habitats Baseline', STAGE_BASELINE),
    true
  )
  assert.equal(
    isStageHabitatLayer('Area Habitats Baseline', STAGE_POST_INTERVENTION),
    false
  )
  assert.equal(isStageHabitatLayer('Habitats', STAGE_BASELINE), false)
  assert.equal(isStageHabitatLayer('Area Habitats Baseline', undefined), false)
})
