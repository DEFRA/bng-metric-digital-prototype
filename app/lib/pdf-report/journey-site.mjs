/**
 * The site model, built from what the prototype journey already has in hand
 * rather than from an uploaded file.
 *
 * `gpkg.mjs` reads a GeoPackage. This is the other way in: the summary page's
 * "Download report" button has no file to read, so it assembles the same shape
 * out of session state — and falls back to committed demo data when there is
 * no session state either, so the button always produces something to look at.
 *
 * The two sources are deliberately the same shape as each other and as
 * `readSite`, because the whole point is that ONE engine draws all three. If
 * this file ever grows a special case that only the demo path exercises, the
 * button has stopped demonstrating the real report.
 *
 * ── Why the session data fits without conversion ───────────────────────────
 *
 * `buildProjectDashboardMapData` (app/routes/project-dashboard.js) stores the
 * uploaded GeoPackage as GeoJSON FeatureCollections keyed by layer role, and
 * `bng-library/gpkg-io` leaves the coordinates in the file's own CRS — which
 * for a BNG template is EPSG:27700, in metres. That is exactly what the engine
 * projects from, and a GeoJSON feature is already `{ properties, geometry }`,
 * which is exactly what it reads. So this adapter is a re-keying, not a
 * transformation, and there is no reprojection anywhere in it.
 *
 * NOTHING here calculates. No metric engine, no biodiversity units — the
 * numbers on the report are the ones in the data plus areas and lengths
 * measured from geometry.
 */

import fs from 'node:fs'
import path from 'node:path'

const DEMO_PATH = path.resolve(import.meta.dirname, 'demo-site.json')

/**
 * Demo data, extracted from `example-files/` and frozen into the repository so
 * the button works on a cold session with no uploads behind it.
 *
 * Read once and cached: it is static, and re-reading it per request would put
 * a filesystem call on a path that does not need one.
 */
let demoData = null
function demo() {
  if (!demoData) {
    demoData = JSON.parse(fs.readFileSync(DEMO_PATH, 'utf8'))
  }
  return demoData
}

function featuresOf(collection) {
  return collection?.features ?? []
}

/**
 * Blank is absent.
 *
 * `??` is not enough here: the prototype kit populates `req.session.data` from
 * every form it has seen, so a field the user skipped arrives as `''` rather
 * than undefined — and `'' ?? fallback` is `''`. That put an empty site name
 * on a report drawn from a real upload.
 */
function nonBlank(value) {
  if (typeof value !== 'string') {
    return value ?? null
  }
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/** One layer in the shape the engine reads. */
function layer(features) {
  return features.length > 0 ? { features } : undefined
}

function siteFrom({ boundary, parcels, hedgerows, watercourses, trees, siteName }) {
  const layers = {}
  const redLineFeatures = boundary ? [boundary] : []

  if (redLineFeatures.length > 0) layers.redLine = { features: redLineFeatures }
  if (layer(parcels)) layers.habitats = layer(parcels)
  if (layer(hedgerows)) layers.hedgerows = layer(hedgerows)
  if (layer(watercourses)) layers.watercourses = layer(watercourses)
  if (layer(trees)) layers.trees = layer(trees)

  return {
    layers,
    redLine: boundary ?? null,
    siteName:
      nonBlank(siteName) ??
      nonBlank(boundary?.properties?.['Site Name']) ??
      nonBlank(parcels[0]?.properties?.['Site Name'])
  }
}

/**
 * A site from one kind of dashboard upload, or null if that kind has nothing.
 *
 * @param {object} mapData  a `projectDashboardMapDataByKind` entry
 */
function siteFromMapData(mapData, siteName) {
  const boundary = featuresOf(mapData?.siteBoundary)[0] ?? null
  const parcels = featuresOf(mapData?.parcels)
  if (!boundary && parcels.length === 0) {
    return null
  }
  return siteFrom({
    boundary,
    parcels,
    hedgerows: featuresOf(mapData?.hedgerows),
    watercourses: featuresOf(mapData?.watercourses),
    trees: featuresOf(mapData?.trees),
    siteName
  })
}

/** The committed demo pair. */
export function demoSite() {
  const data = demo()
  return {
    source: 'demo',
    baseline: siteFrom({
      boundary: data.boundary,
      parcels: data.baselineParcels,
      hedgerows: data.hedgerows,
      watercourses: data.watercourses,
      trees: [],
      siteName: data.siteName
    }),
    postIntervention: siteFrom({
      boundary: data.boundary,
      parcels: data.postParcels,
      hedgerows: data.hedgerows,
      watercourses: data.watercourses,
      trees: [],
      siteName: data.siteName
    })
  }
}

/**
 * What the summary page should put in a report.
 *
 * Prefers whatever the user has actually uploaded in this session, so the PDF
 * shows their own site rather than a stranger's, and only falls back to the
 * demo data when the session has nothing. `source` says which happened, so
 * the caller can be honest about it.
 *
 * @param {object} [sessionData]  `req.session.data`
 * @returns {{ source: 'session'|'demo'|'session+demo',
 *             baseline: object, postIntervention: object|null }}
 */
export function siteForJourney(sessionData = {}) {
  const byKind = sessionData.projectDashboardMapDataByKind ?? {}
  const siteName = nonBlank(sessionData.projectName)

  const baseline = siteFromMapData(byKind.baseline, siteName)
  const postIntervention = siteFromMapData(byKind['post-intervention'], siteName)

  if (!baseline && !postIntervention) {
    return demoSite()
  }

  // A post-intervention upload with no baseline still deserves a report; the
  // engine draws one map instead of two.
  return {
    source: 'session',
    baseline: baseline ?? postIntervention,
    postIntervention: baseline ? postIntervention : null
  }
}
