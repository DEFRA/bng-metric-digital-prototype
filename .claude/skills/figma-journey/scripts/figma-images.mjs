#!/usr/bin/env node
// Render one PNG per screen frame of a Figma prototype via the Figma REST API.
// Writes screen-<name>.png into .tmp/figma-journey/<fileKey>/ (reusing the
// extract step's cache when present). No npm deps. Never prints the FIGMA_TOKEN.

import { mkdir, writeFile, readFile, access } from 'node:fs/promises'
import { join } from 'node:path'

const API_BASE = 'https://api.figma.com/v1'
const SETUP_DOC = '.claude/skills/figma-journey/references/setup.md'
const HTTP_OK = 200

function fail(message) {
  console.error(message)
  process.exit(1)
}

function parseArgs(argv) {
  let location = null
  let nodeFlag = null
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--node') {
      nodeFlag = argv[i + 1]
      i += 1
    } else if (!location) {
      location = argv[i]
    }
  }
  return { location, nodeFlag }
}

function parseLocation(location, nodeFlag) {
  let fileKey = null
  let nodeId = null
  if (location && location.includes('figma.com')) {
    const url = new URL(location)
    const match = url.pathname.match(/\/(?:proto|file|design)\/([A-Za-z0-9]+)/)
    fileKey = match ? match[1] : null
    nodeId = url.searchParams.get('node-id')
  } else if (location && location.includes('#')) {
    const [key, node] = location.split('#')
    fileKey = key
    nodeId = node
  } else {
    fileKey = location
  }
  if (nodeFlag) {
    nodeId = nodeFlag
  }
  if (nodeId) {
    nodeId = nodeId.replaceAll('-', ':')
  }
  return { fileKey, nodeId }
}

async function figmaGet(path, token) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'X-Figma-Token': token }
  })
  const body = await res.json().catch(() => ({}))
  if (res.status !== HTTP_OK) {
    fail(`Figma API ${res.status}: ${body.err || res.statusText}`)
  }
  return body
}

function collectScreens(document) {
  if (document.type === 'CANVAS') {
    return (document.children || []).filter((c) => c.type === 'FRAME')
  }
  return [document]
}

function firstDocument(pageJson) {
  const first = Object.values(pageJson.nodes || {})[0]
  return first ? first.document : null
}

function sanitize(name) {
  const slug = name
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '-')
    .replaceAll(/^-+|-+$/g, '')
  return slug || 'screen'
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function loadScreens(outDir, fileKey, nodeId, token) {
  const flowPath = join(outDir, 'flow.json')
  if (await exists(flowPath)) {
    const flow = JSON.parse(await readFile(flowPath, 'utf8'))
    return flow.screens.map((screen) => ({ id: screen.id, name: screen.name }))
  }
  const pagePath = join(outDir, 'page.json')
  let document = null
  if (await exists(pagePath)) {
    document = firstDocument(JSON.parse(await readFile(pagePath, 'utf8')))
  }
  if (!document && nodeId) {
    const data = await figmaGet(`/files/${fileKey}/nodes?ids=${nodeId}`, token)
    document = firstDocument(data)
  }
  if (!document) {
    fail('Could not load screens — run figma-extract.mjs first or pass a node id')
  }
  return collectScreens(document).map((screen) => ({ id: screen.id, name: screen.name }))
}

async function downloadScreens(screens, urlMap, outDir) {
  let count = 0
  for (const screen of screens) {
    const url = urlMap[screen.id]
    if (!url) {
      console.warn(`No image URL for "${screen.name}" (${screen.id})`)
      continue
    }
    const res = await fetch(url)
    if (!res.ok) {
      console.warn(`Download failed (${res.status}) for "${screen.name}"`)
      continue
    }
    const buffer = Buffer.from(await res.arrayBuffer())
    const file = join(outDir, `screen-${sanitize(screen.name)}.png`)
    await writeFile(file, buffer)
    console.log(`Wrote ${file} (${buffer.length} bytes)`)
    count += 1
  }
  return count
}

async function main() {
  const token = process.env.FIGMA_TOKEN
  if (!token) {
    fail(`FIGMA_TOKEN is not set. See ${SETUP_DOC}`)
  }
  const { location, nodeFlag } = parseArgs(process.argv.slice(2))
  if (!location) {
    fail('Usage: figma-images.mjs <figma-url | KEY#node | KEY --node A-B>')
  }
  const { fileKey, nodeId } = parseLocation(location, nodeFlag)
  if (!fileKey) {
    fail(`Could not parse a fileKey from: ${location}`)
  }
  const outDir = join('.tmp', 'figma-journey', fileKey)
  await mkdir(outDir, { recursive: true })

  const screens = await loadScreens(outDir, fileKey, nodeId, token)
  if (screens.length === 0) {
    fail('No screen frames to render')
  }

  const ids = screens.map((screen) => screen.id).join(',')
  const result = await figmaGet(`/images/${fileKey}?ids=${ids}&format=png&scale=1`, token)
  if (result.err) {
    fail(`Figma images error: ${result.err}`)
  }
  const count = await downloadScreens(screens, result.images || {}, outDir)
  console.log(`Downloaded ${count}/${screens.length} screens into ${outDir}`)
}

main()
