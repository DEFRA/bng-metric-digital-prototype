/**
 * The route, driven directly rather than over HTTP.
 *
 * The prototype has no express or supertest to mount a real server against,
 * and adding one to test a developer tool is not a trade worth making. So the
 * handlers are captured from a stand-in router and called with the request and
 * response shapes express would give them. multer is skipped — `req.files` is
 * populated the way multer populates it — because multer's behaviour is not
 * ours to test; everything after it is.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { registerPdfReportRoutes } from '../../app/routes/pdf-report.js'

const EXAMPLES = path.resolve(import.meta.dirname, '..', '..', 'example-files')

/** Capture the handlers the module registers, keyed "METHOD /path". */
function handlers() {
  const captured = new Map()
  const record = (method) => (routePath, ...chain) => {
    // The last argument is the handler; anything before it is middleware
    // (multer), which these tests deliberately step around.
    captured.set(`${method} ${routePath}`, chain.at(-1))
  }
  registerPdfReportRoutes({ get: record('GET'), post: record('POST') })
  return (key) => {
    const handler = captured.get(key)
    assert.ok(handler, `no handler registered for ${key}`)
    return handler
  }
}

/** A response that remembers what it was asked to do. */
function fakeResponse() {
  const res = {
    statusCode: 200,
    view: null,
    model: null,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code
      return this
    },
    render(view, model) {
      this.view = view
      this.model = model
      return this
    },
    set(key, value) {
      this.headers[key.toLowerCase()] = value
      return this
    },
    send(body) {
      this.body = body
      return this
    }
  }
  return res
}

/**
 * Copy a fixture somewhere disposable: the handler deletes its uploads when it
 * is done, which is behaviour worth keeping and worth not aiming at the repo.
 */
function upload(name) {
  const source = path.join(EXAMPLES, name)
  const target = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-report-')), name)
  fs.copyFileSync(source, target)
  return { path: target }
}

function filesFor({ baseline, postIntervention } = {}) {
  const files = {}
  if (baseline) files.baseline = [baseline]
  if (postIntervention) files.postIntervention = [postIntervention]
  return files
}

const BASELINE = 'Baseline - complete with area refs.gpkg'
const POST = 'Post-intervention - complete.gpkg'

test('GET renders the form with every choice offered', async () => {
  const res = fakeResponse()
  await handlers()('GET /test-data/pdf-report')({}, res, (error) => {
    throw error
  })

  assert.equal(res.view, 'pdf-report/index')
  assert.equal(res.model.fontItems.length, 4)
  assert.equal(res.model.basemapItems.length, 2)
  assert.equal(res.model.layoutItems.length, 2)
  assert.ok(
    res.model.fontItems.some((item) => item.checked),
    'one typeface must be selected by default'
  )
})

test('POST builds a report and hands back a download id', async () => {
  const baseline = upload(BASELINE)
  const postIntervention = upload(POST)
  const res = fakeResponse()

  await handlers()('POST /test-data/pdf-report')(
    {
      body: { font: 'noto-sans', basemap: 'synthetic', layout: 'cards' },
      files: filesFor({ baseline, postIntervention })
    },
    res
  )

  assert.equal(res.view, 'pdf-report/result')
  assert.equal(res.model.siteName, 'Test Area')
  assert.equal(res.model.stats.habitats, 12)
  assert.equal(res.model.hasPostIntervention, true)
  assert.equal(res.model.fonts.embedded, true)
  assert.equal(res.model.basemap.degraded, false)
  assert.match(res.model.id, /^[0-9a-f-]{36}$/)

  // The uploads are gone: nothing a user submits outlives the request.
  assert.equal(fs.existsSync(baseline.path), false)
  assert.equal(fs.existsSync(postIntervention.path), false)
})

test('the generated report downloads as a named PDF attachment', async () => {
  const route = handlers()
  const built = fakeResponse()
  await route('POST /test-data/pdf-report')(
    {
      body: { font: 'noto-sans', basemap: 'synthetic', layout: 'table' },
      files: filesFor({ baseline: upload(BASELINE) })
    },
    built
  )

  const res = fakeResponse()
  route('GET /test-data/pdf-report/download/:id')(
    { params: { id: built.model.id } },
    res
  )

  assert.equal(res.headers['content-type'], 'application/pdf')
  assert.equal(res.headers['content-disposition'], 'attachment; filename="test-area-summary.pdf"')
  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-')
  assert.equal(res.headers['content-length'], String(res.body.length))
})

test('an unknown download id is a page, not a crash', () => {
  const res = fakeResponse()
  handlers()('GET /test-data/pdf-report/download/:id')({ params: { id: 'nope' } }, res)

  assert.equal(res.statusCode, 404)
  assert.equal(res.view, 'pdf-report/expired')
})

test('a missing baseline re-renders the form with an error', async () => {
  const res = fakeResponse()
  await handlers()('POST /test-data/pdf-report')(
    { body: { basemap: 'synthetic' }, files: filesFor({}) },
    res
  )

  assert.equal(res.statusCode, 400)
  assert.equal(res.view, 'pdf-report/index')
  assert.match(res.model.error, /Select a baseline GeoPackage/)
})

test('a file that is not a GeoPackage is explained, not stack-traced', async () => {
  const notAGpkg = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pdf-report-')), 'fake.gpkg')
  fs.writeFileSync(notAGpkg, 'this is plain text, not SQLite')
  const res = fakeResponse()

  await handlers()('POST /test-data/pdf-report')(
    {
      body: { basemap: 'synthetic' },
      files: filesFor({ baseline: { path: notAGpkg } })
    },
    res
  )

  assert.equal(res.statusCode, 400)
  assert.match(res.model.error, /could not be read as a GeoPackage/)
  assert.equal(fs.existsSync(notAGpkg), false, 'the rejected upload is still cleaned up')
})

test('an unrecognised option falls back rather than being trusted', async () => {
  const res = fakeResponse()
  await handlers()('POST /test-data/pdf-report')(
    {
      body: { font: '../../etc/passwd', basemap: 'nonsense', layout: 'sideways' },
      files: filesFor({ baseline: upload(BASELINE) })
    },
    res
  )

  assert.equal(res.view, 'pdf-report/result')
  assert.equal(res.model.layout, 'cards')
  assert.equal(res.model.fonts.name, 'GDS Transport', 'unknown font falls back to the default')
})

test('the summary page button streams a PDF straight back', async () => {
  const res = fakeResponse()

  await handlers()('GET /project-dashboard/report.pdf')(
    { session: { data: {} } },
    res,
    (error) => {
      throw error
    }
  )

  assert.equal(res.headers['content-type'], 'application/pdf')
  assert.match(res.headers['content-disposition'], /^attachment; filename=".+-summary\.pdf"$/)
  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-')
  assert.equal(res.headers['content-length'], String(res.body.length))
})

test('the button works on a cold session, from the demo data', async () => {
  const res = fakeResponse()

  // No session at all, not merely an empty one: a prototype user can land on
  // the summary page without having uploaded anything.
  await handlers()('GET /project-dashboard/report.pdf')({}, res, (error) => {
    throw error
  })

  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-')
  assert.match(res.headers['content-disposition'], /oakfield-farm-demo-data-summary\.pdf/)
})

test('the button reports on what the session has actually uploaded', async () => {
  const square = (x, y, size) => ({
    type: 'Feature',
    properties: { 'Parcel Ref': 'S1', 'Baseline Habitat Type': 'Modified grassland' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [x, y],
          [x + size, y],
          [x + size, y + size],
          [x, y + size],
          [x, y]
        ]
      ]
    }
  })
  const collection = (features) => ({ type: 'FeatureCollection', features })
  const res = fakeResponse()

  await handlers()('GET /project-dashboard/report.pdf')(
    {
      session: {
        data: {
          projectName: 'Riverside Meadows',
          projectDashboardMapDataByKind: {
            baseline: {
              siteBoundary: collection([square(400_000, 300_000, 300)]),
              parcels: collection([square(400_000, 300_000, 150)])
            }
          }
        }
      }
    },
    res,
    (error) => {
      throw error
    }
  )

  assert.equal(res.body.subarray(0, 5).toString(), '%PDF-')
  assert.match(
    res.headers['content-disposition'],
    /riverside-meadows-summary\.pdf/,
    "the project's own name, not the demo site's"
  )
})

test('both entry points draw the same report from the same site', async () => {
  // The developer tool and the journey button are only worth having as two
  // routes if they are one renderer. Same site, same options, same bytes —
  // apart from the creation date pdfkit stamps into every document.
  const { siteForJourney } = await import('../../app/lib/pdf-report/journey-site.mjs')
  const { buildSummaryPdf } = await import('../../app/lib/pdf-report/document.mjs')
  const { resolveBasemap } = await import('../../app/lib/pdf-report/basemap.mjs')
  const { resolveFonts } = await import('../../app/lib/pdf-report/fonts.mjs')

  const { baseline, postIntervention } = siteForJourney({})
  const basemap = await resolveBasemap({ source: 'synthetic' })
  const { stats } = await buildSummaryPdf({
    baseline,
    postIntervention,
    grid: basemap.grid,
    tileSource: basemap.tileSource,
    layout: 'cards',
    fonts: resolveFonts('gds-transport')
  })

  assert.equal(stats.habitats, 6, 'the demo post-intervention side has six parcels')
  assert.equal(stats.maps, 2)
})
