/**
 * The whole thing, end to end, on this repo's own example GeoPackages: read
 * two files, draw a report, get PDF bytes.
 *
 * Runs on the generated basemap, so it needs no OS key and no network — which
 * is the point of keeping that basemap around.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { readSite } from '../../app/lib/pdf-report/gpkg.mjs'
import { buildSummaryPdf } from '../../app/lib/pdf-report/document.mjs'
import { resolveBasemap } from '../../app/lib/pdf-report/basemap.mjs'
import { FONT_CHOICES, resolveFonts } from '../../app/lib/pdf-report/fonts.mjs'

const EXAMPLES = path.resolve(import.meta.dirname, '..', '..', 'example-files')
const BASELINE = path.join(EXAMPLES, 'Baseline - complete with area refs.gpkg')
const POST = path.join(EXAMPLES, 'Post-intervention - complete.gpkg')

const PDF_MAGIC = '%PDF-'
const MIN_PLAUSIBLE_BYTES = 20_000

function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

async function render({ post = true, layout = 'cards', font = 'noto-sans' } = {}) {
  const basemap = await resolveBasemap({ source: 'synthetic' })
  const { doc, stats } = await buildSummaryPdf({
    baseline: readSite(BASELINE),
    postIntervention: post ? readSite(POST) : null,
    grid: basemap.grid,
    tileSource: basemap.tileSource,
    layout,
    fonts: resolveFonts(font)
  })
  return { pdf: await toBuffer(doc), stats }
}

test('a baseline and post-intervention pair renders to a PDF', async () => {
  const { pdf, stats } = await render()

  assert.equal(pdf.subarray(0, PDF_MAGIC.length).toString(), PDF_MAGIC)
  assert.ok(
    pdf.length > MIN_PLAUSIBLE_BYTES,
    `${pdf.length} bytes is too small to contain maps`
  )
  // One card per post-intervention parcel, and both site maps drawn.
  assert.equal(stats.habitats, 12)
  assert.equal(stats.maps, 2)
  assert.ok(stats.tiles > 0, 'expected basemap tiles to be drawn')
})

test('a baseline on its own renders the baseline parcels', async () => {
  const { pdf, stats } = await render({ post: false })

  assert.equal(pdf.subarray(0, PDF_MAGIC.length).toString(), PDF_MAGIC)
  assert.equal(stats.habitats, 3, 'the baseline file has three parcels')
  assert.equal(stats.maps, 1, 'with nothing to compare against, there is one map')
})

test('the table layout renders the same parcels more compactly', async () => {
  const cards = await render({ layout: 'cards' })
  const table = await render({ layout: 'table' })

  assert.equal(table.stats.habitats, cards.stats.habitats)
  assert.ok(
    table.pdf.length < cards.pdf.length,
    `expected the table (${table.pdf.length}) to be smaller than cards (${cards.pdf.length})`
  )
})

test('the document declares itself tagged, titled and in English', async () => {
  const { pdf } = await render({ post: false, layout: 'table' })
  const text = pdf.toString('latin1')

  assert.match(text, /\/Marked true/, 'tagged PDF')
  assert.match(text, /\/DisplayDocTitle true/, 'viewers should show the title, not the filename')
  assert.match(text, /\/Lang \(en-GB\)/)
  assert.match(text, /Biodiversity net gain summary/)
})

test('embedded typefaces embed, and PDF built-ins do not', async () => {
  // /FontFile* is the font PROGRAM inside the document. Its presence is what
  // PDF/UA-1 7.21.4.1 requires and what separates the two kinds of choice on
  // the form; nothing about the rendered page looks different either way.
  for (const choice of FONT_CHOICES) {
    const { pdf } = await render({ post: false, layout: 'table', font: choice.value })
    const embeds = /\/FontFile\d?/.test(pdf.toString('latin1'))
    assert.equal(
      embeds,
      choice.conformant,
      `${choice.value}: expected embedded=${choice.conformant}`
    )
  }
})

test('a non-BNG file is refused rather than drawn in the wrong place', () => {
  assert.throws(
    () => readSite(path.join(EXAMPLES, 'does-not-exist.gpkg')),
    'a missing file should throw rather than produce an empty report'
  )
})
