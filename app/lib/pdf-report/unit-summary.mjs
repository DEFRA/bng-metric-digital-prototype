/**
 * On-site biodiversity-unit figures, per unit type, from the file alone.
 *
 * The service's project summary page shows five figures for each of Area
 * habitats, Hedgerows and Watercourses: on-site baseline units, on-site
 * post-intervention units, the net unit change, the net percentage change,
 * and whether that percentage meets the project's target. This module
 * computes the same figures from the GeoPackage, so the PDF's summary page
 * can mirror that layout with real, file-derived numbers.
 *
 * The formula is the statutory metric's static one:
 *
 *   units = size × distinctiveness score × condition score × strategic
 *           significance multiplier
 *
 * where size is hectares for area habitats and kilometres for the linear
 * types, all measured from the geometry like every other figure in this
 * report. The scores come straight off the file — the template records
 * distinctiveness and condition as text — so no habitat-type lookup table
 * is needed.
 *
 * **Known limitation, stated on purpose:** the temporal and difficulty
 * multipliers that the full metric applies to CREATED and ENHANCED parcels
 * are not applied, because they need the engine's per-habitat time-to-target
 * tables. A post-intervention file with creation in it will therefore show
 * MORE post-intervention units here than the service calculates. The backend
 * owns the real engine and is the source of truth; these figures exist so the
 * spike's summary page has honest file-derived content, and the gap is the
 * same one README.md already records for calculated units.
 */

import { polygonAreaSqm, lineLengthMetres } from './geometry.mjs'
import { SQ_M_PER_HECTARE } from './layout.mjs'

const METRES_PER_KILOMETRE = 1_000

/**
 * The statutory 10% gain, as the default target. The service reads the real
 * target off the project; the CLI takes `--target` for the same reason.
 */
export const DEFAULT_TARGET_PERCENTAGE = 10

/** Statutory metric distinctiveness bands, as the template spells them. */
export const DISTINCTIVENESS_SCORES = Object.freeze({
  'V.Low': 1,
  Low: 2,
  Medium: 4,
  High: 6,
  'V.High': 8
})

/**
 * Statutory metric condition scores, as the template spells them.
 * "N/A - Other" is the sealed-surface case — land with no condition because
 * it has no habitat — and scores zero on purpose.
 */
export const CONDITION_SCORES = Object.freeze({
  Good: 3,
  'Fairly Good': 2.5,
  Moderate: 2,
  'Fairly Poor': 1.5,
  Poor: 1,
  'Condition Assessment N/A': 1,
  'N/A - Other': 0
})

/**
 * Strategic significance multipliers, keyed by the template's own option
 * strings (including its double space in "strategy/ no"). Anything else —
 * including an empty column — takes the neutral multiplier, because "not in
 * a local strategy" is the metric's own default.
 */
export const STRATEGIC_SIGNIFICANCE_MULTIPLIERS = Object.freeze({
  'Formally identified in local strategy': 1.15,
  'Location ecologically desirable but not in local strategy': 1.1,
  'Area/compensation not in local strategy/ no local strategy': 1
})
const NEUTRAL_STRATEGIC_SIGNIFICANCE = 1

/**
 * The three unit types the summary page shows, in its order. Individual
 * trees are deliberately absent: the metric sizes them by root protection
 * area, not mapped geometry, so a file-derived figure would be wrong rather
 * than approximate.
 */
export const UNIT_TYPES = Object.freeze([
  Object.freeze({ key: 'habitats', title: 'Area habitats', kind: 'area' }),
  Object.freeze({ key: 'hedgerows', title: 'Hedgerows', kind: 'linear' }),
  Object.freeze({ key: 'watercourses', title: 'Watercourses', kind: 'linear' })
])

/**
 * One summary per unit type:
 *
 *   { key, title, baselineUnits, postInterventionUnits, netChange,
 *     percentageChange }
 *
 * `postInterventionUnits`, `netChange` and `percentageChange` are null when
 * no post-intervention file was supplied; `percentageChange` is also null
 * when the baseline is zero, where a percentage has no meaning.
 */
export function summariseUnitTypes(baseline, postIntervention) {
  return UNIT_TYPES.map(({ key, title, kind }) => {
    const baselineUnits = layerUnits(baseline, key, kind, baselineValue)
    const postInterventionUnits = postIntervention
      ? layerUnits(postIntervention, key, kind, activeValue)
      : null

    const netChange =
      postInterventionUnits === null ? null : postInterventionUnits - baselineUnits
    const percentageChange =
      netChange === null || baselineUnits === 0
        ? null
        : (netChange / baselineUnits) * 100

    return { key, title, baselineUnits, postInterventionUnits, netChange, percentageChange }
  })
}

/** Met when the change reaches the target; an unknowable change is not met. */
export function meetsTarget(percentageChange, targetPercentage) {
  return percentageChange !== null && percentageChange >= targetPercentage
}

function layerUnits(site, key, kind, valueOf) {
  const features = site.layers[key]?.features ?? []
  return features
    .filter(isOnSite)
    .reduce((total, feature) => total + parcelUnits(feature, kind, valueOf), 0)
}

/**
 * "On-site" the way the summary page means it. A file that does not record
 * Location at all is treated as on-site — the red line boundary is the site —
 * so only an explicit "Off-site" excludes a parcel.
 */
function isOnSite(feature) {
  return (feature.properties?.Location ?? 'On-site') !== 'Off-site'
}

function parcelUnits(feature, kind, valueOf) {
  const properties = feature.properties ?? {}
  const distinctiveness =
    DISTINCTIVENESS_SCORES[dropdownValue(valueOf(properties, 'Distinctiveness'))] ?? 0
  const condition =
    CONDITION_SCORES[dropdownValue(valueOf(properties, 'Condition'))] ?? 0
  const significance =
    STRATEGIC_SIGNIFICANCE_MULTIPLIERS[
      dropdownValue(valueOf(properties, 'Strategic Significance'))
    ] ?? NEUTRAL_STRATEGIC_SIGNIFICANCE

  // An unrecognised distinctiveness or condition zeroes the parcel rather
  // than guessing a score: a figure that quietly omits a parcel reads low,
  // which is the safer direction for a headline number to be wrong in.
  return sizeOf(feature, kind) * distinctiveness * condition * significance
}

function sizeOf(feature, kind) {
  if (kind === 'area') {
    return polygonAreaSqm(feature.geometry) / SQ_M_PER_HECTARE
  }
  return lineLengthMetres(feature.geometry) / METRES_PER_KILOMETRE
}

/**
 * "3. Moderate" → "Moderate".
 *
 * The template's dropdowns number their options, and data that has been
 * through the dashboard keeps the number — the same quirk the habitat cards
 * normalise for the retention category. Data read straight from a file
 * usually arrives unnumbered, so both spellings must land on the same score.
 */
function dropdownValue(value) {
  if (typeof value !== 'string') {
    return value
  }
  return value.replace(/^\d+\.\s*/u, '')
}

/**
 * Blank is absent — and so is the literal string "Null", which is how some
 * exports (the demo data among them) spell an empty column. Without this a
 * retained parcel's "Proposed Condition: Null" would beat the baseline
 * fallback and zero the parcel.
 */
function recordedValue(value) {
  if (value === null || value === undefined) {
    return null
  }
  const trimmed = String(value).trim()
  if (trimmed === '' || /^null$/iu.test(trimmed)) {
    return null
  }
  return trimmed
}

function baselineValue(properties, suffix) {
  return recordedValue(properties[`Baseline ${suffix}`])
}

/**
 * The proposed value where the parcel has one, the baseline value otherwise —
 * the same fallback the habitat cards use, so a retained parcel scores its
 * baseline attributes rather than nothing.
 */
function activeValue(properties, suffix) {
  return recordedValue(properties[`Proposed ${suffix}`]) ?? baselineValue(properties, suffix)
}
