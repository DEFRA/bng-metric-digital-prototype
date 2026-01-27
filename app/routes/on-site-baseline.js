/**
 * On-Site Baseline Journey Routes
 * Handles the habitat baseline workflow including file uploads, layer confirmation, and summary
 */

const multer = require('multer')
const { parseGeoPackage } = require('../lib/geopackage-parser')
const {
  calculatePolygonArea,
  calculateLineLength,
  isPolygonSelfIntersecting
} = require('../lib/geometry-utils')
const { isWithinUK, getLPA, getNCA, getLNRS } = require('../lib/arcgis-queries')

const upload = multer({ storage: multer.memoryStorage() })

// Validation thresholds
const maxFileSizeMB = 100
const boundaryLayerName = 'Red Line Boundary'
const maxBoundaryFeatures = 10
const maxPolygonSize = 1000000000 // 1000 sq km

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
        // Redirect to confirm page
        res.redirect('/on-site-baseline/confirm-layers')
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
    // Mark layers as confirmed
    req.session.data['layersConfirmed'] = true

    // Clear hand-drawn data when confirming GeoPackage layers
    // This ensures the GeoPackage flow is used on the habitats-summary page
    req.session.data['redLineBoundary'] = null
    req.session.data['habitatParcels'] = null
    req.session.data['hedgerows'] = null
    req.session.data['watercourses'] = null
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
    // Use drawing flow only if no GeoPackage data was confirmed
    const isGeoPackageFlow = layersConfirmed && hasGeoPackageData
    const isDrawingFlow = !isGeoPackageFlow && drawnBoundary && drawnParcels

    // Debug logging
    console.log('Habitats summary - session state:', {
      layersConfirmed: !!layersConfirmed,
      hasGeoPackageData: !!hasGeoPackageData,
      hasBoundary: !!drawnBoundary,
      hasParcels: !!drawnParcels,
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
    let lpaName = req.session.data['lpaName'] || 'Not specified'
    let ncaName = req.session.data['ncaName'] || 'Not specified'

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
          }

          habitatParcels.push({
            parcelId: 'HP-' + (index + 1).toString().padStart(3, '0'),
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

      // Prepare map data from drawn geometries
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
          let distinctiveness =
            feature.properties['Baseline Distinctiveness'] || null
          let condition = feature.properties['Baseline Condition'] || null

          // Remove the number and period from the condition
          if (condition !== null) {
            condition = condition.replace(/^\d+\.\s*/, '')
          }

          if (
            habitat !== null ||
            distinctiveness !== null ||
            condition !== null
          ) {
            status = 'In progress'
          }

          // Calculate units
          let units = 0
          let distinctivenessScore = distinctivenessScores[distinctiveness] || 0
          let conditionScore = conditionScores[condition] || 0

          if (distinctivenessScore > 0 && conditionScore > 0) {
            units = areaHa * distinctivenessScore * conditionScore
          }

          habitatParcels.push({
            parcelId: parcelId,
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

    // Build table rows for GovUK table component
    const tableRows = habitatParcels.map(function (parcel, index) {
      return [
        {
          html:
            '<a href="#" class="govuk-link habitat-ref-link" data-feature-type="parcel" data-feature-index="' +
            index +
            '">' +
            parcel.parcelId +
            '</a>'
        },
        { text: parcel.areaHectares },
        { text: parcel.habitatLabel || 'Not specified' },
        { text: parcel.distinctiveness || 'Not specified' },
        { text: parcel.condition || 'Not specified' },
        { text: parcel.units ? parcel.units.toFixed(2) : '0.00' },
        { text: parcel.status },
        {
          html:
            '<a class="govuk-link" href="' +
            parcel.actionUrl +
            '">Add details<span class="govuk-visually-hidden"> for ' +
            parcel.parcelId +
            '</span></a>'
        }
      ]
    })

    // Build hedgerow table rows
    const hedgerows = mapData.hedgerows?.features || []
    const hedgerowTableRows = hedgerows.map(function (feature, index) {
      // Use lengthM property if available, otherwise calculate from geometry
      let lengthM = feature.properties?.lengthM
      if (lengthM === undefined && feature.geometry) {
        lengthM = calculateLineLength(feature.geometry)
      }
      lengthM = lengthM || 0
      return [
        {
          html:
            '<a href="#" class="govuk-link habitat-ref-link" data-feature-type="hedgerow" data-feature-index="' +
            index +
            '">H-' +
            (index + 1).toString().padStart(3, '0') +
            '</a>'
        },
        { text: lengthM.toFixed(1) },
        { text: 'Not started' },
        {
          html:
            '<a class="govuk-link" href="/on-site-baseline/hedgerow/' +
            (index + 1) +
            '/details">Add details<span class="govuk-visually-hidden"> for H-' +
            (index + 1).toString().padStart(3, '0') +
            '</span></a>'
        }
      ]
    })

    // Build watercourse table rows
    const watercourses = mapData.watercourses?.features || []
    const watercourseTableRows = watercourses.map(function (feature, index) {
      // Use lengthM property if available, otherwise calculate from geometry
      let lengthM = feature.properties?.lengthM
      if (lengthM === undefined && feature.geometry) {
        lengthM = calculateLineLength(feature.geometry)
      }
      lengthM = lengthM || 0
      return [
        {
          html:
            '<a href="#" class="govuk-link habitat-ref-link" data-feature-type="watercourse" data-feature-index="' +
            index +
            '">W-' +
            (index + 1).toString().padStart(3, '0') +
            '</a>'
        },
        { text: lengthM.toFixed(1) },
        { text: 'Not started' },
        {
          html:
            '<a class="govuk-link" href="/on-site-baseline/watercourse/' +
            (index + 1) +
            '/details">Add details<span class="govuk-visually-hidden"> for W-' +
            (index + 1).toString().padStart(3, '0') +
            '</span></a>'
        }
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
      tableRows: tableRows,
      hedgerowTableRows: hedgerowTableRows,
      watercourseTableRows: watercourseTableRows,
      actions: {
        startFirstParcel: {
          url: habitatParcels.length > 0 ? habitatParcels[0].actionUrl : '#'
        }
      }
    })
  })

  // API endpoint for getting parsed geometries (for map display)
  router.get('/api/on-site-baseline/geometries', function (req, res) {
    const geometries = req.session.data['geopackageGeometries'] || {}
    res.json(geometries)
  })
}

module.exports = { registerOnSiteBaselineRoutes }
