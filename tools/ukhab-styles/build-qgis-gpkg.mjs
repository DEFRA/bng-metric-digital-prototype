#!/usr/bin/env node
// Build a GeoPackage that renders every UKHab "type" symbology in QGIS, for
// side-by-side comparison with the HTML style browser (/tools/ukhab-styles).
//
//   node tools/ukhab-styles/build-qgis-gpkg.mjs
//
// It creates one feature per category for the three categorised QGIS styles and
// embeds the original .qml as each layer's default style (QGIS `layer_styles`
// table). Drag the .gpkg into QGIS, add the layers, and the real symbology is
// applied automatically — the Layers-panel legend then shows QGIS's own render
// of every category, directly comparable to the HTML cards.
//
//   habitats  (polygon) — Baseline Habitat Type   — Habitats Master.qml
//   hedgerows (line)    — Proposed Hedge Type      — Hedgerows Master.qml
//   rivers    (line)    — Baseline River Type      — Watercourse baseline.qml
//
// The tree / rivers-master styles are QGIS rule-based renderers (filters over
// several columns rather than one category field), so they are out of scope for
// this auto-binding file; load those .qml manually if you need them.
//
// Source:  tools/ukhab-styles/qml/**/*.qml   (dev-only)
// Output:  tools/ukhab-styles/ukhab-symbology.gpkg   (committed; open in QGIS)

import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

const QML_ROOT = join(import.meta.dirname, 'qml')
const OUTPUT = join(import.meta.dirname, 'ukhab-symbology.gpkg')

const SRID = 4326
const GPKG_APPLICATION_ID = 1196444487 // 'GPKG'
const GPKG_USER_VERSION = 10301

// Layers to build. geom: polygon | line. attr must match the .qml renderer attr.
const LAYERS = [
  {
    table: 'habitats',
    geom: 'polygon',
    attr: 'Baseline Habitat Type',
    qml: 'Styles/Habitats Master.qml',
    origin: [0, 51.5]
  },
  {
    table: 'hedgerows',
    geom: 'line',
    attr: 'Proposed Hedge Type',
    qml: 'Styles/Hedgerows Master.qml',
    origin: [2, 51.5]
  },
  {
    table: 'rivers',
    geom: 'line',
    attr: 'Baseline River Type',
    qml: 'Styles/Watercourse baseline.qml',
    origin: [4, 51.5]
  }
]

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decodeEntities(text) {
  return text.replaceAll(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (whole, code) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16))
    }
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10))
    return ENTITIES[code] ?? whole
  })
}

// Pull the category value/label pairs out of a categorised .qml.
function readCategories(qmlText) {
  const cats = []
  const re = /<category\b[^>]*\/>/g
  let m
  while ((m = re.exec(qmlText)) !== null) {
    const tag = m[0]
    const value = /value="([^"]*)"/.exec(tag)
    const label = /label="([^"]*)"/.exec(tag)
    const render = /render="([^"]*)"/.exec(tag)
    if (render && (render[1] === 'false' || render[1] === '0')) continue
    cats.push({
      value: decodeEntities(value ? value[1] : ''),
      label: decodeEntities(label ? label[1] : value ? value[1] : '')
    })
  }
  return cats
}

// ---------------------------------------------------------------------------
// GeoPackage geometry encoding (little-endian WKB wrapped in a GPKG blob)
// ---------------------------------------------------------------------------

function gpkgBlob(wkb) {
  const header = Buffer.alloc(8)
  header.write('GP', 0, 'ascii') // magic
  header.writeUInt8(0, 2) // version
  header.writeUInt8(1, 3) // flags: little-endian, no envelope
  header.writeInt32LE(SRID, 4)
  return Buffer.concat([header, wkb])
}
function wkbPoints(buf, offset, pts) {
  let o = offset
  for (const [x, y] of pts) {
    buf.writeDoubleLE(x, o)
    buf.writeDoubleLE(y, o + 8)
    o += 16
  }
  return o
}
function wkbLine(pts) {
  const buf = Buffer.alloc(9 + pts.length * 16)
  buf.writeUInt8(1, 0)
  buf.writeUInt32LE(2, 1) // LineString
  buf.writeUInt32LE(pts.length, 5)
  wkbPoints(buf, 9, pts)
  return buf
}
function wkbPolygon(ring) {
  const buf = Buffer.alloc(13 + ring.length * 16)
  buf.writeUInt8(1, 0)
  buf.writeUInt32LE(3, 1) // Polygon
  buf.writeUInt32LE(1, 5) // one ring
  buf.writeUInt32LE(ring.length, 9)
  wkbPoints(buf, 13, ring)
  return buf
}

// One feature per category, laid out in a compact grid so QGIS shows a tidy
// block of swatches. Returns { blob, bbox } accumulator via callback.
const STEP = 0.012
const SIZE = 0.009
function geomFor(geom, originX, originY, index) {
  const x = originX + index.col * STEP
  const y = originY - index.row * STEP
  if (geom === 'polygon') {
    const ring = [
      [x, y],
      [x + SIZE, y],
      [x + SIZE, y - SIZE],
      [x, y - SIZE],
      [x, y]
    ]
    return { wkb: wkbPolygon(ring), pts: ring }
  }
  const pts = [
    [x, y - SIZE / 2],
    [x + SIZE, y - SIZE / 2]
  ]
  return { wkb: wkbLine(pts), pts }
}

// ---------------------------------------------------------------------------
// GeoPackage skeleton
// ---------------------------------------------------------------------------

function createSkeleton(db) {
  db.pragma(`application_id = ${GPKG_APPLICATION_ID}`)
  db.pragma(`user_version = ${GPKG_USER_VERSION}`)

  db.exec(`
    CREATE TABLE gpkg_spatial_ref_sys (
      srs_name TEXT NOT NULL, srs_id INTEGER PRIMARY KEY,
      organization TEXT NOT NULL, organization_coordsys_id INTEGER NOT NULL,
      definition TEXT NOT NULL, description TEXT
    );
    CREATE TABLE gpkg_contents (
      table_name TEXT PRIMARY KEY, data_type TEXT NOT NULL, identifier TEXT UNIQUE,
      description TEXT DEFAULT '', last_change TEXT NOT NULL,
      min_x DOUBLE, min_y DOUBLE, max_x DOUBLE, max_y DOUBLE,
      srs_id INTEGER, CONSTRAINT fk_gc_srs FOREIGN KEY (srs_id)
        REFERENCES gpkg_spatial_ref_sys(srs_id)
    );
    CREATE TABLE gpkg_geometry_columns (
      table_name TEXT NOT NULL, column_name TEXT NOT NULL,
      geometry_type_name TEXT NOT NULL, srs_id INTEGER NOT NULL,
      z TINYINT NOT NULL, m TINYINT NOT NULL,
      CONSTRAINT pk_geom_cols PRIMARY KEY (table_name, column_name)
    );
    CREATE TABLE layer_styles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      f_table_catalog TEXT, f_table_schema TEXT, f_table_name TEXT,
      f_geometry_column TEXT, styleName TEXT, styleQML TEXT, styleSLD TEXT,
      useAsDefault BOOLEAN, description TEXT, owner TEXT, ui TEXT,
      update_time DATETIME DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `)

  const wgs84 =
    'GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563,' +
    'AUTHORITY["EPSG","7030"]],AUTHORITY["EPSG","6326"]],' +
    'PRIMEM["Greenwich",0,AUTHORITY["EPSG","8901"]],' +
    'UNIT["degree",0.0174532925199433,AUTHORITY["EPSG","9122"]],' +
    'AUTHORITY["EPSG","4326"]]'
  const srs = db.prepare(
    `INSERT INTO gpkg_spatial_ref_sys
     (srs_name, srs_id, organization, organization_coordsys_id, definition, description)
     VALUES (?,?,?,?,?,?)`
  )
  srs.run('Undefined cartesian SRS', -1, 'NONE', -1, 'undefined', null)
  srs.run('Undefined geographic SRS', 0, 'NONE', 0, 'undefined', null)
  srs.run('WGS 84', 4326, 'EPSG', 4326, wgs84, null)
}

function addLayer(db, layer) {
  const qmlText = readFileSync(join(QML_ROOT, layer.qml), 'utf-8')
  const cats = readCategories(qmlText)
  const cols = Math.ceil(Math.sqrt(cats.length))
  const geomType = layer.geom === 'polygon' ? 'POLYGON' : 'LINESTRING'
  const [ox, oy] = layer.origin

  db.exec(
    `CREATE TABLE "${layer.table}" (
       fid INTEGER PRIMARY KEY AUTOINCREMENT,
       geom BLOB,
       "${layer.attr}" TEXT,
       label TEXT
     )`
  )

  const insert = db.prepare(
    `INSERT INTO "${layer.table}" (geom, "${layer.attr}", label) VALUES (?,?,?)`
  )
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const tx = db.transaction(() => {
    cats.forEach((cat, i) => {
      const g = geomFor(layer.geom, ox, oy, { col: i % cols, row: Math.floor(i / cols) })
      for (const [px, py] of g.pts) {
        if (px < minX) minX = px
        if (py < minY) minY = py
        if (px > maxX) maxX = px
        if (py > maxY) maxY = py
      }
      insert.run(gpkgBlob(g.wkb), cat.value, cat.label)
    })
  })
  tx()

  db.prepare(
    `INSERT INTO gpkg_contents
      (table_name, data_type, identifier, description, last_change, min_x, min_y, max_x, max_y, srs_id)
     VALUES (?,?,?,?, strftime('%Y-%m-%dT%H:%M:%fZ','now'), ?,?,?,?,?)`
  ).run(
    layer.table,
    'features',
    layer.table,
    `${cats.length} categories from ${layer.qml}`,
    minX,
    minY,
    maxX,
    maxY,
    SRID
  )

  db.prepare(
    `INSERT INTO gpkg_geometry_columns
      (table_name, column_name, geometry_type_name, srs_id, z, m)
     VALUES (?, 'geom', ?, ?, 0, 0)`
  ).run(layer.table, geomType, SRID)

  db.prepare(
    `INSERT INTO layer_styles
      (f_table_catalog, f_table_schema, f_table_name, f_geometry_column,
       styleName, styleQML, styleSLD, useAsDefault, description, owner, ui)
     VALUES ('', '', ?, 'geom', ?, ?, NULL, 1, ?, '', NULL)`
  ).run(layer.table, layer.table, qmlText, `UKHab symbology — ${layer.qml}`)

  console.log(
    `  ${layer.table}: ${cats.length} features (${geomType}), style ${layer.qml}`
  )
  return cats.length
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

rmSync(OUTPUT, { force: true })
const db = new Database(OUTPUT)
db.pragma('journal_mode = DELETE') // plain single-file output, no -wal sidecar
createSkeleton(db)
let total = 0
for (const layer of LAYERS) total += addLayer(db, layer)
db.close()
console.log(`\nWrote ${OUTPUT} — ${LAYERS.length} layers, ${total} features.`)
console.log('Open in QGIS: drag the .gpkg in, add the layers; styles apply automatically.')
