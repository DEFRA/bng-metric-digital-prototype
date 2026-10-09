#!/usr/bin/env node
/**
 * Build a User Research data scenario from a completed metric workbook and
 * import it as the project-dashboard-v2 data.
 *
 *   npm run scenario:metric -- tools/metric-workbook/scenarios/incomplete.json
 *
 * A scenario file names the source workbook, the copy to write, and which
 * baseline parcels lose which input values:
 *
 *   { "source": "app/data/UR-Round-5.xlsm",
 *     "output": "app/data/UR-Round-5-incomplete.xlsx",
 *     "blank": { "AH-006": ["condition", "strategicSignificance"] } }
 *
 * The cells are cleared inside LibreOffice (blank-cells.bas, a Basic macro
 * run headless — LibreOffice's bundled Python is blocked by macOS code
 * signing on Apple Silicon) so the metric
 * itself recalculates units, totals, headline results and trading rules for
 * the gaps — every screen stays consistent. (Editing with SheetJS and
 * recalculating was tried and corrupts this workbook.) The copy is then
 * imported with import.js. The source workbook is never modified.
 *
 * To go back to the complete data: npm run import:metric -- <source>
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

// Baseline area habitat input columns ("A-1 On-Site Habitat Baseline").
const BASELINE_SHEET = 'A-1 On-Site Habitat Baseline'
const BASELINE_REF_COLUMN = 'AB'
const BASELINE_FIELDS = {
  broadHabitat: 'E',
  habitatType: 'F',
  area: 'H',
  condition: 'K',
  strategicSignificance: 'M'
}

const LIBREOFFICE = [
  path.join(os.homedir(), 'Applications/LibreOffice.app/Contents'),
  '/Applications/LibreOffice.app/Contents'
].find((p) => fs.existsSync(p))

function column(letters) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1
}

const xmlEscape = (text) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

// A throwaway LibreOffice profile with blank-cells.bas installed as
// Standard.MetricScenario ("My Macros" are trusted, so it can run from the
// command line). LibreOffice rewrites the Standard library on a profile's
// first start, so the profile is initialised first and the macro added after.
function makeProfile(soffice) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'scenario-lo-'))
  execFileSync(
    soffice,
    [
      '--headless',
      '--norestore',
      `-env:UserInstallation=file://${profile}`,
      '--terminate_after_init'
    ],
    { stdio: 'ignore' }
  )
  const standard = path.join(profile, 'user', 'basic', 'Standard')
  const library = path.join(standard, 'script.xlb')
  if (!fs.existsSync(library)) {
    fail('LibreOffice did not create a profile.')
  }
  fs.writeFileSync(
    path.join(standard, 'MetricScenario.xba'),
    '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE script:module PUBLIC "-//OpenOffice.org//DTD OfficeDocument 1.0//EN" "module.dtd">\n<script:module xmlns:script="http://openoffice.org/2000/script" script:name="MetricScenario" script:language="StarBasic">' +
      xmlEscape(
        fs.readFileSync(path.join(__dirname, 'blank-cells.bas'), 'utf8')
      ) +
      '</script:module>\n'
  )
  fs.writeFileSync(
    library,
    fs
      .readFileSync(library, 'utf8')
      .replace(
        '</library:library>',
        ' <library:element library:name="MetricScenario"/>\n</library:library>'
      )
  )
  return profile
}

function fail(message) {
  console.error(`scenario: ${message}`)
  process.exit(1)
}

function main() {
  const file = process.argv[2]
  if (!file || !fs.existsSync(file)) {
    fail('usage: npm run scenario:metric -- <scenario.json>')
  }
  if (!LIBREOFFICE) {
    fail('LibreOffice not found.')
  }
  const scenario = JSON.parse(fs.readFileSync(file, 'utf8'))

  const blank = {}
  for (const [ref, fields] of Object.entries(scenario.blank)) {
    blank[ref] = fields.map((field) => {
      if (!BASELINE_FIELDS[field]) {
        fail(
          `unknown field "${field}" for ${ref} — use one of ${Object.keys(BASELINE_FIELDS).join(', ')}`
        )
      }
      return BASELINE_FIELDS[field]
    })
  }

  const soffice = path.join(LIBREOFFICE, 'MacOS/soffice')
  const profile = makeProfile(soffice)
  const spec = path.join(profile, 'spec.txt')
  fs.writeFileSync(
    spec,
    [
      path.resolve(scenario.source),
      path.resolve(scenario.output),
      BASELINE_SHEET,
      column(BASELINE_REF_COLUMN)
    ]
      .concat(
        Object.entries(blank).map(([ref, cols]) =>
          [ref].concat(cols.map(column)).join('|')
        )
      )
      .join('\n') + '\n'
  )

  console.log(`Building "${path.basename(file)}" from ${scenario.source}…`)
  fs.rmSync(scenario.output, { force: true })
  execFileSync(
    soffice,
    [
      '--headless',
      '--norestore',
      `-env:UserInstallation=file://${profile}`,
      'macro:///Standard.MetricScenario.Run'
    ],
    { stdio: 'ignore', env: { ...process.env, METRIC_SCENARIO_SPEC: spec } }
  )
  const log = fs.existsSync(`${spec}.log`)
    ? fs.readFileSync(`${spec}.log`, 'utf8').trim()
    : ''
  fs.rmSync(profile, { recursive: true, force: true })
  log.split('\n').forEach((line) => line && console.log(`  ${line}`))
  if (/^ERROR:/m.test(log) || !fs.existsSync(scenario.output)) {
    fail('LibreOffice did not produce the scenario workbook (see log above).')
  }
  console.log(`Wrote ${scenario.output}`)

  // Already recalculated by LibreOffice, so import as-is.
  execFileSync(
    process.execPath,
    [
      path.join(__dirname, 'import.js'),
      scenario.output,
      '--no-recalculate'
    ].concat(scenario.importArgs || []),
    { stdio: 'inherit' }
  )
}

main()
