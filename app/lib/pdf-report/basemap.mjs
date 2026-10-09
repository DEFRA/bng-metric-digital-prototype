/**
 * Which basemap sits under the habitat geometry, and what to do when the one
 * that was asked for is not available.
 *
 * Two sources:
 *
 *   os         real OS NGD vector tiles. Needs OS_PROJECT_API_KEY and network.
 *   synthetic  a generated grid that states its own ground coordinates. Needs
 *              neither, and is what makes the tool demonstrable — and its
 *              tests runnable — with no secret at all.
 *
 * The synthetic basemap is not a placeholder for the sake of one: every line
 * it draws is at a round EPSG:27700 coordinate, so habitat geometry drawn at
 * the same coordinate must land exactly on it. That makes registration
 * provable rather than merely plausible.
 *
 * Asking for `os` and not getting it DEGRADES rather than fails. A report with
 * a generated grid behind it is still a correct, complete, accessible report,
 * and refusing to produce one because a tile server is unreachable would turn
 * a cosmetic dependency into an outage. The caller is handed `degraded` and
 * `reason` so it can say so on the page — a substituted basemap otherwise
 * looks like a design decision rather than a fault.
 */

import { syntheticTileSource } from './tiles.mjs'
import { fetchOsGrid, isOsTileError, osVectorTileSource } from './os-tiles.mjs'

/**
 * A tile matrix set shaped like the one OS publishes for EPSG:27700: a shared
 * top-left origin, 256px tiles, resolutions halving per level.
 *
 * Used ONLY with the synthetic basemap, where the numbers are arbitrary
 * because the tiles are generated from the same grid they are drawn against.
 * The real grid is read from OS — see `fetchOsGrid`. Do not promote these
 * constants into anything that talks to api.os.uk.
 */
export const SYNTHETIC_GRID = Object.freeze({
  originX: -238375,
  originY: 1376256,
  tileSize: 256,
  resolutions: [
    896, 448, 224, 112, 56, 28, 14, 7, 3.5, 1.75, 0.875, 0.4375, 0.21875, 0.109375
  ]
})

export const BASEMAP_CHOICES = Object.freeze([
  {
    value: 'os',
    label: 'Ordnance Survey',
    hint: 'OS NGD vector tiles, drawn as PDF paths. Needs OS_PROJECT_API_KEY; falls back to the grid below if OS cannot be reached.',
    conformant: true
  },
  {
    value: 'synthetic',
    label: 'Generated grid (no OS data)',
    hint: 'A grid labelled with real British National Grid coordinates. No key, no network — use this to check that the habitat geometry lands where it should.',
    conformant: true
  }
])

export const DEFAULT_BASEMAP_CHOICE = 'os'

/**
 * Fall back to the generated grid after OS has already been chosen — a tile
 * failed part-way through drawing, rather than the grid failing up front.
 *
 * The caller rebuilds the document from scratch with this: a PDF cannot have
 * half its basemap swapped once written, and a report drawn half on OS tiles
 * and half on a generated grid would be worse than either.
 */
export function degradeToSynthetic(reason) {
  return synthetic(reason)
}

/** Re-exported so callers need not reach past this module into os-tiles. */
export { isOsTileError }

function synthetic(reason = null) {
  return {
    grid: SYNTHETIC_GRID,
    tileSource: syntheticTileSource(),
    kind: 'Generated grid (no OS data)',
    requested: reason ? 'os' : 'synthetic',
    degraded: Boolean(reason),
    reason
  }
}

/**
 * @param {object} options
 * @param {string} options.source  'os' | 'synthetic'
 * @param {string} [options.apiKey]  OS_PROJECT_API_KEY
 * @param {Function} [options.log]
 * @param {Function} [options.fetchImpl]  test seam; defaults to proxyFetch
 * @returns {Promise<{ grid: object, tileSource: Function, kind: string,
 *                     degraded: boolean, reason: string|null }>}
 */
export async function resolveBasemap({
  source = DEFAULT_BASEMAP_CHOICE,
  apiKey,
  log = console,
  fetchImpl = undefined
} = {}) {
  if (source !== 'os') {
    return synthetic()
  }

  if (!apiKey) {
    // The absence, never the value.
    log.warn?.('[pdf-report] OS_PROJECT_API_KEY is not set; using the generated basemap')
    return synthetic('OS_PROJECT_API_KEY is not set on this environment.')
  }

  try {
    const grid = await fetchOsGrid(apiKey, fetchImpl ? { fetchImpl } : undefined)
    return {
      grid,
      tileSource: osVectorTileSource(apiKey, fetchImpl ? { fetchImpl } : undefined),
      kind: 'Ordnance Survey NGD (ngd-base, EPSG:27700)',
      requested: 'os',
      degraded: false,
      reason: null
    }
  } catch (error) {
    log.warn?.(`[pdf-report] OS basemap unavailable: ${error.message}`)
    return synthetic(error.message)
  }
}
