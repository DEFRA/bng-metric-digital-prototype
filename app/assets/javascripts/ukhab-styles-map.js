// OpenLayers comparison map for the UKHab styles page.
//
// Renders one style layer's categories as a grid of mock geometry (polygons for
// fills, lines, or point markers) styled from the same parsed symbology the
// cards use (#ukhab-data), so the OpenLayers render can be compared with the
// HTML cards and with QGIS.
//
// OpenLayers (global `ol`) is loaded lazily from the same CDN the prototype's
// map pages use, only when the map is first shown, so this page stays light.
;(function () {
  const dataEl = document.getElementById('ukhab-data')
  const mapEl = document.getElementById('ukhab-map')
  const layerSel = document.getElementById('ukhab-map-layer')
  const renderBtn = document.getElementById('ukhab-map-render')
  if (!dataEl || !mapEl || !layerSel || !renderBtn) return

  const DATA = JSON.parse(dataEl.textContent)
  const MM = 3.78 // mm -> px, same scale as the card swatches

  // Cell layout in map units (resolution is 1 unit/px, so these are ~pixels).
  const CELL_W = 150
  const CELL_H = 110
  const SHAPE_W = 120
  const SHAPE_H = 80

  // ---- OpenLayers lazy loader --------------------------------------------
  const OL_CSS = 'https://cdn.jsdelivr.net/npm/ol@v10.6.0/ol.css'
  const OL_JS = 'https://cdn.jsdelivr.net/npm/ol@v10.6.0/dist/ol.js'
  let olPromise = null
  function ensureOl() {
    if (window.ol) return Promise.resolve(window.ol)
    if (olPromise) return olPromise
    olPromise = new Promise((resolve, reject) => {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = OL_CSS
      document.head.appendChild(link)
      const script = document.createElement('script')
      script.src = OL_JS
      script.onload = () =>
        window.ol
          ? resolve(window.ol)
          : reject(new Error('OpenLayers failed to initialise'))
      script.onerror = () =>
        reject(new Error('Could not load OpenLayers from CDN'))
      document.head.appendChild(script)
    })
    return olPromise
  }

  // ---- colour + geometry helpers -----------------------------------------
  function rgba(c, fallbackAlpha) {
    if (!Array.isArray(c)) return 'rgba(0,0,0,0)'
    const [r, g, b, a] = c
    const alpha = (a === undefined ? (fallbackAlpha ?? 255) : a) / 255
    return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
  }
  function num(v, d) {
    const n = parseFloat(v)
    return Number.isFinite(n) ? n : d
  }

  // ---- canvas patterns (hatching / dots) ---------------------------------
  const patternCache = {}
  function hatchPattern(color, widthPx, spacingPx, angleDeg, dash) {
    const key = ['h', color, widthPx, spacingPx, angleDeg, dash].join('|')
    if (patternCache[key]) return patternCache[key]
    // Tile is a square of the perpendicular spacing; draw the line at the given
    // angle across an oversized area and crop, so it tiles as parallel lines.
    const size = Math.max(4, Math.round(spacingPx))
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    ctx.strokeStyle = color
    ctx.lineWidth = widthPx
    if (dash) ctx.setLineDash(dash)
    ctx.translate(size / 2, size / 2)
    ctx.rotate((-angleDeg * Math.PI) / 180)
    // Draw several parallel vertical lines so the rotated tile stays covered.
    for (let i = -2; i <= 2; i++) {
      const x = i * size
      ctx.beginPath()
      ctx.moveTo(x, -size * 2)
      ctx.lineTo(x, size * 2)
      ctx.stroke()
    }
    const pattern = ctx.createPattern(canvas, 'repeat')
    patternCache[key] = pattern
    return pattern
  }
  function dotPattern(markerLayer, dxPx, dyPx) {
    const p = markerLayer.props
    const key = ['d', JSON.stringify(p), dxPx, dyPx].join('|')
    if (patternCache[key]) return patternCache[key]
    const w = Math.max(4, Math.round(dxPx))
    const h = Math.max(4, Math.round(dyPx))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    drawMarker(ctx, p, w / 2, h / 2)
    const pattern = ctx.createPattern(canvas, 'repeat')
    patternCache[key] = pattern
    return pattern
  }
  // Draw a SimpleMarker onto a 2d context (used for dot patterns).
  function drawMarker(ctx, p, cx, cy) {
    const size = num(p.size, 2)
    const r = Math.max(2, (size * MM) / 2)
    const fill = rgba(p.color)
    const outlineOn = p.outline_style && p.outline_style !== 'no'
    ctx.fillStyle = fill
    ctx.strokeStyle = outlineOn ? rgba(p.outline_color) : 'rgba(0,0,0,0)'
    ctx.lineWidth = outlineOn ? Math.max(0.4, num(p.outline_width, 0) * MM) : 0
    ctx.beginPath()
    if (p.name === 'diamond') {
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy)
      ctx.lineTo(cx, cy + r)
      ctx.lineTo(cx - r, cy)
      ctx.closePath()
    } else if (p.name === 'square' || p.name === 'rectangle') {
      ctx.rect(cx - r, cy - r, 2 * r, 2 * r)
    } else if (p.name === 'triangle') {
      ctx.moveTo(cx, cy - r)
      ctx.lineTo(cx + r, cy + r)
      ctx.lineTo(cx - r, cy + r)
      ctx.closePath()
    } else {
      ctx.arc(cx, cy, r, 0, 2 * Math.PI)
    }
    ctx.fill()
    if (outlineOn) ctx.stroke()
  }

  function dashFor(ol, p, widthPx) {
    if (p.use_custom_dash === '1' && p.customdash) {
      return p.customdash.split(';').map((n) => num(n, 0) * MM)
    }
    const w = widthPx
    switch (p.line_style) {
      case 'dash':
        return [4 * w, 3 * w]
      case 'dot':
        return [w, 2 * w]
      case 'dash dot':
        return [4 * w, 2 * w, w, 2 * w]
      case 'dash dot dot':
        return [4 * w, 2 * w, w, 2 * w, w, 2 * w]
      default:
        return undefined
    }
  }

  // ---- symbol -> ol styles ------------------------------------------------
  function markerImage(ol, p) {
    const size = num(p.size, 2)
    const r = Math.max(3, (size * MM) / 2)
    const outlineOn = p.outline_style && p.outline_style !== 'no'
    const stroke = outlineOn
      ? new ol.style.Stroke({
          color: rgba(p.outline_color),
          width: Math.max(0.4, num(p.outline_width, 0) * MM)
        })
      : undefined
    const fill = new ol.style.Fill({ color: rgba(p.color) })
    const shapes = {
      diamond: { points: 4, radius: r, angle: 0 },
      square: { points: 4, radius: r * 1.15, angle: Math.PI / 4 },
      rectangle: { points: 4, radius: r * 1.15, angle: Math.PI / 4 },
      triangle: { points: 3, radius: r, angle: 0 }
    }
    if (p.name === 'circle' || !shapes[p.name]) {
      return new ol.style.Circle({ radius: r, fill, stroke })
    }
    const s = shapes[p.name]
    return new ol.style.RegularShape({
      points: s.points,
      radius: s.radius,
      angle: s.angle,
      fill,
      stroke
    })
  }

  function fillStyles(ol, symbol) {
    const styles = []
    for (const layer of symbol.layers.filter((l) => l.enabled)) {
      const p = layer.props
      if (layer.class === 'SimpleFill') {
        const outlineOn = p.outline_style && p.outline_style !== 'no'
        styles.push(
          new ol.style.Style({
            fill:
              p.style === 'no'
                ? null
                : new ol.style.Fill({ color: rgba(p.color) }),
            stroke: outlineOn
              ? new ol.style.Stroke({
                  color: rgba(p.outline_color),
                  width: Math.max(1, num(p.outline_width, 0.26) * MM)
                })
              : null
          })
        )
      } else if (layer.class === 'LinePatternFill') {
        const sub = (layer.subSymbol && layer.subSymbol.layers[0]) || null
        const sp = sub ? sub.props : {}
        const w = Math.max(
          0.6,
          num(sub ? sp.line_width : p.line_width, 0.26) * MM
        )
        const dist = Math.max(3, num(p.distance, 2) * MM)
        const pattern = hatchPattern(
          rgba(sub ? sp.line_color : p.color),
          w,
          dist,
          num(p.angle, 0),
          dashFor(ol, sp, w)
        )
        if (pattern)
          styles.push(
            new ol.style.Style({ fill: new ol.style.Fill({ color: pattern }) })
          )
      } else if (layer.class === 'PointPatternFill') {
        const mk = (layer.subSymbol ? layer.subSymbol.layers : []).find(
          (l) => l.class === 'SimpleMarker'
        )
        if (mk) {
          const dx = Math.max(6, num(p.distance_x, 2) * MM)
          const dy = Math.max(6, num(p.distance_y, 2) * MM)
          const pattern = dotPattern(mk, dx, dy)
          if (pattern)
            styles.push(
              new ol.style.Style({
                fill: new ol.style.Fill({ color: pattern })
              })
            )
        }
      }
    }
    return styles
  }

  function lineStyles(ol, symbol) {
    const styles = []
    for (const layer of symbol.layers.filter((l) => l.enabled)) {
      const p = layer.props
      if (layer.class === 'SimpleLine') {
        if (p.line_style === 'no') continue
        const width = Math.max(1, num(p.line_width, 0.5) * MM)
        styles.push(
          new ol.style.Style({
            stroke: new ol.style.Stroke({
              color: rgba(p.line_color),
              width,
              lineDash: dashFor(ol, p, width),
              lineCap: p.capstyle === 'round' ? 'round' : 'butt'
            })
          })
        )
      } else if (layer.class === 'MarkerLine') {
        const mk = (layer.subSymbol ? layer.subSymbol.layers : []).find(
          (l) => l.class === 'SimpleMarker'
        )
        if (!mk) continue
        const interval = Math.max(6, num(layer.props.interval, 3) * MM)
        styles.push(
          new ol.style.Style({
            image: markerImage(ol, mk.props),
            geometry: function (feature) {
              const line = feature.getGeometry()
              const pts = []
              const len = line.getLength()
              for (let d = interval / 2; d <= len; d += interval) {
                pts.push(line.getCoordinateAt(d / len))
              }
              return new ol.geom.MultiPoint(pts)
            }
          })
        )
      }
    }
    return styles
  }

  function markerStyles(ol, symbol) {
    return symbol.layers
      .filter((l) => l.enabled && l.class === 'SimpleMarker')
      .map((l) => new ol.style.Style({ image: markerImage(ol, l.props) }))
  }

  function stylesForSymbol(ol, symbol) {
    if (!symbol) return []
    if (symbol.type === 'marker') return markerStyles(ol, symbol)
    if (symbol.type === 'line') return lineStyles(ol, symbol)
    return fillStyles(ol, symbol)
  }

  // ---- mock geometry ------------------------------------------------------
  function geometryFor(ol, geom, col, row) {
    const x = col * CELL_W
    const y = -row * CELL_H
    if (geom === 'line') {
      return new ol.geom.LineString([
        [x, y - SHAPE_H / 2],
        [x + SHAPE_W, y - SHAPE_H / 2]
      ])
    }
    if (geom === 'marker' || geom === 'unknown') {
      return new ol.geom.Point([x + SHAPE_W / 2, y - SHAPE_H / 2])
    }
    return new ol.geom.Polygon([
      [
        [x, y],
        [x + SHAPE_W, y],
        [x + SHAPE_W, y - SHAPE_H],
        [x, y - SHAPE_H],
        [x, y]
      ]
    ])
  }

  // ---- build / render -----------------------------------------------------
  const fileLayers = DATA.layers.filter((l) => l.entries.some((e) => e.symbol))
  layerSel.innerHTML = fileLayers
    .map(
      (l, i) =>
        '<option value="' + i + '">' + l.group + ' — ' + l.file + '</option>'
    )
    .join('')
  // Default to the main habitats layer if present.
  const habIdx = fileLayers.findIndex(
    (l) => l.file === 'Styles/Habitats Master.qml'
  )
  if (habIdx >= 0) layerSel.value = String(habIdx)

  let map = null
  let vectorSource = null

  function renderLayer(ol) {
    const layer = fileLayers[Number(layerSel.value)] || fileLayers[0]
    const entries = layer.entries.filter((e) => e.symbol)
    const cols = Math.ceil(Math.sqrt(entries.length))
    const features = entries.map((entry, i) => {
      const col = i % cols
      const row = Math.floor(i / cols)
      const feature = new ol.Feature({
        geometry: geometryFor(ol, layer.geometry, col, row),
        label: entry.label
      })
      feature.setStyle(stylesForSymbol(ol, entry.symbol))
      return feature
    })

    if (!vectorSource) {
      vectorSource = new ol.source.Vector()
      const vectorLayer = new ol.layer.Vector({ source: vectorSource })
      map = new ol.Map({
        target: mapEl,
        layers: [vectorLayer],
        view: new ol.View({ center: [0, 0], resolution: 1 })
      })
    }
    vectorSource.clear()
    vectorSource.addFeatures(features)
    map.getView().fit(vectorSource.getExtent(), { padding: [20, 20, 20, 20] })
  }

  renderBtn.addEventListener('click', () => {
    renderBtn.disabled = true
    renderBtn.textContent = 'Loading map…'
    ensureOl()
      .then((ol) => {
        mapEl.hidden = false
        renderLayer(ol)
        renderBtn.disabled = false
        renderBtn.textContent = 'Render on map'
      })
      .catch((err) => {
        renderBtn.disabled = false
        renderBtn.textContent = 'Render on map'
        mapEl.hidden = false
        mapEl.textContent = 'Could not load the map: ' + err.message
      })
  })
})()
