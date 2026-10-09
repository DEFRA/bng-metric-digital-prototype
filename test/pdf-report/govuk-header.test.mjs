/**
 * The GOV.UK header: the logotype geometry is what govuk-frontend ships, and
 * the header draws cleanly into a tagged document.
 *
 * The geometry checks are shape, not pixels — the crown is machine-extracted
 * (see govuk-logo.mjs), so what can regress is the extraction: a path that
 * lost its arcs, a missing circle, a viewBox that no longer matches the
 * coordinates the paths are written in.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import PDFDocument from 'pdfkit'

import { GOVUK_LOGOTYPE } from '../../app/lib/pdf-report/govuk-logo.mjs'
import {
  addGovukHeader, govukHeaderHeight, GOVUK_BLUE, HEADER_SERVICE_NAME
} from '../../app/lib/pdf-report/govuk-header.mjs'
import { registerFonts } from '../../app/lib/pdf-report/page-furniture.mjs'

test('the logotype carries the crown, the letters and the dot of .UK', () => {
  assert.equal(GOVUK_LOGOTYPE.viewBox.width, 324)
  assert.equal(GOVUK_LOGOTYPE.viewBox.height, 60)
  // The exact circles are pinned against the installed govuk-frontend in
  // govuk-logo-upstream.test.mjs; here it only matters that some survived.
  assert.ok(GOVUK_LOGOTYPE.circles.length > 0, 'the crown kept its dots')
  assert.match(GOVUK_LOGOTYPE.crown, /^M/u)
  assert.match(GOVUK_LOGOTYPE.letters, /^M/u)
  assert.ok(GOVUK_LOGOTYPE.letters.length > 1000, 'the letterforms are the long path')
  assert.ok(GOVUK_LOGOTYPE.dot.r > 0)
})

test('every logotype coordinate sits inside the declared viewBox', () => {
  const { viewBox, circles, dot } = GOVUK_LOGOTYPE
  for (const { cx, cy, r } of [...circles, dot]) {
    assert.ok(cx - r >= 0 && cx + r <= viewBox.width, `circle at ${cx} fits horizontally`)
    assert.ok(cy - r >= 0 && cy + r <= viewBox.height, `circle at ${cy} fits vertically`)
  }
})

test('the header draws into a tagged document and reports its height', () => {
  const doc = new PDFDocument({ tagged: true, lang: 'en-GB' })
  registerFonts(doc)
  const root = doc.struct('Document', { title: 'test' })
  doc.addStructure(root)
  const section = doc.struct('Sect')
  root.add(section)

  const bottom = addGovukHeader({ doc, section })

  assert.equal(bottom, govukHeaderHeight())
  assert.ok(bottom > 0)
  section.end()
  root.end()
  doc.end()
})

test('the brand is GOV.UK blue and the service is named', () => {
  assert.equal(GOVUK_BLUE, '#1d70b8')
  assert.equal(HEADER_SERVICE_NAME, 'Biodiversity Net Gain Metric')
})
