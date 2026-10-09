/**
 * The site name on the result page comes out of the uploaded GeoPackage, and
 * govukPanel renders its `html` parameter through the `safe` filter. So the
 * name has to be escaped before it is joined to that markup, or an uploaded
 * file can put live tags on the page.
 *
 * The panel call is lifted out of the real template rather than copied here,
 * so removing the escape breaks this test.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

/** nunjucks arrives via the prototype kit, so it may or may not be hoisted. */
function loadNunjucks() {
  for (const id of ['nunjucks', 'govuk-prototype-kit/node_modules/nunjucks']) {
    try {
      return require(id)
    } catch (error) {
      if (error.code !== 'MODULE_NOT_FOUND') {
        throw error
      }
    }
  }
  throw new Error('nunjucks could not be resolved')
}

const nunjucks = loadNunjucks()

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const RESULT_VIEW = path.join(ROOT, 'app', 'views', 'pdf-report', 'result.html')
const GOVUK = path.join(ROOT, 'node_modules', 'govuk-frontend', 'dist')

const HOSTILE = '<img src=x onerror="alert(1)">'

/** The `{{ govukPanel({ ... }) }}` call, exactly as the template writes it. */
function panelCallFromView() {
  const source = fs.readFileSync(RESULT_VIEW, 'utf8')
  const call = /\{\{\s*govukPanel\(\{[\s\S]*?\}\)\s*\}\}/.exec(source)
  assert.ok(call, 'no govukPanel call found in result.html')
  return call[0]
}

function renderPanel(model) {
  const env = nunjucks.configure([GOVUK], { autoescape: true })
  return env.renderString(
    `{% from "govuk/components/panel/macro.njk" import govukPanel %}\n${panelCallFromView()}`,
    model
  )
}

const MODEL = {
  siteName: HOSTILE,
  stats: { habitats: 3 },
  sizeKb: '12.0',
  elapsedSeconds: '1.4'
}

test('a site name from the GeoPackage cannot inject markup into the panel', () => {
  const html = renderPanel(MODEL)

  assert.ok(!html.includes('<img src=x'), 'site name rendered as a live tag')
  assert.ok(
    !html.includes('onerror="alert(1)"'),
    'site name kept a live handler'
  )
  assert.match(html, /&lt;img src=x/)
})

test('the panel still renders its own markup and the surrounding detail', () => {
  const html = renderPanel(MODEL)

  // The escape must not swallow the line break the panel is built around.
  assert.match(html, /<br>/)
  assert.match(html, /3 parcels/)
  assert.match(html, /12\.0 kB/)
  assert.match(html, /1\.4s/)
})

test('an ordinary site name is shown unchanged', () => {
  const html = renderPanel({ ...MODEL, siteName: 'Test Area' })

  assert.match(html, /Test Area<br>/)
})

test('a site name with an ampersand is escaped, not dropped', () => {
  const html = renderPanel({ ...MODEL, siteName: 'Fields & Meadows' })

  assert.match(html, /Fields &amp; Meadows/)
})
