// Client-side renderer for the UKHab styles page (app/views/ukhab-styles).
// Reads the JSON the route injected into #ukhab-data and renders a searchable
// grid of habitat cards: an SVG swatch of the QGIS symbology plus the
// authoritative raw property tables. No dependencies — plain DOM.
//
// The swatch aims to be as faithful as possible to how QGIS draws each symbol.
// Two things are inherent limits of a fixed swatch rather than missing work:
//   - Absolute on-map size cannot be shown (a swatch has no map scale), so MM
//     below is a consistent *relative* scale, not real-world millimetres.
//   - Along-line placement (MarkerLine) and point-pattern grids are shown on a
//     straight segment / regular grid; real placement follows the geometry.
;(function () {
  const dataEl = document.getElementById('ukhab-data')
  const grid = document.getElementById('ukhab-grid')
  if (!dataEl || !grid) return // not on this page

  const searchEl = document.getElementById('ukhab-search')
  const groupEl = document.getElementById('ukhab-group')
  const fileEl = document.getElementById('ukhab-file')
  const countEl = document.getElementById('ukhab-count')

  const DATA = JSON.parse(dataEl.textContent)

  const SW = 120
  const SH = 80 // swatch size in px
  const MM = 3.2 // relative mm -> px scale for the swatch

  // Flatten every category/rule across all layers into one searchable list.
  const ITEMS = []
  for (const layer of DATA.layers) {
    for (const entry of layer.entries) {
      ITEMS.push({
        label: entry.label,
        value: entry.value,
        symbol: entry.symbol,
        group: layer.group,
        variant: layer.variant,
        file: layer.file,
        geometry: layer.geometry,
        search: (
          entry.label +
          ' ' +
          entry.value +
          ' ' +
          layer.group +
          ' ' +
          layer.file
        ).toLowerCase()
      })
    }
  }

  // ---- colour helpers -----------------------------------------------------
  function rgba(c, fallbackAlpha) {
    if (!Array.isArray(c)) return 'transparent'
    const [r, g, b, a] = c
    const alpha = (a === undefined ? (fallbackAlpha ?? 255) : a) / 255
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
  }
  function hex(c) {
    if (!Array.isArray(c)) return ''
    return (
      '#' +
      c
        .slice(0, 3)
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('')
    )
  }
  function esc(s) {
    return String(s).replace(
      /[&<>"]/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]
    )
  }
  function num(v, d) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : d
  }

  // ---- SVG swatch renderer ------------------------------------------------
  function svgFor(symbol) {
    let inner = ''
    if (symbol) {
      if (symbol.type === 'marker') inner = markerInner(symbol)
      else if (symbol.type === 'line') inner = lineInner(symbol)
      else inner = fillInner(symbol)
    }
    // QGIS symbol-level alpha dims the whole symbol.
    const a = symbol ? num(symbol.alpha, 1) : 1
    const body = a < 1 ? '<g opacity="' + a + '">' + inner + '</g>' : inner
    return (
      '<svg width="' +
      SW +
      '" height="' +
      SH +
      '" viewBox="0 0 ' +
      SW +
      ' ' +
      SH +
      '">' +
      body +
      '</svg>'
    )
  }

  // Opening tag (no close) for a marker shape centred on (cx, cy), radius r.
  function markerPath(shape, cx, cy, r) {
    switch (shape) {
      case 'diamond':
        return (
          '<polygon points="' +
          cx +
          ',' +
          (cy - r) +
          ' ' +
          (cx + r) +
          ',' +
          cy +
          ' ' +
          cx +
          ',' +
          (cy + r) +
          ' ' +
          (cx - r) +
          ',' +
          cy +
          '"'
        )
      case 'square':
      case 'rectangle':
        return (
          '<rect x="' +
          (cx - r) +
          '" y="' +
          (cy - r) +
          '" width="' +
          2 * r +
          '" height="' +
          2 * r +
          '"'
        )
      case 'triangle':
        return (
          '<polygon points="' +
          cx +
          ',' +
          (cy - r) +
          ' ' +
          (cx + r) +
          ',' +
          (cy + r) +
          ' ' +
          (cx - r) +
          ',' +
          (cy + r) +
          '"'
        )
      case 'cross':
      case 'cross2':
        return (
          '<path d="M' +
          (cx - r) +
          ' ' +
          cy +
          ' H' +
          (cx + r) +
          ' M' +
          cx +
          ' ' +
          (cy - r) +
          ' V' +
          (cy + r) +
          '"'
        )
      default:
        return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '"'
    }
  }

  // Draw one SimpleMarker layer at (cx, cy): size, colour, outline, per-layer
  // offset and rotation. Shared by marker symbols, MarkerLine and point fills.
  function simpleMarker(p, cx, cy) {
    const size = num(p.size, 2) // QGIS marker size is a diameter (mm)
    const r = Math.max(3, (size * MM) / 2)
    const parts = String(p.offset || '0,0').split(',')
    const x = cx + num(parts[0], 0) * MM
    const y = cy + num(parts[1], 0) * MM
    const isStroke = p.name === 'cross' || p.name === 'cross2'
    const outlineOn = p.outline_style && p.outline_style !== 'no'
    const fill = isStroke ? 'none' : rgba(p.color)
    const stroke = isStroke
      ? rgba(p.color)
      : outlineOn
        ? rgba(p.outline_color)
        : 'none'
    const sw = isStroke
      ? Math.max(1, r * 0.3)
      : outlineOn
        ? Math.max(0.4, num(p.outline_width, 0) * MM)
        : 0
    let el =
      markerPath(p.name, x, y, r) +
      ' fill="' +
      fill +
      '" stroke="' +
      stroke +
      '" stroke-width="' +
      sw +
      '"/>'
    const angle = num(p.angle, 0)
    if (angle) {
      el =
        '<g transform="rotate(' +
        angle +
        ' ' +
        x +
        ' ' +
        y +
        ')">' +
        el +
        '</g>'
    }
    return el
  }

  function dashArray(p, width) {
    if (p.use_custom_dash === '1' && p.customdash) {
      return p.customdash
        .split(';')
        .map((n) => num(n, 0) * MM)
        .join(',')
    }
    switch (p.line_style) {
      case 'dash':
        return 4 * width + ',' + 3 * width
      case 'dot':
        return width + ',' + 2 * width
      case 'dash dot':
        return 4 * width + ',' + 2 * width + ',' + width + ',' + 2 * width
      case 'dash dot dot':
        return (
          4 * width +
          ',' +
          2 * width +
          ',' +
          width +
          ',' +
          2 * width +
          ',' +
          width +
          ',' +
          2 * width
        )
      default:
        return ''
    }
  }

  // ---- fill symbols -------------------------------------------------------
  let uid = 0
  function fillRect(fill, extra) {
    return (
      '<rect x="1" y="1" width="' +
      (SW - 2) +
      '" height="' +
      (SH - 2) +
      '" fill="' +
      fill +
      '"' +
      (extra || '') +
      '/>'
    )
  }

  function fillInner(symbol) {
    const defs = []
    const body = []
    for (const layer of symbol.layers.filter((l) => l.enabled)) {
      const p = layer.props
      if (layer.class === 'SimpleFill') {
        const fill = p.style === 'no' ? 'none' : rgba(p.color)
        const outlineOn = p.outline_style && p.outline_style !== 'no'
        const stroke = outlineOn ? rgba(p.outline_color) : 'none'
        const sw = outlineOn ? Math.max(1, num(p.outline_width, 0.26) * MM) : 0
        const dash = outlineOn
          ? dashArray({ line_style: p.outline_style }, sw)
          : ''
        body.push(
          fillRect(
            fill,
            ' stroke="' +
              stroke +
              '" stroke-width="' +
              sw +
              '"' +
              (dash ? ' stroke-dasharray="' + dash + '"' : '')
          )
        )
      } else if (layer.class === 'LinePatternFill') {
        const id = 'h' + uid++
        const sub = (layer.subSymbol && layer.subSymbol.layers[0]) || null
        const sp = sub ? sub.props : {}
        const col = rgba(sub ? sp.line_color : p.color)
        const lw = Math.max(
          0.6,
          num(sub ? sp.line_width : p.line_width, 0.26) * MM
        )
        const dist = Math.max(3, num(p.distance, 2) * MM)
        const angle = num(p.angle, 0)
        const dash = sub ? dashArray(sp, lw) : ''
        defs.push(
          '<pattern id="' +
            id +
            '" patternUnits="userSpaceOnUse" width="' +
            dist +
            '" height="' +
            dist +
            '" patternTransform="rotate(' +
            -angle +
            ')"><line x1="0" y1="0" x2="0" y2="' +
            dist +
            '" stroke="' +
            col +
            '" stroke-width="' +
            lw +
            '"' +
            (dash ? ' stroke-dasharray="' + dash + '"' : '') +
            '/></pattern>'
        )
        body.push(fillRect('url(#' + id + ')'))
      } else if (layer.class === 'PointPatternFill') {
        const id = 'd' + uid++
        const markers = (layer.subSymbol ? layer.subSymbol.layers : []).filter(
          (l) => l.enabled && l.class === 'SimpleMarker'
        )
        const dx = Math.max(6, num(p.distance_x, 2) * MM)
        const dy = Math.max(6, num(p.distance_y, 2) * MM)
        const inner = markers
          .map((m) => simpleMarker(m.props, dx / 2, dy / 2))
          .join('')
        defs.push(
          '<pattern id="' +
            id +
            '" patternUnits="userSpaceOnUse" width="' +
            dx +
            '" height="' +
            dy +
            '">' +
            inner +
            '</pattern>'
        )
        body.push(fillRect('url(#' + id + ')'))
      }
    }
    return '<defs>' + defs.join('') + '</defs>' + body.join('')
  }

  // ---- line symbols -------------------------------------------------------
  function simpleLine(p, cy) {
    if (p.line_style === 'no') return ''
    const width = Math.max(1, num(p.line_width, 0.5) * MM)
    const y = cy + num(p.offset, 0) * MM
    const dash = dashArray(p, width)
    return (
      '<line x1="4" y1="' +
      y +
      '" x2="' +
      (SW - 4) +
      '" y2="' +
      y +
      '" stroke="' +
      rgba(p.line_color) +
      '" stroke-width="' +
      width +
      '"' +
      (dash ? ' stroke-dasharray="' + dash + '"' : '') +
      ' stroke-linecap="' +
      (p.capstyle === 'round' ? 'round' : 'butt') +
      '"/>'
    )
  }

  // MarkerLine: repeat the sub-marker along the line at its interval.
  function markerLine(layer, cy) {
    const sub = layer.subSymbol
    if (!sub) return ''
    const markers = sub.layers.filter(
      (l) => l.enabled && l.class === 'SimpleMarker'
    )
    const interval = Math.max(4, num(layer.props.interval, 3) * MM)
    let out = ''
    for (let x = 6; x <= SW - 4; x += interval) {
      out += markers.map((m) => simpleMarker(m.props, x, cy)).join('')
    }
    return out
  }

  function lineInner(symbol) {
    const cy = SH / 2
    let out = ''
    // Layers draw in declared order, overlaid on the same line (offsets in mm).
    for (const layer of symbol.layers.filter((l) => l.enabled)) {
      if (layer.class === 'SimpleLine') out += simpleLine(layer.props, cy)
      else if (layer.class === 'MarkerLine') out += markerLine(layer, cy)
    }
    return out
  }

  // ---- marker symbols -----------------------------------------------------
  function markerInner(symbol) {
    return symbol.layers
      .filter((l) => l.enabled && l.class === 'SimpleMarker')
      .map((m) => simpleMarker(m.props, SW / 2, SH / 2))
      .join('')
  }

  // ---- property tables ----------------------------------------------------
  function propRow(k, v) {
    let cell
    if (Array.isArray(v)) {
      cell =
        '<span class="ukhab-chip"><span class="ukhab-chip-sw" style="background:' +
        rgba(v) +
        '"></span><span class="ukhab-mono">' +
        esc(hex(v)) +
        '</span> <span class="ukhab-mono">' +
        esc(v.join(',')) +
        '</span></span>'
    } else {
      cell = '<span class="ukhab-mono">' + esc(v) + '</span>'
    }
    return '<tr><td>' + esc(k) + '</td><td>' + cell + '</td></tr>'
  }

  function layerTable(layer, depth) {
    const rows = Object.entries(layer.props)
      .map(([k, v]) => propRow(k, v))
      .join('')
    let html =
      '<div class="ukhab-layer-block" style="margin-left:' +
      depth * 8 +
      'px"><div class="ukhab-layer-name">' +
      esc(layer.class) +
      (layer.enabled ? '' : ' (disabled)') +
      '</div><table class="ukhab-props"><tbody>' +
      rows +
      '</tbody></table>'
    if (layer.subSymbol) {
      html += layer.subSymbol.layers
        .map((l) => layerTable(l, depth + 1))
        .join('')
    }
    return html + '</div>'
  }

  function detailsFor(symbol) {
    if (!symbol) return '<div class="ukhab-meta">No symbol defined.</div>'
    const inner = symbol.layers.map((l) => layerTable(l, 0)).join('')
    return (
      '<details class="ukhab-details"><summary>Symbol detail (' +
      symbol.type +
      ', ' +
      symbol.layers.length +
      ' layer' +
      (symbol.layers.length === 1 ? '' : 's') +
      ')</summary>' +
      inner +
      '</details>'
    )
  }

  // ---- card render --------------------------------------------------------
  function card(item) {
    // Show group / geometry / variant as compact tags. The variant
    // (Master / baseline / proposed / …) tells near-duplicate habitat names
    // apart; the full source path lives in the "Source file" filter instead.
    return (
      '<div class="ukhab-card"><div class="ukhab-card-head"><div class="ukhab-swatch">' +
      svgFor(item.symbol) +
      '</div><div><div class="ukhab-title">' +
      esc(item.label) +
      '</div><div class="ukhab-meta"><span class="ukhab-tag">' +
      esc(item.group) +
      '</span><span class="ukhab-tag">' +
      esc(item.geometry) +
      '</span>' +
      (item.variant
        ? '<span class="ukhab-tag">' + esc(item.variant) + '</span>'
        : '') +
      '</div></div></div>' +
      detailsFor(item.symbol) +
      '</div>'
    )
  }

  // ---- filters ------------------------------------------------------------
  function fillSelect(el, values, allLabel) {
    const opts = ['<option value="">' + allLabel + '</option>'].concat(
      [...new Set(values)]
        .sort()
        .map((v) => '<option value="' + esc(v) + '">' + esc(v) + '</option>')
    )
    el.innerHTML = opts.join('')
  }
  fillSelect(
    groupEl,
    ITEMS.map((i) => i.group),
    'All groups'
  )
  fillSelect(
    fileEl,
    ITEMS.map((i) => i.file),
    'All files'
  )

  function render() {
    const q = searchEl.value.trim().toLowerCase()
    const g = groupEl.value
    const f = fileEl.value
    const shown = ITEMS.filter(
      (i) =>
        (!q || i.search.includes(q)) &&
        (!g || i.group === g) &&
        (!f || i.file === f)
    )
    countEl.textContent =
      shown.length + ' of ' + ITEMS.length + ' styled entries'
    grid.innerHTML = shown.length
      ? shown.map(card).join('')
      : '<div class="ukhab-empty">No matches.</div>'
  }

  searchEl.addEventListener('input', render)
  groupEl.addEventListener('change', render)
  fileEl.addEventListener('change', render)
  render()
})()
