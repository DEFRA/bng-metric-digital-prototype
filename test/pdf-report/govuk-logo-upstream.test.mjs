/**
 * The logotype geometry is govuk-frontend's, and stays govuk-frontend's.
 *
 * govuk-logo.mjs is extracted from the installed govuk-frontend rather than
 * transcribed, so the risk it carries is drift: an upgrade that refreshes the
 * brand (as 2025 did) leaves this repo drawing last year's crown, silently and
 * correctly-looking. These tests re-extract from the installed package and
 * compare, so the upgrade is what fails rather than the printed report.
 *
 * They also pin the one thing that reliably reads as a typo — the centre dot
 * appearing twice in `circles`. It is duplicated in upstream's own macro, so
 * the assertion here is the standing answer to "should that be deleted?": not
 * unless upstream deletes it.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

import { GOVUK_LOGOTYPE } from '../../app/lib/pdf-report/govuk-logo.mjs'

const CIRCLE = /<circle(?<attributes>[^>]*?)\/?>/gu
const ATTRIBUTE = /(?<name>[\w-]+)="(?<value>[^"]*)"/gu

/** govuk-frontend's own logo macro — the source every header fixture renders. */
function upstreamLogoMacro() {
  const require = createRequire(import.meta.url)
  const packageJson = require.resolve('govuk-frontend/package.json')
  return fs.readFileSync(
    path.join(path.dirname(packageJson), 'dist', 'govuk', 'macros', 'logo.njk'),
    'utf8'
  )
}

/**
 * Every `<circle>` in the macro, in document order, as { cx, cy, r } numbers.
 * The dot of ".UK" carries a class and the crown's do not, which is how the
 * two are told apart here — the same split govuk-logo.mjs stores.
 */
function upstreamCircles(macro) {
  const circles = []
  for (const match of macro.matchAll(CIRCLE)) {
    const attributes = Object.fromEntries(
      [...match.groups.attributes.matchAll(ATTRIBUTE)].map((a) => [
        a.groups.name,
        a.groups.value
      ])
    )
    circles.push({
      isDot: 'class' in attributes,
      cx: Number(attributes.cx),
      cy: Number(attributes.cy),
      r: Number(attributes.r)
    })
  }
  return circles
}

const macro = upstreamLogoMacro()
const circles = upstreamCircles(macro)
const crownCircles = circles.filter((circle) => !circle.isDot)
const dotCircles = circles.filter((circle) => circle.isDot)

function bare({ cx, cy, r }) {
  return { cx, cy, r }
}

test('the extraction found circles at all — otherwise the rest proves nothing', () => {
  assert.ok(macro.length > 0, 'govuk-frontend ships macros/logo.njk')
  assert.ok(crownCircles.length > 0, 'the macro still uses <circle> for the crown')
  assert.equal(dotCircles.length, 1, 'exactly one classed circle, the dot of ".UK"')
})

test('the crown circles match the installed govuk-frontend exactly, in order', () => {
  assert.deepEqual(
    GOVUK_LOGOTYPE.circles.map(bare),
    crownCircles.map(bare),
    'govuk-logo.mjs has drifted from the installed govuk-frontend; re-extract it'
  )
})

test('the repeated centre dot is upstream’s, not a transcription slip', () => {
  const repeated = crownCircles.filter(
    (circle) => circle.cx === 31.7 && circle.cy === 30.6
  )

  assert.equal(
    repeated.length,
    2,
    'upstream no longer repeats the centre dot — drop the duplicate here too'
  )
})

test('the dot of ".UK" matches upstream', () => {
  assert.deepEqual(bare(GOVUK_LOGOTYPE.dot), bare(dotCircles[0]))
})

test('the viewBox height matches upstream; its width is the doubled half-width', () => {
  const viewBox = /viewBox="0 0 \{\{ svgWidth \* 2 \}\} (?<height>[\d.]+)"/u.exec(macro)

  assert.ok(viewBox, 'upstream still declares a doubled-width viewBox')
  assert.equal(GOVUK_LOGOTYPE.viewBox.height, Number(viewBox.groups.height))
  assert.equal(GOVUK_LOGOTYPE.viewBox.width, 324)
})
