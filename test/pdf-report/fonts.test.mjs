/**
 * Which typeface the report gets, and what it costs.
 *
 * The claim these guard is the one that is invisible in the output: an
 * embedded font can meet PDF/UA-1 clause 7.21.4.1 and a PDF base-14 font
 * cannot, while both render identically on screen. `render.test.mjs` proves
 * the consequence end to end; this file pins the resolution.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

import {
  DEFAULT_FONT_CHOICE,
  FONT_CHOICES,
  bundledFonts,
  gdsTransportPaths,
  resolveFonts
} from '../../app/lib/pdf-report/fonts.mjs'

test('every offered choice resolves to something pdfkit accepts', () => {
  for (const choice of FONT_CHOICES) {
    const fonts = resolveFonts(choice.value)
    assert.equal(typeof fonts.regular, 'string', `${choice.value} regular`)
    assert.equal(typeof fonts.bold, 'string', `${choice.value} bold`)
    assert.equal(
      fonts.embedded,
      choice.conformant,
      `${choice.value}: "conformant" on the form must mean "embedded" in the file`
    )
  }
})

test('the built-in choices are named, not read from disk', () => {
  assert.deepEqual(resolveFonts('helvetica'), {
    regular: 'Helvetica',
    bold: 'Helvetica-Bold',
    name: 'Helvetica',
    embedded: false,
    requested: 'helvetica',
    fellBack: false
  })
  assert.equal(resolveFonts('times').regular, 'Times-Roman')
})

test('the bundled fallback is committed and readable', () => {
  const fonts = bundledFonts()
  assert.ok(fs.existsSync(fonts.regular), fonts.regular)
  assert.ok(fs.existsSync(fonts.bold), fonts.bold)
  assert.equal(fonts.embedded, true)
})

test('GDS Transport is found in the installed govuk-frontend', () => {
  const gds = gdsTransportPaths()

  // Not skipped when absent: govuk-frontend is a direct dependency, so if this
  // cannot find the fonts the default choice is silently degrading for
  // everyone, which is exactly what the tool must not do quietly.
  assert.ok(gds, 'expected govuk-frontend to ship GDS Transport')
  assert.ok(fs.existsSync(gds.regular), gds.regular)
  assert.ok(fs.existsSync(gds.bold), gds.bold)
  // Content-hashed filenames change with every govuk-frontend release, so the
  // resolver matches by prefix. Assert that shape, never the exact name.
  assert.match(gds.regular, /\/light-[0-9a-f]+-v\d+\.woff2?$/)
  assert.match(gds.bold, /\/bold-[0-9a-f]+-v\d+\.woff2?$/)
})

test('the default is GDS Transport, and it is not falling back', () => {
  const fonts = resolveFonts(DEFAULT_FONT_CHOICE)
  assert.equal(fonts.name, 'GDS Transport')
  assert.equal(fonts.fellBack, false)
  assert.equal(fonts.embedded, true)
})

test('an unrecognised choice lands on the bundled font rather than throwing', () => {
  const fonts = resolveFonts('something-else')
  assert.equal(fonts.name, 'Noto Sans')
  assert.equal(fonts.embedded, true)
})

test('the GDS Transport files are not committed to this repository', () => {
  // The whole licensing position rests on this: the repo is public, and the
  // font's licence does not permit republishing it. It may be READ from
  // node_modules; it may not be held here.
  const gds = gdsTransportPaths()
  assert.match(
    gds.regular,
    /node_modules/,
    'GDS Transport must come from the installed package, never from the repo'
  )
})
