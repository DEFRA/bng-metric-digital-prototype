/**
 * The GOV.UK page header, on paper: the brand-blue band with the crown
 * logotype, and the service navigation bar naming the service under it —
 * the same two bars the top of every page of the service shows, so the
 * downloaded report opens looking like where it came from.
 *
 * Colours are govuk-frontend's refreshed (2025) brand: GOV.UK blue behind
 * the white logotype, the service bar on light grey over a hairline border.
 * Both bands bleed to the page edges, because the web header does.
 *
 * Structure: the logotype is a Figure with alt "GOV.UK" — it is a wordmark,
 * not decoration — and the service name is a real paragraph. The bands and
 * the border carry no information, so they are artifacts.
 */

import { BOLD, labelAsArtifact } from './page-furniture.mjs'
import { GOVUK_LOGOTYPE } from './govuk-logo.mjs'
import { A4_PORTRAIT, BORDER, CONTENT_WIDTH, FONT_SIZE, INK, MARGIN, TILE_BACKGROUND } from './layout.mjs'

export const GOVUK_BLUE = '#1d70b8'
export const HEADER_SERVICE_NAME = 'Biodiversity Net Gain Metric'

const PAGE_WIDTH = A4_PORTRAIT[0]
const BAND_HEIGHT = 46
const LOGOTYPE_HEIGHT = 26
const SERVICE_BAR_HEIGHT = 26
const SERVICE_BAR_BORDER = 0.75

/** The vertical space the header occupies, so page 1 can lay out under it. */
export function govukHeaderHeight() {
  return BAND_HEIGHT + SERVICE_BAR_HEIGHT
}

/**
 * Draw the header across the top of the current page and add its structure
 * to `section`. Positions are all explicit — nothing here reads `doc.y`.
 */
export function addGovukHeader({ doc, section, serviceName = HEADER_SERVICE_NAME }) {
  labelAsArtifact(doc, () => {
    doc.save()
    doc.rect(0, 0, PAGE_WIDTH, BAND_HEIGHT).fillColor(GOVUK_BLUE).fill()
    doc
      .rect(0, BAND_HEIGHT, PAGE_WIDTH, SERVICE_BAR_HEIGHT)
      .fillColor(TILE_BACKGROUND)
      .fill()
    doc
      .rect(0, BAND_HEIGHT + SERVICE_BAR_HEIGHT - SERVICE_BAR_BORDER, PAGE_WIDTH, SERVICE_BAR_BORDER)
      .fillColor(BORDER)
      .fill()
    doc.restore()
  })

  const logoTop = (BAND_HEIGHT - LOGOTYPE_HEIGHT) / 2
  const logoWidth = logotypeWidth()

  const content = doc.markStructureContent('Figure')
  drawLogotype(doc, MARGIN, logoTop, LOGOTYPE_HEIGHT)
  doc.endMarkedContent()

  section.add(
    doc.struct('Figure', {
      alt: 'GOV.UK ',
      bbox: [MARGIN, logoTop, MARGIN + logoWidth, logoTop + LOGOTYPE_HEIGHT]
    }, [content])
  )

  section.add(
    doc.struct('P', () => {
      doc.font(BOLD).fontSize(FONT_SIZE.body).fillColor(INK)
      const textHeight = doc.currentLineHeight()
      doc.text(`${serviceName} `, MARGIN, BAND_HEIGHT + (SERVICE_BAR_HEIGHT - textHeight) / 2, {
        width: CONTENT_WIDTH
      })
    })
  )

  return govukHeaderHeight()
}

function logotypeWidth() {
  const { viewBox } = GOVUK_LOGOTYPE
  return (LOGOTYPE_HEIGHT / viewBox.height) * viewBox.width
}

/**
 * The crown and letterforms, scaled from their own viewBox and filled white.
 * Geometry comes from `govuk-logo.mjs`, machine-extracted from the header
 * component's SVG, so the crown is govuk-frontend's own — not a redrawing.
 */
function drawLogotype(doc, x, y, height) {
  const { viewBox, circles, dot, crown, letters } = GOVUK_LOGOTYPE
  const scale = height / viewBox.height

  doc.save()
  doc.translate(x, y).scale(scale)
  doc.fillColor('#ffffff')
  for (const { cx, cy, r } of circles) {
    doc.circle(cx, cy, r).fill()
  }
  doc.path(crown).fill()
  doc.path(letters).fill()
  doc.circle(dot.cx, dot.cy, dot.r).fill()
  doc.restore()
}
