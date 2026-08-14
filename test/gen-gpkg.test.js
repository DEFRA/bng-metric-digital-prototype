const test = require('node:test')
const assert = require('node:assert/strict')
const { Writable } = require('node:stream')
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
  res.body = () => Buffer.concat(chunks)
  return res
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
