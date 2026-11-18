const test = require('node:test')
const assert = require('node:assert/strict')
const { Writable } = require('node:stream')
const Database = require('better-sqlite3')
const XLSX = require('xlsx')
const {
  sendZip,
  permutationsZipFiles,
  registerGenGpkgRoutes
} = require('../app/routes/gen-gpkg')

// Capture the POST handler the route registers, so a test can drive it with a
// fake req/res without standing up the whole prototype-kit server (and its
// auth / https / CSRF middleware, which are the kit's, not ours).
function getPostHandler() {
  let handler
  const router = {
    get() {},
    post(_path, ...rest) {
      handler = rest[rest.length - 1]
    }
  }
  registerGenGpkgRoutes(router)
  return handler
}

// Local-file-header signature that begins every zip: "PK\x03\x04".
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04])

// Minimal Express-like response: a writable sink (sendZip pipes into it) that
// also records the headers sendZip sets.
function makeFakeRes() {
  const chunks = []
  const res = new Writable({
    write(chunk, _enc, cb) {
      chunks.push(Buffer.from(chunk))
      cb()
    }
  })
  res.headers = {}
  res.set = (key, value) => {
    res.headers[key] = value
    return res
  }
  res.send = (body) => res.end(body)
  res.body = () => Buffer.concat(chunks)
  return res
}

// Every GeoPackage is a SQLite database, and starts with its header string.
const SQLITE_MAGIC = Buffer.from('SQLite format 3\0')

// A small metric workbook: one baseline habitat, lost, and one created
// habitat. It has only the sheets and columns the workbook reader needs.
function makeWorkbookBuffer() {
  const significance =
    'Area/compensation not in local strategy/ no local strategy'
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'Ref',
        'Broad Habitat',
        'Habitat Type',
        'Area (hectares)',
        'Distinctiveness',
        'Condition',
        'Strategic significance',
        'Area retained',
        'Area enhanced',
        'Area habitat lost'
      ],
      [],
      [
        '1',
        'Urban',
        'Artificial unvegetated, unsealed surface',
        1,
        'V.Low',
        'N/A - Other',
        significance,
        0,
        0,
        1
      ]
    ]),
    'A-1 On-Site Habitat Baseline'
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'Ref',
        'Broad Habitat',
        'Proposed habitat',
        'Habitat',
        'Area (hectares)',
        'Distinctiveness',
        'Condition',
        'Strategic significance'
      ],
      [],
      [
        '1',
        'Urban',
        'Bare ground',
        'Urban - Bare ground',
        1,
        'Low',
        'Moderate',
        significance
      ]
    ]),
    'A-2 On-Site Habitat Creation'
  )
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

// Post a workbook through the route and collect the response.
async function postWorkbook(body) {
  const handler = getPostHandler()
  const res = makeFakeRes()
  const finished = new Promise((resolve) => res.on('finish', resolve))
  const req = {
    body: { source: 'workbook', ...body },
    file: { buffer: makeWorkbookBuffer(), originalname: 'metric.xlsx' }
  }

  await handler(req, res, (err) => {
    if (err) throw err
  })
  await finished
  return res
}

function countRows(gpkg, table) {
  const db = new Database(gpkg)
  try {
    return db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n
  } finally {
    db.close()
  }
}

// Guards the archiver contract sendZip depends on. archiver 8 (ESM-only)
// dropped the callable `archiver('zip', ...)` factory for the `ZipArchive`
// class; this test fails fast if a future bump changes that API again — the
// exact regression that shipped when archiver was auto-bumped 7 -> 8.
test('sendZip streams a valid multi-entry zip and sets download headers', async () => {
  const res = makeFakeRes()
  const files = [
    {
      buffer: Buffer.from('baseline gpkg bytes'),
      filenameHint: 'site-baseline.gpkg'
    },
    {
      buffer: Buffer.from('post-intervention gpkg bytes'),
      filenameHint: 'site-post-intervention.gpkg'
    }
  ]

  const finished = new Promise((resolve) => res.on('finish', resolve))
  sendZip(res, files, 'bundle.zip')
  await finished

  const out = res.body()
  assert.deepEqual(out.subarray(0, 4), ZIP_MAGIC, 'output should be a zip')
  assert.ok(
    out.length > files[0].buffer.length,
    'zip should contain the entries'
  )
  assert.equal(res.headers['Content-Type'], 'application/zip')
  assert.equal(
    res.headers['Content-Disposition'],
    'attachment; filename="bundle.zip"'
  )
})

test('permutationsZipFiles maps each scenario to two gpkgs plus a manifest', async () => {
  const gen = await import('bng-library')
  const result = gen.generatePermutations({ only: 'net-gain', seed: 1 })
  const files = permutationsZipFiles(result)

  // two GeoPackages per scenario, plus a single manifest.json.
  assert.equal(files.length, result.scenarios.length * 2 + 1)
  assert.ok(
    files.every((f) => Buffer.isBuffer(f.buffer)),
    'every entry carries a buffer'
  )
  assert.ok(
    files.some((f) => f.filenameHint === 'manifest.json'),
    'a manifest is included'
  )
  assert.ok(
    files.some((f) =>
      f.filenameHint.startsWith('net-gain/net-gain-met-baseline.gpkg')
    ),
    'entries keep the purpose/ folder layout'
  )
})

test('permutations bundle streams as a valid zip', async () => {
  const gen = await import('bng-library')
  const result = gen.generatePermutations({ only: 'net-gain', seed: 1 })
  const files = permutationsZipFiles(result)

  const res = makeFakeRes()
  const finished = new Promise((resolve) => res.on('finish', resolve))
  sendZip(res, files, 'bng-permutations.zip')
  await finished

  assert.deepEqual(res.body().subarray(0, 4), ZIP_MAGIC)
  assert.equal(res.headers['Content-Type'], 'application/zip')
})

test('generatePermutations is byte-reproducible for the same seed', async () => {
  const gen = await import('bng-library')
  const a = gen.generatePermutations({ only: 'net-gain', seed: 5 })
  const b = gen.generatePermutations({ only: 'net-gain', seed: 5 })
  assert.equal(
    Buffer.compare(
      a.scenarios[0].postIntervention.buffer,
      b.scenarios[0].postIntervention.buffer
    ),
    0
  )
})

test('POST source=permutations streams a zip through the route', async () => {
  const handler = getPostHandler()
  const res = makeFakeRes()
  const finished = new Promise((resolve) => res.on('finish', resolve))
  const req = {
    body: {
      source: 'permutations',
      purpose: 'net-gain',
      seed: '3',
      centreEasting: '530000',
      centreNorthing: '180000'
    }
  }

  await handler(req, res, (err) => {
    if (err) throw err
  })
  await finished

  assert.deepEqual(res.body().subarray(0, 4), ZIP_MAGIC, 'a zip is streamed')
  assert.equal(res.headers['Content-Type'], 'application/zip')
  assert.match(res.headers['Content-Disposition'], /bng-permutations-\d+\.zip/)
})

test('POST source=workbook refuses a format the generator does not know', async () => {
  const handler = getPostHandler()
  const rendered = {}
  const res = {
    status(code) {
      rendered.status = code
      return res
    },
    render(view, data) {
      rendered.view = view
      rendered.data = data
    }
  }
  const req = {
    body: { source: 'workbook', format: 'shapefile', mode: 'both' },
    file: { buffer: Buffer.from('not read'), originalname: 'metric.xlsm' }
  }

  await handler(req, res, (err) => {
    if (err) throw err
  })

  assert.equal(rendered.status, 400)
  assert.equal(rendered.view, 'gen-gpkg/index')
  assert.match(rendered.data.error, /legacy, bng-service/)
  assert.deepEqual(rendered.data.form, req.body, 'the form values are kept')
  assert.ok(rendered.data.purposes.length > 0, 'the purposes are listed')
  assert.ok(rendered.data.flawGroups.geometric.length > 0, 'flaws are listed')
})

test('POST source=workbook format=bng-service downloads one GeoPackage with both stages', async () => {
  const res = await postWorkbook({ format: 'bng-service', mode: 'both' })

  const out = res.body()
  assert.deepEqual(out.subarray(0, SQLITE_MAGIC.length), SQLITE_MAGIC)
  assert.equal(res.headers['Content-Type'], 'application/geopackage+sqlite3')
  assert.match(
    res.headers['Content-Disposition'],
    /^attachment; filename="metric-bng-service-[\d-]+\.gpkg"$/
  )
  assert.equal(res.headers['Content-Length'], String(out.length))
  assert.equal(countRows(out, 'Area Habitats Baseline'), 1)
  assert.equal(countRows(out, 'Area Habitats Post-Intervention'), 1)
})

test('POST source=workbook format=bng-service mode=baseline leaves the post-intervention layers empty', async () => {
  const res = await postWorkbook({ format: 'bng-service', mode: 'baseline' })

  const out = res.body()
  assert.deepEqual(out.subarray(0, SQLITE_MAGIC.length), SQLITE_MAGIC)
  assert.match(
    res.headers['Content-Disposition'],
    /filename="metric-bng-service-baseline-[\d-]+\.gpkg"/
  )
  assert.equal(countRows(out, 'Area Habitats Baseline'), 1)
  assert.equal(countRows(out, 'Area Habitats Post-Intervention'), 0)
})

test('POST source=workbook with no format keeps the legacy baseline and post-intervention zip', async () => {
  const res = await postWorkbook({ mode: 'both' })

  assert.deepEqual(res.body().subarray(0, 4), ZIP_MAGIC, 'a zip is streamed')
  assert.equal(res.headers['Content-Type'], 'application/zip')
  assert.match(res.headers['Content-Disposition'], /bng-from-workbook-\d+\.zip/)
})
