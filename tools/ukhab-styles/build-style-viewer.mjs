#!/usr/bin/env node
// Parse every QGIS .qml layer style under ./qml into a compact JSON model
// (renderer + symbols per category) and write it to app/data/ukhab-styles.json.
//
//   node tools/ukhab-styles/build-style-viewer.mjs
//
// The page itself is a normal GOV.UK-templated view (app/views/ukhab-styles)
// plus a client script (app/assets/javascripts/ukhab-styles.js). The route
// injects this JSON into the view, and the client script renders the searchable
// grid of swatches + property tables from it. So only the *data* is generated
// here; the markup and behaviour are hand-maintained.
//
// Source:  tools/ukhab-styles/qml/**/*.qml  (dev-only; not shipped in the image)
// Output:  app/data/ukhab-styles.json       (committed; read by the route).

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';

const QML_ROOT = join(import.meta.dirname, 'qml');
const OUTPUT = join(import.meta.dirname, '..', '..', 'app', 'data', 'ukhab-styles.json');

// ---------------------------------------------------------------------------
// Minimal XML parser (dependency-free). QML files are machine-generated and
// well-formed, so a small recursive-descent parser is enough.
// ---------------------------------------------------------------------------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeEntities(text) {
  return text.replaceAll(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (whole, code) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16));
    }
    if (code.startsWith('#')) {
      return String.fromCodePoint(parseInt(code.slice(1), 10));
    }
    return ENTITIES[code] ?? whole;
  });
}

function parseAttrs(raw) {
  const attrs = {};
  const re = /([\w:-]+)\s*=\s*"([^"]*)"/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    attrs[m[1]] = decodeEntities(m[2]);
  }
  return attrs;
}

// Returns the root element node. node = { tag, attrs, children }.
function parseXML(xml) {
  const root = { tag: '#root', attrs: {}, children: [] };
  const stack = [root];
  const tagRe = /<(\/)?([\w:-]+|![^>]*|\?[^>]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/)?>/g;
  let m;
  while ((m = tagRe.exec(xml)) !== null) {
    const [, closing, name, attrRaw, selfClose] = m;
    // Skip declarations, doctype and comments.
    if (name.startsWith('!') || name.startsWith('?')) {
      continue;
    }
    if (closing) {
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }
    const node = { tag: name, attrs: parseAttrs(attrRaw), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) {
      stack.push(node);
    }
  }
  return root;
}

function findAll(node, tag, out = []) {
  for (const child of node.children) {
    if (child.tag === tag) {
      out.push(child);
    }
    findAll(child, tag, out);
  }
  return out;
}

function firstChild(node, tag) {
  return node.children.find((c) => c.tag === tag) ?? null;
}

// ---------------------------------------------------------------------------
// QML -> compact model
// ---------------------------------------------------------------------------

// Colour props are stored as "r,g,b,a"; convert to [r,g,b,a] for known keys.
const COLOUR_KEYS = new Set([
  'color', 'outline_color', 'line_color', 'border_color', 'fill_color', 'ring_color',
]);

function propsOf(layerNode) {
  const props = {};
  for (const p of layerNode.children.filter((c) => c.tag === 'prop')) {
    const key = p.attrs.k;
    const value = p.attrs.v;
    if (COLOUR_KEYS.has(key) && /^\d+,\d+,\d+(,\d+)?$/.test(value)) {
      props[key] = value.split(',').map(Number);
    } else {
      props[key] = value;
    }
  }
  return props;
}

function parseSymbol(symbolNode) {
  if (!symbolNode) {
    return null;
  }
  const layers = symbolNode.children
    .filter((c) => c.tag === 'layer')
    .map((layerNode) => ({
      class: layerNode.attrs.class,
      enabled: layerNode.attrs.enabled !== '0',
      props: propsOf(layerNode),
      // Pattern-fill / marker-line layers embed a sub-symbol.
      subSymbol: parseSymbol(firstChild(layerNode, 'symbol')),
    }));
  return {
    type: symbolNode.attrs.type,
    name: symbolNode.attrs.name,
    alpha: symbolNode.attrs.alpha ?? '1',
    layers,
  };
}

function symbolMap(rendererNode) {
  const map = {};
  const symbolsNode = firstChild(rendererNode, 'symbols');
  if (!symbolsNode) {
    return map;
  }
  for (const s of symbolsNode.children.filter((c) => c.tag === 'symbol')) {
    map[s.attrs.name] = parseSymbol(s);
  }
  return map;
}

function parseCategorized(rendererNode, symbols) {
  const catsNode = firstChild(rendererNode, 'categories');
  const cats = catsNode ? catsNode.children.filter((c) => c.tag === 'category') : [];
  return cats.map((c) => ({
    label: c.attrs.label || c.attrs.value || '(default)',
    value: c.attrs.value ?? '',
    render: c.attrs.render !== 'false' && c.attrs.render !== '0',
    symbol: symbols[c.attrs.symbol] ?? null,
  }));
}

function parseRuleBased(rendererNode, symbols) {
  const rulesNode = firstChild(rendererNode, 'rules');
  const rules = rulesNode ? findAll(rulesNode, 'rule') : [];
  return rules
    .filter((r) => r.attrs.symbol !== undefined)
    .map((r) => ({
      label: r.attrs.label || r.attrs.filter || '(rule)',
      value: r.attrs.filter ?? '',
      render: true,
      symbol: symbols[r.attrs.symbol] ?? null,
    }));
}

function geometryOf(entries) {
  const first = entries.find((e) => e.symbol);
  return first?.symbol?.type ?? 'unknown';
}

// Derive a friendly group/variant from the file path, e.g.
//   Styles/Habitats Master.qml            -> Habitats / Master
//   Styles/Layer Styling/Rivers/... .qml  -> Rivers (styling) / <name>
function classify(relPath) {
  const name = basename(relPath, '.qml');
  const dir = dirname(relPath);
  if (dir.includes('Layer Styling')) {
    const theme = basename(dir);
    return { group: `${theme} (thematic)`, variant: name };
  }
  const lower = name.toLowerCase();
  let group = 'Other';
  if (lower.startsWith('habitat')) group = 'Habitats';
  else if (lower.startsWith('hedge')) group = 'Hedgerows';
  else if (lower.startsWith('individual tree')) group = 'Individual trees';
  else if (lower.startsWith('river') || lower.startsWith('watercourse')) group = 'Rivers';
  else if (lower.startsWith('net gain')) group = 'Layer index';
  const variant = name.replace(/^\S+\s*/i, '').trim() || name;
  return { group, variant };
}

function parseQml(absPath, relPath) {
  const xml = readFileSync(absPath, 'utf-8');
  const doc = parseXML(xml);
  const rendererNode = findAll(doc, 'renderer-v2')[0];
  if (!rendererNode) {
    return null;
  }
  const rendererType = rendererNode.attrs.type ?? 'unknown';
  const symbols = symbolMap(rendererNode);
  let entries = [];
  if (rendererType === 'categorizedSymbol') {
    entries = parseCategorized(rendererNode, symbols);
  } else if (rendererType === 'RuleRenderer') {
    entries = parseRuleBased(rendererNode, symbols);
  } else {
    // Fall back to whatever symbols exist so nothing is silently dropped.
    entries = Object.entries(symbols).map(([name, symbol]) => ({
      label: `symbol ${name}`, value: name, render: true, symbol,
    }));
  }
  const { group, variant } = classify(relPath);
  return {
    file: relPath,
    group,
    variant,
    rendererType,
    attr: rendererNode.attrs.attr ?? '',
    geometry: geometryOf(entries),
    entries,
  };
}

// ---------------------------------------------------------------------------
// Collect files, parse, write JSON
// ---------------------------------------------------------------------------

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, out);
    } else if (name.toLowerCase().endsWith('.qml')) {
      out.push(full);
    }
  }
  return out;
}

const qmlFiles = walk(QML_ROOT).sort();
const layers = [];
for (const abs of qmlFiles) {
  const rel = relative(QML_ROOT, abs);
  const parsed = parseQml(abs, rel);
  if (parsed) {
    layers.push(parsed);
    console.log(`  parsed ${rel} — ${parsed.rendererType}, ${parsed.entries.length} entries (${parsed.geometry})`);
  } else {
    console.log(`  skipped ${rel} — no renderer`);
  }
}

const data = {
  generatedAtNote: 'Regenerate with: node tools/ukhab-styles/build-style-viewer.mjs',
  source: 'BNG QGIS template (.qml layer styles)',
  layers,
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(data), 'utf-8');
const totalEntries = layers.reduce((n, l) => n + l.entries.length, 0);
console.log(`\nWrote ${OUTPUT} — ${layers.length} layers, ${totalEntries} styled entries.`);
