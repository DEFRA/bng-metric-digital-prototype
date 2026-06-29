/**
 * Test-data GeoPackage generator. Wraps bng-library's buffer API in a
 * simple form so testers can produce fixtures from a browser instead of
 * dropping to a shell.
 */

const multer = require('multer')
const archiver = require('archiver')
const { PassThrough } = require('node:stream')

const MAX_WORKBOOK_BYTES = 25 * 1024 * 1024

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_WORKBOOK_BYTES }
})

const DEFAULT_CENTRE_E = 530000
const DEFAULT_CENTRE_N = 180000
const DEFAULT_NUM_PARCELS = 50
const DEFAULT_COUNT = 1
const MAX_COUNT = 10
const MIN_COUNT = 1
const MIN_PARCELS = 1
const MAX_PARCELS = 500
// Default tree count when the field is blank/invalid (mirrors bng-library's
// DEFAULT_TREE_COUNT). Any explicit count is honoured as-is; 0 yields an empty
// Urban Trees layer, and fewer than 4 trees won't cover every size band.
const DEFAULT_NUM_TREES = 5
const MIN_TREES = 0
const MAX_TREES = 500

// Lazy-load the generator so a failed install (or wrong Node version) is
// reported when the route is first hit, not at server startup.
let genPromise = null
function getGenerator() {
  if (!genPromise) {
    genPromise = import('bng-library')
  }
  return genPromise
}

function isEnabled() {
  return process.env.SHOW_TOOLS === 'true'
}

function parseIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed)) return fallback
  return Math.max(min, Math.min(max, parsed))
}

function parseCentre(eastingRaw, northingRaw) {
  const easting = Number.parseFloat(eastingRaw)
  const northing = Number.parseFloat(northingRaw)
  if (!Number.isFinite(easting) || !Number.isFinite(northing)) {
    return [DEFAULT_CENTRE_E, DEFAULT_CENTRE_N]
  }
  return [easting, northing]
}

function normaliseFlawsField(value) {
  // govuk-prototype-kit checkbox groups inject a hidden "_unchecked" value
  // so an empty submission is distinguishable from a missing field.
  const isReal = (v) => Boolean(v) && v !== '_unchecked'
  if (Array.isArray(value)) return value.filter(isReal)
  if (typeof value === 'string' && isReal(value)) return [value]
  return []
}

function groupFlaws(flaws) {
  const toItem = (f) => ({
    value: f.name,
    text: f.name + (f.standalone ? ' (standalone)' : ''),
    hint: { text: `${f.description} — triggers ${f.errorCode}` }
  })
  return {
    geometric: flaws.filter((f) => f.category === 'geometric').map(toItem),
    empty: flaws.filter((f) => f.category === 'empty').map(toItem),
    attribute: flaws.filter((f) => f.category === 'attribute').map(toItem)
  }
}

function sendBuffer(res, { buffer, filenameHint }) {
  res.set('Content-Type', 'application/geopackage+sqlite3')
  res.set('Content-Disposition', `attachment; filename="${filenameHint}"`)
  res.set('Content-Length', String(buffer.length))
  res.send(buffer)
}

function sendZip(res, files, zipFilename) {
  const archive = archiver('zip', { zlib: { level: 9 } })
  const passthrough = new PassThrough()
  archive.pipe(passthrough)

  res.set('Content-Type', 'application/zip')
  res.set('Content-Disposition', `attachment; filename="${zipFilename}"`)
  passthrough.pipe(res)

  for (const file of files) {
    archive.append(file.buffer, { name: file.filenameHint })
  }
  archive.finalize()
}

async function handleSynthetic(req, res, gen) {
  const numParcels = parseIntInRange(
    req.body.numParcels,
    DEFAULT_NUM_PARCELS,
    MIN_PARCELS,
    MAX_PARCELS
  )
  const numTrees = parseIntInRange(
    req.body.numTrees,
    DEFAULT_NUM_TREES,
    MIN_TREES,
    MAX_TREES
  )
  const count = parseIntInRange(
    req.body.count,
    DEFAULT_COUNT,
    MIN_COUNT,
    MAX_COUNT
  )
  const centre = parseCentre(req.body.centreEasting, req.body.centreNorthing)
  const bad = req.body.bad === 'on' || req.body.bad === 'true'
  const flaws = normaliseFlawsField(req.body.flaw)

  // Single file: stream the gpkg directly.
  if (count === 1) {
    const out = gen.generateSyntheticGpkg({
      numParcels,
      numTrees,
      centre,
      bad,
      flaws
    })
    return sendBuffer(res, out)
  }

  // Multiple files: zip them up. Each call randomises geometry so the user
  // gets `count` distinct fixtures, mirroring `--count` on the CLI. We
  // suffix each filename with the run index because the second-resolution
  // timestamp would otherwise collide for files generated in the same
  // batch.
  const pad = String(count).length
  const files = []
  for (let i = 0; i < count; i += 1) {
    const out = gen.generateSyntheticGpkg({
      numParcels,
      numTrees,
      centre,
      bad,
      flaws
    })
    const indexSuffix = `-${String(i + 1).padStart(pad, '0')}`
    out.filenameHint = out.filenameHint.replace(
      /\.gpkg$/,
      `${indexSuffix}.gpkg`
    )
    files.push(out)
  }
  return sendZip(res, files, `bng-test-data-bundle-${Date.now()}.zip`)
}

async function handleWorkbook(req, res, gen) {
  if (!req.file) {
    return res.status(400).render('gen-gpkg/index', {
      error: 'Upload a workbook (.xlsx or .xlsm) to use the workbook flow.'
    })
  }

  const mode = req.body.mode || gen.MODE_BOTH
  if (!gen.VALID_MODES.has(mode)) {
    return res.status(400).render('gen-gpkg/index', {
      error: `Mode must be one of: ${[...gen.VALID_MODES].join(', ')}`
    })
  }

  const strict = req.body.strict === 'on' || req.body.strict === 'true'
  const centre = parseCentre(req.body.centreEasting, req.body.centreNorthing)

  const result = gen.generateFromWorkbookBuffer({
    workbookBuffer: req.file.buffer,
    workbookFilename: req.file.originalname,
    mode,
    strict,
    centre
  })

  if (!result.success) {
    return res.status(422).render('gen-gpkg/result', {
      success: false,
      messages: result.messages
    })
  }

  const files = []
  if (result.baseline) files.push(result.baseline)
  if (result.postIntervention) files.push(result.postIntervention)

  if (files.length === 1) {
    return sendBuffer(res, files[0])
  }
  return sendZip(res, files, `bng-from-workbook-${Date.now()}.zip`)
}

function registerGenGpkgRoutes(router) {
  router.get('/test-data/gen-gpkg', async function (req, res) {
    if (!isEnabled()) return res.status(404).send('Not found')
    const gen = await getGenerator()
    res.render('gen-gpkg/index', { flawGroups: groupFlaws(gen.listFlaws()) })
  })

  router.post(
    '/test-data/gen-gpkg',
    upload.single('workbook'),
    async function (req, res, next) {
      if (!isEnabled()) return res.status(404).send('Not found')
      try {
        const gen = await getGenerator()
        const mode = req.body.source === 'workbook' ? 'workbook' : 'synthetic'
        if (mode === 'workbook') {
          return await handleWorkbook(req, res, gen)
        }
        return await handleSynthetic(req, res, gen)
      } catch (err) {
        // FlawSelectionError carries a user-facing message; re-render the form
        // with it. Everything else propagates to the kit's default handler.
        if (err && err.name === 'FlawSelectionError') {
          const gen = await getGenerator()
          return res.status(400).render('gen-gpkg/index', {
            flawGroups: groupFlaws(gen.listFlaws()),
            error: err.message,
            form: req.body
          })
        }
        return next(err)
      }
    }
  )
}

module.exports = { registerGenGpkgRoutes }
