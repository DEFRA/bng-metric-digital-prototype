/**
 * Read a BNG GeoPackage.
 *
 * Uses `better-sqlite3`, which this repo already depends on, rather than the
 * built-in `node:sqlite` the original spike used — the built-in still prints
 * an experimental warning on Node 24, and the driver here is already loaded by
 * `bng-library/gpkg-io` for the upload journeys. The two APIs are otherwise
 * the same shape.
 *
 * In the real service this is the wrong source: the backend already holds the
 * same geometry in PostGIS as `geometry(..., 27700)`, and that is the copy the
 * user has since edited (`PUT /projects/{id}/habitats/{featureId}`), so an
 * uploaded file can be stale. Reading the file is what makes this tool
 * standalone — it takes a file and nothing else.
 */

import Database from 'better-sqlite3'

import {
  STAGE_BASELINE,
  STAGE_POST_INTERVENTION,
  isStageHabitatLayer,
  layerStage,
  hasStageLayers
} from '../habitat-layers.js'
import { gpkgBlobToGeometry } from './wkb.mjs'

export { STAGE_BASELINE, STAGE_POST_INTERVENTION }

export const BNG_SRS_ID = 27700

/**
 * Layer names carry meaning in the BNG template, so map them onto the roles
 * the report cares about rather than guessing from geometry type.
 */
const LAYER_ROLES = {
  'Red Line Boundary': 'redLine',
  Habitats: 'habitats',
  Hedgerows: 'hedgerows',
  Rivers: 'watercourses',
  'Urban Trees': 'trees'
}

/**
 * The other layers of a BNG Service file, by name without the stage suffix,
 * in lower case.
 */
const STAGE_LAYER_ROLES = {
  hedgerows: 'hedgerows',
  watercourses: 'watercourses',
  'individual trees': 'trees'
}

/**
 * The BNG Service template holds both stages in one file, with each layer
 * named for its stage (app/lib/habitat-layers.js). Only the layers of the
 * stage being read take a role, so one stage cannot overwrite the other.
 */
function layerRole(name, stage) {
  if (LAYER_ROLES[name]) {
    return LAYER_ROLES[name]
  }
  if (isStageHabitatLayer(name, stage)) {
    return 'habitats'
  }
  if (layerStage(name) !== stage) {
    return null
  }
  const baseName = name.slice(0, -(stage.length + 1)).toLowerCase()
  return STAGE_LAYER_ROLES[baseName] ?? null
}

/**
 * List the feature layers, with the SRS id declared for each geometry column.
 *
 * The srsId is read rather than inferred. The digital prototype sniffs
 * projection from coordinate magnitude instead
 * (`isLikelyBNG` in app/assets/javascripts/map-habitats-summary.js), which is
 * a heuristic that eventually guesses wrong — the file states the answer.
 */
export function readLayers(db, stage = STAGE_BASELINE) {
  const contents = db
    .prepare(
      `SELECT table_name, identifier FROM gpkg_contents WHERE data_type = 'features'`
    )
    .all()

  const geometryColumns = new Map(
    db
      .prepare(
        `SELECT table_name, column_name, geometry_type_name, srs_id
           FROM gpkg_geometry_columns`
      )
      .all()
      .map((row) => [row.table_name, row])
  )

  const layers = []
  for (const row of contents) {
    const geometry = geometryColumns.get(row.table_name)
    if (!geometry) {
      continue
    }
    layers.push({
      name: row.table_name,
      role: layerRole(row.table_name, stage),
      geometryColumn: geometry.column_name,
      geometryType: geometry.geometry_type_name,
      srsId: geometry.srs_id
    })
  }
  return layers
}

/**
 * Read every feature of one layer: all attribute columns, plus the decoded
 * geometry.
 *
 * @returns {Array<{ properties: object, geometry: object }>}
 */
export function readFeatures(db, layer) {
  const columns = db
    .prepare(`PRAGMA table_info("${layer.name}")`)
    .all()
    .map((column) => column.name)

  const rows = db
    .prepare(
      `SELECT ${columns.map((c) => `"${c}"`).join(', ')}
         FROM "${layer.name}"
        WHERE "${layer.geometryColumn}" IS NOT NULL`
    )
    .all()

  return rows.map((row) => {
    const { geometry, srsId } = gpkgBlobToGeometry(row[layer.geometryColumn])
    assertBngSrs(srsId, `${layer.name} feature ${row.fid}`)

    const properties = {}
    for (const column of columns) {
      if (column !== layer.geometryColumn) {
        properties[column] = row[column]
      }
    }
    return { properties, geometry }
  })
}

/**
 * Fail loudly on anything that is not British National Grid.
 *
 * Every downstream calculation — the tile grid, the page transform, the areas —
 * assumes metres on EPSG:27700. Silently accepting degrees would put the
 * geometry somewhere off the coast of Africa rather than produce a visible
 * error, so this is checked at both the layer and the feature level.
 */
export function assertBngSrs(srsId, what) {
  if (srsId !== BNG_SRS_ID) {
    throw new Error(
      `${what}: expected EPSG:${BNG_SRS_ID} (British National Grid), got EPSG:${srsId}. ` +
        'This spike does no reprojection by design.'
    )
  }
}

/**
 * Read a whole site: the red line, and the habitat layers keyed by role.
 *
 * `holdsStages` is true for a BNG Service file, which holds both stages; a
 * legacy file holds one stage, and `stage` does not change what is read.
 *
 * @param {string} filename path to a .gpkg
 * @param {string} [stage] the stage to read from a BNG Service file
 * @returns {{ layers: object, redLine: object|null, siteName: string|null, holdsStages: boolean }}
 */
export function readSite(filename, stage = STAGE_BASELINE) {
  const db = new Database(filename, { readonly: true, fileMustExist: true })
  try {
    const layers = {}
    const fileLayers = readLayers(db, stage)
    const holdsStages = hasStageLayers(fileLayers)
    for (const layer of fileLayers) {
      assertBngSrs(layer.srsId, `layer "${layer.name}"`)
      if (layer.role) {
        layers[layer.role] = { ...layer, features: readFeatures(db, layer) }
      }
    }

    const redLine = layers.redLine?.features?.[0] ?? null
    return {
      layers,
      redLine,
      siteName:
        redLine?.properties?.['Site Name'] ??
        layers.habitats?.features?.[0]?.properties?.['Site Name'] ??
        null,
      holdsStages
    }
  } finally {
    db.close()
  }
}
