/**
 * Which typeface the report is drawn with, and where its bytes come from.
 *
 * This is not a cosmetic setting. PDF/UA-1 clause 7.21.4.1 requires every font
 * PROGRAM used by a document to be embedded in it. The PDF "base-14" faces —
 * Helvetica, Times, Courier — are referenced by name and resolved by whatever
 * viewer opens the file, never embedded, so a report drawn in one CANNOT pass
 * however well it is tagged. Nothing on the rendered page looks different,
 * which is exactly why it is easy to get wrong.
 *
 * Four choices, and the tool offers all four on purpose: two that embed and
 * conform, two that do not, so the difference can be seen side by side.
 *
 *   gds-transport  GOV.UK's own typeface, read out of the `govuk-frontend`
 *                  package. Embeds, conforms. The default.
 *   noto-sans      The committed fallback. SIL OFL 1.1, so safe to hold in a
 *                  public repository, and needs no network or package layout.
 *   helvetica      pdfkit base-14. Does NOT embed, does NOT conform.
 *   times          pdfkit base-14. Does NOT embed, does NOT conform.
 *
 * On Arial: it is not one of the base-14 faces and shipping it would need a
 * Monotype licence, so asking a PDF for Arial gets whatever the viewer
 * substitutes — in practice Helvetica. The option is therefore labelled
 * Helvetica, which is what actually happens.
 *
 * ── GDS Transport and this repository ──────────────────────────────────────
 *
 * The font files are NOT committed here and must not be. This is a public
 * repository; the font's own metadata records its licence as a "Special
 * license agreement" with Margaret Calvert and Henrik Kubel and describes it
 * as "customised exclusively for the UK Government Digital Services … not
 * commercially available". Committing the files would republish the font to
 * everyone who clones the repo.
 *
 * Reading them out of `node_modules/govuk-frontend` at runtime is a different
 * act: the repository holds no font, npm delivers the package to the machine,
 * and the prototype already serves those same files to browsers on every page
 * it renders. The font's `fsType` is "Preview & Print" — the rights holder
 * permitting embedding for exactly this kind of use.
 *
 * What remains open for a production service is GDS's consent to a
 * DOWNLOADABLE PDF carrying an embedded subset: a web page streams the font
 * for one session, a PDF carries a subset to everyone the document is
 * forwarded to. `bng-metric-backend`'s `src/services/report/fonts.js` is the
 * pattern if that ever needs a cleaner separation — fonts fetched from a
 * private S3 bucket at startup, falling back to the committed OFL font.
 */

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const BUNDLED_DIR = path.resolve(import.meta.dirname, 'assets', 'fonts')
const BUNDLED_REGULAR = path.join(BUNDLED_DIR, 'NotoSans-Regular.ttf')
const BUNDLED_BOLD = path.join(BUNDLED_DIR, 'NotoSans-Bold.ttf')

/**
 * govuk-frontend ships GDS Transport under content-hashed filenames that
 * change with every release:
 *
 *   dist/govuk/assets/fonts/light-f591b13f7d-v2.woff
 *   dist/govuk/assets/fonts/bold-affa96571d-v2.woff
 *
 * so they are matched by prefix rather than named. WOFF is preferred over
 * WOFF2 only because it is the pair this was verified against end to end;
 * fontkit reads both, and the WOFF2 pair is the fallback.
 */
const FONT_CONTAINERS = ['.woff', '.woff2']

function govukFontDir() {
  // `govuk-frontend`'s exports map publishes ./package.json and ./dist/, so
  // this resolves without reaching into the package by relative path.
  const packageJson = require.resolve('govuk-frontend/package.json')
  return path.join(path.dirname(packageJson), 'dist', 'govuk', 'assets', 'fonts')
}

function findByPrefix(files, prefix) {
  for (const container of FONT_CONTAINERS) {
    const match = files.find(
      (file) => file.startsWith(`${prefix}-`) && file.endsWith(container)
    )
    if (match) {
      return match
    }
  }
  return null
}

/**
 * Locate the GDS Transport pair, or null if this installation has no usable
 * copy — a missing package, a release that moved the assets, anything.
 *
 * Returning null rather than throwing is deliberate: a report in the fallback
 * typeface is a correct, complete, conformant report, and refusing to produce
 * one because a font could not be located would turn a cosmetic dependency
 * into an outage.
 */
export function gdsTransportPaths() {
  try {
    const dir = govukFontDir()
    const files = fs.readdirSync(dir)
    const regular = findByPrefix(files, 'light')
    const bold = findByPrefix(files, 'bold')
    if (!regular || !bold) {
      return null
    }
    return {
      regular: path.join(dir, regular),
      bold: path.join(dir, bold)
    }
  } catch {
    return null
  }
}

/** The committed Noto Sans pair. Always available; the floor of this module. */
export function bundledFonts() {
  return {
    regular: BUNDLED_REGULAR,
    bold: BUNDLED_BOLD,
    embedded: true,
    name: 'Noto Sans'
  }
}

/**
 * What the form offers, and what each choice costs.
 *
 * `conformant` is surfaced in the view and again on the result page, because
 * a non-embedded font is invisible in the output — the only way anyone knows
 * the file they just downloaded cannot meet PDF/UA is if the service says so.
 */
export const FONT_CHOICES = Object.freeze([
  {
    value: 'gds-transport',
    label: 'GDS Transport',
    hint: "GOV.UK's own typeface, read from the govuk-frontend package and embedded in the file.",
    conformant: true
  },
  {
    value: 'noto-sans',
    label: 'Noto Sans',
    hint: 'Open-licensed fallback, committed to this repo and embedded in the file.',
    conformant: true
  },
  {
    value: 'helvetica',
    label: 'Helvetica (PDF built-in)',
    hint: 'Not embedded, so the PDF cannot meet PDF/UA. Arial is not a PDF built-in — viewers substitute Helvetica for it, which is what this option produces.',
    conformant: false
  },
  {
    value: 'times',
    label: 'Times Roman (PDF built-in)',
    hint: 'Not embedded, so the PDF cannot meet PDF/UA.',
    conformant: false
  }
])

export const DEFAULT_FONT_CHOICE = 'gds-transport'

const BASE_14 = Object.freeze({
  helvetica: { regular: 'Helvetica', bold: 'Helvetica-Bold', name: 'Helvetica' },
  times: { regular: 'Times-Roman', bold: 'Times-Bold', name: 'Times Roman' }
})

/**
 * Resolve a radio value to something `registerFonts` can hand to pdfkit.
 *
 * pdfkit's `registerFont` takes a base-14 name, a path or a Buffer, so all
 * four choices flow through one call.
 *
 * @param {string} choice one of FONT_CHOICES[].value
 * @returns {{ regular: string, bold: string, embedded: boolean, name: string,
 *             requested: string, fellBack: boolean }}
 */
export function resolveFonts(choice = DEFAULT_FONT_CHOICE) {
  const base14 = BASE_14[choice]
  if (base14) {
    return { ...base14, embedded: false, requested: choice, fellBack: false }
  }

  if (choice === 'gds-transport') {
    const gds = gdsTransportPaths()
    if (gds) {
      return {
        ...gds,
        embedded: true,
        name: 'GDS Transport',
        requested: choice,
        fellBack: false
      }
    }
    // Named as a fallback so the caller can say so on the page: a substituted
    // typeface looks like a design decision rather than a fault.
    return { ...bundledFonts(), requested: choice, fellBack: true }
  }

  return { ...bundledFonts(), requested: 'noto-sans', fellBack: false }
}
