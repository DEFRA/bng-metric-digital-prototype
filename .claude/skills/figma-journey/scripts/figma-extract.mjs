#!/usr/bin/env node
// Extract a Figma prototype's screens + click-flow via the Figma REST API.
// Writes .tmp/figma-journey/<fileKey>/{page.json,flow.json,flow.md}.
// No npm deps (Node 22 global fetch). Never prints the FIGMA_TOKEN.

import { mkdir, writeFile } from 'node:fs/promises'
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

function walk(node, visit) {
  visit(node)
  for (const child of node.children || []) {
    walk(child, visit)
  }
}

function collectScreens(document) {
  if (document.type === 'CANVAS') {
    return (document.children || []).filter((c) => c.type === 'FRAME')
  }
  return [document]
}

function addDest(seen, node, toId, navigation) {
  if (!toId) {
    return
  }
  const key = `${node.id}|${toId}`
  if (!seen.has(key)) {
    seen.set(key, { fromId: node.id, fromName: node.name, toId, navigation })
  }
}

function collectTransitions(screens) {
  const seen = new Map()
  for (const screen of screens) {
    walk(screen, (node) => {
      for (const interaction of node.interactions || []) {
        for (const action of interaction.actions || []) {
          addDest(seen, node, action.destinationId, action.navigation || 'NAVIGATE')
        }
      }
      addDest(seen, node, node.transitionNodeID, 'transition')
    })
  }
  return [...seen.values()]
}

function buildIdIndex(screens) {
  const idToScreen = new Map()
  for (const screen of screens) {
    walk(screen, (node) => idToScreen.set(node.id, screen.name))
  }
  return idToScreen
}

function classify(transitions, idToScreen) {
  const onPage = []
  const offPage = []
  for (const transition of transitions) {
    const toName = idToScreen.get(transition.toId)
    if (toName) {
      onPage.push({ ...transition, toName })
    } else {
      offPage.push(transition)
    }
  }
  return { onPage, offPage }
}

function renderFlowMd({ fileKey, nodeId, startNodeId, screens, transitions }) {
  const lines = [
    `# Figma prototype flow — ${fileKey}`,
    '',
    `- Requested node: \`${nodeId}\``,
    `- Flow starting point: \`${startNodeId || 'n/a'}\``,
    `- Screens: ${screens.length}`,
    '',
    '## Screens',
    '',
    '| # | id | name | size |',
    '| - | -- | ---- | ---- |'
  ]
  screens.forEach((screen, index) => {
    lines.push(`| ${index + 1} | \`${screen.id}\` | ${screen.name} | ${screen.width}×${screen.height} |`)
  })
  lines.push('', '## On-page flow', '')
  if (transitions.onPage.length === 0) {
    lines.push('_No on-page transitions found._')
  }
  for (const transition of transitions.onPage) {
    lines.push(`- "${transition.fromName}" (\`${transition.fromId}\`) → ${transition.toName} (\`${transition.toId}\`)`)
  }
  lines.push('', '## Off-page / library links (ignore)', '')
  if (transitions.offPage.length === 0) {
    lines.push('_None._')
  }
  for (const transition of transitions.offPage) {
    lines.push(`- "${transition.fromName}" (\`${transition.fromId}\`) → \`${transition.toId}\``)
  }
  lines.push('')
  return lines.join('\n')
}

async function resolveNodeId(fileKey, nodeId, token) {
  if (nodeId) {
    return nodeId
  }
  const file = await figmaGet(`/files/${fileKey}?depth=1`, token)
  const firstPage = (file.document.children || [])[0]
  if (!firstPage) {
    fail(`No pages found in file ${fileKey}`)
  }
  console.log(`No node given — using first page ${firstPage.id}`)
  return firstPage.id
}

async function main() {
  const token = process.env.FIGMA_TOKEN
  if (!token) {
    fail(`FIGMA_TOKEN is not set. See ${SETUP_DOC}`)
  }
  const { location, nodeFlag } = parseArgs(process.argv.slice(2))
  if (!location) {
    fail('Usage: figma-extract.mjs <figma-url | KEY#node | KEY --node A-B>')
  }
  const parsed = parseLocation(location, nodeFlag)
  if (!parsed.fileKey) {
    fail(`Could not parse a fileKey from: ${location}`)
  }
  const fileKey = parsed.fileKey
  const nodeId = await resolveNodeId(fileKey, parsed.nodeId, token)

  const data = await figmaGet(`/files/${fileKey}/nodes?ids=${nodeId}`, token)
  const entry = data.nodes[nodeId]
  if (!entry) {
    fail(`Node ${nodeId} not found in file ${fileKey}`)
  }
  const document = entry.document
  const screens = collectScreens(document)
  const startNodeId = (document.flowStartingPoints || [{}])[0].nodeId || null
  const transitions = classify(collectTransitions(screens), buildIdIndex(screens))
  const screenMeta = screens.map((screen) => ({
    id: screen.id,
    name: screen.name,
    width: Math.round(screen.absoluteBoundingBox?.width || 0),
    height: Math.round(screen.absoluteBoundingBox?.height || 0)
  }))
  const flow = { fileKey, nodeId, startNodeId, screens: screenMeta, transitions }

  const outDir = join('.tmp', 'figma-journey', fileKey)
  await mkdir(outDir, { recursive: true })
  await writeFile(join(outDir, 'page.json'), JSON.stringify(data, null, 2))
  await writeFile(join(outDir, 'flow.json'), JSON.stringify(flow, null, 2))
  await writeFile(join(outDir, 'flow.md'), renderFlowMd(flow))

  console.log(`Wrote ${join(outDir, 'page.json')}`)
  console.log(
    `Wrote ${join(outDir, 'flow.json')} — ${screenMeta.length} screens, ` +
      `${transitions.onPage.length} on-page / ${transitions.offPage.length} off-page transitions`
  )
  console.log(`Wrote ${join(outDir, 'flow.md')}`)
  console.log(`Next: read ${join(outDir, 'flow.md')}, then run figma-images.mjs to render the screens`)
}

main()
