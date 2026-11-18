const test = require('node:test')
const assert = require('node:assert/strict')
const {
  registerOnSitePostInterventionRoutes
} = require('../app/routes/on-site-post-intervention')

// Capture the handlers the module registers, keyed "METHOD /path", and call
// them with the request and response shapes express would give them.
function handlers() {
  const captured = new Map()
  const record =
    (method) =>
    (routePath, ...chain) => {
      captured.set(`${method} ${routePath}`, chain.at(-1))
    }
  registerOnSitePostInterventionRoutes({
    get: record('GET'),
    post: record('POST')
  })
  return (key) => {
    const handler = captured.get(key)
    assert.ok(handler, `no handler registered for ${key}`)
    return handler
  }
}

function fakeResponse() {
  return {
    statusCode: 200,
    body: null,
    redirectedTo: null,
    status(code) {
      this.statusCode = code
      return this
    },
    send(body) {
      this.body = body
      return this
    },
    redirect(target) {
      this.redirectedTo = target
      return this
    },
    render(view, model) {
      this.model = model
      return this
    }
  }
}

function parcel(ref, properties = {}) {
  return {
    type: 'Feature',
    properties: { 'Parcel Ref': ref, ...properties },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [100, 0],
          [100, 100],
          [0, 100],
          [0, 0]
        ]
      ]
    }
  }
}

function editRequest(layers, geometries, parcelRef) {
  return {
    params: { parcelRef },
    body: {
      broad_habitat: 'Urban',
      habitat_type: 'Urban - Bare ground',
      target_condition: 'Moderate',
      advance_or_delay: 'neither'
    },
    session: {
      data: {
        geopackageLayersPostIntervention: layers,
        geopackageGeometriesPostIntervention: geometries
      },
      save: (callback) => callback()
    }
  }
}

const EDIT = 'POST /on-site-post-intervention/habitat/:parcelRef/edit'

test('the post-intervention edit does not change a baseline feature of a BNG Service file', () => {
  const baselineFeature = parcel('H1', {
    'Baseline Habitat Type': 'Bare ground'
  })
  const before = structuredClone(baselineFeature)
  const layers = [
    { name: 'Red Line Boundary' },
    { name: 'Area Habitats Baseline' },
    { name: 'Area Habitats Post-Intervention' }
  ]
  const geometries = {
    'Area Habitats Baseline': { features: [baselineFeature] },
    'Area Habitats Post-Intervention': { features: [parcel('P1')] }
  }
  const req = editRequest(layers, geometries, 'H1')
  const res = fakeResponse()

  handlers()(EDIT)(req, res)

  assert.equal(res.statusCode, 404)
  assert.deepEqual(baselineFeature, before)
})

test('the post-intervention edit changes a feature of the post-intervention layer of a BNG Service file', () => {
  const postFeature = parcel('P1')
  const layers = [
    { name: 'Area Habitats Baseline' },
    { name: 'Area Habitats Post-Intervention' }
  ]
  const geometries = {
    'Area Habitats Baseline': { features: [parcel('H1')] },
    'Area Habitats Post-Intervention': { features: [postFeature] }
  }
  const res = fakeResponse()

  handlers()(EDIT)(editRequest(layers, geometries, 'P1'), res)

  assert.equal(res.redirectedTo, '/on-site-post-intervention/habitats-summary')
  assert.equal(postFeature.properties['Proposed Habitat Type'], 'Bare ground')
})

test('the post-intervention edit searches every layer of a legacy file', () => {
  const feature = parcel('P1')
  const layers = [{ name: 'Red Line Boundary' }, { name: 'Proposed' }]
  const geometries = { Proposed: { features: [feature] } }
  const res = fakeResponse()

  handlers()(EDIT)(editRequest(layers, geometries, 'P1'), res)

  assert.equal(res.redirectedTo, '/on-site-post-intervention/habitats-summary')
  assert.equal(feature.properties['Proposed Habitat Type'], 'Bare ground')
})

test('confirm-layers does not show the habitat layer of the other stage of a BNG Service file', () => {
  const req = {
    session: {
      data: {
        geopackageLayersPostIntervention: [
          { name: 'Red Line Boundary', featureCount: 1, totalAreaSqm: 10000 },
          {
            name: 'Area Habitats Baseline',
            featureCount: 3,
            totalAreaSqm: 10000
          }
        ],
        geopackageGeometriesPostIntervention: {}
      }
    }
  }
  const res = fakeResponse()

  handlers()('GET /on-site-post-intervention/confirm-layers')(req, res)

  assert.equal(res.model.layers.habitatParcels.layerName, 'Not found')
  assert.equal(res.model.layers.habitatParcels.polygonCount, 0)
})
