#!/usr/bin/env node
// Build a single self-contained HTML viewer for all QGIS .qml layer styles.
// Parses each .qml under ./qml into a compact JSON model (renderer + symbols
// per category), then embeds that JSON into an HTML page with client-side
// search, filtering and an SVG swatch renderer.
//
//   node tools/ukhab-styles/build-style-viewer.mjs
//
// Source:  tools/ukhab-styles/qml/**/*.qml  (dev-only; not shipped in the image)
// Output:  app/data/ukhab-styles.html       (committed; served by the route and
//                                             copied into the container).
// The output is a single self-contained file — open it directly in a browser
// with no server, or let the SHOW_TOOLS-gated route serve it.

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, relative, dirname, basename } from 'node:path';

const QML_ROOT = join(import.meta.dirname, 'qml');
const OUTPUT = join(import.meta.dirname, '..', '..', 'app', 'data', 'ukhab-styles.html');

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
// Collect files
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
  generatedAtNote: 'Regenerate with: node tools/build-style-viewer.mjs',
  source: 'bng-ukhab QGIS template (.qml layer styles)',
  layers,
};

// ---------------------------------------------------------------------------
// Client-side viewer script (runs in the browser). Kept as a template string so
// the whole tool is a single dependency-free file. `\\` escapes backticks/$
// that must survive into the emitted <script>.
// ---------------------------------------------------------------------------

const VIEWER_JS = String.raw`
const DATA = JSON.parse(document.getElementById('data').textContent);
const grid = document.getElementById('grid');
const searchEl = document.getElementById('search');
const groupEl = document.getElementById('group');
const fileEl = document.getElementById('file');
const countEl = document.getElementById('count');

const SW = 120, SH = 80;               // swatch size in px
const MM = 3.2;                        // rough mm -> px for the swatch scale

// Flatten every category/rule across all layers into one searchable list.
const ITEMS = [];
for (const layer of DATA.layers) {
  for (const entry of layer.entries) {
    ITEMS.push({
      label: entry.label,
      value: entry.value,
      render: entry.render,
      symbol: entry.symbol,
      group: layer.group,
      variant: layer.variant,
      file: layer.file,
      attr: layer.attr,
      geometry: layer.geometry,
      rendererType: layer.rendererType,
      search: (entry.label + ' ' + entry.value + ' ' + layer.group + ' ' + layer.file).toLowerCase(),
    });
  }
}

// ---- colour helpers -------------------------------------------------------
function rgba(c, fallbackAlpha) {
  if (!Array.isArray(c)) { return 'transparent'; }
  const [r, g, b, a] = c;
  const alpha = (a === undefined ? (fallbackAlpha ?? 255) : a) / 255;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
function hex(c) {
  if (!Array.isArray(c)) { return ''; }
  return '#' + c.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}

// ---- SVG swatch renderer (approximate) ------------------------------------
let uid = 0;
function svgFor(symbol) {
  if (!symbol) { return '<svg width="' + SW + '" height="' + SH + '"></svg>'; }
  if (symbol.type === 'marker') { return markerSwatch(symbol); }
  if (symbol.type === 'line') { return lineSwatch(symbol); }
  return fillSwatch(symbol);
}

function fillSwatch(symbol) {
  const defs = [];
  const rects = [];
  for (const layer of symbol.layers.filter((l) => l.enabled)) {
    const p = layer.props;
    if (layer.class === 'SimpleFill') {
      const fill = p.style === 'no' ? 'none' : rgba(p.color);
      const strokeOn = p.outline_style && p.outline_style !== 'no';
      const stroke = strokeOn ? rgba(p.outline_color) : 'none';
      const sw = strokeOn ? Math.max(1, (parseFloat(p.outline_width) || 0.26) * MM) : 0;
      rects.push('<rect x="1" y="1" width="' + (SW - 2) + '" height="' + (SH - 2) +
        '" fill="' + fill + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
    } else if (layer.class === 'LinePatternFill') {
      const id = 'h' + (uid++);
      const line = (layer.subSymbol && layer.subSymbol.layers[0]) || null;
      const col = rgba(line ? line.props.line_color : p.color);
      const lw = Math.max(0.7, (parseFloat(line ? line.props.line_width : p.line_width) || 0.26) * MM);
      const dist = Math.max(4, (parseFloat(p.distance) || 2) * MM);
      const angle = parseFloat(p.angle) || 0;
      defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + dist + '" height="' + dist +
        '" patternTransform="rotate(' + (-angle) + ')"><line x1="0" y1="0" x2="0" y2="' + dist +
        '" stroke="' + col + '" stroke-width="' + lw + '"/></pattern>');
      rects.push('<rect x="1" y="1" width="' + (SW - 2) + '" height="' + (SH - 2) + '" fill="url(#' + id + ')"/>');
    } else if (layer.class === 'PointPatternFill') {
      const id = 'd' + (uid++);
      const mk = (layer.subSymbol && layer.subSymbol.layers[0]) || null;
      const col = rgba(mk ? mk.props.color : p.color);
      const dx = Math.max(5, (parseFloat(p.distance_x) || 2) * MM);
      const dy = Math.max(5, (parseFloat(p.distance_y) || 2) * MM);
      const r = Math.max(1, (parseFloat(mk ? mk.props.size : 1) || 1) * MM * 0.5);
      defs.push('<pattern id="' + id + '" patternUnits="userSpaceOnUse" width="' + dx + '" height="' + dy +
        '"><circle cx="' + (dx / 2) + '" cy="' + (dy / 2) + '" r="' + r + '" fill="' + col + '"/></pattern>');
      rects.push('<rect x="1" y="1" width="' + (SW - 2) + '" height="' + (SH - 2) + '" fill="url(#' + id + ')"/>');
    }
  }
  return '<svg width="' + SW + '" height="' + SH + '"><defs>' + defs.join('') + '</defs>' + rects.join('') + '</svg>';
}

function dashArray(p, width) {
  if (p.use_custom_dash === '1' && p.customdash) {
    return p.customdash.split(';').map((n) => (parseFloat(n) || 0) * MM).join(',');
  }
  const style = p.line_style;
  if (style === 'dash') { return (4 * width) + ',' + (3 * width); }
  if (style === 'dot') { return width + ',' + (2 * width); }
  if (style === 'dash dot') { return (4 * width) + ',' + (2 * width) + ',' + width + ',' + (2 * width); }
  return '';
}

function lineSwatch(symbol) {
  const lines = [];
  const layers = symbol.layers.filter((l) => l.enabled && l.class === 'SimpleLine');
  const n = Math.max(1, layers.length);
  layers.forEach((layer, i) => {
    const p = layer.props;
    if (p.line_style === 'no') { return; }
    const width = Math.max(1, (parseFloat(p.line_width) || 0.5) * MM);
    const y = SH * (i + 1) / (n + 1);
    const dash = dashArray(p, width);
    lines.push('<line x1="6" y1="' + y + '" x2="' + (SW - 6) + '" y2="' + y +
      '" stroke="' + rgba(p.line_color) + '" stroke-width="' + width + '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') + ' stroke-linecap="round"/>');
  });
  return '<svg width="' + SW + '" height="' + SH + '">' + lines.join('') + '</svg>';
}

function markerPath(shape, cx, cy, r) {
  switch (shape) {
    case 'diamond': return '<polygon points="' + cx + ',' + (cy - r) + ' ' + (cx + r) + ',' + cy + ' ' + cx + ',' + (cy + r) + ' ' + (cx - r) + ',' + cy + '"';
    case 'square': case 'rectangle': return '<rect x="' + (cx - r) + '" y="' + (cy - r) + '" width="' + (2 * r) + '" height="' + (2 * r) + '"';
    case 'triangle': return '<polygon points="' + cx + ',' + (cy - r) + ' ' + (cx + r) + ',' + (cy + r) + ' ' + (cx - r) + ',' + (cy + r) + '"';
    case 'cross': case 'cross2': return '<path d="M' + (cx - r) + ' ' + cy + ' H' + (cx + r) + ' M' + cx + ' ' + (cy - r) + ' V' + (cy + r) + '"';
    default: return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"';
  }
}

function markerSwatch(symbol) {
  const shapes = [];
  const layers = symbol.layers.filter((l) => l.enabled && l.class === 'SimpleMarker');
  for (const layer of layers) {
    const p = layer.props;
    const r = Math.max(4, (parseFloat(p.size) || 2) * MM);
    const stroke = p.outline_style && p.outline_style !== 'no' ? rgba(p.outline_color) : 'none';
    const sw = Math.max(0.5, (parseFloat(p.outline_width) || 0) * MM);
    shapes.push(markerPath(p.name, SW / 2, SH / 2, r) +
      ' fill="' + rgba(p.color) + '" stroke="' + stroke + '" stroke-width="' + sw + '"/>');
  }
  return '<svg width="' + SW + '" height="' + SH + '">' + shapes.join('') + '</svg>';
}

// ---- property tables ------------------------------------------------------
function propRow(k, v) {
  let cell;
  if (Array.isArray(v)) {
    cell = '<span class="chip"><span class="sw" style="background:' + rgba(v) + '"></span>' +
      '<span class="mono">' + esc(hex(v)) + '</span> <span class="mono">' + esc(v.join(',')) + '</span></span>';
  } else {
    cell = '<span class="mono">' + esc(v) + '</span>';
  }
  return '<tr><td>' + esc(k) + '</td><td>' + cell + '</td></tr>';
}

function layerTable(layer, depth) {
  const rows = Object.entries(layer.props).map(([k, v]) => propRow(k, v)).join('');
  let html = '<div class="layer-block" style="margin-left:' + (depth * 8) + 'px">' +
    '<div class="layer-name">' + esc(layer.class) + (layer.enabled ? '' : ' (disabled)') + '</div>' +
    '<table class="props"><tbody>' + rows + '</tbody></table>';
  if (layer.subSymbol) {
    html += layer.subSymbol.layers.map((l) => layerTable(l, depth + 1)).join('');
  }
  return html + '</div>';
}

function detailsFor(symbol) {
  if (!symbol) { return '<div class="meta">No symbol defined.</div>'; }
  const inner = symbol.layers.map((l) => layerTable(l, 0)).join('');
  return '<details><summary>Symbol detail (' + symbol.type + ', ' + symbol.layers.length + ' layer' +
    (symbol.layers.length === 1 ? '' : 's') + ')</summary>' + inner + '</details>';
}

// ---- card render ----------------------------------------------------------
function card(item) {
  return '<div class="card">' +
    '<div class="card-head">' +
      '<div class="swatch">' + svgFor(item.symbol) + '</div>' +
      '<div><div class="title">' + esc(item.label) + '</div>' +
        '<div class="meta"><span class="tag">' + esc(item.group) + '</span>' +
        '<span class="tag">' + esc(item.geometry) + '</span></div>' +
        '<div class="meta">' + esc(item.file) + '</div>' +
        (item.attr ? '<div class="meta">by: ' + esc(item.attr) + '</div>' : '') +
      '</div>' +
    '</div>' +
    detailsFor(item.symbol) +
  '</div>';
}

// ---- filters --------------------------------------------------------------
function fillSelect(el, values, allLabel) {
  const opts = ['<option value="">' + allLabel + '</option>']
    .concat([...new Set(values)].sort().map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>'));
  el.innerHTML = opts.join('');
}
fillSelect(groupEl, ITEMS.map((i) => i.group), 'All groups');
fillSelect(fileEl, ITEMS.map((i) => i.file), 'All files');

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const g = groupEl.value;
  const f = fileEl.value;
  const shown = ITEMS.filter((i) =>
    (!q || i.search.includes(q)) && (!g || i.group === g) && (!f || i.file === f));
  countEl.textContent = shown.length + ' of ' + ITEMS.length + ' styled entries';
  grid.innerHTML = shown.length
    ? shown.map(card).join('')
    : '<div class="empty">No matches.</div>';
}

searchEl.addEventListener('input', render);
groupEl.addEventListener('change', render);
fileEl.addEventListener('change', render);
render();
`;

// Escape so the JSON is safe inside a <script> element.
const jsonText = JSON.stringify(data).replaceAll('<', '\\u003c');

const html = buildHtml(jsonText, VIEWER_JS);
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, html, 'utf-8');
const totalEntries = layers.reduce((n, l) => n + l.entries.length, 0);
console.log(`\nWrote ${OUTPUT} — ${layers.length} layers, ${totalEntries} styled entries.`);

// ---------------------------------------------------------------------------
// HTML template
// ---------------------------------------------------------------------------

function buildHtml(jsonText, viewerJs) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UKHab / BNG layer style browser</title>
<style>
  :root {
    --bg: #0f172a; --panel: #1e293b; --panel2: #273449; --text: #e2e8f0;
    --muted: #94a3b8; --accent: #38bdf8; --border: #334155;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font: 14px/1.5 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
    background: var(--bg); color: var(--text);
  }
  header {
    padding: 16px 20px; border-bottom: 1px solid var(--border);
    position: sticky; top: 0; background: var(--bg); z-index: 5;
  }
  header h1 { margin: 0 0 4px; font-size: 18px; }
  header p { margin: 0; color: var(--muted); font-size: 12px; }
  .controls { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; align-items: center; }
  input[type=search], select {
    background: var(--panel); color: var(--text); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px 10px; font-size: 14px;
  }
  input[type=search] { min-width: 260px; flex: 1; }
  .count { color: var(--muted); font-size: 12px; }
  main { padding: 16px 20px 60px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 12px; }
  .card {
    background: var(--panel); border: 1px solid var(--border); border-radius: 10px;
    padding: 12px; display: flex; flex-direction: column; gap: 8px;
  }
  .card-head { display: flex; gap: 10px; align-items: flex-start; }
  .swatch { flex: 0 0 auto; border-radius: 6px; background:
    repeating-conic-gradient(#0000 0 25%, #ffffff11 0 50%) 0 0 / 14px 14px; }
  .title { font-weight: 600; }
  .meta { color: var(--muted); font-size: 11px; margin-top: 2px; }
  .tag {
    display: inline-block; font-size: 10px; padding: 1px 6px; border-radius: 999px;
    background: var(--panel2); border: 1px solid var(--border); color: var(--muted);
    margin-right: 4px;
  }
  details { border-top: 1px solid var(--border); padding-top: 6px; }
  summary { cursor: pointer; color: var(--accent); font-size: 12px; }
  table.props { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
  table.props th { text-align: left; color: var(--muted); font-weight: 600; padding: 2px 6px; }
  table.props td { padding: 2px 6px; border-top: 1px solid var(--border); vertical-align: top; }
  .layer-block { margin-top: 8px; }
  .layer-name { font-size: 11px; color: var(--accent); font-weight: 600; }
  .chip { display: inline-flex; align-items: center; gap: 5px; }
  .chip .sw { width: 12px; height: 12px; border-radius: 3px; border: 1px solid #0006; display: inline-block; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .empty { color: var(--muted); padding: 40px; text-align: center; }
  a { color: var(--accent); }
</style>
</head>
<body>
<header>
  <h1>UKHab / BNG layer style browser</h1>
  <p>Parsed from the QGIS <span class="mono">.qml</span> templates in <span class="mono">bng-ukhab</span>. Swatches are an approximate render of the QGIS symbology; the property tables are authoritative.</p>
  <div class="controls">
    <input id="search" type="search" placeholder="Search habitat / type name…" autocomplete="off">
    <select id="group"></select>
    <select id="file"></select>
    <span class="count" id="count"></span>
  </div>
</header>
<main><div class="grid" id="grid"></div></main>

<script id="data" type="application/json">${jsonText}</script>
<script>
${viewerJs}
</script>
</body>
</html>`;
}
