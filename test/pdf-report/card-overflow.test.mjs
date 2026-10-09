/**
 * No card may be taller than the page it is drawn on.
 *
 * Moving an oversized card to a fresh page cannot help — it overruns whatever
 * page it starts on. pdfkit then paginates the overflowing text itself, which
 * leaves the card's frame (one rect, already drawn) on the first page, the
 * rest of the text on pages the layout does not know exist, and `y` advancing
 * against a page that has been left behind.
 *
 * The three free-text fields come straight from the uploaded GeoPackage, so
 * nothing bounds them. These tests hold the invariant that makes the layout
 * work: the height a card is measured at is the height it draws at, and that
 * height fits on a page.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import PDFDocument from 'pdfkit'

import {
  cardHeight,
  cardValues,
  fitCardToPage,
  labelWidth,
  maxCardHeight
} from '../../app/lib/pdf-report/habitat-cards.mjs'
import { registerFonts } from '../../app/lib/pdf-report/page-furniture.mjs'
import { resolveFonts } from '../../app/lib/pdf-report/fonts.mjs'
import { readSite } from '../../app/lib/pdf-report/gpkg.mjs'
import { buildSummaryPdf } from '../../app/lib/pdf-report/document.mjs'
import { resolveBasemap } from '../../app/lib/pdf-report/basemap.mjs'
import { A4_PORTRAIT, MARGIN } from '../../app/lib/pdf-report/layout.mjs'

const EXAMPLES = path.resolve(import.meta.dirname, '..', '..', 'example-files')
const BASELINE = path.join(EXAMPLES, 'Baseline - complete with area refs.gpkg')

const SENTENCE =
  'The parcel was surveyed on foot and the sward height recorded. '
const MARKER = 'shortened to fit'

/** A document with fonts registered, because every measurement depends on them. */
function measuringDoc() {
  const doc = new PDFDocument({ size: A4_PORTRAIT, margin: MARGIN })
  registerFonts(doc, resolveFonts('noto-sans'))
  return doc
}

const words = (count) => SENTENCE.repeat(count)

test('a comment long enough to overflow is trimmed until the card fits', () => {
  const doc = measuringDoc()
  const raw = { broadType: 'Grassland', comment: words(100) }

  assert.ok(
    cardHeight(doc, raw) > maxCardHeight(),
    'the fixture must overflow, or this test proves nothing'
  )

  const fitted = fitCardToPage(doc, raw)
  assert.ok(cardHeight(doc, fitted) <= maxCardHeight())
})

test('however absurd the value, the card still fits', () => {
  const doc = measuringDoc()

  for (const count of [45, 100, 400, 2000, 10_000]) {
    const fitted = fitCardToPage(doc, {
      broadType: 'Grassland',
      comment: words(count)
    })
    assert.ok(
      cardHeight(doc, fitted) <= maxCardHeight(),
      `a ${count * SENTENCE.length} character comment still overflowed`
    )
  }
})

test('a trimmed value says that it was trimmed', () => {
  const doc = measuringDoc()
  const fitted = fitCardToPage(doc, {
    broadType: 'Grassland',
    comment: words(100)
  })

  assert.match(fitted.comment, new RegExp(MARKER))
})

test('a value that already fits is left exactly as it was', () => {
  const doc = measuringDoc()
  const raw = {
    broadType: 'Grassland',
    condition: 'Moderate',
    comment: 'Surveyed in poor light; recommend a second visit.'
  }

  assert.deepEqual(fitCardToPage(doc, raw), raw)
})

test('two runaway fields each keep a share, rather than the first losing everything', () => {
  const doc = measuringDoc()
  const fitted = fitCardToPage(doc, {
    broadType: 'Grassland',
    surveyDetails: words(200),
    comment: words(200)
  })

  assert.ok(cardHeight(doc, fitted) <= maxCardHeight())
  // Trimming the longest first, recomputed each pass, keeps these comparable.
  // Without that the first field is cut to nothing before the second is touched.
  assert.ok(
    fitted.surveyDetails.length > 200,
    'survey details were cut to nothing'
  )
  assert.ok(fitted.comment.length > 200, 'the comment was cut to nothing')
})

test('a long value in a field that does not wrap is cut to one line', () => {
  // `mappedBy` is measured as a single line but pdfkit still wraps what it
  // draws, so an over-long name would draw through the lines beneath it and,
  // far enough, off the page — the same overflow by a different door.
  const doc = measuringDoc()
  const fitted = fitCardToPage(doc, {
    broadType: 'Grassland',
    mappedBy: words(30)
  })

  doc.font('Helvetica-Bold').fontSize(9)
  assert.ok(cardHeight(doc, fitted) <= maxCardHeight())
  assert.match(fitted.mappedBy, new RegExp(MARKER))
  assert.ok(fitted.mappedBy.length < words(30).length)
})

test('every parcel of the example file fits without being trimmed', () => {
  // Real data must pass through untouched; a clamp that fires on ordinary
  // parcels would be quietly deleting report content.
  const doc = measuringDoc()
  const site = readSite(BASELINE)

  for (const feature of site.layers.habitats.features) {
    const raw = cardValues(feature)
    assert.deepEqual(fitCardToPage(doc, raw), raw)
    assert.ok(cardHeight(doc, raw) <= maxCardHeight())
  }
})

test('the page count stops growing with the length of a comment', async () => {
  const basemap = await resolveBasemap({ source: 'synthetic' })
  const fonts = resolveFonts('noto-sans')

  const pagesFor = async (count) => {
    const site = readSite(BASELINE)
    site.layers.habitats.features = site.layers.habitats.features.slice(0, 3)
    site.layers.habitats.features[0].properties.Comment = words(count)

    const { doc } = await buildSummaryPdf({
      baseline: site,
      postIntervention: null,
      grid: basemap.grid,
      tileSource: basemap.tileSource,
      layout: 'cards',
      fonts
    })

    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    await new Promise((resolve, reject) => {
      doc.on('end', resolve)
      doc.on('error', reject)
      doc.end()
    })
    const bytes = Buffer.concat(chunks).toString('latin1')
    return (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  }

  // A longer card legitimately pushes the cards after it onto another page,
  // so the count rises with length and then stops: once a value is clamped,
  // making it longer cannot make the document longer. Before the clamp it grew
  // without limit - 3, 5, then 9 pages - because pdfkit was adding pages of
  // its own for text the layout had already drawn a single frame around.
  const clamped = await pagesFor(400)
  assert.equal(
    await pagesFor(2_000),
    clamped,
    'five times the text added pages'
  )
  assert.equal(
    await pagesFor(10_000),
    clamped,
    'twenty-five times the text added pages'
  )

  // And the whole thing stays within what three cards and an intro can need.
  assert.ok(clamped <= 6, `three parcels should not need ${clamped} pages`)
})
