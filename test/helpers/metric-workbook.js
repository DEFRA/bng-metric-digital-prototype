const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const XLSX = require('xlsx')

// A small metric workbook: one baseline habitat, lost, and one created
// habitat. It has only the sheets and columns the workbook reader needs.
function makeWorkbookBuffer() {
  const significance =
    'Area/compensation not in local strategy/ no local strategy'
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'Ref',
        'Broad Habitat',
        'Habitat Type',
        'Area (hectares)',
        'Distinctiveness',
        'Condition',
        'Strategic significance',
        'Area retained',
        'Area enhanced',
        'Area habitat lost'
      ],
      [],
      [
        '1',
        'Urban',
        'Artificial unvegetated, unsealed surface',
        1,
        'V.Low',
        'N/A - Other',
        significance,
        0,
        0,
        1
      ]
    ]),
    'A-1 On-Site Habitat Baseline'
  )
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      [
        'Ref',
        'Broad Habitat',
        'Proposed habitat',
        'Habitat',
        'Area (hectares)',
        'Distinctiveness',
        'Condition',
        'Strategic significance'
      ],
      [],
      [
        '1',
        'Urban',
        'Bare ground',
        'Urban - Bare ground',
        1,
        'Low',
        'Moderate',
        significance
      ]
    ]),
    'A-2 On-Site Habitat Creation'
  )
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' })
}

// Generate a BNG Service GeoPackage from the small workbook, and write it to a
// temporary file. The file holds both stages; mode "baseline" leaves the
// post-intervention layers empty.
async function writeBngServiceFile(mode = 'both') {
  const gen = await import('bng-library')
  const result = gen.generateFromWorkbookBuffer({
    workbookBuffer: makeWorkbookBuffer(),
    workbookFilename: 'metric.xlsx',
    mode,
    format: gen.FORMAT_BNG_SERVICE
  })
  if (!result.success) {
    throw new Error(`could not generate the file: ${result.messages}`)
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bng-service-'))
  const target = path.join(dir, 'bng-service.gpkg')
  fs.writeFileSync(target, result.buffer)
  return target
}

module.exports = { makeWorkbookBuffer, writeBngServiceFile }
