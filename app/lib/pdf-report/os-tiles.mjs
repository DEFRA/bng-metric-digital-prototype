/**
 * The report's basemap tiles, straight from Ordnance Survey.
 *
 * The product is *OS NGD API – Tiles* (the `ngd-base` tileset, EPSG:27700) —
 * the same one `app/routes/os-api.js` already proxies for the interactive map
 * pages, so this needs no new entitlement and no new secret. Vector rather
 * than raster because the project key is OpenData, which caps the raster OS
 * Maps API at roughly 1.75 m/px — too coarse for a printed site map.
 *
 * Why this calls OS directly instead of going through our own
 * `/api/os/tiles/...` route, which would otherwise be the obvious reuse:
 *
 *   1. It would be an HTTP round trip from the server to itself, per tile, and
 *      a 20-parcel report fetches upwards of 150 tiles.
 *   2. That route answers `204 No Content` when OS fails, so the map still
 *      renders in the browser. For a PDF an empty tile is not a degraded
 *      picture, it is a hole — this path needs the error, not a blank.
 *
 * Everything else is shared: the key stays server-side, and all traffic goes
 * through `proxyFetch`, which routes via HTTP_PROXY so it works behind CDP's
 * egress proxy. A bare `fetch` would work locally and fail in deployment.
 */

import { LRUCache } from 'lru-cache'

import { proxyFetch } from '../proxy-fetch.js'
import { gridFromTileMatrixSetJson } from './grid.mjs'
import { decodeVectorTile } from './mvt.mjs'

const COLLECTION = 'ngd-base'
const CRS = '27700'
const BASE = 'https://api.os.uk/maps/vector/ngd/ota/v1'

const TILES_URL = `${BASE}/collections/${COLLECTION}/tiles/${CRS}`
const TILE_MATRIX_SET_URL = `${BASE}/tilematrixsets/${CRS}`

/**
 * A tile is ~10-60 kB decoded. 2000 of them is tens of MB, which is worth
 * spending: without a cache every submission re-fetches every tile, and the
 * two site maps plus a mini-map per parcel overlap heavily.
 */
const MAX_CACHED_TILES = 2000
const TILE_TTL_MS = 24 * 60 * 60 * 1000

const REQUEST_TIMEOUT_MS = 15_000

const tileCache = new LRUCache({ max: MAX_CACHED_TILES, ttl: TILE_TTL_MS })

/** The tile matrix set is static data; read it once per process. */
let gridPromise = null

function withKey(url, apiKey) {
  return `${url}?key=${encodeURIComponent(apiKey)}`
}

/**
 * Name the OS Data Hub product in the failure, because a key that is valid but
 * lacks this API looks exactly like a key that is wrong.
 */
function describeFailure(response, what) {
  if (response.status === 401 || response.status === 403) {
    return (
      `${what}: ${response.status} from Ordnance Survey. The key in ` +
      'OS_API_KEY needs the "OS NGD API – Tiles" product added to its project.'
    )
  }
  return `${what}: ${response.status} ${response.statusText}`
}

async function getJson(url, what, fetchImpl) {
  const response = await fetchImpl(url, {
    method: 'GET',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  })
  if (!response.ok) {
    throw new Error(describeFailure(response, what))
  }
  return response.json()
}

/**
 * The EPSG:27700 tile matrix set, as the projector and tile maths need it.
 *
 * Read from OS rather than hard-coded: the origin and the resolution ladder
 * are what put the habitat geometry on the right pixel, and a constant copied
 * into the source is a constant nobody notices going stale.
 */
export function fetchOsGrid(apiKey, { fetchImpl = proxyFetch } = {}) {
  if (!gridPromise) {
    gridPromise = getJson(
      withKey(TILE_MATRIX_SET_URL, apiKey),
      'Could not read the OS EPSG:27700 tile matrix set',
      fetchImpl
    )
      .then(gridFromTileMatrixSetJson)
      .catch((error) => {
        // Do not memoise a failure — the next request should try again.
        gridPromise = null
        throw error
      })
  }
  return gridPromise
}

/**
 * A tile source in the shape the PDF engine expects:
 * `(grid, z, col, row) => Promise<{ layers }>`.
 *
 * NOTE the path order. OGC API – Tiles is `{tileMatrix}/{tileRow}/{tileCol}`,
 * so the row comes before the column — the opposite way round from the
 * `{z}/{x}/{y}` convention the browser-side map uses.
 */
export function osVectorTileSource(apiKey, { fetchImpl = proxyFetch } = {}) {
  return async function osVectorTile(grid, z, col, row) {
    const key = `${z}/${col}/${row}`
    const cached = tileCache.get(key)
    if (cached) {
      return cached
    }

    const response = await fetchImpl(withKey(`${TILES_URL}/${z}/${row}/${col}`, apiKey), {
      method: 'GET',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    })

    // 204 is how OS signals "nothing here" for a tile outside the data extent
    // — the sea, mostly. That is an empty tile, not a failure.
    if (response.status === 204) {
      const empty = { layers: {} }
      tileCache.set(key, empty)
      return empty
    }

    if (!response.ok) {
      throw new Error(describeFailure(response, `Tile ${key}`))
    }

    const tile = decodeVectorTile(Buffer.from(await response.arrayBuffer()))
    tileCache.set(key, tile)
    return tile
  }
}

/** Test seam: drop everything remembered between processes-worth of requests. */
export function clearTileCache() {
  tileCache.clear()
  gridPromise = null
}
