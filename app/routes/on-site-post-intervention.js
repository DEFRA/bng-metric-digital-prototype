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

//const { isWithinUK, getLPA, getNCA, getLNRS } = require('../lib/arcgis-queries')
const { isWithinUK } = require('../lib/arcgis-queries')
const { annotateParcelAdjacency } = require('./on-site-baseline')

// Import metric calculation data
const metricCalcs = require('../lib/metric-calcs')
const distinctivenessCategories = metricCalcs.distinctivenessCategories || {}
const distinctivenesScores = metricCalcs.distinctivenesScores || {}
const conditionScores = metricCalcs.conditionScores || {}
const creationTimeToTarget = metricCalcs.creationTimeToTarget || {}
const habitatDifficultyMultiplier = metricCalcs.habitatDifficultyMultiplier || {}
const habitatDifficulty = metricCalcs.habitatDifficulty || {}
const getCreationUnits = metricCalcs.getCreationUnits || {}
const getEnhancementUnits = metricCalcs.getEnhancementUnits || {}
const getBaselineUnits = metricCalcs.getBaselineUnits || {}

const upload = multer({ storage: multer.memoryStorage() })

// Validation thresholds
const maxFileSizeMB = 100
const boundaryLayerName = 'Red Line Boundary'
const maxBoundaryFeatures = 10
const maxPolygonSize = 1000000000 // 1000 sq km

const STRATEGIC_SIGNIFICANCE_OPTIONS = [
  { value: '', text: 'Select' },
  { value: 'Area/compensation not in local strategy/ no local strategy', text: 'Low Strategic Significance' },
  { value: 'Location ecologically desirable but not in local strategy', text: 'Medium strategic significance' },
  { value: 'Formally identified in local strategy', text: 'High strategic significance' }
]

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
 * Register on-site post-intervention routes
 * @param {Router} router - Express router instance
 */
function registerOnSitePostInterventionRoutes(router) {
  
  // // Upload Choice Page - GET
  // router.get('/on-site-baseline/start', function (req, res) {
  //   res.render('on-site-baseline/start', {
  //     error: req.query.error || null
  //   })
  // })

  // // Upload Choice Page - POST
  // router.post('/on-site-baseline/start', function (req, res) {
  //   const uploadChoice = req.body.uploadChoice

  //   if (!uploadChoice) {
  //     return res.redirect(
  //       '/on-site-baseline/start?error=Select how you want to add your habitat data'
  //     )
  //   }

  //   // Store the choice in session
  //   req.session.data['uploadChoice'] = uploadChoice

  //   // Route based on selection
  //   switch (uploadChoice) {
  //     case 'single-file':
  //       return res.redirect('/on-site-baseline/upload-single-file')
  //     case 'separate-files':
  //       // Future implementation
  //       return res.redirect('/on-site-baseline/upload-boundary')
  //     case 'no-files':
  //       return res.redirect('/define-red-line-boundary')
  //     default:
  //       return res.redirect('/on-site-baseline/start?error=Invalid selection')
  //   }
  // })

  // Post-intervention start page - GET
  router.get('/on-site-post-intervention/post-intervention-start', function (req, res) {
    res.redirect('/on-site-post-intervention/upload-single-file')
  })

  // Upload Single File Page - GET
  router.get('/on-site-post-intervention/upload-single-file', function (req, res) {
    res.render('on-site-post-intervention/upload-single-file', {
      error: req.query.error || null
    })
  })

  // Upload Single File Page - POST (handles GeoPackage upload)
  router.post(
    '/on-site-post-intervention/upload-single-file',
    upload.single('fileUpload'),
    async function (req, res) {
      if (!req.file) {
        return res.redirect(
          '/on-site-post-intervention/upload-single-file?error=Select a file to upload'
        )
      }

      const originalName = req.file.originalname.toLowerCase()
      if (!originalName.endsWith('.gpkg')) {
        return res.redirect(
          '/on-site-post-intervention/upload-single-file?error=Upload a GeoPackage (.gpkg) file'
        )
      }

      // Check that the file is not too large
      if (req.file.size > maxFileSizeMB * 1024 * 1024) {
        return res.redirect(
          `/on-site-post-intervention/upload-single-file?error=File is too large. Please upload a file smaller than ${maxFileSizeMB}MB`
        )
      }

      try {
        // Parse the GeoPackage file
        const gpkgData = parseGeoPackage(req.file.buffer)

        if (!gpkgData.layers || gpkgData.layers.length === 0) {
          return res.redirect(
            '/on-site-post-intervention/upload-single-file?error=No layers found in the GeoPackage file'
          )
        }

        // Store parsed data in session
        req.session.data['uploadedPostInterventionFiles'] = {
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
            `/on-site-post-intervention/upload-single-file?error=Geometries are not within England`
          )
        }

        // Commented out for user testing
        // // Check the Red Line Boundary is the same as the baseline boundary
        // if (gpkgData.geometries[boundaryLayerName].features.length !== req.session.data['geopackageGeometries'][boundaryLayerName].features.length) {
        //   return res.redirect(
        //     `/on-site-post-intervention/upload-single-file?error=The Red Line Boundary is not the same as the baseline boundary. Please upload the same boundary as the baseline.`
        //   )
        // }

        req.session.data['geopackageLayersPostIntervention'] = gpkgData.layers
        req.session.data['geopackageGeometriesPostIntervention'] = gpkgData.geometries

        // Set predefined Units values for specific parcel references
        const predefinedUnits = {
          'H2-2': 0.5,
          'H2-3': 4,
          'H1': 0.5,
          'H3': 1.09
        }
        
        // Find parcels layer and update Units property
        const parcelsLayerInfo = gpkgData.layers.find(
          (l) =>
            l.name.toLowerCase().includes('parcel') ||
            l.name.toLowerCase().includes('habitat')
        )
        
        if (parcelsLayerInfo && gpkgData.geometries[parcelsLayerInfo.name]) {
          const parcelsLayer = gpkgData.geometries[parcelsLayerInfo.name]
          if (parcelsLayer.features) {
            parcelsLayer.features.forEach((feature, index) => {
              const parcelRef = feature.properties['Parcel Ref'] || 'HP-' + (index + 1).toString().padStart(3, '0')
              if (predefinedUnits.hasOwnProperty(parcelRef)) {
                feature.properties['Units'] = predefinedUnits[parcelRef]
              }
            })
          }
        }

        // Match baseline flow: skip confirm-layers and continue directly.
        req.session.data['layersConfirmedPostIntervention'] = true
        req.session.data['redLineBoundaryPostIntervention'] = null
        req.session.data['habitatParcelsPostIntervention'] = null
        req.session.data['hedgerowsPostIntervention'] = null
        req.session.data['watercoursesPostIntervention'] = null

        res.redirect('/on-site-post-intervention/habitats-summary')
      } catch (err) {
        console.error('GeoPackage parsing error:', err)
        return res.redirect(
          '/on-site-post-intervention/upload-single-file?error=Could not read the GeoPackage file. Please check the file is valid.'
        )
      }
    }
  )

  // Confirm Layers Page - GET
  router.get('/on-site-post-intervention/confirm-layers', function (req, res) {
    // Confirm-layers is retained for compatibility, but the active flow skips it.
    if (req.session.data['layersConfirmedPostIntervention']) {
      return res.redirect('/on-site-post-intervention/habitats-summary')
    }

    const layers = req.session.data['geopackageLayersPostIntervention'] || []
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}
    //const uploadedFiles = req.session.data['uploadedFiles'] || {}

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
      ? (siteBoundary.totalAreaSqm / 10000).toFixed(4)
      : 0
    const parcelsAreaHa = habitatParcels
      ? (habitatParcels.totalAreaSqm / 10000).toFixed(4)
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

    res.render('on-site-post-intervention/confirm-layers', viewData)
  })

  // Confirm Layers Page - POST
  router.post('/on-site-post-intervention/confirm-layers', function (req, res) {
    // Mark layers as confirmed
    req.session.data['layersConfirmedPostIntervention'] = true

    // Clear hand-drawn data when confirming GeoPackage layers
    // This ensures the GeoPackage flow is used on the habitats-summary page
    req.session.data['redLineBoundaryPostIntervention'] = null
    req.session.data['habitatParcelsPostIntervention'] = null
    req.session.data['hedgerowsPostIntervention'] = null
    req.session.data['watercoursesPostIntervention'] = null

    // Redirect to habitats summary (future implementation)
    res.redirect('/on-site-post-intervention/habitats-summary')
  })

  // Habitats Summary page
  router.get('/on-site-post-intervention/habitats-summary', function (req, res) {
    // Check which flow the user came from:
    // - GeoPackage flow: layersConfirmed is true (set when user confirms uploaded layers)
    // - Drawing flow: has redLineBoundary and habitatParcels but no layersConfirmed

    const layersConfirmed = req.session.data['layersConfirmedPostIntervention']
    const hasGeoPackageData =
      req.session.data['geopackageLayersPostIntervention'] &&
      req.session.data['geopackageLayersPostIntervention'].length > 0
    const drawnBoundary = req.session.data['redLineBoundaryPostIntervention']
    const drawnParcels = req.session.data['habitatParcelsPostIntervention']

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
    // let lpaName = req.session.data['lpaName'] || ''
    // let ncaName = req.session.data['ncaName'] || ''

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
        totalAreaHectares = (totalAreaSqm / 10000).toFixed(4)
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
        totalAreaHectares = (parcelsTotalAreaSqm / 10000).toFixed(4)
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
      const layers = req.session.data['geopackageLayersPostIntervention'] || []
      const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}

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
        totalAreaHectares = (boundaryLayerInfo.totalAreaSqm / 10000).toFixed(4)
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
          let retentionCategory = feature.properties['Retention Category'] || null
          let habitat = feature.properties['Proposed Habitat Type'] || null
          let broadHabitat = feature.properties['Proposed Broad Habitat Type'] || null
          let fullHabitat = broadHabitat + ' - ' + habitat

          //let distinctiveness =
          //feature.properties['Proposed Distinctiveness'] || null
          let distinctiveness = distinctivenessCategories[fullHabitat] || null
          let condition = feature.properties['Proposed Condition'] || null

          let createdInAdvance = feature.properties['created_in_advance'] ?? feature.properties['Habitat created in advance/years'] ?? null
          let delayInStarting = feature.properties['delay_in_starting'] ?? feature.properties['Delay in starting habitat creation/years'] ?? null
          let spatialRiskCategory = feature.properties['Spatial risk category'] || null

          // Remove the number and period from the condition
          if (condition !== null) {
            condition = condition.replace(/^\d+\.\s*/, '')
          }

          // Spatial Risk is always considered as "N/A", so it doesn't affect status calculation
          if (habitat !== null && distinctiveness !== null && condition !== null && createdInAdvance !== null && delayInStarting !== null && retentionCategory !== null){
            status = 'Complete'
          }
          else if (
            habitat !== null ||
            distinctiveness !== null ||
            condition !== null ||
            createdInAdvance !== null ||
            delayInStarting !== null ||
            retentionCategory !== null
          ) {
            status = 'Incomplete'
          }


          let habitatBefore = feature.properties['Baseline Habitat Type'] || null
          let broadHabitatBefore = feature.properties['Baseline Broad Habitat Type'] || null
          let fullHabitatBefore = broadHabitatBefore + ' - ' + habitatBefore
          let conditionBefore = feature.properties['Baseline Condition'] || null
          if (conditionBefore !== null) {
            conditionBefore = conditionBefore.replace(/^\d+\.\s*/, '')
          }

          let numericDelayInStarting = null;
          let numericCreatedInAdvance = null;

          if (delayInStarting !== null) {
            if (delayInStarting === '30+') {
              numericDelayInStarting = 30;
            } else {
              const parsedDelay = Number(delayInStarting);
              numericDelayInStarting = isNaN(parsedDelay) ? null : parsedDelay;
            }
          }

          if (createdInAdvance !== null) {
            if (createdInAdvance === '30+') {
              numericCreatedInAdvance = 30;
            } else {
              const parsedAdvance = Number(createdInAdvance);
              numericCreatedInAdvance = isNaN(parsedAdvance) ? null : parsedAdvance;
            }
          }

          let units = 0

          // Incomplete rows should not attempt metric calculations.
          if (status === 'Complete') {
            try {
              if (retentionCategory === "Retained") {
                //units = getRetentionUnits(fullHabitat, areaHa, condition, fullHabitatBefore, conditionBefore)
                units = getBaselineUnits(fullHabitatBefore, areaHa, conditionBefore)
              }
              else if (retentionCategory === "Enhanced") {
                units = getEnhancementUnits(
                  fullHabitatBefore,
                  conditionBefore,
                  fullHabitat,
                  areaHa,
                  condition,
                  numericDelayInStarting,
                  numericCreatedInAdvance
                )
              }
              else if (retentionCategory === "Lost") {
                units = getCreationUnits(
                  areaHa,
                  fullHabitat,
                  condition,
                  numericDelayInStarting,
                  numericCreatedInAdvance
                )
              }
            } catch (error) {
              console.warn(
                '[PostIntervention] Skipping units calculation for parcel ' +
                  parcelId +
                  ':',
                error.message
              )
              units = 0
            }
          }

          // // Calculate units - use predefined values for specific parcel references
          // let units = 0

          // const predefinedUnits = {
          //   'H2-2': 0.5,
          //   'H2-3': 4,
          //   'H1': 0.5,
          //   'H3': 1.09
          // }
          
          // // Check if this parcel has a predefined Units value
          // if (predefinedUnits.hasOwnProperty(parcelId)) {
          //   units = predefinedUnits[parcelId]
          //   // Also update the feature property so it persists
          //   feature.properties['Units'] = units
          // } else {
          //   /*
          //   let distinctivenessScore = distinctivenessScores[distinctiveness] || 0
          //   let conditionScore = conditionScores[condition] || 0

          //   if (distinctivenessScore > 0 && conditionScore > 0) {
          //     units = areaHa * distinctivenessScore * conditionScore
          //   }
          //   */
          // }

          habitatParcels.push({
            parcelId: parcelId,
            areaHectares: areaHa.toFixed(4),
            habitatLabel: habitat,
            distinctiveness: distinctiveness,
            condition: condition,
            createdInAdvance: createdInAdvance,
            delayInStarting: delayInStarting,
            spatialRiskCategory: spatialRiskCategory,
            retentionCategory: retentionCategory,
            units: units,
            status: status
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
        hedgerows: hedgerowLayer,
        watercourses: watercourseLayer
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
      const statusText = parcel.status || ''
      let statusClass = ''
      if (statusText === 'Incomplete') {
        statusClass = 'govuk-tag--blue'
      }

      return [
        {
          html:
            '<a href="#" class="govuk-link habitat-ref-link" data-feature-type="parcel" data-feature-index="' +
            index +
            '" data-parcel-ref="' +
            parcel.parcelId +
            '">' +
            parcel.parcelId +
            '</a>'
        },
        { text: parcel.areaHectares },
        { text: parcel.habitatLabel || '' },
        { text: parcel.distinctiveness || '' },
        { text: parcel.condition || '' },
        { text: parcel.retentionCategory === 'Lost' ? 'Created' : (parcel.retentionCategory || '') },
        { text: statusText === 'Incomplete' ? '' : (parcel.units ? parcel.units.toFixed(2) : '0.00') },
        statusClass
          ? {
              html:
                '<strong class="govuk-tag ' +
                statusClass +
                '">' +
                statusText +
                '</strong>'
            }
          : { text: statusText },
        {
          html:
            '<a class="govuk-link" href="/on-site-post-intervention/habitat/' +
            encodeURIComponent(parcel.parcelId) +
            '/edit">' +
            (parcel.status === 'Complete' ? 'Edit' : parcel.status === 'Incomplete' ? 'Add details' : 'Edit') +
            '</a>'
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
        { text: feature.properties["Baseline Hedge Type"] || '' },
        { text: feature.properties["Baseline Distinctiveness"] || '' },
        { text: feature.properties["Baseline Condition"] || '' },
        { text: 'Complete' },
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
        { text: feature.properties["Baseline River Type"] || '' },
        { text: feature.properties["Baseline Distinctiveness"] || '' },
        { text: feature.properties["Baseline Condition"].replace(/^\d+\.\s*/, '') || '' },
        { text: feature.properties["Baseline Encroachment into Watercourse"] || '' },
        { text: feature.properties["Baseline Encroachment into riparian zone"].replace(/^\d+\.\s*/, '') || '' },
        { text: 'Complete' },
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



    // Build table rows for GovUK table component
    // Sum habitat parcel units for post-intervention total (only count units for Complete rows; Incomplete = 0)
    const postInterventionUnits = habitatParcels.reduce(function (sum, parcel) {
      if ((parcel.status || '') === 'Incomplete') return sum;
      const units = typeof parcel.units === 'number' ? parcel.units : 0;
      return sum + units;
    }, 0);
    const postInterventionUnitsFormatted = postInterventionUnits.toFixed(2);

    // Store post-intervention total units in session so project overview
    // can reflect that the post-intervention stage has been started/completed
    req.session.data['postInterventionUnits'] = postInterventionUnits;

    const baselineUnitsRaw = req.session.data['baselineUnits'];
    const baselineUnits =
      typeof baselineUnitsRaw === 'number'
        ? baselineUnitsRaw
        : parseFloat(baselineUnitsRaw) || 0;
    
    const netChangeValue = baselineUnits === 0
      ? 0
      : ((postInterventionUnits - baselineUnits) / baselineUnits) * 100;
    const netChange = netChangeValue.toFixed(1) + '%';
    const tradingRulesSatisfied = "No";
    
    const summary = [
      [
        { "text": "Habitat parcels" },
        { "text": baselineUnits.toFixed(2) },
        { "text": postInterventionUnitsFormatted },
        { "text": netChange },
        { "text": tradingRulesSatisfied }
      ]
    ]
    

    res.render('on-site-post-intervention/habitats-summary', {
      baselineSummary: {
        parcelCountMessage: parcelCountMessage
      },
      siteSummary: {
        totalAreaHectares: totalAreaHectares + ' hectares'
        // localPlanningAuthority: lpaName,
        // nationalCharacterArea: ncaName
      },
      mapData: mapData,
      habitatParcels: habitatParcels,
      tableRows: tableRows,
      summary: summary,
      hedgerowTableRows: hedgerowTableRows,
      watercourseTableRows: watercourseTableRows,
      actions: {
        // startPostIntervention: {
        //   url: '/on-site-post-intervention/upload-single-file'
        // }
      }
    })
  })

  // Helper function to organize habitat types by broad habitat
  function getHabitatTypesByBroadHabitat() {
    const habitatTypesByBroad = {}
    const allHabitatTypes = Object.keys(distinctivenessCategories)
    
    allHabitatTypes.forEach(habitatType => {
      if (habitatType.includes(' - ')) {
        const [broad, specific] = habitatType.split(' - ', 2)
        if (!habitatTypesByBroad[broad]) {
          habitatTypesByBroad[broad] = []
        }
        habitatTypesByBroad[broad].push(habitatType)
      }
    })
    
    return habitatTypesByBroad
  }

  // Helper function to get habitat data for a parcel
  function getHabitatData(parcelRef, req) {
    const layers = req.session.data['geopackageLayersPostIntervention'] || []
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}

    // Find parcels layer
    const parcelsLayerInfo = layers.find(
      (l) =>
        l.name.toLowerCase().includes('parcel') ||
        l.name.toLowerCase().includes('habitat')
    )

    if (!parcelsLayerInfo) {
      return null
    }

    const parcelsLayer = geometries[parcelsLayerInfo.name]
    if (!parcelsLayer || !parcelsLayer.features) {
      return null
    }

    // Find the feature by parcel ref
    let feature = null
    let featureIndex = -1
    for (let i = 0; i < parcelsLayer.features.length; i++) {
      const f = parcelsLayer.features[i]
      const ref = f.properties['Parcel Ref'] || 'HP-' + (i + 1).toString().padStart(3, '0')
      if (ref === parcelRef) {
        feature = f
        featureIndex = i
        break
      }
    }

    if (!feature) {
      return null
    }

    // Calculate area
    let areaHa = 0
    if (
      feature.geometry.type === 'Polygon' ||
      feature.geometry.type === 'MultiPolygon'
    ) {
      const areaSqm = calculatePolygonArea(feature.geometry)
      areaHa = areaSqm / 10000
    }

    // Extract properties
    const props = feature.properties
    
    // Post-intervention properties
    const habitatType = props['Proposed Habitat Type'] || ''
    const distinctiveness = props['Proposed Distinctiveness'] || ''
    let condition = props['Proposed Condition'] || ''
    
    // Remove the number and period from the condition
    if (condition) {
      condition = condition.replace(/^\d+\.\s*/, '')
    }

    // Extract broad habitat - check for separate property first, then extract from habitat type
    let broadHabitat = props['Proposed Broad Habitat Type'] || props['Broad Habitat Type'] || ''
    if (!broadHabitat && habitatType.includes(' - ')) {
      broadHabitat = habitatType.split(' - ')[0]
    }

    // Extract additional post-intervention properties
    const strategicSignificance = props['Proposed Strategic Significance'] || props['Strategic significance'] || ''
    const createdInAdvance = props['Habitat created in advance/years'] || ''
    const delayInStarting = props['Delay in starting habitat creation/years'] || ''
    const spatialRiskCategory = props['Spatial risk category'] || ''
    
    // Get Units - check predefined values first, then feature property
    const predefinedUnits = {
      'H2-2': 0.5,
      'H2-3': 4,
      'H1': 0.5,
      'H3': 1.09
    }
    let units = 0
    if (predefinedUnits.hasOwnProperty(parcelRef)) {
      units = predefinedUnits[parcelRef]
      // Ensure the feature property is set
      feature.properties['Units'] = units
    } else if (props['Units'] !== undefined && props['Units'] !== null) {
      units = parseFloat(props['Units']) || 0
    }

    return {
      feature,
      featureIndex,
      parcelRef,
      areaHa,
      broadHabitat,
      habitatType,
      distinctiveness,
      condition,
      strategicSignificance,
      createdInAdvance,
      delayInStarting,
      spatialRiskCategory,
      units,
      props
    }
  }

  // Habitat details page
  router.get('/on-site-post-intervention/habitat/:parcelRef/details', function (req, res) {
    const parcelRef = decodeURIComponent(req.params.parcelRef)
    const habitatData = getHabitatData(parcelRef, req)

    if (!habitatData) {
      return res.status(404).send('Habitat parcel not found')
    }

    // Calculate post-intervention units based on Retention Category
    const retentionCategory = habitatData.props['Retention Category'] || null
    const fullHabitatAfter = (habitatData.broadHabitat && habitatData.habitatType)
      ? habitatData.broadHabitat + ' - ' + habitatData.habitatType
      : null

    // Get baseline data
    const baselineHabitatTypeRaw = habitatData.props['Baseline Habitat Type'] || null
    const baselineBroadHabitatRaw = habitatData.props['Baseline Broad Habitat Type'] || null
    const fullHabitatBefore = (baselineBroadHabitatRaw && baselineHabitatTypeRaw)
      ? baselineBroadHabitatRaw + ' - ' + baselineHabitatTypeRaw
      : null
    let conditionBefore = habitatData.props['Baseline Condition'] || null
    if (conditionBefore !== null) {
      conditionBefore = conditionBefore.replace(/^\d+\.\s*/, '')
    }

    // Parse time values
    let numericDelayInStarting = 0
    let numericCreatedInAdvance = 0
    if (habitatData.delayInStarting) {
      if (habitatData.delayInStarting === '30+') {
        numericDelayInStarting = 30
      } else {
        const parsed = Number(habitatData.delayInStarting)
        numericDelayInStarting = isNaN(parsed) ? 0 : parsed
      }
    }
    if (habitatData.createdInAdvance) {
      if (habitatData.createdInAdvance === '30+') {
        numericCreatedInAdvance = 30
      } else {
        const parsed = Number(habitatData.createdInAdvance)
        numericCreatedInAdvance = isNaN(parsed) ? 0 : parsed
      }
    }

    // Calculate units based on retention category
    let habitatUnits = 0
    try {
      if (retentionCategory === 'Retained') {
        //habitatUnits = getRetentionUnits(fullHabitatAfter, habitatData.areaHa, habitatData.condition, fullHabitatBefore, conditionBefore)
        habitatUnits = getBaselineUnits(fullHabitatBefore, habitatData.areaHa, conditionBefore)
      } else if (retentionCategory === 'Enhanced') {
        habitatUnits = getEnhancementUnits(
          fullHabitatBefore,
          conditionBefore,
          fullHabitatAfter,
          habitatData.areaHa,
          habitatData.condition,
          numericDelayInStarting,
          numericCreatedInAdvance
        )
      } else if (retentionCategory === 'Lost') {
        habitatUnits = getCreationUnits(habitatData.areaHa, fullHabitatAfter, habitatData.condition, numericDelayInStarting, numericCreatedInAdvance)
      }
    } catch (err) {
      console.error('[PostIntervention] Error calculating units for parcel ' + habitatData.parcelRef + ':', err.message)
      habitatUnits = 0
    }

    // Build habitat object for template
    const habitat = {
      id: habitatData.parcelRef,
      broad_habitat: habitatData.broadHabitat || '',
      habitat_type: habitatData.habitatType || '',
      area_hectares: habitatData.areaHa,
      distinctiveness: habitatData.distinctiveness || '',
      condition: habitatData.condition || '',
      habitat_units: habitatUnits,
      units: habitatUnits,
      strategic_significance: habitatData.strategicSignificance || '',
      created_in_advance: habitatData.createdInAdvance || '',
      delay_in_starting: habitatData.delayInStarting || '',
      spatial_risk_category: habitatData.spatialRiskCategory || '',
      comments: habitatData.props['Comments'] || null
    }

    // Baseline properties
    const baselineHabitatType = habitatData.props['Baseline Habitat Type'] || ''
    const baselineDistinctiveness = habitatData.props['Baseline Distinctiveness'] || ''
    let baselineCondition = habitatData.props['Baseline Condition'] || ''
    
    // Remove the number and period from the baseline condition
    if (baselineCondition !== '') {
      baselineCondition = baselineCondition.replace(/^\d+\.\s*/, '')
    }

    // Extract baseline broad habitat - check for separate property first, then extract from habitat type
    let baselineBroadHabitat = habitatData.props['Baseline Broad Habitat Type'] || habitatData.props['Broad Habitat Type'] || ''
    if (!baselineBroadHabitat && baselineHabitatType.includes(' - ')) {
      baselineBroadHabitat = baselineHabitatType.split(' - ')[0]
    }
    if (!baselineBroadHabitat) {
      baselineBroadHabitat = ''
    }

    let baselineFullHabitat = baselineBroadHabitat + ' - ' + baselineHabitatType;

    let unitsLost = habitatData.props['Retention Category'] === "Lost" ? getBaselineUnits(baselineFullHabitat, habitatData.areaHa, baselineCondition) : 0;
    let areaLost = habitatData.props['Retention Category'] === "Lost" ? habitatData.areaHa.toFixed(4) : 0;

    // Build baseline object
    const baseline = {
      id: habitatData.parcelRef,
      broad_habitat: baselineBroadHabitat,
      habitat_type: baselineHabitatType,
      distinctiveness: baselineDistinctiveness,
      condition: baselineCondition,
      strategic_significance: habitatData.props['Baseline Strategic Significance'] || habitatData.props['Baseline Strategic significance'] || '',
      retention_category: habitatData.props['Retention Category'] || '',
      area_lost: areaLost,
      units_lost: unitsLost.toFixed(2),
      trading_rule: null
    }

    // Build map data for parcel preview (boundary + all parcels + highlighted parcel)
    const layers = req.session.data['geopackageLayersPostIntervention'] || []
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}
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
    const siteBoundary = boundaryLayerInfo && geometries[boundaryLayerInfo.name]
      ? geometries[boundaryLayerInfo.name]
      : null
    const allParcels = parcelsLayerInfo && geometries[parcelsLayerInfo.name]
      ? geometries[parcelsLayerInfo.name]
      : null
    const parcelFeatureCollection = {
      type: 'FeatureCollection',
      features: [habitatData.feature]
    }
    annotateParcelAdjacency(parcelFeatureCollection, {
      siteBoundary: siteBoundary || null
    })
    const mapData = {
      siteBoundary: siteBoundary || null,
      parcels: allParcels || null,
      parcel: parcelFeatureCollection
    }

    // Render template
    res.render('on-site-post-intervention/habitat-details', {
      habitat: habitat,
      baseline: baseline,
      projectName: req.session.data['projectName'] || 'On-site post-development',
      proposedStatus: 'Post-intervention',
      mapData: mapData
    })
  })

  // Habitat edit page - GET
  router.get('/on-site-post-intervention/habitat/:parcelRef/edit', function (req, res) {
    const parcelRef = decodeURIComponent(req.params.parcelRef)
    const habitatData = getHabitatData(parcelRef, req)

    if (!habitatData) {
      return res.status(404).send('Habitat parcel not found')
    }

    // Calculate post-intervention units based on Retention Category
    const retentionCategory = habitatData.props['Retention Category'] || null
    const fullHabitatAfter = (habitatData.broadHabitat && habitatData.habitatType)
      ? habitatData.broadHabitat + ' - ' + habitatData.habitatType
      : null

    // Get baseline data
    const baselineHabitatTypeRaw = habitatData.props['Baseline Habitat Type'] || null
    const baselineBroadHabitatRaw = habitatData.props['Baseline Broad Habitat Type'] || null
    const fullHabitatBefore = (baselineBroadHabitatRaw && baselineHabitatTypeRaw)
      ? baselineBroadHabitatRaw + ' - ' + baselineHabitatTypeRaw
      : null
    let conditionBefore = habitatData.props['Baseline Condition'] || null
    if (conditionBefore !== null) {
      conditionBefore = conditionBefore.replace(/^\d+\.\s*/, '')
    }

    // Parse time values
    let numericDelayInStarting = 0
    let numericCreatedInAdvance = 0
    if (habitatData.delayInStarting) {
      if (habitatData.delayInStarting === '30+') {
        numericDelayInStarting = 30
      } else {
        const parsed = Number(habitatData.delayInStarting)
        numericDelayInStarting = isNaN(parsed) ? null : parsed
      }
    }
    if (habitatData.createdInAdvance) {
      if (habitatData.createdInAdvance === '30+') {
        numericCreatedInAdvance = 30
      } else {
        const parsed = Number(habitatData.createdInAdvance)
        numericCreatedInAdvance = isNaN(parsed) ? null : parsed
      }
    }

    // Calculate units based on retention category
    let habitatUnits = 0
    try {
      if (retentionCategory === 'Retained') {
        //habitatUnits = getRetentionUnits(fullHabitatAfter, habitatData.areaHa, habitatData.condition, fullHabitatBefore, conditionBefore)
        habitatUnits = getBaselineUnits(fullHabitatBefore, habitatData.areaHa, conditionBefore)
      } else if (retentionCategory === 'Enhanced') {
        habitatUnits = getEnhancementUnits(
          fullHabitatBefore,
          conditionBefore,
          fullHabitatAfter,
          habitatData.areaHa,
          habitatData.condition,
          numericDelayInStarting,
          numericCreatedInAdvance
        )
      } else if (retentionCategory === 'Lost') {
        // habitatUnits = getCreationUnits(
        //   fullHabitatBefore,
        //   habitatData.areaHa,
        //   conditionBefore,
        //   fullHabitatAfter,
        //   habitatData.condition,
        //   numericDelayInStarting,
        //   numericCreatedInAdvance
        // )
        habitatUnits = getCreationUnits(habitatData.areaHa, fullHabitatAfter, habitatData.condition, numericDelayInStarting, numericCreatedInAdvance)
      }
    } catch (err) {
      console.error('[PostIntervention] Error calculating units for parcel ' + habitatData.parcelRef + ':', err.message)
      habitatUnits = 0
    }

    // Ensure habitat type is in full format for dropdown matching
    // Dropdown options are in format "[Broad habitat] - [Habitat type]"
    let habitatTypeForForm = habitatData.habitatType || ''
    if (habitatTypeForForm && habitatData.broadHabitat) {
      // Check if habitat type already includes the broad habitat
      const alreadyHasBroadHabitat = habitatTypeForForm.startsWith(habitatData.broadHabitat + ' - ')
      // If habitat type doesn't already include broad habitat in the correct format, construct it
      if (!alreadyHasBroadHabitat && !habitatTypeForForm.includes(' - ')) {
        habitatTypeForForm = habitatData.broadHabitat + ' - ' + habitatTypeForForm
      }
      // If it has a different broad habitat prefix, replace it with the correct one
      else if (!alreadyHasBroadHabitat && habitatTypeForForm.includes(' - ')) {
        const parts = habitatTypeForForm.split(' - ', 2)
        if (parts.length === 2) {
          habitatTypeForForm = habitatData.broadHabitat + ' - ' + parts[1]
        }
      }
    }

    // Build habitat object for template (retention_category from feature props for Intervention display)
    const retentionCategoryFromProps = (habitatData.props && habitatData.props['Retention Category']) || ''
    const rawCreatedInAdvance = habitatData.createdInAdvance
    const rawDelayInStarting = habitatData.delayInStarting
    const isEmpty = function (v) {
      return v === undefined || v === null || String(v).trim() === ''
    }
    const createdInAdvanceNum = !isEmpty(rawCreatedInAdvance) ? Number(String(rawCreatedInAdvance).trim()) : 0
    const delayInStartingNum = !isEmpty(rawDelayInStarting) ? Number(String(rawDelayInStarting).trim()) : 0
    const createdInAdvance = createdInAdvanceNum > 0 ? String(createdInAdvanceNum) : ''
    const delayInStarting = delayInStartingNum > 0 ? String(delayInStartingNum) : ''
    let advanceOrDelay = ''
    let yearsAdvance = ''
    let yearsDelay = ''
    const bothEmpty = isEmpty(rawCreatedInAdvance) && isEmpty(rawDelayInStarting)
    if (bothEmpty) {
      // No radio selected when both are empty
      advanceOrDelay = ''
    } else if (createdInAdvanceNum > 0) {
      advanceOrDelay = 'advance'
      yearsAdvance = createdInAdvance
    } else if (delayInStartingNum > 0) {
      advanceOrDelay = 'delay'
      yearsDelay = delayInStarting
    } else {
      // One or both are 0 (not empty): preselect "Neither"
      advanceOrDelay = 'neither'
    }
    const habitat = {
      ref: habitatData.parcelRef,
      id: habitatData.parcelRef,
      broad_habitat: habitatData.broadHabitat || '',
      habitat_type: habitatTypeForForm,
      area_hectares: habitatData.areaHa,
      distinctiveness: habitatData.distinctiveness || '',
      condition: habitatData.condition || '',
      target_condition: habitatData.condition || '',
      retention_category: retentionCategoryFromProps || habitatData.retentionCategory || '',
      habitat_units: habitatUnits,
      strategic_significance: habitatData.strategicSignificance || '',
      created_in_advance: createdInAdvance,
      delay_in_starting: delayInStarting,
      advance_or_delay: advanceOrDelay,
      years_advance: yearsAdvance,
      years_delay: yearsDelay,
      comments: habitatData.props['Comments'] || '',
      strategic_significance_options: STRATEGIC_SIGNIFICANCE_OPTIONS
    }

    const validationStore = req.session.data['postInterventionHabitatEditValidation'] || {}
    const validationState = validationStore[parcelRef] || null
    let validationErrors = []
    let fieldErrors = {}

    if (validationState && validationState.values) {
      const values = validationState.values

      habitat.broad_habitat = values.broad_habitat || ''
      habitat.habitat_type = values.habitat_type || ''
      habitat.strategic_significance = values.strategic_significance || ''
      habitat.target_condition = values.target_condition || ''
      habitat.advance_or_delay = values.advance_or_delay || ''
      habitat.years_advance = values.years_advance || ''
      habitat.years_delay = values.years_delay || ''
      habitat.comments = values.supporting_evidence || ''

      validationErrors = Array.isArray(validationState.errors)
        ? validationState.errors
        : []

      fieldErrors = validationErrors.reduce(function (acc, error) {
        if (error && error.field) {
          acc[error.field] = { text: error.text }
        }
        return acc
      }, {})

      delete validationStore[parcelRef]
      req.session.data['postInterventionHabitatEditValidation'] = validationStore
    }

    // Organize habitat types by broad habitat
    const habitatTypesByBroadHabitat = getHabitatTypesByBroadHabitat()

    // Build habitat type items for current broad habitat
    const currentBroadHabitat = habitat.broad_habitat
    const habitatTypeItems = currentBroadHabitat && habitatTypesByBroadHabitat[currentBroadHabitat]
      ? [{ value: '', text: 'Select' }, ...habitatTypesByBroadHabitat[currentBroadHabitat].map(ht => ({ value: ht, text: ht }))]
      : [{ value: '', text: 'Select' }]

    // Build broad habitat options (sorted) for dropdown
    const broadHabitatItems = [
      { value: '', text: 'Select' },
      ...Object.keys(habitatTypesByBroadHabitat).sort().map(b => ({ value: b, text: b }))
    ]

    // Prepare baseline data for client-side calculation
    const baselineData = {
      retentionCategory: habitatData.props['Retention Category'] || null,
      broadHabitat: habitatData.props['Baseline Broad Habitat Type'] || null,
      habitatType: habitatData.props['Baseline Habitat Type'] || null,
      condition: conditionBefore
    }

    // Build map data for parcel preview (same as habitat-details)
    const layers = req.session.data['geopackageLayersPostIntervention'] || []
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}
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
    const siteBoundary = boundaryLayerInfo && geometries[boundaryLayerInfo.name]
      ? geometries[boundaryLayerInfo.name]
      : null
    const allParcels = parcelsLayerInfo && geometries[parcelsLayerInfo.name]
      ? geometries[parcelsLayerInfo.name]
      : null
    const parcelFeatureCollection = {
      type: 'FeatureCollection',
      features: [habitatData.feature]
    }
    annotateParcelAdjacency(parcelFeatureCollection, {
      siteBoundary: siteBoundary || null
    })
    const mapData = {
      siteBoundary: siteBoundary || null,
      parcels: allParcels || null,
      parcel: parcelFeatureCollection
    }

    res.render('on-site-post-intervention/habitat-edit', {
      habitat: habitat,
      id: parcelRef,
      projectName: req.session.data['projectName'] || 'On-site post-development',
      retention_category: habitatData.retentionCategory || '',
      habitatTypesByBroadHabitat: JSON.stringify(habitatTypesByBroadHabitat),
      habitatTypeItems: habitatTypeItems,
      broadHabitatItems: broadHabitatItems,
      distinctivenessCategories: JSON.stringify(distinctivenessCategories),
      conditionScores: JSON.stringify(conditionScores),
      creationTimeToTarget: JSON.stringify(creationTimeToTarget),
      habitatDifficulty: JSON.stringify(habitatDifficulty),
      habitatDifficultyMultiplier: JSON.stringify(habitatDifficultyMultiplier),
      baselineData: JSON.stringify(baselineData),
      proposedStatus: 'Post-intervention',
      mapData: mapData,
      validationErrors: validationErrors,
      fieldErrors: fieldErrors
    })
  })

  // Habitat edit page - POST
  router.post('/on-site-post-intervention/habitat/:parcelRef/edit', function (req, res) {
    const parcelRef = decodeURIComponent(req.params.parcelRef)
    const layers = req.session.data['geopackageLayersPostIntervention'] || []
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}

    // Find parcels layer by name (parcel/habitat), or fallback: find any layer containing this parcel ref
    let parcelsLayerInfo = layers.find(
      (l) =>
        l.name.toLowerCase().includes('parcel') ||
        l.name.toLowerCase().includes('habitat')
    )
    let parcelsLayer = parcelsLayerInfo && geometries[parcelsLayerInfo.name]
      ? geometries[parcelsLayerInfo.name]
      : null

    let feature = null
    let featureIndex = -1

    if (parcelsLayer && parcelsLayer.features) {
      for (let i = 0; i < parcelsLayer.features.length; i++) {
        const f = parcelsLayer.features[i]
        const ref = f.properties['Parcel Ref'] || 'HP-' + (i + 1).toString().padStart(3, '0')
        if (ref === parcelRef) {
          feature = f
          featureIndex = i
          break
        }
      }
    }

    // Fallback: search all geometry layers for a feature with this parcel ref (e.g. if layer name has no "parcel"/"habitat")
    if (!feature && geometries && typeof geometries === 'object') {
      for (const layerName of Object.keys(geometries)) {
        const layer = geometries[layerName]
        if (!layer || !layer.features || !Array.isArray(layer.features)) continue
        for (let i = 0; i < layer.features.length; i++) {
          const f = layer.features[i]
          const ref = (f.properties && f.properties['Parcel Ref']) || 'HP-' + (i + 1).toString().padStart(3, '0')
          if (ref === parcelRef) {
            feature = f
            featureIndex = i
            parcelsLayerInfo = { name: layerName }
            parcelsLayer = layer
            break
          }
        }
        if (feature) break
      }
    }

    if (!feature) {
      return res.status(404).send('Habitat parcel not found')
    }

    const broadHabitatInput = (req.body.broad_habitat || '').trim()
    const habitatTypeInput = (req.body.habitat_type || '').trim()
    const targetConditionInput = (req.body.target_condition || '').trim()
    const advanceOrDelay = (req.body.advance_or_delay || '').trim()
    const yearsAdvanceRaw =
      req.body.years_advance !== undefined && req.body.years_advance !== null
        ? String(req.body.years_advance).trim()
        : ''
    const yearsDelayRaw =
      req.body.years_delay !== undefined && req.body.years_delay !== null
        ? String(req.body.years_delay).trim()
        : ''

    const validationErrors = []

    if (!broadHabitatInput) {
      validationErrors.push({
        text: 'Select broad habitat',
        href: '#broad_habitat',
        field: 'broad_habitat'
      })
    }

    if (!habitatTypeInput) {
      validationErrors.push({
        text: 'Select habitat type',
        href: '#habitat_type',
        field: 'habitat_type'
      })
    }

    if (!targetConditionInput) {
      validationErrors.push({
        text: 'Select target condition',
        href: '#target_condition',
        field: 'target_condition'
      })
    }

    if (!advanceOrDelay) {
      validationErrors.push({
        text: 'Select if habitat was created in advance or delayed',
        href: '#advance_or_delay',
        field: 'advance_or_delay'
      })
    }

    if (advanceOrDelay === 'advance' && !yearsAdvanceRaw) {
      validationErrors.push({
        text: 'Enter years habitat was created in advance',
        href: '#years_advance',
        field: 'years_advance'
      })
    }

    if (advanceOrDelay === 'delay' && !yearsDelayRaw) {
      validationErrors.push({
        text: 'Enter years delay in starting habitat creation',
        href: '#years_delay',
        field: 'years_delay'
      })
    }

    if (validationErrors.length > 0) {
      const validationStore =
        req.session.data['postInterventionHabitatEditValidation'] || {}

      validationStore[parcelRef] = {
        errors: validationErrors,
        values: {
          broad_habitat: req.body.broad_habitat || '',
          habitat_type: req.body.habitat_type || '',
          strategic_significance: req.body.strategic_significance || '',
          target_condition: req.body.target_condition || '',
          advance_or_delay: req.body.advance_or_delay || '',
          years_advance: req.body.years_advance || '',
          years_delay: req.body.years_delay || '',
          supporting_evidence: req.body.supporting_evidence || ''
        }
      }

      req.session.data['postInterventionHabitatEditValidation'] = validationStore
      return res.redirect(
        '/on-site-post-intervention/habitat/' +
          encodeURIComponent(parcelRef) +
          '/edit'
      )
    }

    // Update feature properties with form data
    // Save broad habitat to both possible property names to ensure it's found
    const broadHabitat = broadHabitatInput
    feature.properties['Proposed Broad Habitat Type'] = broadHabitat
    feature.properties['Broad Habitat Type'] = broadHabitat
    
    // Extract habitat type without broad habitat prefix (format: "[Broad habitat] - [Habitat type]")
    let habitatTypeToSave = habitatTypeInput
    if (habitatTypeToSave.includes(' - ')) {
      // Remove the broad habitat prefix (everything before and including " - ")
      habitatTypeToSave = habitatTypeToSave.split(' - ').slice(1).join(' - ')
    }
    feature.properties['Proposed Habitat Type'] = habitatTypeToSave
    feature.properties['Proposed Distinctiveness'] = req.body.distinctiveness || ''
    feature.properties['Proposed Condition'] = targetConditionInput
    
    // Save strategic significance to both possible property names to ensure it's found
    const strategicSignificance = req.body.strategic_significance || ''
    feature.properties['Proposed Strategic Significance'] = strategicSignificance
    feature.properties['Strategic significance'] = strategicSignificance
    // Derive advance/delay years from radio and years inputs: Neither → both 0; Advance → advance=years_advance, delay=0; Delay → advance=0, delay=years_delay
    let createdInAdvanceToSave = ''
    let delayInStartingToSave = ''
    if (advanceOrDelay === 'advance') {
      createdInAdvanceToSave = yearsAdvanceRaw !== '' ? yearsAdvanceRaw : '0'
      delayInStartingToSave = '0'
    } else if (advanceOrDelay === 'delay') {
      createdInAdvanceToSave = '0'
      delayInStartingToSave = yearsDelayRaw !== '' ? yearsDelayRaw : '0'
    } else {
      createdInAdvanceToSave = '0'
      delayInStartingToSave = '0'
    }

    feature.properties['Habitat created in advance/years'] = createdInAdvanceToSave
    feature.properties['Delay in starting habitat creation/years'] = delayInStartingToSave
    feature.properties['Comments'] = req.body.comments || ''

    // Calculate post-intervention units based on Baseline Retention Category
    const retentionCategory = feature.properties['Retention Category'] || null

    // Get area in hectares
    let areaHa = 0
    if (feature.geometry && (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon')) {
      const areaSqm = calculatePolygonArea(feature.geometry)
      areaHa = areaSqm / 10000
    }

    // Get baseline data
    const habitatBefore = feature.properties['Baseline Habitat Type'] || null
    const broadHabitatBefore = feature.properties['Baseline Broad Habitat Type'] || null
    const fullHabitatBefore = (broadHabitatBefore && habitatBefore) ? broadHabitatBefore + ' - ' + habitatBefore : null
    let conditionBefore = feature.properties['Baseline Condition'] || null
    if (conditionBefore !== null) {
      conditionBefore = conditionBefore.replace(/^\d+\.\s*/, '')
    }

    // Get post-intervention data
    // habitat_type from form is already in full format "Broad - Type" (e.g., "Grassland - Modified grassland")
    const fullHabitatAfter = req.body.habitat_type || null
    let conditionAfter = req.body.target_condition || ''
    if (conditionAfter !== '') {
      conditionAfter = conditionAfter.replace(/^\d+\.\s*/, '')
    }

    // Parse time values (use derived advance/delay values from form)
    let numericDelayInStarting = 0
    let numericCreatedInAdvance = 0
    if (delayInStartingToSave !== '') {
      if (delayInStartingToSave === '30+') {
        numericDelayInStarting = 30
      } else {
        const parsedDelay = Number(delayInStartingToSave)
        numericDelayInStarting = isNaN(parsedDelay) ? 0 : parsedDelay
      }
    }
    if (createdInAdvanceToSave !== '') {
      if (createdInAdvanceToSave === '30+') {
        numericCreatedInAdvance = 30
      } else {
        const parsedAdvance = Number(createdInAdvanceToSave)
        numericCreatedInAdvance = isNaN(parsedAdvance) ? 0 : parsedAdvance
      }
    }

    // Calculate units based on retention category
    let units = 0
    try {
      if (retentionCategory === 'Retained') {
        //units = getRetentionUnits(fullHabitatAfter, areaHa, conditionAfter, fullHabitatBefore, conditionBefore)
        units = getBaselineUnits(fullHabitatBefore, areaHa, conditionBefore)
      } else if (retentionCategory === 'Enhanced') {
        units = getEnhancementUnits(
          fullHabitatBefore,
          conditionBefore,
          fullHabitatAfter,
          areaHa,
          conditionAfter,
          numericDelayInStarting,
          numericCreatedInAdvance
        )
      } else if (retentionCategory === 'Lost') {
        // units = getCreationUnits(
        //   fullHabitatBefore,
        //   areaHa,
        //   conditionBefore,
        //   fullHabitatAfter,
        //   conditionAfter,
        //   numericDelayInStarting,
        //   numericCreatedInAdvance
        // )
        units = getCreationUnits(areaHa, fullHabitatAfter, conditionAfter, numericDelayInStarting, numericCreatedInAdvance)
        
      }
    } catch (err) {
      console.error('[PostIntervention] Error calculating units for parcel ' + parcelRef + ':', err.message)
      units = 0
    }

    // Save calculated units to feature
    feature.properties['Units'] = units

    // Save updated geometries back to session
    req.session.data['geopackageGeometriesPostIntervention'] = geometries

    // Explicitly save session to ensure data persists before redirect
    req.session.save(function (err) {
      if (err) {
        console.error('[PostIntervention] Session save error:', err)
        return res.status(500).send('Failed to save session')
      }
      res.redirect('/on-site-post-intervention/habitats-summary')
    })
  })


  // API endpoint for getting parsed geometries (for map display)
  router.get('/api/on-site-post-intervention/geometries', function (req, res) {
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}
    res.json(geometries)
  })

  // Note: API endpoint for calculating units is defined in main routes.js file
}

module.exports = { registerOnSitePostInterventionRoutes }
