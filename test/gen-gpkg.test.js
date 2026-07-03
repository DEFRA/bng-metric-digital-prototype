const test = require('node:test')
const assert = require('node:assert/strict')
const { Writable } = require('node:stream')
const { sendZip } = require('../app/routes/gen-gpkg')

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
