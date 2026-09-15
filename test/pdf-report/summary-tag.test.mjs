/**
 * The summary page tags a project only when it has something to judge.
 *
 * `summariseUnitTypes` returns a null percentage change in two cases — no
 * post-intervention file, and a zero baseline — and neither is a project that
 * was assessed and fell short. `siteForJourney` produces the first of them
 * for any session with only a baseline uploaded, so this is the ordinary
 * state of a half-finished journey, not an edge case.
 *
 * The doc here is a recorder rather than a real PDFDocument: these tests ask
 * which structure elements were built, not how they look on the page, and a
 * stub keeps that question independent of fonts and measurement.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import { buildUnitTypeSection } from '../../app/lib/pdf-report/summary-tiles.mjs'
import { DEFAULT_TARGET_PERCENTAGE } from '../../app/lib/pdf-report/unit-summary.mjs'

const TILE_HEIGHT = 10
const LINE_HEIGHT = 12
const TEXT_WIDTH = 30

/**
 * Records every string drawn. The measurement calls return fixed sizes: the
 * layout maths is exercised elsewhere, and constants keep it out of the way.
 */
function recordingDoc() {
  const drawn = []
  const doc = {
    drawn,
    struct: (type, optionsOrChildren, maybeChildren) => {
      const children = Array.isArray(optionsOrChildren)
        ? optionsOrChildren
        : maybeChildren
      if (typeof optionsOrChildren === 'function') {
        optionsOrChildren()
      }
      return { type, children: children ?? [] }
    },
    text: (value) => drawn.push(String(value).trim()),
    font: () => doc,
    fontSize: () => doc,
    fillColor: () => doc,
    heightOfString: () => TILE_HEIGHT,
    widthOfString: () => TEXT_WIDTH,
    currentLineHeight: () => LINE_HEIGHT,
    markContent: () => doc,
    endMarkedContent: () => doc,
    save: () => doc,
    restore: () => doc,
    rect: () => doc,
    fill: () => doc
  }
  return doc
}

function drawSection(summary) {
  const doc = recordingDoc()
  buildUnitTypeSection({
    doc,
    summary,
    targetPercentage: DEFAULT_TARGET_PERCENTAGE,
    top: 0
  })
  return doc.drawn
}

function summary(overrides) {
  return {
    key: 'habitats',
    title: 'Area habitats',
    baselineUnits: 10,
    postInterventionUnits: null,
    netChange: null,
    percentageChange: null,
    ...overrides
  }
}

test('a project with no post-intervention file is not tagged "Not met"', () => {
  const drawn = drawSection(summary({}))

  assert.ok(
    !drawn.includes('Not met') && !drawn.includes('Met'),
    `an unassessed project was tagged: ${drawn.join(' | ')}`
  )
})

test('a zero baseline yields no tag either — the percentage is unknowable', () => {
  const drawn = drawSection(
    summary({ baselineUnits: 0, postInterventionUnits: 4, netChange: 4 })
  )

  assert.ok(!drawn.includes('Not met') && !drawn.includes('Met'))
})

test('an assessed project that falls short is still tagged "Not met"', () => {
  const drawn = drawSection(
    summary({ postInterventionUnits: 9, netChange: -1, percentageChange: -10 })
  )

  assert.ok(drawn.includes('Not met'))
})

test('an assessed project that reaches the target is tagged "Met"', () => {
  const drawn = drawSection(
    summary({ postInterventionUnits: 12, netChange: 2, percentageChange: 20 })
  )

  assert.ok(drawn.includes('Met'))
})
