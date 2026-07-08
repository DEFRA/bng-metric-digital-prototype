// Client-side renderer for the UKHab styles page (app/views/ukhab-styles).
// Reads the JSON the route injected into #ukhab-data and renders a searchable
// grid of habitat cards: an approximate SVG swatch of the QGIS symbology plus
// the authoritative raw property tables. No dependencies — plain DOM.
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
  const MM = 3.2 // rough mm -> px for the swatch scale

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

  // ---- SVG swatch renderer (approximate) ----------------------------------
  let uid = 0
  function svgFor(symbol) {
    if (!symbol) return '<svg width="' + SW + '" height="' + SH + '"></svg>'
    if (symbol.type === 'marker') return markerSwatch(symbol)
    if (symbol.type === 'line') return lineSwatch(symbol)
    return fillSwatch(symbol)
  }

  function fillSwatch(symbol) {
    const defs = []
    const rects = []
    for (const layer of symbol.layers.filter((l) => l.enabled)) {
      const p = layer.props
      if (layer.class === 'SimpleFill') {
        const fill = p.style === 'no' ? 'none' : rgba(p.color)
        const strokeOn = p.outline_style && p.outline_style !== 'no'
        const stroke = strokeOn ? rgba(p.outline_color) : 'none'
        const sw = strokeOn
          ? Math.max(1, (parseFloat(p.outline_width) || 0.26) * MM)
          : 0
        rects.push(
          '<rect x="1" y="1" width="' +
            (SW - 2) +
            '" height="' +
            (SH - 2) +
            '" fill="' +
            fill +
            '" stroke="' +
            stroke +
            '" stroke-width="' +
            sw +
            '"/>'
        )
      } else if (layer.class === 'LinePatternFill') {
        const id = 'h' + uid++
        const line = (layer.subSymbol && layer.subSymbol.layers[0]) || null
        const col = rgba(line ? line.props.line_color : p.color)
        const lw = Math.max(
          0.7,
          (parseFloat(line ? line.props.line_width : p.line_width) || 0.26) * MM
        )
        const dist = Math.max(4, (parseFloat(p.distance) || 2) * MM)
        const angle = parseFloat(p.angle) || 0
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
            '"/></pattern>'
        )
        rects.push(
          '<rect x="1" y="1" width="' +
            (SW - 2) +
            '" height="' +
            (SH - 2) +
            '" fill="url(#' +
            id +
            ')"/>'
        )
      } else if (layer.class === 'PointPatternFill') {
        const id = 'd' + uid++
        const mk = (layer.subSymbol && layer.subSymbol.layers[0]) || null
        const col = rgba(mk ? mk.props.color : p.color)
        const dx = Math.max(5, (parseFloat(p.distance_x) || 2) * MM)
        const dy = Math.max(5, (parseFloat(p.distance_y) || 2) * MM)
        const r = Math.max(
          1,
          (parseFloat(mk ? mk.props.size : 1) || 1) * MM * 0.5
        )
        defs.push(
          '<pattern id="' +
            id +
            '" patternUnits="userSpaceOnUse" width="' +
            dx +
            '" height="' +
            dy +
            '"><circle cx="' +
            dx / 2 +
            '" cy="' +
            dy / 2 +
            '" r="' +
            r +
            '" fill="' +
            col +
            '"/></pattern>'
        )
        rects.push(
          '<rect x="1" y="1" width="' +
            (SW - 2) +
            '" height="' +
            (SH - 2) +
            '" fill="url(#' +
            id +
            ')"/>'
        )
      }
    }
    return (
      '<svg width="' +
      SW +
      '" height="' +
      SH +
      '"><defs>' +
      defs.join('') +
      '</defs>' +
      rects.join('') +
      '</svg>'
    )
  }

  function dashArray(p, width) {
    if (p.use_custom_dash === '1' && p.customdash) {
      return p.customdash
        .split(';')
        .map((n) => (parseFloat(n) || 0) * MM)
        .join(',')
    }
    const style = p.line_style
    if (style === 'dash') return 4 * width + ',' + 3 * width
    if (style === 'dot') return width + ',' + 2 * width
    if (style === 'dash dot')
      return 4 * width + ',' + 2 * width + ',' + width + ',' + 2 * width
    return ''
  }

  function lineSwatch(symbol) {
    const lines = []
    const layers = symbol.layers.filter(
      (l) => l.enabled && l.class === 'SimpleLine'
    )
    const n = Math.max(1, layers.length)
    layers.forEach((layer, i) => {
      const p = layer.props
      if (p.line_style === 'no') return
      const width = Math.max(1, (parseFloat(p.line_width) || 0.5) * MM)
      const y = (SH * (i + 1)) / (n + 1)
      const dash = dashArray(p, width)
      lines.push(
        '<line x1="6" y1="' +
          y +
          '" x2="' +
          (SW - 6) +
          '" y2="' +
          y +
          '" stroke="' +
          rgba(p.line_color) +
          '" stroke-width="' +
          width +
          '"' +
          (dash ? ' stroke-dasharray="' + dash + '"' : '') +
          ' stroke-linecap="round"/>'
      )
    })
    return (
      '<svg width="' + SW + '" height="' + SH + '">' + lines.join('') + '</svg>'
    )
  }

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

  function markerSwatch(symbol) {
    const shapes = []
    const layers = symbol.layers.filter(
      (l) => l.enabled && l.class === 'SimpleMarker'
    )
    for (const layer of layers) {
      const p = layer.props
      const r = Math.max(4, (parseFloat(p.size) || 2) * MM)
      const stroke =
        p.outline_style && p.outline_style !== 'no'
          ? rgba(p.outline_color)
          : 'none'
      const sw = Math.max(0.5, (parseFloat(p.outline_width) || 0) * MM)
      shapes.push(
        markerPath(p.name, SW / 2, SH / 2, r) +
          ' fill="' +
          rgba(p.color) +
          '" stroke="' +
          stroke +
          '" stroke-width="' +
          sw +
          '"/>'
      )
    }
    return (
      '<svg width="' +
      SW +
      '" height="' +
      SH +
      '">' +
      shapes.join('') +
      '</svg>'
    )
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
