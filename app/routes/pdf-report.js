/**
 * PDF site report tool.
 *
 * Upload a baseline GeoPackage and (optionally) a post-intervention one, pick
 * a typeface and a basemap, and get back a designed, tagged, PDF/UA-targeted
 * site report — two site maps over an Ordnance Survey basemap, then one card
 * per habitat parcel carrying every attribute the file records.
 *
 * The engine is a port of the BMD-984 spike (bng-metric-harness,
 * `spikes/bmd-984-pdf-export/`), which is also what `bng-metric-backend`'s
 * report route is built from. It lives in `app/lib/pdf-report/` as ESM and is
 * reached from here through a cached dynamic import, the same CJS→ESM bridge
 * `app/lib/geopackage-parser.js` and `app/routes/gen-gpkg.js` use.
 *
 * NO metric calculations happen here. `app/lib/metric-calcs.js` is not called
 * and the report carries no biodiversity-unit figures: every number on the
 * page is read from the uploaded files or measured from their geometry. The
 * point of the tool is to show what the data and the layout look like on a
 * page, not to reproduce the metric.
 */

const os = require('node:os')
const fs = require('node:fs/promises')
const crypto = require('node:crypto')

const multer = require('multer')
const { LRUCache } = require('lru-cache')

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024
const MAX_FILES = 2

// multer's own random filenames, never `file.originalname` — that string comes
// from the client and would otherwise be a path-traversal hole.
const upload = multer({
  storage: multer.diskStorage({ destination: os.tmpdir() }),
  limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_FILES }
})

/**
 * Generated reports, held just long enough for the result page's download
 * link to fetch them.
 *
 * Keeping the bytes rather than streaming straight back is what buys the
 * result page, and the result page is where the caveats live: which typeface
 * was actually embedded, whether the OS basemap was reachable, and whether
 * the file that was just produced can meet PDF/UA at all. None of that is
 * visible in the document itself, so a bare download would leave a user with
 * a non-conformant PDF and no way to know.
 *
 * In-process, so it assumes the download lands on the instance that generated
 * it. True today — the prototype runs single-instance — and the cost of being
 * wrong is one dead link, not a broken journey.
 */
const REPORT_TTL_MS = 15 * 60 * 1000
const MAX_HELD_REPORTS = 8

const reports = new LRUCache({
  max: MAX_HELD_REPORTS,
  ttl: REPORT_TTL_MS,
  maxSize: MAX_HELD_REPORTS * MAX_UPLOAD_BYTES,
  sizeCalculation: (report) => report.buffer.length
})

// Lazy-loaded so a broken install surfaces on first use of this tool rather
// than at server startup, and so the ~8k lines of engine are not parsed by
// prototypes that never open it.
let enginePromise = null
function getEngine() {
  if (!enginePromise) {
    enginePromise = Promise.all([
      import('../lib/pdf-report/document.mjs'),
      import('../lib/pdf-report/gpkg.mjs'),
      import('../lib/pdf-report/fonts.mjs'),
      import('../lib/pdf-report/basemap.mjs'),
      import('../lib/pdf-report/journey-site.mjs')
    ]).then(([document, gpkg, fonts, basemap, journeySite]) => ({
      document,
      gpkg,
      fonts,
      basemap,
      journeySite
    }))
  }
  return enginePromise
}

const LAYOUT_CHOICES = Object.freeze([
  {
    value: 'cards',
    label: 'Cards — one card per parcel',
    hint: 'Every attribute the file records, each on its own line, beside a larger mini-map. Roughly two parcels to a page.',
    conformant: true
  },
  {
    value: 'table',
    label: 'Table — one row per parcel',
    hint: 'Reference, habitat type, condition and area only. Around eleven parcels to a page.',
    conformant: true
  }
])

function toItems(choices, selected) {
  return choices.map((choice) => ({
    value: choice.value,
    text: choice.label,
    hint: { text: choice.hint },
    checked: choice.value === selected
  }))
}

function pick(choices, value, fallback) {
  return choices.some((choice) => choice.value === value) ? value : fallback
}

async function formModel(engine, submitted = {}) {
  return {
    fontItems: toItems(
      engine.fonts.FONT_CHOICES,
      submitted.font ?? engine.fonts.DEFAULT_FONT_CHOICE
    ),
    basemapItems: toItems(
      engine.basemap.BASEMAP_CHOICES,
      submitted.basemap ?? engine.basemap.DEFAULT_BASEMAP_CHOICE
    ),
    layoutItems: toItems(LAYOUT_CHOICES, submitted.layout ?? 'cards'),
    maxUploadMb: MAX_UPLOAD_BYTES / (1024 * 1024)
  }
}

/** Turn a thrown error into something a user can act on. */
function explain(error) {
  if (/expected EPSG:27700/.test(error.message)) {
    return `${error.message} Re-export the file in British National Grid.`
  }
  if (
    /file is not a database|SQLITE_NOTADB|unable to open/i.test(error.message)
  ) {
    return 'That file could not be read as a GeoPackage. Check it is a .gpkg and not a shapefile or a zip.'
  }
  if (/no such table|gpkg_contents/i.test(error.message)) {
    return 'That file is a database but not a GeoPackage — no gpkg_contents table.'
  }
  return error.message
}

async function renderForm(
  res,
  engine,
  { status = 200, error = null, submitted = {} } = {}
) {
  res.status(status).render('pdf-report/index', {
    ...(await formModel(engine, submitted)),
    error
  })
}

function uploadedPath(req, field) {
  return req.files?.[field]?.[0]?.path ?? null
}

async function removeAll(paths) {
  await Promise.all(
    paths.filter(Boolean).map((file) => fs.unlink(file).catch(() => {}))
  )
}

/** Collect a pdfkit document into a Buffer. */
function toBuffer(doc) {
  return new Promise((resolve, reject) => {
    const chunks = []
    doc.on('data', (chunk) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)
    doc.end()
  })
}

/**
 * Draw a report. The single path both entry points go through — the developer
 * tool, which gets its site from an uploaded GeoPackage, and the summary
 * page's button, which gets its site from the session or the demo data.
 *
 * Keeping one builder is the point of having two entry points: if the button
 * ever renders through different code, it has stopped demonstrating the
 * report the tool produces.
 */
async function buildReport(
  engine,
  { baseline, postIntervention, font, basemapSource, layout }
) {
  const fonts = engine.fonts.resolveFonts(font)
  const basemap = await engine.basemap.resolveBasemap({
    source: basemapSource,
    apiKey: process.env.OS_PROJECT_API_KEY
  })

  const started = Date.now()
  const { doc, stats } = await engine.document.buildSummaryPdf({
    baseline,
    postIntervention,
    grid: basemap.grid,
    tileSource: basemap.tileSource,
    layout,
    fonts
  })

  return {
    buffer: await toBuffer(doc),
    stats,
    fonts,
    basemap,
    elapsedMs: Date.now() - started
  }
}

/** `Test Area` → `test-area-summary.pdf`. */
function attachmentName(siteName) {
  const name = (siteName ?? 'site')
    .replace(/[^a-zA-Z0-9-_ ]/g, '')
    .trim()
    .replaceAll(' ', '-')
    .toLowerCase()
  return `${name || 'site'}-summary.pdf`
}

function sendPdf(res, buffer, siteName) {
  res.set('Content-Type', 'application/pdf')
  res.set(
    'Content-Disposition',
    `attachment; filename="${attachmentName(siteName)}"`
  )
  res.set('Content-Length', String(buffer.length))
  res.send(buffer)
}

function registerPdfReportRoutes(router) {
  router.get('/test-data/pdf-report', async function (req, res, next) {
    try {
      await renderForm(res, await getEngine())
    } catch (error) {
      next(error)
    }
  })

  router.post(
    '/test-data/pdf-report',
    upload.fields([
      { name: 'baseline', maxCount: 1 },
      { name: 'postIntervention', maxCount: 1 }
    ]),
    async function (req, res, next) {
      const engine = await getEngine()
      const submitted = {
        font: pick(
          engine.fonts.FONT_CHOICES,
          req.body.font,
          engine.fonts.DEFAULT_FONT_CHOICE
        ),
        basemap: pick(
          engine.basemap.BASEMAP_CHOICES,
          req.body.basemap,
          engine.basemap.DEFAULT_BASEMAP_CHOICE
        ),
        layout: pick(LAYOUT_CHOICES, req.body.layout, 'cards')
      }

      const baselinePath = uploadedPath(req, 'baseline')
      const postPath = uploadedPath(req, 'postIntervention')

      try {
        if (!baselinePath) {
          return renderForm(res, engine, {
            status: 400,
            error: 'Select a baseline GeoPackage.',
            submitted
          })
        }

        const baseline = engine.gpkg.readSite(baselinePath)
        const postIntervention = postPath
          ? engine.gpkg.readSite(postPath)
          : null

        const { buffer, stats, fonts, basemap, elapsedMs } = await buildReport(
          engine,
          {
            baseline,
            postIntervention,
            font: submitted.font,
            basemapSource: submitted.basemap,
            layout: submitted.layout
          }
        )

        const id = crypto.randomUUID()
        reports.set(id, { buffer, siteName: baseline.siteName })

        res.render('pdf-report/result', {
          id,
          siteName: baseline.siteName ?? 'Unnamed site',
          sizeKb: (buffer.length / 1024).toFixed(1),
          elapsedSeconds: (elapsedMs / 1000).toFixed(1),
          stats,
          layout: submitted.layout,
          fonts,
          basemap,
          hasPostIntervention: Boolean(postIntervention)
        })
      } catch (error) {
        console.error('[pdf-report] could not build the report:', error)
        return renderForm(res, engine, {
          status: 400,
          error: explain(error),
          submitted
        })
      } finally {
        await removeAll([baselinePath, postPath])
      }
    }
  )

  router.get('/test-data/pdf-report/download/:id', function (req, res) {
    const report = reports.get(req.params.id)
    if (!report) {
      return res.status(404).render('pdf-report/expired')
    }
    sendPdf(res, report.buffer, report.siteName)
  })

  /**
   * The journey's own "Download report" button, on the project summary page.
   *
   * No form and no options: one click, one file. It draws through exactly the
   * same `buildReport` as the developer tool, with the choices a real service
   * would have made for the user — GDS Transport, OS mapping, cards — so what
   * comes out is the report, not a reduced version of it.
   *
   * The site comes from whatever the session already holds: an uploaded
   * GeoPackage from `/project-dashboard/upload`, or the committed demo data
   * when the session is cold. Nothing is read from a file here and nothing is
   * calculated; see `app/lib/pdf-report/journey-site.mjs`.
   */
  router.get('/project-dashboard/report.pdf', async function (req, res, next) {
    try {
      const engine = await getEngine()
      const { baseline, postIntervention, source } =
        engine.journeySite.siteForJourney(req.session?.data ?? {})

      const { buffer, stats, fonts, basemap, elapsedMs } = await buildReport(
        engine,
        {
          baseline,
          postIntervention,
          font: engine.fonts.DEFAULT_FONT_CHOICE,
          basemapSource: engine.basemap.DEFAULT_BASEMAP_CHOICE,
          layout: 'cards'
        }
      )

      // The one line that says which of the two data sources was used, which
      // typeface was embedded and whether OS answered. A download has nowhere
      // to put that, and all three are invisible in the file.
      console.log(
        `[pdf-report] summary report: ${source} data, ${stats.habitats} parcels, ` +
          `${fonts.name}, ${basemap.kind}, ${(buffer.length / 1024).toFixed(1)} kB ` +
          `in ${elapsedMs} ms`
      )

      sendPdf(res, buffer, baseline.siteName)
    } catch (error) {
      next(error)
    }
  })
}

module.exports = { registerPdfReportRoutes, LAYOUT_CHOICES }
