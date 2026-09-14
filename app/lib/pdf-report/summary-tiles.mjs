/**
 * The summary page's tile grid — the PDF translation of the service's
 * project summary page (`app-unit-type-summary` in the frontend).
 *
 * One section per unit type, matching the web page tile for tile:
 *
 *   ┌──────────────────────────────┬──────────────────────────────┐
 *   │ Total on-site net percentage │ Trading Rules                │
 *   │ change    -15.80%  [Not met] │ View trading rules           │
 *   ├─────────────────┬────────────┴─────┬────────────────────────┤
 *   │ On-site         │ On-site          │ Total on-site net      │
 *   │ baseline        │ post-intervention│ unit change            │
 *   └─────────────────┴──────────────────┴────────────────────────┘
 *
 * Structure mirrors the visual: a Sect per unit type, its name as an H2,
 * each tile an H3 heading with its value as a paragraph. The "Met"/"Not met"
 * tag is real text on a coloured background, never colour alone — the same
 * rule the legend follows.
 *
 * Every position here is computed, never read back off `doc.y`: a struct
 * closure does not run when it is created, it runs when the element is
 * attached to the tree (`section.add`), by which point the cursor belongs to
 * someone else. Heights come from `heightOfString` — the same question the
 * renderer answers later, at the same width and font.
 */

import { BODY, BOLD, labelAsArtifact } from './page-furniture.mjs'
import { meetsTarget } from './unit-summary.mjs'
import {
  CONTENT_WIDTH, FONT_SIZE, INK, MARGIN, MUTED, PRIMARY_TILE_HEIGHT,
  SECONDARY_TILE_HEIGHT, SECTION_HEADING_HEIGHT, TAG_COLOURS, TILE_BACKGROUND,
  TILE_GUTTER, TILE_PADDING
} from './layout.mjs'

const PRIMARY_TILE_COUNT = 2
const SECONDARY_TILE_COUNT = 3
const ROW_GAP = 10
const TAG_PADDING_X = 5
const TAG_PADDING_Y = 3
const VALUE_GAP = 6

/** The vertical space one unit-type section occupies, for pagination. */
export function unitTypeSectionHeight() {
  return (
    SECTION_HEADING_HEIGHT + PRIMARY_TILE_HEIGHT + ROW_GAP + SECONDARY_TILE_HEIGHT
  )
}

/**
 * Build one unit type's section with its top edge at `top` and return its
 * Sect element, ready for `section.add`. The tile backgrounds are drawn here
 * and immediately (they are artifacts, and they must sit under the text);
 * the text itself draws when the returned element is attached.
 */
export function buildUnitTypeSection({ doc, summary, targetPercentage, top }) {
  const heading = doc.struct('H2', () => {
    doc.font(BOLD).fontSize(FONT_SIZE.subHeading).fillColor(INK)
    doc.text(`${summary.title} `, MARGIN, top, { width: CONTENT_WIDTH })
  })

  const primaryTop = top + SECTION_HEADING_HEIGHT
  const secondaryTop = primaryTop + PRIMARY_TILE_HEIGHT + ROW_GAP

  // Each tile is a short list of elements (heading, value, maybe a tag), so
  // the rows flatten into one reading-order sequence of children.
  const tiles = [
    ...primaryRow({ doc, summary, targetPercentage, top: primaryTop }),
    ...secondaryRow({ doc, summary, top: secondaryTop })
  ].flat()

  return doc.struct('Sect', { title: summary.title }, [heading, ...tiles])
}

function primaryRow({ doc, summary, targetPercentage, top }) {
  const width = tileWidth(PRIMARY_TILE_COUNT)
  const met = meetsTarget(summary.percentageChange, targetPercentage)

  const percentageTile = buildTile({
    doc,
    frame: tileFrame(0, top, width, PRIMARY_TILE_HEIGHT),
    heading: 'Total on-site net percentage change',
    value: formatPercentage(summary.percentageChange),
    tag: { label: met ? 'Met' : 'Not met', colours: met ? TAG_COLOURS.met : TAG_COLOURS.notMet }
  })

  // The web page's tile is a link to the trading rules screen. A PDF cannot
  // take the reader there, so the tile keeps the page's shape and wording
  // without pretending to be a link.
  const tradingRulesTile = buildTile({
    doc,
    frame: tileFrame(1, top, width, PRIMARY_TILE_HEIGHT),
    heading: 'Trading Rules',
    headingSize: FONT_SIZE.tileValue,
    headingFont: BODY,
    value: 'View trading rules in the service',
    valueSize: FONT_SIZE.body,
    valueColour: MUTED
  })

  return [percentageTile, tradingRulesTile]
}

function secondaryRow({ doc, summary, top }) {
  const width = tileWidth(SECONDARY_TILE_COUNT)
  const cells = [
    { heading: 'On-site baseline', value: formatUnits(summary.baselineUnits) },
    {
      heading: 'On-site post-intervention',
      value: formatUnits(summary.postInterventionUnits)
    },
    {
      heading: 'Total on-site net unit change',
      value: formatUnits(summary.netChange)
    }
  ]

  return cells.map((cell, index) =>
    buildTile({
      doc,
      frame: tileFrame(index, top, width, SECONDARY_TILE_HEIGHT),
      heading: cell.heading,
      value: cell.value
    })
  )
}

function tileWidth(count) {
  return (CONTENT_WIDTH - TILE_GUTTER * (count - 1)) / count
}

function tileFrame(index, top, width, height) {
  return { x: MARGIN + index * (width + TILE_GUTTER), y: top, width, height }
}

/**
 * One tile: grey panel (an artifact), a bold heading, a large value below
 * it, and optionally a Met/Not met tag below that. Returns structure
 * elements in reading order, every one at a position computed here.
 */
function buildTile({
  doc, frame, heading, value, tag = null,
  headingFont = BOLD, headingSize = FONT_SIZE.body,
  valueSize = FONT_SIZE.tileValue, valueColour = INK
}) {
  labelAsArtifact(doc, () => {
    doc.save()
    doc.rect(frame.x, frame.y, frame.width, frame.height).fillColor(TILE_BACKGROUND).fill()
    doc.restore()
  })

  const textX = frame.x + TILE_PADDING
  const textWidth = frame.width - TILE_PADDING * 2

  const headingY = frame.y + TILE_PADDING
  doc.font(headingFont).fontSize(headingSize)
  const headingHeight = doc.heightOfString(`${heading} `, { width: textWidth })

  const valueY = headingY + headingHeight + VALUE_GAP
  doc.font(BODY).fontSize(valueSize)
  const valueHeight = doc.heightOfString(`${value} `, { width: textWidth })

  const headingElement = doc.struct('H3', () => {
    doc.font(headingFont).fontSize(headingSize).fillColor(INK)
    doc.text(`${heading} `, textX, headingY, { width: textWidth })
  })

  const valueElement = doc.struct('P', () => {
    doc.font(BODY).fontSize(valueSize).fillColor(valueColour)
    doc.text(`${value} `, textX, valueY, { width: textWidth })
  })

  const elements = [headingElement, valueElement]
  if (tag) {
    elements.push(buildTag(doc, tag, textX, valueY + valueHeight + VALUE_GAP))
  }
  return elements
}

/**
 * The GOV.UK tag: a coloured panel behind short bold text. The panel is an
 * artifact and draws now; the label is real content — "Not met" must reach a
 * screen reader as words, not as a colour.
 */
function buildTag(doc, { label, colours }, x, top) {
  doc.font(BOLD).fontSize(FONT_SIZE.tag)
  const textWidth = doc.widthOfString(label)
  const textHeight = doc.currentLineHeight()

  labelAsArtifact(doc, () => {
    doc.save()
    doc
      .rect(x, top, textWidth + TAG_PADDING_X * 2, textHeight + TAG_PADDING_Y * 2)
      .fillColor(colours.background)
      .fill()
    doc.restore()
  })

  return doc.struct('P', () => {
    doc.font(BOLD).fontSize(FONT_SIZE.tag).fillColor(colours.text)
    doc.text(`${label} `, x + TAG_PADDING_X, top + TAG_PADDING_Y, {
      width: textWidth + TAG_PADDING_X * 2,
      lineBreak: false
    })
  })
}

/** "-37.49 units", or an honest dash where there is nothing to say. */
export function formatUnits(units) {
  if (units === null) {
    return '—'
  }
  return `${units.toFixed(2)} units`
}

/** "-15.80%", or a dash where a percentage has no meaning. */
export function formatPercentage(percentage) {
  if (percentage === null) {
    return '—'
  }
  return `${percentage.toFixed(2)}%`
}
