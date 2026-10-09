#!/usr/bin/env node
/**
 * Capture full-page PNGs of the project-dashboard-v2 journey for design review.
 *
 *   npm run dev                       # in another terminal
 *   npm run screenshots               # or: node tools/screenshots/capture.js [baseUrl]
 *
 * Drives the locally installed Google Chrome in headless mode over the
 * DevTools protocol (Node's built-in WebSocket) — no Puppeteer/Playwright
 * download. Each page is captured at 1280px wide and its full scroll height.
 * Files are prefixed with the Figma frame number they reconstruct, and split
 * into the two dashboard states (Complete project / Baseline only).
 *
 * Output: ~/Downloads/project-dashboard-v2-screens-<YYYY-MM-DD>/ (+ .zip)
 */

const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')

const BASE_URL = process.argv[2] || 'http://localhost:3010'
const JOURNEY = '/project-dashboard-v2'
const WIDTH = 1280

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  path.join(
    os.homedir(),
    'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
]

// [file name, path] — file names lead with the Figma frame number.
const ONBOARDING = [
  ['0000-start', ''],
  ['0100-sign-in', '/sign-in'],
  ['0200-project-name', '/project-name'],
  ['0300-upload-choose', '/upload/choose'],
  ['0400-upload', '/upload'],
  ['0420-upload-checking', '/upload/checking']
]

const DASHBOARD = [
  ['1000-overview', '/overview'],
  ['2000-orange-flags', '/orange-flags'],
  ['3000-area-habitats', '/area-habitats'],
  ['3100-area-habitats-trading-summary', '/area-habitats/trading-summary'],
  ['3200-area-habitats-baseline', '/area-habitats/baseline'],
  ['3300-area-habitats-post-intervention', '/area-habitats/post-intervention'],
  ['4000-hedgerows', '/hedgerows'],
  ['4100-hedgerows-trading-summary', '/hedgerows/trading-summary'],
  ['4200-hedgerows-baseline', '/hedgerows/baseline'],
  ['4300-hedgerows-post-intervention', '/hedgerows/post-intervention']
]

// Screens that only exist (or only differ) once post-intervention data is in.
// The two tab captures are kept apart: a hash-only change to the same page
// fires no load event, so each must follow a different page.
const COMPLETE_ONLY = [
  [
    '3300-area-habitats-post-intervention-enhanced-tab',
    '/area-habitats/post-intervention#enhanced'
  ],
  ['3210-baseline-habitat-detail-AH-001', '/area-habitats/baseline/ah-001'],
  [
    '3300-area-habitats-post-intervention-created-tab',
    '/area-habitats/post-intervention#created'
  ],
  [
    '3310-post-intervention-detail-created-AH-006',
    '/area-habitats/post-intervention/ah-006'
  ],
  [
    '3320-post-intervention-detail-enhanced-AH-003-1',
    '/area-habitats/post-intervention/ah-003-1'
  ],
  [
    '3330-post-intervention-detail-retained-AH-002',
    '/area-habitats/post-intervention/ah-002'
  ],
  ['5000-project-details', '/project-details'],
  ['2000-export', '/export']
]

function fail(message) {
  console.error(`screenshots: ${message}`)
  process.exit(1)
}

async function launchChrome() {
  const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p))
  if (!chrome) {
    fail('Google Chrome not found.')
  }
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'screens-chrome-'))
  const proc = spawn(
    chrome,
    [
      '--headless=new',
      '--remote-debugging-port=0',
      `--user-data-dir=${profile}`,
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank'
    ],
    { stdio: 'ignore' }
  )
  // Chrome writes its chosen port to DevToolsActivePort in the profile.
  const portFile = path.join(profile, 'DevToolsActivePort')
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) {
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  if (!fs.existsSync(portFile)) {
    proc.kill()
    fail('Chrome did not start.')
  }
  const [port] = fs.readFileSync(portFile, 'utf8').split('\n')
  // Wait for Chrome to exit before deleting its profile — it keeps writing
  // to it while shutting down.
  const close = async () => {
    const exited = new Promise((resolve) => proc.once('exit', resolve))
    proc.kill()
    await exited
    fs.rmSync(profile, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200
    })
  }
  return { port, close }
}

// Minimal DevTools protocol client for one page target.
async function connect(port) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json()
  const page = targets.find((t) => t.type === 'page')
  const ws = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let nextId = 0
  const pending = new Map()
  const listeners = new Map()
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data)
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id)
      pending.delete(msg.id)
      if (msg.error) {
        reject(new Error(msg.error.message))
      } else {
        resolve(msg.result)
      }
    } else if (msg.method && listeners.has(msg.method)) {
      listeners.get(msg.method).forEach((fn) => fn(msg.params))
      listeners.delete(msg.method)
    }
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })
  const once = (method) =>
    new Promise((resolve) => {
      if (!listeners.has(method)) {
        listeners.set(method, [])
      }
      listeners.get(method).push(resolve)
    })
  return { send, once, close: () => ws.close() }
}

async function evaluate(cdp, expression) {
  const { result } = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true
  })
  return result.value
}

async function capture(cdp, url, file) {
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false
  })
  const loaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.navigate', { url })
  await loaded
  // Fonts and govuk-frontend JS (tabs, file upload) settle after load.
  await evaluate(cdp, 'document.fonts.ready.then(() => true)')
  await new Promise((resolve) => setTimeout(resolve, 300))
  const height = await evaluate(
    cdp,
    'Math.ceil(document.documentElement.scrollHeight)'
  )
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: WIDTH,
    height: height,
    deviceScaleFactor: 1,
    mobile: false
  })
  const { data } = await cdp.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: WIDTH, height: height, scale: 1 }
  })
  fs.writeFileSync(file, Buffer.from(data, 'base64'))
}

// Set the dashboard state the way a user would: answer the upload question.
async function setState(cdp, choice) {
  const loaded = cdp.once('Page.loadEventFired')
  await cdp.send('Page.navigate', {
    url: `${BASE_URL}${JOURNEY}/upload/choose`
  })
  await loaded
  await evaluate(
    cdp,
    `fetch('${JOURNEY}/upload/choose', {
       method: 'POST',
       headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
       body: 'uploadChoice=${choice}'
     }).then((r) => r.ok)`
  )
}

async function main() {
  try {
    await fetch(`${BASE_URL}${JOURNEY}`)
  } catch {
    fail(`prototype not reachable at ${BASE_URL} — start it with npm run dev`)
  }

  const date = new Date().toISOString().slice(0, 10)
  const name = `project-dashboard-v2-screens-${date}`
  // SCREENSHOTS_DIR overrides ~/Downloads (e.g. for a quick local check).
  const outDir = path.join(
    process.env.SCREENSHOTS_DIR || path.join(os.homedir(), 'Downloads'),
    name
  )
  const zipFile = `${outDir}.zip`
  fs.rmSync(outDir, { recursive: true, force: true })
  fs.rmSync(zipFile, { force: true })

  const chrome = await launchChrome()
  const cdp = await connect(chrome.port)
  await cdp.send('Page.enable')

  const runs = [
    ['complete', 'complete', ONBOARDING.concat(DASHBOARD, COMPLETE_ONLY)],
    ['baseline-only', 'baseline', DASHBOARD]
  ]

  let count = 0
  try {
    for (const [folder, choice, pages] of runs) {
      const dir = path.join(outDir, folder)
      fs.mkdirSync(dir, { recursive: true })
      for (const [name, pagePath] of pages) {
        // Onboarding pages come first, so set the state before the dashboard.
        if (pagePath === '/overview') {
          await setState(cdp, choice)
        }
        const file = path.join(dir, `${name}.png`)
        await capture(cdp, `${BASE_URL}${JOURNEY}${pagePath}`, file)
        count++
        console.log(`  ${folder}/${name}.png`)
      }
    }
  } finally {
    cdp.close()
    await chrome.close()
  }
  // A zip alongside the folder, ready to send to reviewers.
  execFileSync('zip', ['-qr', zipFile, name], { cwd: path.dirname(outDir) })
  console.log(`Captured ${count} screens in ${outDir}`)
  console.log(`Zip: ${zipFile}`)
}

main()
