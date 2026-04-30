/**
 * On-Site Baseline Journey Routes
 * Handles the habitat baseline workflow including file uploads, layer confirmation, and summary
 */

const multer = require('multer')
const { parseGeoPackage } = require('../lib/geopackage-parser')
const {
  calculatePolygonArea,
  calculateLineLength,
  isPolygonSelfIntersecting,
  doLineSegmentsIntersect
} = require('../lib/geometry-utils')
const { isWithinUK, getLPA, getNCA, getLNRS } = require('../lib/arcgis-queries')
const metricCalcs = require('../lib/metric-calcs')
const { getBaselineUnits, distinctivenessCategories } = metricCalcs

const upload = multer({ storage: multer.memoryStorage() })

// Validation thresholds
const maxFileSizeMB = 100
const boundaryLayerName = 'Red Line Boundary'
const maxBoundaryFeatures = 10
const maxPolygonSize = 1000000000 // 1000 sq km

function getHabitatTypesByBroadHabitat() {
  const habitatTypesByBroad = {}
  const allHabitatTypes = Object.keys(distinctivenessCategories)

  allHabitatTypes.forEach((habitatType) => {
    if (habitatType.includes(' - ')) {
      const [broad] = habitatType.split(' - ', 2)
      if (!habitatTypesByBroad[broad]) {
        habitatTypesByBroad[broad] = []
      }
      habitatTypesByBroad[broad].push(habitatType)
    }
  })

  return habitatTypesByBroad
}

function getPolygonOuterRings(geometry) {
  if (!geometry) {
    return []
  }

  if (geometry.type === 'Polygon') {
    return geometry.coordinates && geometry.coordinates[0]
      ? [geometry.coordinates[0]]
      : []
  }

  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates || [])
      .map((polygon) => (polygon && polygon[0] ? polygon[0] : null))
      .filter(Boolean)
  }

  return []
}

function getLinePaths(geometry) {
  if (!geometry) {
    return []
  }

  if (geometry.type === 'LineString') {
    return [geometry.coordinates || []]
  }

  if (geometry.type === 'MultiLineString') {
    return geometry.coordinates || []
  }

  return []
}

function pointsEqual(a, b) {
  return !!(
    a &&
    b &&
    a.length >= 2 &&
    b.length >= 2 &&
    Math.abs(a[0] - b[0]) < 0.001 &&
    Math.abs(a[1] - b[1]) < 0.001
  )
}

function isPointOnSegment(point, segmentStart, segmentEnd) {
  if (!point || !segmentStart || !segmentEnd) {
    return false
  }

  const cross =
    (point[1] - segmentStart[1]) * (segmentEnd[0] - segmentStart[0]) -
    (point[0] - segmentStart[0]) * (segmentEnd[1] - segmentStart[1])

  if (Math.abs(cross) > 0.001) {
    return false
  }

  const dot =
    (point[0] - segmentStart[0]) * (segmentEnd[0] - segmentStart[0]) +
    (point[1] - segmentStart[1]) * (segmentEnd[1] - segmentStart[1])

  if (dot < 0) {
    return false
  }

  const squaredLength =
    Math.pow(segmentEnd[0] - segmentStart[0], 2) +
    Math.pow(segmentEnd[1] - segmentStart[1], 2)

  return dot <= squaredLength
}

function ringsTouch(ringA, ringB) {
  if (!ringA || !ringB || ringA.length < 2 || ringB.length < 2) {
    return false
  }

  for (let i = 0; i < ringA.length - 1; i++) {
    const a1 = ringA[i]
    const a2 = ringA[i + 1]

    for (let j = 0; j < ringB.length - 1; j++) {
      const b1 = ringB[j]
      const b2 = ringB[j + 1]

      if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
        return true
      }

      if (
        pointsEqual(a1, b1) ||
        pointsEqual(a1, b2) ||
        pointsEqual(a2, b1) ||
        pointsEqual(a2, b2)
      ) {
        return true
      }
    }
  }

  return false
}

function polygonTouchesLine(geometry, lineGeometry) {
  const rings = getPolygonOuterRings(geometry)
  const paths = getLinePaths(lineGeometry)

  return rings.some((ring) => {
    return paths.some((path) => {
      if (!path || path.length < 2) {
        return false
      }

      for (let i = 0; i < ring.length - 1; i++) {
        const a1 = ring[i]
        const a2 = ring[i + 1]

        for (let j = 0; j < path.length - 1; j++) {
          const b1 = path[j]
          const b2 = path[j + 1]

          if (doLineSegmentsIntersect(a1, a2, b1, b2)) {
            return true
          }

          if (
            isPointOnSegment(a1, b1, b2) ||
            isPointOnSegment(a2, b1, b2) ||
            isPointOnSegment(b1, a1, a2) ||
            isPointOnSegment(b2, a1, a2)
          ) {
            return true
          }
        }
      }

      return false
    })
  })
}

function getFeatureBoundingBox(geometry) {
  const rings = getPolygonOuterRings(geometry)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  rings.forEach((ring) => {
    ring.forEach((coordinate) => {
      if (!coordinate || coordinate.length < 2) {
        return
      }

      minX = Math.min(minX, coordinate[0])
      minY = Math.min(minY, coordinate[1])
      maxX = Math.max(maxX, coordinate[0])
      maxY = Math.max(maxY, coordinate[1])
    })
  })

  if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
    return null
  }

  return { minX, minY, maxX, maxY }
}

function getBoundingBoxCenter(bounds) {
  if (!bounds) {
    return null
  }

  return {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2
  }
}

function getBoundaryEdgeDirection(parcelGeometry, boundaryFeatures) {
  const parcelBounds = getFeatureBoundingBox(parcelGeometry)
  if (!parcelBounds || !boundaryFeatures || !boundaryFeatures.length) {
    return 'Yes'
  }

  let boundaryBounds = null

  boundaryFeatures.forEach(function (feature) {
    const currentBounds = feature && feature.geometry ? getFeatureBoundingBox(feature.geometry) : null
    if (!currentBounds) {
      return
    }

    if (!boundaryBounds) {
      boundaryBounds = Object.assign({}, currentBounds)
      return
    }

    boundaryBounds.minX = Math.min(boundaryBounds.minX, currentBounds.minX)
    boundaryBounds.minY = Math.min(boundaryBounds.minY, currentBounds.minY)
    boundaryBounds.maxX = Math.max(boundaryBounds.maxX, currentBounds.maxX)
    boundaryBounds.maxY = Math.max(boundaryBounds.maxY, currentBounds.maxY)
  })

  const parcelCenter = getBoundingBoxCenter(parcelBounds)
  const boundaryCenter = getBoundingBoxCenter(boundaryBounds)
  if (!parcelCenter || !boundaryCenter) {
    return 'Yes'
  }

  const dx = parcelCenter.x - boundaryCenter.x
  const dy = parcelCenter.y - boundaryCenter.y
  const thresholdX = (boundaryBounds.maxX - boundaryBounds.minX) * 0.1
  const thresholdY = (boundaryBounds.maxY - boundaryBounds.minY) * 0.1

  let vertical = ''
  let horizontal = ''

  if (dy > thresholdY) {
    vertical = 'north'
  } else if (dy < -thresholdY) {
    vertical = 'south'
  }

  if (dx > thresholdX) {
    horizontal = 'east'
  } else if (dx < -thresholdX) {
    horizontal = 'west'
  }

  const direction = [vertical, horizontal].filter(Boolean).join(', ')
  return direction ? 'Yes - ' + direction : 'Yes'
}

function getRelativePositionOfSite(parcelGeometry, boundaryFeatures) {
  const parcelBounds = getFeatureBoundingBox(parcelGeometry)
  if (!parcelBounds || !boundaryFeatures || !boundaryFeatures.length) {
    return 'Within site'
  }

  let boundaryBounds = null

  boundaryFeatures.forEach(function (feature) {
    const currentBounds = feature && feature.geometry ? getFeatureBoundingBox(feature.geometry) : null
    if (!currentBounds) {
      return
    }

    if (!boundaryBounds) {
      boundaryBounds = Object.assign({}, currentBounds)
      return
    }

    boundaryBounds.minX = Math.min(boundaryBounds.minX, currentBounds.minX)
    boundaryBounds.minY = Math.min(boundaryBounds.minY, currentBounds.minY)
    boundaryBounds.maxX = Math.max(boundaryBounds.maxX, currentBounds.maxX)
    boundaryBounds.maxY = Math.max(boundaryBounds.maxY, currentBounds.maxY)
  })

  const parcelCenter = getBoundingBoxCenter(parcelBounds)
  const boundaryCenter = getBoundingBoxCenter(boundaryBounds)
  if (!parcelCenter || !boundaryCenter) {
    return 'Within site'
  }

  const dx = parcelCenter.x - boundaryCenter.x
  const dy = parcelCenter.y - boundaryCenter.y
  const thresholdX = (boundaryBounds.maxX - boundaryBounds.minX) * 0.1
  const thresholdY = (boundaryBounds.maxY - boundaryBounds.minY) * 0.1

  let vertical = ''
  let horizontal = ''

  if (dy > thresholdY) {
    vertical = 'north'
  } else if (dy < -thresholdY) {
    vertical = 'south'
  }

  if (dx > thresholdX) {
    horizontal = 'east'
  } else if (dx < -thresholdX) {
    horizontal = 'west'
  }

  if (vertical && horizontal) {
    return vertical + '-' + horizontal + ' of site'
  }

  if (vertical || horizontal) {
    return (vertical || horizontal) + ' of site'
  }

  return 'Centre of site'
}

function getParcelReference(feature, index) {
  return (
    (feature && feature.properties && feature.properties['Parcel Ref']) ||
    'H' + (index + 1)
  )
}

function annotateParcelAdjacency(parcelFeatureCollection, context) {
  if (
    !parcelFeatureCollection ||
    !Array.isArray(parcelFeatureCollection.features) ||
    !parcelFeatureCollection.features.length
  ) {
    return
  }

  const boundaryFeatures =
    context && context.siteBoundary && Array.isArray(context.siteBoundary.features)
      ? context.siteBoundary.features
      : []
  const hedgerowFeatures =
    context && context.hedgerows && Array.isArray(context.hedgerows.features)
      ? context.hedgerows.features
      : []
  const watercourseFeatures =
    context && context.watercourses && Array.isArray(context.watercourses.features)
      ? context.watercourses.features
      : []

  parcelFeatureCollection.features.forEach(function (feature, index) {
    if (!feature || !feature.geometry) {
      return
    }

    feature.properties = feature.properties || {}

    const existingAdjacentTo =
      feature.properties['Adjacent To'] ||
      feature.properties['Adjacent to'] ||
      feature.properties['Baseline Adjacent To'] ||
      feature.properties['Baseline Adjacent to']
    const existingBoundaryEdge =
      feature.properties['Boundary edge'] ||
      feature.properties['Boundary Edge'] ||
      feature.properties['Baseline Boundary edge'] ||
      feature.properties['Baseline Boundary Edge']
    const existingPosition =
      feature.properties.Position ||
      feature.properties.position ||
      feature.properties['Baseline Position'] ||
      feature.properties['Baseline position']
    const hasExistingPosition =
      typeof existingPosition === 'string'
        ? existingPosition.trim() && existingPosition.trim() !== '-'
        : !!existingPosition

    const touchesBoundary = boundaryFeatures.some(function (boundaryFeature) {
      return getPolygonOuterRings(feature.geometry).some(function (parcelRing) {
        return getPolygonOuterRings(boundaryFeature.geometry).some(function (boundaryRing) {
          return ringsTouch(parcelRing, boundaryRing)
        })
      })
    })

    const adjacentLabels = []

    parcelFeatureCollection.features.forEach(function (otherFeature, otherIndex) {
      if (otherIndex === index || !otherFeature || !otherFeature.geometry) {
        return
      }

      const touchesParcel = getPolygonOuterRings(feature.geometry).some(function (parcelRing) {
        return getPolygonOuterRings(otherFeature.geometry).some(function (otherRing) {
          return ringsTouch(parcelRing, otherRing)
        })
      })

      if (touchesParcel) {
        adjacentLabels.push(getParcelReference(otherFeature, otherIndex))
      }
    })

    if (
      hedgerowFeatures.some(function (hedgerowFeature) {
        return hedgerowFeature && hedgerowFeature.geometry
          ? polygonTouchesLine(feature.geometry, hedgerowFeature.geometry)
          : false
      })
    ) {
      adjacentLabels.push('Hedgerow')
    }

    if (
      watercourseFeatures.some(function (watercourseFeature) {
        return watercourseFeature && watercourseFeature.geometry
          ? polygonTouchesLine(feature.geometry, watercourseFeature.geometry)
          : false
      })
    ) {
      adjacentLabels.push('Watercourse')
    }

    const fallbackAdjacentTo = adjacentLabels.length
      ? Array.from(new Set(adjacentLabels)).join(', ')
      : 'No adjacent features identified'
    const fallbackBoundaryEdge = touchesBoundary
      ? getBoundaryEdgeDirection(feature.geometry, boundaryFeatures)
      : 'No'
    const fallbackPosition = getRelativePositionOfSite(feature.geometry, boundaryFeatures)

    if (!existingAdjacentTo) {
      feature.properties['Baseline Adjacent To'] = fallbackAdjacentTo
      feature.properties['Adjacent To'] = fallbackAdjacentTo
    }

    if (!existingBoundaryEdge) {
      feature.properties['Baseline Boundary edge'] = fallbackBoundaryEdge
      feature.properties['Boundary edge'] = fallbackBoundaryEdge
    }

    if (!hasExistingPosition) {
      feature.properties['Baseline Position'] = fallbackPosition
      feature.properties.Position = fallbackPosition
    }
  })
}

function activateUploadedBaselineLayers(req) {
  req.session.data['layersConfirmed'] = true
  req.session.data['redLineBoundary'] = null
  req.session.data['habitatParcels'] = null
  req.session.data['hedgerows'] = null
  req.session.data['watercourses'] = null
}

/*
const distinctivenessScores = {
  'V.High': 8,
  High: 6,
  Medium: 4,
  Low: 2,
  'V.Low': 0
}

const conditionScores = {
  Good: 3,
  'Fairly Good': 2.5,
  Moderate: 2,
  'Fairly Poor': 1.5,
  Poor: 1,
  'Condition Assessment N/A': 1,
  'N/A - Other': 0
}
*/

/**
 * Register on-site baseline routes
 * @param {Router} router - Express router instance
 */
function registerOnSiteBaselineRoutes(router) {
  // Upload Choice Page - GET
  router.get('/on-site-baseline/start', function (req, res) {
    res.render('on-site-baseline/start', {
      error: req.query.error || null
    })
  })

  // Upload Choice Page - POST
  router.post('/on-site-baseline/start', function (req, res) {
    const uploadChoice = req.body.uploadChoice

    if (!uploadChoice) {
      return res.redirect(
        '/on-site-baseline/start?error=Select how you want to add your habitat data'
      )
    }

    // Store the choice in session
    req.session.data['uploadChoice'] = uploadChoice

    // Route based on selection
    switch (uploadChoice) {
      case 'single-file':
        return res.redirect('/on-site-baseline/upload-single-file')
      case 'separate-files':
        // Future implementation
        return res.redirect('/on-site-baseline/upload-boundary')
      case 'no-files':
        return res.redirect('/define-red-line-boundary')
      default:
        return res.redirect('/on-site-baseline/start?error=Invalid selection')
    }
  })

  // Upload Single File Page - GET
  router.get('/on-site-baseline/upload-single-file', function (req, res) {
    res.render('on-site-baseline/upload-single-file', {
      error: req.query.error || null
    })
  })

  // Upload Single File Page - POST (handles GeoPackage upload)
  router.post(
    '/on-site-baseline/upload-single-file',
    upload.single('fileUpload'),
    async function (req, res) {
      if (!req.file) {
        return res.redirect(
          '/on-site-baseline/upload-single-file?error=Select a file to upload'
        )
      }

      const originalName = req.file.originalname.toLowerCase()
      if (!originalName.endsWith('.gpkg')) {
        return res.redirect(
          '/on-site-baseline/upload-single-file?error=Upload a GeoPackage (.gpkg) file'
        )
      }

      // Check that the file is not too large
      if (req.file.size > maxFileSizeMB * 1024 * 1024) {
        return res.redirect(
          `/on-site-baseline/upload-single-file?error=File is too large. Please upload a file smaller than ${maxFileSizeMB}MB`
        )
      }

      try {
        // Parse the GeoPackage file
        const gpkgData = parseGeoPackage(req.file.buffer)

        if (!gpkgData.layers || gpkgData.layers.length === 0) {
          return res.redirect(
            '/on-site-baseline/upload-single-file?error=No layers found in the GeoPackage file'
          )
        }

        // Store parsed data in session
        req.session.data['uploadedFiles'] = {
          habitatFile: {
            originalName: req.file.originalname,
            mimeType: req.file.mimetype,
            size: req.file.size,
            storageKey: `upload-${Date.now()}`
          }
        }

        console.log('gpkgData.layers:', gpkgData.layers)
        console.log('gpkgData.geometries:', gpkgData.geometries)

        // Check if geometries are within the UK
        if (!isWithinUK(gpkgData.geometries[boundaryLayerName].features)) {
          console.log('Geometries are not within England')
          return res.redirect(
            `/on-site-baseline/upload-single-file?error=Geometries are not within England`
          )
        }

        // Check that there are not too many Red Line Boundary features
        if (
          gpkgData.geometries[boundaryLayerName].features.length >
          maxBoundaryFeatures
        ) {
          console.log('Red Line Boundary has too many features')
          return res.redirect(
            `/on-site-baseline/upload-single-file?error=Red Line Boundary has too many features. Please upload a file with no more than ${maxBoundaryFeatures} features`
          )
        }

        // Check that geometries are not too large
        if (
          gpkgData.geometries[boundaryLayerName].features.some((f) => {
            const area = calculatePolygonArea(f.geometry)
            return area > maxPolygonSize
          })
        ) {
          console.log('Geometries are too large')
          return res.redirect(
            `/on-site-baseline/upload-single-file?error=Geometries are too large. Please upload a file with polygons smaller than ${maxPolygonSize / 1000000} square kilometers`
          )
        }

        // Check that geometries do not self-intersect
        if (
          gpkgData.geometries[boundaryLayerName].features.some((f) => {
            if (
              f.geometry.type === 'Polygon' ||
              f.geometry.type === 'MultiPolygon'
            ) {
              if (isPolygonSelfIntersecting(f.geometry)) {
                return true
              }
            }
            return false
          })
        ) {
          console.log('Geometries self-intersect')
          return res.redirect(
            `/on-site-baseline/upload-single-file?error=Geometries self-intersect. Please upload a file with non-self-intersecting polygons`
          )
        }

        // Get the LPA name
        const lpaName = await getLPA(
          gpkgData.geometries[boundaryLayerName].features
        )
        console.log('LPA name:', lpaName)

        const ncaName = await getNCA(
          gpkgData.geometries[boundaryLayerName].features
        )
        console.log('NCA name:', ncaName)

        const lnrsName = await getLNRS(
          gpkgData.geometries[boundaryLayerName].features
        )
        console.log('LNRS name:', lnrsName)

        req.session.data['geopackageLayers'] = gpkgData.layers
        req.session.data['geopackageGeometries'] = gpkgData.geometries
        req.session.data['lpaName'] = lpaName
        req.session.data['ncaName'] = ncaName
        req.session.data['lnrsName'] = lnrsName

        activateUploadedBaselineLayers(req)

        // Skip the check page and continue straight to habitats summary.
        res.redirect('/on-site-baseline/habitats-summary')
      } catch (err) {
        console.error('GeoPackage parsing error:', err)
        return res.redirect(
          '/on-site-baseline/upload-single-file?error=Could not read the GeoPackage file. Please check the file is valid.'
        )
      }
    }
  )

  // Confirm Layers Page - GET
  router.get('/on-site-baseline/confirm-layers', function (req, res) {
    const layers = req.session.data['geopackageLayers'] || []
    const geometries = req.session.data['geopackageGeometries'] || {}
    const uploadedFiles = req.session.data['uploadedFiles'] || {}

    // Find boundary and parcel layers (heuristic based on layer names)
    let siteBoundary =
      layers.find(
        (l) =>
          l.name.toLowerCase().includes('boundary') ||
          l.name.toLowerCase().includes('red_line') ||
          l.name.toLowerCase().includes('redline')
      ) || layers[0]

    let habitatParcels =
      layers.find(
        (l) =>
          l.name.toLowerCase().includes('parcel') ||
          l.name.toLowerCase().includes('habitat')
      ) || (layers.length > 1 ? layers[1] : layers[0])

    // Calculate areas in hectares
    const boundaryAreaHa = siteBoundary
      ? (siteBoundary.totalAreaSqm / 10000).toFixed(2)
      : 0
    const parcelsAreaHa = habitatParcels
      ? (habitatParcels.totalAreaSqm / 10000).toFixed(2)
      : 0

    // Find hedgerow layer
    let hedgerowLayer = layers.find(
      (l) =>
        l.name.toLowerCase().includes('hedgerow') ||
        l.name.toLowerCase().includes('hedge')
    )

    // Find watercourse layer
    let watercourseLayer = layers.find(
      (l) =>
        l.name.toLowerCase().includes('watercourse') ||
        l.name.toLowerCase().includes('river') ||
        l.name.toLowerCase().includes('stream')
    )

    // Calculate hedgerow totals
    let hedgerowTotalLengthM = 0
    let hedgerowFeatureCount = 0
    if (hedgerowLayer && geometries[hedgerowLayer.name]) {
      const hedgerowFeatures = geometries[hedgerowLayer.name].features || []
      hedgerowFeatureCount = hedgerowFeatures.length
      hedgerowFeatures.forEach((feature) => {
        if (feature.geometry) {
          hedgerowTotalLengthM += calculateLineLength(feature.geometry)
        }
      })
    }

    // Calculate watercourse totals
    let watercourseTotalLengthM = 0
    let watercourseFeatureCount = 0
    if (watercourseLayer && geometries[watercourseLayer.name]) {
      const watercourseFeatures =
        geometries[watercourseLayer.name].features || []
      watercourseFeatureCount = watercourseFeatures.length
      watercourseFeatures.forEach((feature) => {
        if (feature.geometry) {
          watercourseTotalLengthM += calculateLineLength(feature.geometry)
        }
      })
    }

    // Build view data
    const viewData = {
      uploadSummary: {
        layerCountMessage: `File uploaded – ${layers.length} layer${layers.length !== 1 ? 's' : ''} found`
      },
      layers: {
        siteBoundary: {
          polygonCount: siteBoundary ? siteBoundary.featureCount : 0,
          areaHa: boundaryAreaHa,
          layerName: siteBoundary ? siteBoundary.name : 'Not found'
        },
        habitatParcels: {
          polygonCount: habitatParcels ? habitatParcels.featureCount : 0,
          areaHa: parcelsAreaHa,
          layerName: habitatParcels ? habitatParcels.name : 'Not found'
        },
        hedgerows: {
          featureCount: hedgerowFeatureCount,
          totalLengthM: hedgerowTotalLengthM.toFixed(1),
          layerName: hedgerowLayer ? hedgerowLayer.name : null
        },
        watercourses: {
          featureCount: watercourseFeatureCount,
          totalLengthM: watercourseTotalLengthM.toFixed(1),
          layerName: watercourseLayer ? watercourseLayer.name : null
        }
      },
      coverage: {
        isFull: true // Simplified for prototype
      },
      location: {
        lpaName: req.session.data['lpaName'] || '<LPA Name>',
        nationalCharacterArea:
          req.session.data['ncaName'] || '<National Character Area>',
        lnrsName: req.session.data['lnrsName'] || '<LNRS Name>'
      },
      geometries: geometries,
      boundaryLayerName: siteBoundary ? siteBoundary.name : null,
      parcelsLayerName: habitatParcels ? habitatParcels.name : null
    }

    res.render('on-site-baseline/confirm-layers', viewData)
  })

  // Confirm Layers Page - POST
  router.post('/on-site-baseline/confirm-layers', function (req, res) {
    activateUploadedBaselineLayers(req)

    console.log(
      'Cleared hand-drawn data - GeoPackage upload is now authoritative'
    )

    // Redirect to habitats summary (future implementation)
    res.redirect('/on-site-baseline/habitats-summary')
  })

  // Habitats Summary page
  router.get('/on-site-baseline/habitats-summary', function (req, res) {
    // Check which flow the user came from:
    // - GeoPackage flow: layersConfirmed is true (set when user confirms uploaded layers)
    // - Drawing flow: has redLineBoundary and habitatParcels but no layersConfirmed

    const layersConfirmed = req.session.data['layersConfirmed']
    const hasGeoPackageData =
      req.session.data['geopackageLayers'] &&
      req.session.data['geopackageLayers'].length > 0
    const drawnBoundary = req.session.data['redLineBoundary']
    const drawnParcels = req.session.data['habitatParcels']

    // Use GeoPackage flow if layers were confirmed from upload
    // Use drawing flow if we have drawn parcels (boundary is optional for display)
    const isGeoPackageFlow = layersConfirmed && hasGeoPackageData
    // Check if drawnParcels has valid features
    const hasDrawnParcels =
      drawnParcels && drawnParcels.features && drawnParcels.features.length > 0
    const isDrawingFlow = !isGeoPackageFlow && hasDrawnParcels

    // Debug logging
    console.log('Habitats summary - session state:', {
      layersConfirmed: !!layersConfirmed,
      hasGeoPackageData: !!hasGeoPackageData,
      hasBoundary: !!drawnBoundary,
      boundaryType: drawnBoundary?.type,
      hasParcels: !!drawnParcels,
      hasDrawnParcels: hasDrawnParcels,
      parcelCount: drawnParcels?.features?.length || 0,
      isGeoPackageFlow: isGeoPackageFlow,
      isDrawingFlow: isDrawingFlow,
      hasHedgerows: !!(req.session.data['hedgerows']?.features?.length > 0),
      hasWatercourses: !!(
        req.session.data['watercourses']?.features?.length > 0
      )
    })

    let totalAreaHectares = 0
    let habitatParcels = []
    let mapData = {}
    let lpaName = req.session.data['lpaName'] || ''
    let ncaName = req.session.data['ncaName'] || ''

    if (isDrawingFlow) {
      // Drawing flow - use drawn geometries from session
      // Note: drawnBoundary is a single GeoJSON Feature (from saveBoundary)
      // drawnParcels is a FeatureCollection (from saveParcels)

      // Convert single Feature boundary to FeatureCollection for consistency
      let boundaryFeatureCollection = null
      if (
        drawnBoundary &&
        drawnBoundary.type === 'Feature' &&
        drawnBoundary.geometry
      ) {
        boundaryFeatureCollection = {
          type: 'FeatureCollection',
          features: [drawnBoundary]
        }
        // Calculate boundary area
        const totalAreaSqm = calculatePolygonArea(drawnBoundary.geometry)
        totalAreaHectares = (totalAreaSqm / 10000).toFixed(2)
      }

      // Build parcels data from drawn parcels (already a FeatureCollection)
      let parcelsTotalAreaSqm = 0
      if (
        drawnParcels &&
        drawnParcels.features &&
        drawnParcels.features.length > 0
      ) {
        drawnParcels.features.forEach((feature, index) => {
          let parcelAreaHa = 0
          if (feature.geometry) {
            const areaSqm = calculatePolygonArea(feature.geometry)
            parcelAreaHa = (areaSqm / 10000).toFixed(2)
            parcelsTotalAreaSqm += areaSqm
          }

          habitatParcels.push({
            parcelId: 'HP-' + (index + 1).toString().padStart(3, '0'),
            featureIndex: index,
            areaHectares: parcelAreaHa,
            habitatLabel: feature.properties?.habitatType || null,
            distinctiveness: null,
            condition: null,
            units: 0,
            status: 'Not started',
            actionUrl:
              '/on-site-baseline/parcel/' + (index + 1) + '/habitat-type'
          })
        })
      }

      // If boundary area wasn't calculated, use total parcels area as fallback
      if (totalAreaHectares === 0 && parcelsTotalAreaSqm > 0) {
        totalAreaHectares = (parcelsTotalAreaSqm / 10000).toFixed(2)
      }

      // Prepare map data from drawn geometries
      annotateParcelAdjacency(drawnParcels, {
        siteBoundary: boundaryFeatureCollection,
        hedgerows: req.session.data['hedgerows'] || null,
        watercourses: req.session.data['watercourses'] || null
      })

      mapData = {
        siteBoundary: boundaryFeatureCollection,
        parcels: drawnParcels,
        hedgerows: req.session.data['hedgerows'] || {
          type: 'FeatureCollection',
          features: []
        },
        watercourses: req.session.data['watercourses'] || {
          type: 'FeatureCollection',
          features: []
        }
      }
    } else {
      // GeoPackage flow - use uploaded data
      const layers = req.session.data['geopackageLayers'] || []
      const geometries = req.session.data['geopackageGeometries'] || {}

      // Find boundary and parcels layers
      const boundaryLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('boundary') ||
          l.name.toLowerCase().includes('site')
      )
      const parcelsLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('parcel') ||
          l.name.toLowerCase().includes('habitat')
      )

      const boundaryLayer = boundaryLayerInfo
        ? geometries[boundaryLayerInfo.name]
        : null
      const parcelsLayer = parcelsLayerInfo
        ? geometries[parcelsLayerInfo.name]
        : null

      // Calculate total site area
      if (boundaryLayerInfo) {
        totalAreaHectares = (boundaryLayerInfo.totalAreaSqm / 10000).toFixed(2)
      }

      // Build parcels data with property extraction
      if (parcelsLayerInfo && parcelsLayerInfo.featureCount > 0) {
        for (let i = 1; i <= parcelsLayerInfo.featureCount; i++) {
          let areaHa = 0
          let feature = parcelsLayer.features[i - 1]
          if (
            feature.geometry.type === 'Polygon' ||
            feature.geometry.type === 'MultiPolygon'
          ) {
            const areaSqm = calculatePolygonArea(feature.geometry)
            areaHa = areaSqm / 10000
          }

          let status = 'Not started'

          let parcelId =
            feature.properties['Parcel Ref'] ||
            'HP-' + i.toString().padStart(3, '0')
          let habitat = feature.properties['Baseline Habitat Type'] || null
          let broadHabitat = feature.properties['Baseline Broad Habitat Type'] || null
          //let distinctiveness =
          //  feature.properties['Baseline Distinctiveness'] || null

          let fullHabitat = broadHabitat + ' - ' + habitat

          let distinctiveness = distinctivenessCategories[fullHabitat] || null
          let condition = feature.properties['Baseline Condition'] || null

          // Remove the number and period from the condition
          if (condition !== null) {
            condition = condition.replace(/^\d+\.\s*/, '')
          }

          if (habitat !== null && distinctiveness !== null && condition !== null){
            status = 'Complete'
          }
          else if (
            habitat !== null ||
            distinctiveness !== null ||
            condition !== null
          ) {
            status = 'In progress'
          }

          // Calculate units
          // let units = 0
          // let distinctivenessScore = distinctivenessScores[distinctiveness] || 0
          // let conditionScore = conditionScores[condition] || 0

          // if (distinctivenessScore > 0 && conditionScore > 0) {
          //   units = areaHa * distinctivenessScore * conditionScore
          // }

          let units = getBaselineUnits(fullHabitat, areaHa, condition)


          habitatParcels.push({
            parcelId: parcelId,
            featureIndex: i - 1,
            areaHectares: areaHa.toFixed(2),
            habitatLabel: habitat,
            distinctiveness: distinctiveness,
            condition: condition,
            units: units,
            status: status,
            actionUrl: '/on-site-baseline/parcel/' + i + '/habitat-type'
          })
        }
      }

      // Find hedgerow and watercourse layers from uploaded GeoPackage
      const hedgerowLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('hedgerow') ||
          l.name.toLowerCase().includes('hedge')
      )
      const watercourseLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('watercourse') ||
          l.name.toLowerCase().includes('river') ||
          l.name.toLowerCase().includes('stream')
      )

      const hedgerowLayer = hedgerowLayerInfo
        ? geometries[hedgerowLayerInfo.name]
        : null
      const watercourseLayer = watercourseLayerInfo
        ? geometries[watercourseLayerInfo.name]
        : null

      // Prepare map data
      annotateParcelAdjacency(parcelsLayer, {
        siteBoundary: boundaryLayer,
        hedgerows: hedgerowLayer || null,
        watercourses: watercourseLayer || null
      })

      mapData = {
        siteBoundary: boundaryLayer,
        parcels: parcelsLayer,
        hedgerows: hedgerowLayer || {
          type: 'FeatureCollection',
          features: []
        },
        watercourses: watercourseLayer || {
          type: 'FeatureCollection',
          features: []
        }
      }
    }

    // Build parcel count message
    const parcelCount = habitatParcels.length
    let parcelCountMessage = 'No habitat parcels found.'
    if (parcelCount === 1) {
      parcelCountMessage = 'You have 1 habitat parcel to classify.'
    } else if (parcelCount > 1) {
      parcelCountMessage =
        'You have ' + parcelCount + ' habitat parcels to classify.'
    }

    // Sum habitat parcel units and store in session for later use
    const baselineUnits = habitatParcels.reduce(function (sum, parcel) {
      const units = typeof parcel.units === 'number' ? parcel.units : 0;
      return sum + units;
    }, 0);
    req.session.data['baselineUnits'] = baselineUnits;

    const areaHabitatsSize = habitatParcels.reduce(function (sum, parcel) {
      const area = parseFloat(parcel.areaHectares)
      return sum + (isNaN(area) ? 0 : area)
    }, 0)

    const collator = new Intl.Collator('en', {
      numeric: true,
      sensitivity: 'base'
    })

    function compareText(a, b) {
      return collator.compare((a || '').toString(), (b || '').toString())
    }

    function buildSortUrl(
      sortByParam,
      sortOrderParam,
      key,
      currentSortBy,
      currentSortOrder
    ) {
      const nextSortOrder =
        currentSortBy === key && currentSortOrder === 'asc' ? 'desc' : 'asc'
      const params = new URLSearchParams()

      Object.keys(req.query || {}).forEach(function (paramKey) {
        if (paramKey === sortByParam || paramKey === sortOrderParam) {
          return
        }

        const value = req.query[paramKey]
        if (value !== undefined && value !== null && value !== '') {
          params.set(paramKey, value.toString())
        }
      })

      params.set(sortByParam, key)
      params.set(sortOrderParam, nextSortOrder)

      return '/on-site-baseline/habitats-summary?' + params.toString()
    }

    function buildSortableHeadCell(
      label,
      key,
      sortByParam,
      sortOrderParam,
      currentSortBy,
      currentSortOrder
    ) {
      const isCurrent = currentSortBy === key
      const directionText = currentSortOrder === 'asc' ? 'ascending' : 'descending'
      const arrow = !isCurrent ? '' : currentSortOrder === 'asc' ? ' ▲' : ' ▼'

      return {
        html:
          '<a class="govuk-link govuk-link--no-visited-state" href="' +
          buildSortUrl(
            sortByParam,
            sortOrderParam,
            key,
            currentSortBy,
            currentSortOrder
          ) +
          '">' +
          label +
          '</a>' +
          arrow +
          (isCurrent
            ? '<span class="govuk-visually-hidden">, currently sorted ' +
              directionText +
              '</span>'
            : ''),
        attributes: {
          'aria-sort': isCurrent ? directionText : 'none'
        }
      }
    }

    const areaSortKeys = [
      'parcel-reference',
      'area',
      'habitat',
      'distinctiveness',
      'condition',
      'units',
      'status'
    ]
    const areasSortByRequested = (req.query.areasSortBy || '').toString().toLowerCase()
    const areasSortBy = areaSortKeys.includes(areasSortByRequested)
      ? areasSortByRequested
      : 'parcel-reference'
    const areasSortOrder = req.query.areasSortOrder === 'desc' ? 'desc' : 'asc'

    const sortedHabitatParcels = habitatParcels.slice().sort(function (a, b) {
      let compareValue = 0

      if (areasSortBy === 'parcel-reference') {
        compareValue = compareText(a.parcelId, b.parcelId)
      } else if (areasSortBy === 'area') {
        compareValue = (parseFloat(a.areaHectares) || 0) - (parseFloat(b.areaHectares) || 0)
      } else if (areasSortBy === 'habitat') {
        compareValue = compareText(a.habitatLabel, b.habitatLabel)
      } else if (areasSortBy === 'distinctiveness') {
        compareValue = compareText(a.distinctiveness, b.distinctiveness)
      } else if (areasSortBy === 'condition') {
        compareValue = compareText(a.condition, b.condition)
      } else if (areasSortBy === 'units') {
        compareValue = (typeof a.units === 'number' ? a.units : 0) - (typeof b.units === 'number' ? b.units : 0)
      } else if (areasSortBy === 'status') {
        compareValue = compareText(a.status, b.status)
      }

      return areasSortOrder === 'desc' ? -compareValue : compareValue
    })

    // Build table rows for GovUK table component
    const tableRows = sortedHabitatParcels.map(function (parcel, index) {
      const statusText = parcel.status || ''
      let statusClass = ''
      if (statusText === 'Incomplete') {
        statusClass = 'govuk-tag--blue'
      }

      const featureIndex =
        typeof parcel.featureIndex === 'number' ? parcel.featureIndex : index

      return [
        {
          html:
            '<a class="govuk-link habitat-ref-link habitat-ref-cell" data-feature-type="parcel" data-feature-index="' +
            featureIndex +
            '" href="' +
            parcel.actionUrl +
            '">' +
            parcel.parcelId +
            '</a>'
        },
        { text: parcel.habitatLabel || '' },
         { text: parcel.areaHectares },
        { text: parcel.distinctiveness || '' },
        { text: parcel.condition || '' },
        { text: parcel.units ? parcel.units.toFixed(2) : '0.00' },
        statusClass
          ? {
              html:
                '<strong class="govuk-tag ' +
                statusClass +
                '">' +
                statusText +
                '</strong>'
            }
          : { text: statusText }
      ]
    })

    const areasHead = [
      buildSortableHeadCell(
        'Ref',
        'parcel-reference',
        'areasSortBy',
        'areasSortOrder',
        areasSortBy,
        areasSortOrder
      ),
       buildSortableHeadCell(
        'Habitat type',
        'habitat',
        'areasSortBy',
        'areasSortOrder',
        areasSortBy,
        areasSortOrder
      ),
      buildSortableHeadCell(
        'Area (ha)',
        'area',
        'areasSortBy',
        'areasSortOrder',
        areasSortBy,
        areasSortOrder
      ),
      buildSortableHeadCell(
        'Distinctiveness',
        'distinctiveness',
        'areasSortBy',
        'areasSortOrder',
        areasSortBy,
        areasSortOrder
      ),
      buildSortableHeadCell(
        'Condition',
        'condition',
        'areasSortBy',
        'areasSortOrder',
        areasSortBy,
        areasSortOrder
      ),
      buildSortableHeadCell(
        'Units',
        'units',
        'areasSortBy',
        'areasSortOrder',
        areasSortBy,
        areasSortOrder
      ),
      buildSortableHeadCell(
        'Status',
        'status',
        'areasSortBy',
        'areasSortOrder',
        areasSortBy,
        areasSortOrder
      )
    ]

    const areasTableRowsWithTotals = tableRows.concat([
      [
        { html: '<strong>Total</strong>' },
        { html: '<strong>' + areaHabitatsSize.toFixed(2) + '</strong>' },
        { text: '' },
        { text: '' },
        { text: '' },
        { html: '<strong>' + baselineUnits.toFixed(2) + '</strong>' },
        { text: '' }
      ]
    ])

    // Build hedgerow table rows
    const hedgerows = mapData.hedgerows?.features || []
    let hedgerowTotalLengthM = 0
    const hedgerowItems = hedgerows.map(function (feature, index) {
      // Use lengthM property if available, otherwise calculate from geometry
      let lengthM = feature.properties?.lengthM
      if (lengthM === undefined && feature.geometry) {
        lengthM = calculateLineLength(feature.geometry)
      }
      lengthM = lengthM || 0
      hedgerowTotalLengthM += lengthM
      const lengthKm = lengthM / 1000
      return {
        featureIndex: index,
        reference: 'H-' + (index + 1).toString().padStart(3, '0'),
        lengthKm: lengthKm,
        hedgerowType: feature.properties['Baseline Hedge Type'] || '',
        distinctiveness: feature.properties['Baseline Distinctiveness'] || '',
        condition: feature.properties['Baseline Condition'] || '',
        units: 0,
        status: 'Complete',
        actionUrl: '/on-site-baseline/hedgerow/' + (index + 1) + '/details'
      }
    })

    const hedgerowSortKeys = [
      'reference',
      'length',
      'hedgerow-type',
      'distinctiveness',
      'condition',
      'units',
      'status'
    ]
    const hedgerowsSortByRequested =
      (req.query.hedgerowsSortBy || '').toString().toLowerCase()
    const hedgerowsSortBy = hedgerowSortKeys.includes(hedgerowsSortByRequested)
      ? hedgerowsSortByRequested
      : 'reference'
    const hedgerowsSortOrder =
      req.query.hedgerowsSortOrder === 'desc' ? 'desc' : 'asc'

    const sortedHedgerowItems = hedgerowItems.slice().sort(function (a, b) {
      let compareValue = 0

      if (hedgerowsSortBy === 'reference') {
        compareValue = compareText(a.reference, b.reference)
      } else if (hedgerowsSortBy === 'length') {
        compareValue = a.lengthKm - b.lengthKm
      } else if (hedgerowsSortBy === 'hedgerow-type') {
        compareValue = compareText(a.hedgerowType, b.hedgerowType)
      } else if (hedgerowsSortBy === 'distinctiveness') {
        compareValue = compareText(a.distinctiveness, b.distinctiveness)
      } else if (hedgerowsSortBy === 'condition') {
        compareValue = compareText(a.condition, b.condition)
      } else if (hedgerowsSortBy === 'units') {
        compareValue = a.units - b.units
      } else if (hedgerowsSortBy === 'status') {
        compareValue = compareText(a.status, b.status)
      }

      return hedgerowsSortOrder === 'desc' ? -compareValue : compareValue
    })

    const hedgerowTableRows = sortedHedgerowItems.map(function (item) {
      return [
        {
          attributes: {
            style: 'width: 10%; white-space: nowrap;'
          },
          html:
            '<a class="govuk-link habitat-ref-link habitat-ref-cell" data-feature-type="hedgerow" data-feature-index="' +
            item.featureIndex +
            '" href="' +
            item.actionUrl +
            '">' +
            item.reference +
            '</a>'
        },
        { text: item.hedgerowType },
        { text: item.lengthKm.toFixed(2) },
        { text: item.distinctiveness },
        { text: item.condition },
        { text: item.units.toFixed(2) },
        { text: item.status }
      ]
    })

    const hedgerowsHead = [
      {
        attributes: {
          style: 'width: 10%; white-space: nowrap;'
        },
        html:
          '<a class="govuk-link govuk-link--no-visited-state" href="' +
          buildSortUrl(
            'hedgerowsSortBy',
            'hedgerowsSortOrder',
            'reference',
            hedgerowsSortBy,
            hedgerowsSortOrder
          ) +
          '">Ref</a>' +
          (hedgerowsSortBy === 'reference'
            ? hedgerowsSortOrder === 'asc'
              ? ' ▲'
              : ' ▼'
            : '') +
          (hedgerowsSortBy === 'reference'
            ? '<span class="govuk-visually-hidden">, currently sorted ' +
              (hedgerowsSortOrder === 'asc' ? 'ascending' : 'descending') +
              '</span>'
            : ''),
        attributes: {
          style: 'width: 10%; white-space: nowrap;',
          'aria-sort':
            hedgerowsSortBy === 'reference'
              ? hedgerowsSortOrder === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'
        }
      },
      buildSortableHeadCell(
        'Hedgerow type',
        'hedgerow-type',
        'hedgerowsSortBy',
        'hedgerowsSortOrder',
        hedgerowsSortBy,
        hedgerowsSortOrder
      ),
      {
        html:
          '<a class="govuk-link govuk-link--no-visited-state" href="' +
          buildSortUrl(
            'hedgerowsSortBy',
            'hedgerowsSortOrder',
            'length',
            hedgerowsSortBy,
            hedgerowsSortOrder
          ) +
          '">Length (km)</a>' +
          (hedgerowsSortBy === 'length'
            ? hedgerowsSortOrder === 'asc'
              ? ' ▲'
              : ' ▼'
            : '') +
          (hedgerowsSortBy === 'length'
            ? '<span class="govuk-visually-hidden">, currently sorted ' +
              (hedgerowsSortOrder === 'asc' ? 'ascending' : 'descending') +
              '</span>'
            : ''),
        attributes: {
          style: 'width: 12%; white-space: nowrap;',
          'aria-sort':
            hedgerowsSortBy === 'length'
              ? hedgerowsSortOrder === 'asc'
                ? 'ascending'
                : 'descending'
              : 'none'
        }
      },
      buildSortableHeadCell(
        'Distinctiveness',
        'distinctiveness',
        'hedgerowsSortBy',
        'hedgerowsSortOrder',
        hedgerowsSortBy,
        hedgerowsSortOrder
      ),
      buildSortableHeadCell(
        'Condition',
        'condition',
        'hedgerowsSortBy',
        'hedgerowsSortOrder',
        hedgerowsSortBy,
        hedgerowsSortOrder
      ),
      buildSortableHeadCell(
        'Units',
        'units',
        'hedgerowsSortBy',
        'hedgerowsSortOrder',
        hedgerowsSortBy,
        hedgerowsSortOrder
      ),
      buildSortableHeadCell(
        'Status',
        'status',
        'hedgerowsSortBy',
        'hedgerowsSortOrder',
        hedgerowsSortBy,
        hedgerowsSortOrder
      )
    ]

    const hedgerowTableRowsWithTotals = hedgerowTableRows.concat([
      [
        { html: '<strong>Total</strong>' },
        { text: '' },
        { html: '<strong>' + (hedgerowTotalLengthM / 1000).toFixed(2) + '</strong>' },
        { text: '' },
        { text: '' },
        { html: '<strong>0.00</strong>' },
        { text: '' }
      ]
    ])

    // Build watercourse table rows
    const watercourses = mapData.watercourses?.features || []
    let watercourseTotalLengthM = 0
    const watercourseItems = watercourses.map(function (feature, index) {
      // Use lengthM property if available, otherwise calculate from geometry
      let lengthM = feature.properties?.lengthM
      if (lengthM === undefined && feature.geometry) {
        lengthM = calculateLineLength(feature.geometry)
      }
      lengthM = lengthM || 0
      watercourseTotalLengthM += lengthM
      const lengthKm = lengthM / 1000

      return {
        featureIndex: index,
        reference: 'W-' + (index + 1).toString().padStart(3, '0'),
        lengthKm: lengthKm,
        watercourseType: feature.properties['Baseline River Type'] || '',
        distinctiveness: feature.properties['Baseline Distinctiveness'] || '',
        condition:
          feature.properties['Baseline Condition']?.replace(/^\d+\.\s*/, '') ||
          '',
        units: 0,
        status: 'Complete',
        actionUrl: '/on-site-baseline/watercourse/' + (index + 1) + '/details'
      }
    })

    const watercoursesSortKeys = [
      'reference',
      'length',
      'watercourse-type',
      'distinctiveness',
      'condition',
      'units',
      'status'
    ]
    const watercoursesSortByRequested =
      (req.query.watercoursesSortBy || '').toString().toLowerCase()
    const watercoursesSortBy = watercoursesSortKeys.includes(
      watercoursesSortByRequested
    )
      ? watercoursesSortByRequested
      : 'reference'
    const watercoursesSortOrder =
      req.query.watercoursesSortOrder === 'desc' ? 'desc' : 'asc'

    const sortedWatercourseItems = watercourseItems.slice().sort(function (a, b) {
      let compareValue = 0

      if (watercoursesSortBy === 'reference') {
        compareValue = compareText(a.reference, b.reference)
      } else if (watercoursesSortBy === 'length') {
        compareValue = a.lengthKm - b.lengthKm
      } else if (watercoursesSortBy === 'watercourse-type') {
        compareValue = compareText(a.watercourseType, b.watercourseType)
      } else if (watercoursesSortBy === 'distinctiveness') {
        compareValue = compareText(a.distinctiveness, b.distinctiveness)
      } else if (watercoursesSortBy === 'condition') {
        compareValue = compareText(a.condition, b.condition)
      } else if (watercoursesSortBy === 'units') {
        compareValue = a.units - b.units
      } else if (watercoursesSortBy === 'status') {
        compareValue = compareText(a.status, b.status)
      }

      return watercoursesSortOrder === 'desc' ? -compareValue : compareValue
    })

    const watercourseTableRows = sortedWatercourseItems.map(function (item) {
      return [
        {
          html:
            '<a class="govuk-link habitat-ref-link habitat-ref-cell" data-feature-type="watercourse" data-feature-index="' +
            item.featureIndex +
            '" href="' +
            item.actionUrl +
            '">' +
            item.reference +
            '</a>'
        },
        { text: item.watercourseType },
        { text: item.lengthKm.toFixed(2) },
        { text: item.distinctiveness },
        { text: item.condition },
        { text: item.units.toFixed(2) },
        { text: item.status }
      ]
    })

    const watercoursesHead = [
      buildSortableHeadCell(
        'Ref',
        'reference',
        'watercoursesSortBy',
        'watercoursesSortOrder',
        watercoursesSortBy,
        watercoursesSortOrder
      ),
      buildSortableHeadCell(
        'Watercourse type',
        'watercourse-type',
        'watercoursesSortBy',
        'watercoursesSortOrder',
        watercoursesSortBy,
        watercoursesSortOrder
      ),
      buildSortableHeadCell(
        'Length (km)',
        'length',
        'watercoursesSortBy',
        'watercoursesSortOrder',
        watercoursesSortBy,
        watercoursesSortOrder
      ),
      buildSortableHeadCell(
        'Distinctiveness',
        'distinctiveness',
        'watercoursesSortBy',
        'watercoursesSortOrder',
        watercoursesSortBy,
        watercoursesSortOrder
      ),
      buildSortableHeadCell(
        'Condition',
        'condition',
        'watercoursesSortBy',
        'watercoursesSortOrder',
        watercoursesSortBy,
        watercoursesSortOrder
      ),
      buildSortableHeadCell(
        'Units',
        'units',
        'watercoursesSortBy',
        'watercoursesSortOrder',
        watercoursesSortBy,
        watercoursesSortOrder
      ),
      buildSortableHeadCell(
        'Status',
        'status',
        'watercoursesSortBy',
        'watercoursesSortOrder',
        watercoursesSortBy,
        watercoursesSortOrder
      )
    ]

    const watercourseTableRowsWithTotals = watercourseTableRows.concat([
      [
        { html: '<strong>Total</strong>' },
        { text: '' },
        { html: '<strong>' + (watercourseTotalLengthM / 1000).toFixed(2) + '</strong>' },
        { text: '' },
        { text: '' },
        { html: '<strong>0.00</strong>' },
        { text: '' }
      ]
    ])

    const summaryData = [
      {
        unitType: 'Area habitats',
        sizeValue: areaHabitatsSize,
        sizeUnit: 'ha',
        unitsValue: baselineUnits
      },
      {
        unitType: 'Hedgerows',
        sizeValue: hedgerowTotalLengthM / 1000,
        sizeUnit: 'km',
        unitsValue: 0
      },
      {
        unitType: 'Water courses',
        sizeValue: watercourseTotalLengthM / 1000,
        sizeUnit: 'km',
        unitsValue: 0
      }
    ]

    const summaryRows = summaryData.map(function (row) {
      return [
        { text: row.unitType },
        { text: row.sizeValue.toFixed(2) + row.sizeUnit },
        { text: row.unitsValue.toFixed(2) }
      ]
    })

    res.render('on-site-baseline/habitats-summary', {
      baselineSummary: {
        parcelCountMessage: parcelCountMessage
      },
      siteSummary: {
        totalAreaHectares: totalAreaHectares + ' hectares',
        localPlanningAuthority: lpaName,
        nationalCharacterArea: ncaName
      },
      mapData: mapData,
      habitatParcels: habitatParcels,
      summaryRows: summaryRows,
      areasHead: areasHead,
      hedgerowsHead: hedgerowsHead,
      watercoursesHead: watercoursesHead,
      tableRows: tableRows,
      areasTableRowsWithTotals: areasTableRowsWithTotals,
      hedgerowTableRows: hedgerowTableRows,
      hedgerowTableRowsWithTotals: hedgerowTableRowsWithTotals,
      watercourseTableRows: watercourseTableRows,
      watercourseTableRowsWithTotals: watercourseTableRowsWithTotals,
      actions: {
        startPostIntervention: {
          url: '/on-site-post-intervention/post-intervention-start'
        }
      }
    })
  })

  // API endpoint for getting parsed geometries (for map display)
  router.get('/api/on-site-baseline/geometries', function (req, res) {
    const geometries = req.session.data['geopackageGeometries'] || {}
    res.json(geometries)
  })

  // Baseline parcel edit page - GET
  router.get('/on-site-baseline/parcel/:parcelId/habitat-type', function (req, res) {
    const parcelIdParam = req.params.parcelId
    const layersConfirmed = req.session.data['layersConfirmed']
    const hasGeoPackageData =
      req.session.data['geopackageLayers'] &&
      req.session.data['geopackageLayers'].length > 0
    const isGeoPackageFlow = layersConfirmed && hasGeoPackageData

    let parcelsFeatureCollection = null
    let siteBoundaryFeatureCollection = null
    let hedgerowsFeatureCollection = null
    let watercoursesFeatureCollection = null

    if (isGeoPackageFlow) {
      const layers = req.session.data['geopackageLayers'] || []
      const geometries = req.session.data['geopackageGeometries'] || {}

      const boundaryLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('boundary') ||
          l.name.toLowerCase().includes('site')
      )
      const parcelsLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('parcel') ||
          l.name.toLowerCase().includes('habitat')
      )

      siteBoundaryFeatureCollection = boundaryLayerInfo
        ? geometries[boundaryLayerInfo.name]
        : null
      parcelsFeatureCollection = parcelsLayerInfo
        ? geometries[parcelsLayerInfo.name]
        : null

      const hedgerowLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('hedgerow') ||
          l.name.toLowerCase().includes('hedge')
      )
      const watercourseLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('watercourse') ||
          l.name.toLowerCase().includes('river') ||
          l.name.toLowerCase().includes('stream')
      )

      hedgerowsFeatureCollection = hedgerowLayerInfo
        ? geometries[hedgerowLayerInfo.name]
        : null
      watercoursesFeatureCollection = watercourseLayerInfo
        ? geometries[watercourseLayerInfo.name]
        : null
    } else {
      const drawnBoundary = req.session.data['redLineBoundary']
      if (drawnBoundary && drawnBoundary.type === 'Feature' && drawnBoundary.geometry) {
        siteBoundaryFeatureCollection = {
          type: 'FeatureCollection',
          features: [drawnBoundary]
        }
      }

      parcelsFeatureCollection = req.session.data['habitatParcels'] || null
      hedgerowsFeatureCollection = req.session.data['hedgerows'] || null
      watercoursesFeatureCollection = req.session.data['watercourses'] || null
    }

    if (
      !parcelsFeatureCollection ||
      !Array.isArray(parcelsFeatureCollection.features) ||
      !parcelsFeatureCollection.features.length
    ) {
      return res.status(404).send('Habitat parcel not found')
    }

    const parcelIndex = parseInt(parcelIdParam, 10) - 1
    const feature =
      Number.isInteger(parcelIndex) &&
      parcelIndex >= 0 &&
      parcelIndex < parcelsFeatureCollection.features.length
        ? parcelsFeatureCollection.features[parcelIndex]
        : null

    if (!feature) {
      return res.status(404).send('Habitat parcel not found')
    }

    const parcelRef =
      feature.properties?.['Parcel Ref'] ||
      'HP-' + (parcelIndex + 1).toString().padStart(3, '0')

    const areaSqm = feature.geometry ? calculatePolygonArea(feature.geometry) : 0
    const areaHa = (areaSqm / 10000).toFixed(2)

    const broadHabitat = feature.properties?.['Baseline Broad Habitat Type'] || ''
    const habitatType = feature.properties?.['Baseline Habitat Type'] || ''
    const fullHabitatType =
      broadHabitat && habitatType ? broadHabitat + ' - ' + habitatType : ''
    const distinctiveness = fullHabitatType
      ? distinctivenessCategories[fullHabitatType] || '-'
      : '-'
    const conditionRaw = feature.properties?.['Baseline Condition'] || ''
    const condition = conditionRaw ? conditionRaw.replace(/^\d+\.\s*/, '') : ''
    const irreplaceableHabitat =
      feature.properties?.['Irreplaceable Habitat'] ||
      feature.properties?.['Baseline Irreplaceable Habitat'] ||
      'No'
    const requiredAction =
      feature.properties?.['Required action to meeting trading rules'] ||
      feature.properties?.['Required action to meet trading rules'] ||
      '-'
    const supportingEvidence = feature.properties?.Comments || ''
    const totalHabitatUnits =
      fullHabitatType && condition
        ? getBaselineUnits(fullHabitatType, parseFloat(areaHa) || 0, condition)
        : 0

    const habitatTypesByBroadHabitat = getHabitatTypesByBroadHabitat()
    const habitatTypeItems =
      broadHabitat && habitatTypesByBroadHabitat[broadHabitat]
        ? [
            { value: '', text: 'Select' },
            ...habitatTypesByBroadHabitat[broadHabitat].map((value) => ({
              value: value,
              text: value
            }))
          ]
        : [{ value: '', text: 'Select' }]
    const broadHabitatItems = [
      { value: '', text: 'Select' },
      ...Object.keys(habitatTypesByBroadHabitat)
        .sort()
        .map((value) => ({ value: value, text: value }))
    ]

    const conditionItems = [
      { value: '', text: 'Select' },
      { value: 'Poor', text: 'Poor' },
      { value: 'Fairly Poor', text: 'Fairly Poor' },
      { value: 'Moderate', text: 'Moderate' },
      { value: 'Fairly Good', text: 'Fairly Good' },
      { value: 'Good', text: 'Good' },
      { value: 'Condition Assessment N/A', text: 'Condition Assessment N/A' },
      { value: 'N/A - Other', text: 'N/A - Other' }
    ]

    const mapData = {
      siteBoundary: siteBoundaryFeatureCollection || null,
      parcels: parcelsFeatureCollection || null,
      hedgerows: hedgerowsFeatureCollection || null,
      watercourses: watercoursesFeatureCollection || null,
      parcel: {
        type: 'FeatureCollection',
        features: [feature]
      }
    }

    annotateParcelAdjacency(parcelsFeatureCollection, {
      siteBoundary: siteBoundaryFeatureCollection || null,
      hedgerows: hedgerowsFeatureCollection || null,
      watercourses: watercoursesFeatureCollection || null
    })

    res.render('on-site-baseline/habitat-edit', {
      habitat: {
        ref: parcelRef,
        index: parcelIndex + 1,
        area_hectares: areaHa,
        broad_habitat: broadHabitat,
        habitat_type: fullHabitatType,
        distinctiveness: distinctiveness,
        condition: condition,
        irreplaceable_habitat: irreplaceableHabitat,
        required_action: requiredAction,
        total_units: totalHabitatUnits,
        supporting_evidence: supportingEvidence
      },
      habitatTypesByBroadHabitat: JSON.stringify(habitatTypesByBroadHabitat),
      distinctivenessCategories: JSON.stringify(distinctivenessCategories),
      broadHabitatItems: broadHabitatItems,
      habitatTypeItems: habitatTypeItems,
      conditionItems: conditionItems,
      mapData: mapData
    })
  })

  // Baseline parcel edit page - POST
  router.post('/on-site-baseline/parcel/:parcelId/habitat-type', function (req, res) {
    const parcelIdParam = req.params.parcelId
    const parcelIndex = parseInt(parcelIdParam, 10) - 1
    const broadHabitatInput = (req.body.broad_habitat || '').trim()
    const habitatTypeInput = (req.body.habitat_type || '').trim()
    const conditionInput = (req.body.condition || '').trim()
    const irreplaceableHabitatInput = (req.body.irreplaceable_habitat || '').trim()
    const supportingEvidenceInput = (req.body.supporting_evidence || '').trim()

    const layersConfirmed = req.session.data['layersConfirmed']
    const hasGeoPackageData =
      req.session.data['geopackageLayers'] &&
      req.session.data['geopackageLayers'].length > 0
    const isGeoPackageFlow = layersConfirmed && hasGeoPackageData

    let parcelsFeatureCollection = null
    let updateSession = null

    if (isGeoPackageFlow) {
      const layers = req.session.data['geopackageLayers'] || []
      const geometries = req.session.data['geopackageGeometries'] || {}
      const parcelsLayerInfo = layers.find(
        (l) =>
          l.name.toLowerCase().includes('parcel') ||
          l.name.toLowerCase().includes('habitat')
      )

      if (!parcelsLayerInfo || !geometries[parcelsLayerInfo.name]) {
        return res.status(404).send('Habitat parcel not found')
      }

      parcelsFeatureCollection = geometries[parcelsLayerInfo.name]
      updateSession = function () {
        req.session.data['geopackageGeometries'] = geometries
      }
    } else {
      parcelsFeatureCollection = req.session.data['habitatParcels'] || null
      updateSession = function () {
        req.session.data['habitatParcels'] = parcelsFeatureCollection
      }
    }

    if (
      !parcelsFeatureCollection ||
      !Array.isArray(parcelsFeatureCollection.features) ||
      !parcelsFeatureCollection.features.length ||
      !Number.isInteger(parcelIndex) ||
      parcelIndex < 0 ||
      parcelIndex >= parcelsFeatureCollection.features.length
    ) {
      return res.status(404).send('Habitat parcel not found')
    }

    const feature = parcelsFeatureCollection.features[parcelIndex]
    feature.properties = feature.properties || {}

    let broadHabitat = broadHabitatInput
    let habitatType = ''
    if (habitatTypeInput && habitatTypeInput.includes(' - ')) {
      const parts = habitatTypeInput.split(' - ', 2)
      broadHabitat = (parts[0] || '').trim()
      habitatType = (parts[1] || '').trim()
    } else {
      habitatType = habitatTypeInput
    }

    feature.properties['Baseline Broad Habitat Type'] = broadHabitat || null
    feature.properties['Baseline Habitat Type'] = habitatType || null
    feature.properties['Baseline Condition'] = conditionInput || null
    feature.properties['Baseline Irreplaceable Habitat'] =
      irreplaceableHabitatInput || null
    feature.properties['Irreplaceable Habitat'] = irreplaceableHabitatInput || null
    feature.properties['Comments'] = supportingEvidenceInput || ''

    const fullHabitat =
      broadHabitat && habitatType ? broadHabitat + ' - ' + habitatType : null
    const distinctiveness = fullHabitat
      ? distinctivenessCategories[fullHabitat] || null
      : null
    feature.properties['Baseline Distinctiveness'] = distinctiveness

    // Keep compatibility with hand-drawn parcel data shape.
    feature.properties['habitatType'] = habitatType || null

    updateSession()

    res.redirect('/on-site-baseline/habitats-summary?selected=parcel:' + parcelIndex)
  })

  router.get('/on-site-baseline/hedgerow/:hedgerowId/details', function (req, res) {
    const hedgerowIndex = parseInt(req.params.hedgerowId, 10) - 1
    if (!Number.isInteger(hedgerowIndex) || hedgerowIndex < 0) {
      return res.redirect('/on-site-baseline/habitats-summary#hedgerows')
    }

    res.redirect(
      '/on-site-baseline/habitats-summary?selected=hedgerow:' +
        hedgerowIndex +
        '#hedgerows'
    )
  })

  router.get('/on-site-baseline/watercourse/:watercourseId/details', function (req, res) {
    const watercourseIndex = parseInt(req.params.watercourseId, 10) - 1
    if (!Number.isInteger(watercourseIndex) || watercourseIndex < 0) {
      return res.redirect('/on-site-baseline/habitats-summary#watercourses')
    }

    res.redirect(
      '/on-site-baseline/habitats-summary?selected=watercourse:' +
        watercourseIndex +
        '#watercourses'
    )
  })
}

module.exports = { registerOnSiteBaselineRoutes }
