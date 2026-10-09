#!/usr/bin/env node
/**
 * Import a completed Statutory Biodiversity Metric workbook into the static
 * JSON fixture used by the project-dashboard-v2 User Research journey.
 *
 *   npm run import:metric -- app/data/UR-Round-5.xlsm
 *
 * The metric workbook's results are Excel formulas. SheetJS reads the values
 * Excel last saved but cannot evaluate formulas, so a workbook that was never
 * saved by a licensed Excel has empty results. By default this script first
 * recalculates a copy with LibreOffice (headless, forced "always recalculate"
 * profile), writes it next to the source as <name>.recalculated.xlsx, and
 * imports from that copy. Pass --no-recalculate to read the file as-is.
 *
 * Column positions follow the statutory metric template. Each sheet's header
 * row is checked before reading so a template change fails loudly instead of
 * importing the wrong columns.
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const XLSX = require('xlsx')

const OUTPUT = path.join(
  __dirname,
  '..',
  '..',
  'app',
  'data',
  'project-dashboard-v2.json'
)

const SOFFICE_CANDIDATES = [
  path.join(
    os.homedir(),
    'Applications/LibreOffice.app/Contents/MacOS/soffice'
  ),
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  '/usr/bin/soffice',
  '/usr/local/bin/soffice'
]

// LibreOffice defaults to *not* recalculating Excel files on load, which
// would just re-save the empty cached results. This profile forces it.
const RECALC_PROFILE = `<?xml version="1.0" encoding="UTF-8"?>
<oor:items xmlns:oor="http://openoffice.org/2001/registry" xmlns:xs="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="OOXMLRecalcMode" oor:op="fuse"><value>0</value></prop></item>
<item oor:path="/org.openoffice.Office.Calc/Formula/Load"><prop oor:name="ODFRecalcMode" oor:op="fuse"><value>0</value></prop></item>
</oor:items>
`

function fail(message) {
  console.error(`import-metric: ${message}`)
  process.exit(1)
}

function findSoffice() {
  const found = SOFFICE_CANDIDATES.find((p) => fs.existsSync(p))
  if (!found) {
    fail(
      'LibreOffice not found. Install it, or pass --no-recalculate for a workbook already saved by Excel.'
    )
  }
  return found
}

function recalculate(source) {
  const soffice = findSoffice()
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'metric-recalc-'))
  fs.mkdirSync(path.join(tmp, 'profile', 'user'), { recursive: true })
  fs.writeFileSync(
    path.join(tmp, 'profile', 'user', 'registrymodifications.xcu'),
    RECALC_PROFILE
  )
  execFileSync(
    soffice,
    [
      '--headless',
      '--norestore',
      `-env:UserInstallation=file://${path.join(tmp, 'profile')}`,
      '--convert-to',
      'xlsx',
      '--outdir',
      path.join(tmp, 'out'),
      source
    ],
    { stdio: 'ignore' }
  )
  const converted = path.join(tmp, 'out', `${path.parse(source).name}.xlsx`)
  if (!fs.existsSync(converted)) {
    fail('LibreOffice did not produce a recalculated copy.')
  }
  const target = path.join(
    path.dirname(source),
    `${path.parse(source).name}.recalculated.xlsx`
  )
  fs.copyFileSync(converted, target)
  fs.rmSync(tmp, { recursive: true, force: true })
  return target
}

// --- Sheet helpers ---------------------------------------------------------

function sheetRows(workbook, name) {
  const sheet = workbook.Sheets[name]
  if (!sheet) {
    fail(`sheet "${name}" not found — is this a statutory metric workbook?`)
  }
  return XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true
  })
}

const col = (letter) => XLSX.utils.decode_col(letter)

function text(value) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

// A calculated value the metric couldn't produce (blank input, or its
// "Check Data ▲" style messages) — kept as null so screens show "No data"
// rather than a misleading 0.
function numOrNull(value) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : null
}

function num(value) {
  const n = typeof value === 'number' ? value : parseFloat(value)
  return Number.isFinite(n) ? n : 0
}

// Strip the workbook's status glyphs (▲ ⚠ ✓) from result labels.
function clean(value) {
  return text(value).replace(/[▲⚠✓]/g, '').trim()
}

/**
 * Locate the header row containing every expected {column: label} pair and
 * return its index. Fails if the template layout has moved.
 */
function headerRow(rows, sheetName, expected) {
  const index = rows.findIndex((row) =>
    Object.entries(expected).every(([letter, label]) =>
      text(row[col(letter)]).toLowerCase().startsWith(label.toLowerCase())
    )
  )
  if (index === -1) {
    fail(
      `"${sheetName}" header row not found (expected ${JSON.stringify(expected)}). The metric template may have changed.`
    )
  }
  return index
}

function rowsAfter(rows, header, refLetter, pattern) {
  return rows
    .slice(header + 1)
    .filter((row) => pattern.test(text(row[col(refLetter)])))
}

// "Medium strategic significance " -> "Medium"
function band(value) {
  return text(value).split(' ')[0]
}

// --- Extractors ------------------------------------------------------------

function headlines(workbook) {
  const rows = sheetRows(workbook, 'Headline Results')
  const valueFor = (section, unitType, column = 'H') => {
    const start = rows.findIndex((r) => text(r[col('B')]).startsWith(section))
    if (start === -1) {
      fail(`Headline Results: "${section}" not found`)
    }
    const row = rows
      .slice(start, start + 3)
      .find((r) => text(r[col('F')]).startsWith(unitType))
    return row ? row[col(column)] : ''
  }
  const targetRow = (unitType) => {
    const header = headerRow(rows, 'Headline Results', {
      B: 'Unit Type',
      D: 'Target',
      F: 'Units Required'
    })
    return rows
      .slice(header + 1)
      .find((r) => text(r[col('B')]).startsWith(unitType))
  }
  const tradingRow = rows.find((r) =>
    text(r[col('B')]).startsWith('Trading rules satisfied')
  )

  const summary = (unitType, targetLabel) => {
    const target = targetRow(targetLabel)
    return {
      baselineUnits: num(valueFor('On-site baseline', unitType)),
      postInterventionUnits: num(
        valueFor('On-site post-intervention', unitType)
      ),
      netUnitChange: num(valueFor('On-site net change', unitType)),
      netPercentChange: num(valueFor('On-site net change', unitType, 'J')),
      unitsRequired: num(target[col('F')]),
      unitDeficit: num(target[col('H')])
    }
  }

  return {
    area: {
      ...summary('Area habitat units', 'Area habitat units'),
      tradingRulesMet: text(tradingRow[col('F')]).startsWith('Yes')
    },
    hedgerows: summary('Hedgerow units', 'Hedgerow units')
  }
}

function project(workbook) {
  const rows = sheetRows(workbook, 'Start')
  const valueFor = (label) => {
    const row = rows.find((r) => r.some((c) => text(c).startsWith(label)))
    return row ? row.find((c, i) => i > 3 && text(c) !== '') : ''
  }
  return {
    targetPercentage: num(valueFor('Target % net gain')),
    siteArea: num(valueFor('Total site area'))
  }
}

function hedgerowTradingMet(workbook) {
  const rows = sheetRows(workbook, 'B-1 On-Site Hedge Baseline')
  const row = rows.find((r) =>
    text(r[col('E')]).startsWith('Trading Rules Satisfied')
  )
  return row ? text(row[col('I')]).startsWith('Yes') : false
}

function baseline(workbook) {
  const name = 'A-1 On-Site Habitat Baseline'
  const rows = sheetRows(workbook, name)
  const header = headerRow(rows, name, {
    E: 'Broad Habitat',
    H: 'Area (hectares)',
    I: 'Distinctiveness',
    K: 'Condition',
    Q: 'Total habitat units',
    S: 'Area retained',
    T: 'Area enhanced',
    U: 'Baseline units retained',
    AB: 'Habitat reference number'
  })
  return rowsAfter(rows, header, 'AB', /\S/).map((r) => ({
    line: num(r[col('D')]),
    ref: text(r[col('AB')]),
    broadHabitat: text(r[col('E')]),
    habitatType: text(r[col('F')]),
    area: num(r[col('H')]),
    distinctiveness: text(r[col('I')]),
    distinctivenessScore: numOrNull(r[col('J')]),
    condition: text(r[col('K')]),
    conditionScore: numOrNull(r[col('L')]),
    strategicSignificance: band(r[col('N')]),
    strategicSignificanceMultiplier: numOrNull(r[col('O')]),
    tradingRule: text(r[col('P')]),
    units: numOrNull(r[col('Q')]),
    areaRetained: num(r[col('S')]),
    areaEnhanced: num(r[col('T')]),
    unitsRetained: num(r[col('U')]),
    comments: text(r[col('Z')])
  }))
}

function created(workbook) {
  const name = 'A-2 On-Site Habitat Creation'
  const rows = sheetRows(workbook, name)
  const header = headerRow(rows, name, {
    H: 'Distinctiveness',
    J: 'Condition',
    O: 'Standard time to target',
    P: 'Habitat created in advance',
    Q: 'Delay in starting',
    S: 'Final time to target condition',
    U: 'Standard difficulty',
    AB: 'Habitat reference number'
  })
  return rowsAfter(rows, header, 'AB', /\S/).map((r) => ({
    ref: text(r[col('AB')]),
    intervention: 'Created',
    broadHabitat: text(r[col('D')]),
    habitatType: text(r[col('E')]),
    area: num(r[col('G')]),
    distinctiveness: text(r[col('H')]),
    distinctivenessScore: num(r[col('I')]),
    targetCondition: text(r[col('J')]),
    targetConditionScore: num(r[col('K')]),
    strategicSignificance: band(r[col('M')]),
    strategicSignificanceMultiplier: num(r[col('N')]),
    standardTime: num(r[col('O')]),
    advanceYears: num(r[col('P')]),
    delayYears: num(r[col('Q')]),
    finalTime: num(r[col('S')]),
    finalTimeMultiplier: num(r[col('T')]),
    standardDifficulty: text(r[col('U')]),
    appliedDifficulty: text(r[col('W')]),
    appliedDifficultyMultiplier: num(r[col('X')]),
    units: num(r[col('Y')]),
    comments: text(r[col('Z')])
  }))
}

function enhanced(workbook, baselineRows) {
  const name = 'A-3 On-Site Habitat Enhancement'
  const rows = sheetRows(workbook, name)
  const header = headerRow(rows, name, {
    E: 'Baseline ref',
    J: 'Baseline condition category',
    R: 'Proposed habitat',
    AD: 'Standard time to target',
    AH: 'Final time to target',
    AQ: 'Habitat reference number'
  })
  return rows
    .slice(header + 1)
    .filter((r) => num(r[col('E')]) > 0)
    .map((r) => {
      const source = baselineRows.find((b) => b.line === num(r[col('E')]))
      return {
        ref: source ? source.ref : text(r[col('AQ')]),
        baselineRef: source ? source.ref : '',
        intervention: 'Enhanced',
        broadHabitat: text(r[col('Q')]),
        habitatType: text(r[col('R')]),
        area: num(r[col('V')]),
        distinctiveness: text(r[col('W')]),
        distinctivenessScore: num(r[col('X')]),
        baselineCondition: text(r[col('J')]),
        baselineConditionScore: num(r[col('K')]),
        targetCondition: text(r[col('Y')]),
        targetConditionScore: num(r[col('Z')]),
        strategicSignificance: band(r[col('AB')]),
        strategicSignificanceMultiplier: num(r[col('AC')]),
        standardTime: num(r[col('AD')]),
        advanceYears: num(r[col('AE')]),
        delayYears: num(r[col('AF')]),
        finalTime: num(r[col('AH')]),
        finalTimeMultiplier: num(r[col('AI')]),
        standardDifficulty: text(r[col('AJ')]),
        appliedDifficulty: text(r[col('AL')]),
        appliedDifficultyMultiplier: num(r[col('AM')]),
        units: num(r[col('AN')]),
        comments: text(r[col('AO')])
      }
    })
}

// Retained habitats have no sheet of their own in the metric — they are the
// "Area retained" share of each baseline parcel.
function retained(baselineRows) {
  return baselineRows
    .filter((b) => b.areaRetained > 0)
    .map((b) => ({
      ref: b.ref,
      baselineRef: b.ref,
      intervention: 'Retained',
      broadHabitat: b.broadHabitat,
      habitatType: b.habitatType,
      area: b.areaRetained,
      distinctiveness: b.distinctiveness,
      distinctivenessScore: b.distinctivenessScore,
      baselineCondition: b.condition,
      baselineConditionScore: b.conditionScore,
      strategicSignificance: b.strategicSignificance,
      strategicSignificanceMultiplier: b.strategicSignificanceMultiplier,
      units: b.unitsRetained,
      comments: b.comments
    }))
}

function tradingSummary(workbook) {
  const name = 'Trading Summary Area Habitats'
  const rows = sheetRows(workbook, name)
  const statusHeader = headerRow(rows, name, {
    B: 'Distinctiveness Group',
    C: 'Trading Rule',
    G: 'Trading Satisfied'
  })
  const groups = rows
    .slice(statusHeader + 1, statusHeader + 6)
    .filter((r) => text(r[col('B')]))
    .map((r) => ({
      band: text(r[col('B')]),
      rule: text(r[col('C')]),
      met: text(r[col('G')]).startsWith('Yes')
    }))

  // A band's section runs from its "<Band> Distinctiveness" title row to the
  // totals row (no habitat name, on-site total in column D).
  const section = (title) => {
    const start = rows.findIndex((r) => text(r[col('B')]) === title)
    if (start === -1) {
      fail(`${name}: section "${title}" not found`)
    }
    const items = []
    const summary = {}
    for (let i = start + 1; i < rows.length; i++) {
      const r = rows[i]
      const label = text(r[col('J')])
      if (label) {
        summary[label] = num(r[col('K')])
      }
      const habitat = text(r[col('B')])
      if (habitat.includes(' - ')) {
        const change = num(r[col('D')])
        if (change !== 0) {
          items.push({
            broadHabitat: text(r[col('C')]),
            habitatType: habitat.split(' - ').slice(1).join(' - '),
            change: change
          })
        }
      } else if (!habitat && text(r[col('D')]) !== '') {
        return { items, total: num(r[col('D')]), summary }
      }
    }
    return { items, total: 0, summary }
  }

  const summaryValue = (summary, prefix) => {
    const key = Object.keys(summary).find((k) => k.startsWith(prefix))
    return key === undefined ? 0 : summary[key]
  }

  const medium = section('Medium Distinctiveness')
  const low = section('Low Distinctiveness')

  return {
    groups: groups,
    medium: {
      items: medium.items,
      total: medium.total,
      unitsAvailableToOffsetLower: summaryValue(
        medium.summary,
        'Medium Distinctiveness Units available'
      ),
      broadHabitatLosses: summaryValue(
        medium.summary,
        'Medium Distinctiveness broad habitat losses'
      ),
      unitDeficit: summaryValue(
        medium.summary,
        'Medium Distinctiveness Unit deficit'
      ),
      cumulativeSurplus: summaryValue(
        medium.summary,
        'Cumulative surplus of units'
      )
    },
    low: {
      items: low.items,
      total: low.total,
      unitsAvailableFromHigher: summaryValue(
        low.summary,
        'Units available to offset Low'
      ),
      netChange: summaryValue(low.summary, 'Low Distinctiveness net change'),
      cumulativeSurplus: summaryValue(
        low.summary,
        'Cumulative surplus of units'
      )
    }
  }
}

// --- Hedgerows --------------------------------------------------------------

function hedgerowBaseline(workbook) {
  const name = 'B-1 On-Site Hedge Baseline'
  const rows = sheetRows(workbook, name)
  const header = headerRow(rows, name, {
    B: 'Hedge number',
    C: 'Habitat type',
    D: 'Length (km)',
    G: 'Condition',
    M: 'Total hedgerow units',
    O: 'Length retained',
    Q: 'Units retained'
  })
  return rowsAfter(rows, header, 'B', /\S/).map((r) => ({
    ref: text(r[col('B')]),
    habitatType: text(r[col('C')]),
    length: num(r[col('D')]),
    distinctiveness: text(r[col('E')]),
    distinctivenessScore: num(r[col('F')]),
    condition: text(r[col('G')]),
    conditionScore: num(r[col('H')]),
    strategicSignificance: band(r[col('J')]),
    strategicSignificanceMultiplier: num(r[col('K')]),
    tradingRule: text(r[col('L')]),
    units: num(r[col('M')]),
    lengthRetained: num(r[col('O')]),
    unitsRetained: num(r[col('Q')]),
    comments: text(r[col('U')])
  }))
}

function hedgerowCreated(workbook) {
  const name = 'B-2 On-Site Hedge Creation'
  const rows = sheetRows(workbook, name)
  const header = headerRow(rows, name, {
    B: 'New hedge number',
    C: 'Habitat type',
    D: 'Length (km)',
    L: 'Standard Time to target',
    P: 'Final time to target'
  })
  return rowsAfter(rows, header, 'B', /\S/).map((r) => ({
    ref: text(r[col('B')]),
    intervention: 'Created',
    habitatType: text(r[col('C')]),
    length: num(r[col('D')]),
    distinctiveness: text(r[col('E')]),
    distinctivenessScore: num(r[col('F')]),
    targetCondition: text(r[col('G')]),
    targetConditionScore: num(r[col('H')]),
    strategicSignificance: band(r[col('J')]),
    strategicSignificanceMultiplier: num(r[col('K')]),
    standardTime: num(r[col('L')]),
    advanceYears: num(r[col('M')]),
    delayYears: num(r[col('N')]),
    finalTime: num(r[col('P')]),
    finalTimeMultiplier: num(r[col('Q')]),
    standardDifficulty: text(r[col('R')]),
    appliedDifficulty: text(r[col('T')]),
    appliedDifficultyMultiplier: num(r[col('U')]),
    units: num(r[col('V')]),
    comments: text(r[col('W')])
  }))
}

function hedgerowRetained(baselineRows) {
  return baselineRows
    .filter((b) => b.lengthRetained > 0)
    .map((b) => ({
      ref: b.ref,
      baselineRef: b.ref,
      intervention: 'Retained',
      habitatType: b.habitatType,
      length: b.lengthRetained,
      distinctiveness: b.distinctiveness,
      distinctivenessScore: b.distinctivenessScore,
      baselineCondition: b.condition,
      baselineConditionScore: b.conditionScore,
      strategicSignificance: b.strategicSignificance,
      strategicSignificanceMultiplier: b.strategicSignificanceMultiplier,
      units: b.unitsRetained,
      comments: b.comments
    }))
}

// Hedgerow enhancement isn't mapped yet; fail rather than silently drop rows.
function checkNoHedgerowEnhancement(workbook) {
  const rows = sheetRows(workbook, 'B-3 On-Site Hedge Enhancement')
  const used = rows.some(
    (r) => /\S/.test(text(r[col('B')])) && num(r[col('C')]) > 0
  )
  if (used) {
    fail(
      '"B-3 On-Site Hedge Enhancement" has rows, but hedgerow enhancement is not imported yet. Add an extractor to tools/metric-workbook/import.js.'
    )
  }
}

// The hedgerow trading sheet differs from the area one: no broad-habitat
// column (habitat in B, on-site change in C), status in F, summary in H/I.
function hedgerowTradingSummary(workbook) {
  const name = 'Trading Summary Hedgerows'
  const rows = sheetRows(workbook, name)
  const statusHeader = headerRow(rows, name, {
    B: 'Distinctiveness Group',
    C: 'Trading Rule',
    F: 'Trading Satisfied'
  })
  const groups = rows
    .slice(statusHeader + 1, statusHeader + 7)
    .filter((r) => text(r[col('B')]))
    .map((r) => ({
      band: text(r[col('B')]),
      rule: text(r[col('C')]),
      met: text(r[col('F')]).startsWith('Yes')
    }))

  const section = (title) => {
    const start = rows.findIndex((r) => text(r[col('B')]) === title)
    if (start === -1) {
      fail(`${name}: section "${title}" not found`)
    }
    const items = []
    const summary = {}
    for (let i = start + 1; i < rows.length; i++) {
      const r = rows[i]
      const label = text(r[col('H')])
      if (label) {
        summary[label] = num(r[col('I')])
      }
      const habitat = text(r[col('B')])
      if (habitat && habitat !== 'Habitat group') {
        const change = num(r[col('C')])
        if (change !== 0) {
          items.push({ habitatType: habitat, change: change })
        }
      } else if (!habitat && text(r[col('C')]) !== '') {
        return { items, total: num(r[col('C')]), summary }
      }
    }
    return { items, total: 0, summary }
  }

  const summaryValue = (summary, prefix) => {
    const key = Object.keys(summary).find((k) => k.startsWith(prefix))
    return key === undefined ? 0 : summary[key]
  }

  const medium = section('Medium Distinctiveness')
  const low = section('Low Distinctiveness')
  return {
    groups: groups,
    medium: {
      items: medium.items,
      total: medium.total,
      netChange: summaryValue(
        medium.summary,
        'Medium Distinctiveness net change'
      ),
      cumulativeSurplus: summaryValue(
        medium.summary,
        'Cumulative availability of units'
      )
    },
    low: {
      items: low.items,
      total: low.total,
      netChange: summaryValue(low.summary, 'Low Distinctiveness net change'),
      cumulativeSurplus: summaryValue(
        low.summary,
        'Cumulative availability of units'
      )
    }
  }
}

// Orange flags: things the metric itself warns need evidence or checking.
// One list across phases (baseline / post intervention) and unit types.
function flags(unitType, baselineRows, changedRows) {
  const fairly = (condition) => /^fairly/i.test(condition)
  const baselineFlags = baselineRows
    .filter((b) => fairly(b.condition))
    .map((b) => ({
      ref: b.ref,
      phase: 'Baseline',
      unitType: unitType,
      broadHabitat: b.broadHabitat || '',
      habitatType: b.habitatType,
      detail: `‘${b.condition}’ condition category used`,
      note: 'Check the condition assessment evidence supports a ‘Fairly’ category.'
    }))
  const postFlags = changedRows
    .filter((h) => h.delayYears > 0 || fairly(h.targetCondition))
    .map((h) => ({
      ref: h.ref,
      phase: 'Post intervention',
      intervention: h.intervention,
      unitType: unitType,
      broadHabitat: h.broadHabitat || '',
      habitatType: h.habitatType,
      detail:
        h.delayYears > 0
          ? `Delay of ${h.delayYears} years in starting habitat ${h.intervention === 'Created' ? 'creation' : 'enhancement'}`
          : `‘${h.targetCondition}’ target condition used`,
      note:
        h.delayYears > 0
          ? 'Justification or evidence is required for the delay period (phasing plans or agreements) so the delay length can be verified.'
          : 'Check the condition assessment evidence supports a ‘Fairly’ category.'
    }))
  return baselineFlags.concat(postFlags)
}

// --- Main ------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2)
  // --out <file> writes somewhere other than the live fixture (e.g. a test).
  const outIndex = args.indexOf('--out')
  const output = outIndex === -1 ? OUTPUT : path.resolve(args[outIndex + 1])
  const source = args.find(
    (a, i) => !a.startsWith('--') && (outIndex === -1 || i !== outIndex + 1)
  )
  if (!source) {
    fail(
      'usage: npm run import:metric -- <workbook.xlsm> [--no-recalculate] [--out <file.json>]'
    )
  }
  if (!fs.existsSync(source)) {
    fail(`file not found: ${source}`)
  }

  let input = source
  if (!args.includes('--no-recalculate')) {
    console.log('Recalculating with LibreOffice…')
    input = recalculate(path.resolve(source))
    console.log(`Recalculated copy: ${path.relative(process.cwd(), input)}`)
  }

  const workbook = XLSX.readFile(input)
  const results = headlines(workbook)
  if (results.area.baselineUnits === 0) {
    fail(
      'Headline Results are empty — the workbook has no calculated values. Run without --no-recalculate.'
    )
  }

  const baselineRows = baseline(workbook)
  const createdRows = created(workbook)
  const enhancedRows = enhanced(workbook, baselineRows)

  checkNoHedgerowEnhancement(workbook)
  const hedgeBaselineRows = hedgerowBaseline(workbook)
  const hedgeCreatedRows = hedgerowCreated(workbook)

  const data = {
    source: path.basename(source),
    importedAt: new Date().toISOString().slice(0, 10),
    project: project(workbook),
    area: {
      results: results.area,
      baseline: baselineRows,
      postIntervention: {
        retained: retained(baselineRows),
        enhanced: enhancedRows,
        created: createdRows
      },
      tradingSummary: tradingSummary(workbook)
    },
    hedgerows: {
      results: {
        ...results.hedgerows,
        tradingRulesMet: hedgerowTradingMet(workbook)
      },
      baseline: hedgeBaselineRows,
      postIntervention: {
        retained: hedgerowRetained(hedgeBaselineRows),
        enhanced: [],
        created: hedgeCreatedRows
      },
      tradingSummary: hedgerowTradingSummary(workbook)
    },
    flags: flags(
      'Area habitat',
      baselineRows,
      createdRows.concat(enhancedRows)
    ).concat(flags('Hedgerow', hedgeBaselineRows, hedgeCreatedRows))
  }

  fs.writeFileSync(output, JSON.stringify(data, null, 2) + '\n')
  const count = (section) =>
    `${section.baseline.length} baseline, ` +
    `${section.postIntervention.retained.length} retained, ` +
    `${section.postIntervention.enhanced.length} enhanced, ` +
    `${section.postIntervention.created.length} created`
  console.log(`Wrote ${path.relative(process.cwd(), output)}`)
  console.log(`  Area habitats: ${count(data.area)}`)
  console.log(`  Hedgerows:     ${count(data.hedgerows)}`)
  console.log(`  Orange flags:  ${data.flags.length}`)
}

main()
