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

// Import metric calculation data
const metricCalcs = require('../lib/metric-calcs')
const distinctivenessCategories = metricCalcs.distinctivenessCategories || {}
const distinctivenesScores = metricCalcs.distinctivenesScores || {}
const conditionScores = metricCalcs.conditionScores || {}

const upload = multer({ storage: multer.memoryStorage() })

// Validation thresholds
const maxFileSizeMB = 100
const boundaryLayerName = 'Red Line Boundary'
const maxBoundaryFeatures = 10
const maxPolygonSize = 1000000000 // 1000 sq km

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
    res.render('on-site-post-intervention/post-intervention-start', {
      baselineData: req.session.data['baselineData'] || {}
    });
  });

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

        // Redirect to confirm page
        res.redirect('/on-site-post-intervention/confirm-layers')
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
    // let lpaName = req.session.data['lpaName'] || 'Not specified'
    // let ncaName = req.session.data['ncaName'] || 'Not specified'

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
          let distinctiveness =
            feature.properties['Proposed Distinctiveness'] || null
          let condition = feature.properties['Proposed Condition'] || null

          let createdInAdvance = feature.properties['Habitat created in advance/years'] || null
          let delayInStarting = feature.properties['Delay in starting habitat creation/years'] || null
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

          // Calculate units - use predefined values for specific parcel references
          let units = 0
          const predefinedUnits = {
            'H2-2': 0.5,
            'H2-3': 4,
            'H1': 0.5,
            'H3': 1.09
          }
          
          // Check if this parcel has a predefined Units value
          if (predefinedUnits.hasOwnProperty(parcelId)) {
            units = predefinedUnits[parcelId]
            // Also update the feature property so it persists
            feature.properties['Units'] = units
          } else {
            /*
            let distinctivenessScore = distinctivenessScores[distinctiveness] || 0
            let conditionScore = conditionScores[condition] || 0

            if (distinctivenessScore > 0 && conditionScore > 0) {
              units = areaHa * distinctivenessScore * conditionScore
            }
            */
          }

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
      // const hedgerowLayerInfo = layers.find(
      //   (l) =>
      //     l.name.toLowerCase().includes('hedgerow') ||
      //     l.name.toLowerCase().includes('hedge')
      // )
      // const watercourseLayerInfo = layers.find(
      //   (l) =>
      //     l.name.toLowerCase().includes('watercourse') ||
      //     l.name.toLowerCase().includes('river') ||
      //     l.name.toLowerCase().includes('stream')
      // )

      // const hedgerowLayer = hedgerowLayerInfo
      //   ? geometries[hedgerowLayerInfo.name]
      //   : null
      // const watercourseLayer = watercourseLayerInfo
      //   ? geometries[watercourseLayerInfo.name]
      //   : null

      // Prepare map data
      mapData = {
        siteBoundary: boundaryLayer,
        parcels: parcelsLayer
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
            '" data-parcel-ref="' +
            parcel.parcelId +
            '">' +
            parcel.parcelId +
            '</a>'
        },
        { text: parcel.areaHectares },
        { text: parcel.habitatLabel || 'Not specified' },
        { text: parcel.distinctiveness || 'Not specified' },
        { text: parcel.condition || 'Not specified' },
        { text: parcel.retentionCategory || 'Not specified' },
        { text: parcel.units ? parcel.units.toFixed(2) : '0.00' },
        { text: parcel.status },
        {
          html:
            '<a class="govuk-link" href="/on-site-post-intervention/habitat/' +
            encodeURIComponent(parcel.parcelId) +
            '/details">' +
            (parcel.status === 'Complete' ? 'View' : parcel.status === 'Incomplete' ? 'Add details' : 'Edit') +
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
        { text: feature.properties["Baseline Hedge Type"] || 'Not specified' },
        { text: feature.properties["Baseline Distinctiveness"] || 'Not specified' },
        { text: feature.properties["Baseline Condition"] || 'Not specified' },
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
        { text: feature.properties["Baseline River Type"] || 'Not specified' },
        { text: feature.properties["Baseline Distinctiveness"] || 'Not specified' },
        { text: feature.properties["Baseline Condition"].replace(/^\d+\.\s*/, '') || 'Not specified' },
        { text: feature.properties["Baseline Encroachment into Watercourse"] || 'Not specified' },
        { text: feature.properties["Baseline Encroachment into riparian zone"].replace(/^\d+\.\s*/, '') || 'Not specified' },
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
   const summary = [
      [
        {"text": "Habitat parcels"},
        {"text": "5.67"},
        {"text": "6.09"},
        {"text": "7.5%"},
        {"text": "No"}
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

    // Use Units from habitatData (which includes predefined values)
    let habitatUnits = habitatData.units || 0

    // Build habitat object for template
    const habitat = {
      id: habitatData.parcelRef,
      broad_habitat: habitatData.broadHabitat || 'Not specified',
      habitat_type: habitatData.habitatType || 'Not specified',
      area_hectares: habitatData.areaHa,
      distinctiveness: habitatData.distinctiveness || 'Not specified',
      condition: habitatData.condition || 'Not specified',
      habitat_units: habitatUnits,
      units: habitatUnits,
      strategic_significance: habitatData.strategicSignificance || 'Not specified',
      created_in_advance: habitatData.createdInAdvance || 'Not specified',
      delay_in_starting: habitatData.delayInStarting || 'Not specified',
      spatial_risk_category: habitatData.spatialRiskCategory || 'Not specified',
      comments: habitatData.props['Comments'] || null
    }

    // Baseline properties
    const baselineHabitatType = habitatData.props['Baseline Habitat Type'] || 'Not specified'
    const baselineDistinctiveness = habitatData.props['Baseline Distinctiveness'] || 'Not specified'
    let baselineCondition = habitatData.props['Baseline Condition'] || 'Not specified'
    
    // Remove the number and period from the baseline condition
    if (baselineCondition !== 'Not specified') {
      baselineCondition = baselineCondition.replace(/^\d+\.\s*/, '')
    }

    // Extract baseline broad habitat - check for separate property first, then extract from habitat type
    let baselineBroadHabitat = habitatData.props['Baseline Broad Habitat Type'] || habitatData.props['Broad Habitat Type'] || ''
    if (!baselineBroadHabitat && baselineHabitatType.includes(' - ')) {
      baselineBroadHabitat = baselineHabitatType.split(' - ')[0]
    }
    if (!baselineBroadHabitat) {
      baselineBroadHabitat = 'Not specified'
    }

    // Build baseline object
    const baseline = {
      id: habitatData.parcelRef,
      broad_habitat: baselineBroadHabitat,
      habitat_type: baselineHabitatType,
      distinctiveness: baselineDistinctiveness,
      condition: baselineCondition,
      strategic_significance: habitatData.props['Baseline Strategic Significance'] || habitatData.props['Baseline Strategic significance'] || 'Not specified',
      retention_category: habitatData.props['Retention Category'] || 'Not specified',
      area_lost: null,
      units_lost: null,
      trading_rule: null
    }

    // Render template
    res.render('on-site-post-intervention/habitat-details', {
      habitat: habitat,
      baseline: baseline,
      projectName: req.session.data['projectName'] || 'On-site post-development',
      proposedStatus: 'Post-intervention'
    })
  })

  // Habitat edit page - GET
  router.get('/on-site-post-intervention/habitat/:parcelRef/edit', function (req, res) {
    const parcelRef = decodeURIComponent(req.params.parcelRef)
    const habitatData = getHabitatData(parcelRef, req)

    if (!habitatData) {
      return res.status(404).send('Habitat parcel not found')
    }

    // Use Units from habitatData (which includes predefined values)
    // If not predefined, calculate based on distinctiveness, condition, and area
    let habitatUnits = habitatData.units || 0
    if (habitatUnits === 0) {
      const dScore = distinctivenesScores[habitatData.distinctiveness]?.Score || 0
      const cScore = conditionScores[habitatData.condition] || 0
      const strategicMultiplier = 1 // TODO: Get from strategic significance multiplier
      if (dScore > 0 && cScore > 0) {
        habitatUnits = habitatData.areaHa * dScore * cScore * strategicMultiplier
      }
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

    // Build habitat object for template
    const habitat = {
      ref: habitatData.parcelRef,
      id: habitatData.parcelRef,
      broad_habitat: habitatData.broadHabitat || '',
      habitat_type: habitatTypeForForm,
      area_hectares: habitatData.areaHa,
      distinctiveness: habitatData.distinctiveness || '',
      condition: habitatData.condition || '',
      habitat_units: habitatUnits,
      strategic_significance: habitatData.strategicSignificance || '',
      created_in_advance: habitatData.createdInAdvance || '',
      delay_in_starting: habitatData.delayInStarting || '',
      comments: habitatData.props['Comments'] || ''
    }

    // Organize habitat types by broad habitat
    const habitatTypesByBroadHabitat = getHabitatTypesByBroadHabitat()

    // Build habitat type items for current broad habitat
    const currentBroadHabitat = habitat.broad_habitat
    const habitatTypeItems = currentBroadHabitat && habitatTypesByBroadHabitat[currentBroadHabitat]
      ? [{ value: '', text: 'Select' }, ...habitatTypesByBroadHabitat[currentBroadHabitat].map(ht => ({ value: ht, text: ht }))]
      : [{ value: '', text: 'Select' }]

    // Prepare metric lookups for client-side calculation
    const metricLookups = {
      distinctivenessScores: Object.keys(distinctivenesScores).reduce((acc, key) => {
        acc[key] = distinctivenesScores[key].Score
        return acc
      }, {}),
      conditionScores: conditionScores,
      strategicMultipliers: {
        'Formally identified in local strategy': 1.2,
        'Location ecologically desirable but not in local strategy': 1.1,
        'Area/compensation not in local strategy/ no local strategy': 1
      }
    }

    res.render('on-site-post-intervention/habitat-edit', {
      habitat: habitat,
      id: parcelRef,
      habitatTypesByBroadHabitat: JSON.stringify(habitatTypesByBroadHabitat),
      habitatTypeItems: habitatTypeItems,
      metricLookups: JSON.stringify(metricLookups),
      proposedStatus: 'Post-intervention'
    })
  })

  // Habitat edit page - POST
  router.post('/on-site-post-intervention/habitat/:parcelRef/edit', function (req, res) {
    const parcelRef = decodeURIComponent(req.params.parcelRef)
    const layers = req.session.data['geopackageLayersPostIntervention'] || []
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}

    // Find parcels layer
    const parcelsLayerInfo = layers.find(
      (l) =>
        l.name.toLowerCase().includes('parcel') ||
        l.name.toLowerCase().includes('habitat')
    )

    if (!parcelsLayerInfo) {
      return res.status(404).send('Parcels layer not found')
    }

    const parcelsLayer = geometries[parcelsLayerInfo.name]
    if (!parcelsLayer || !parcelsLayer.features) {
      return res.status(404).send('Parcels data not found')
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
      return res.status(404).send('Habitat parcel not found')
    }

    // Update feature properties with form data
    // Save broad habitat to both possible property names to ensure it's found
    const broadHabitat = req.body.broad_habitat || ''
    feature.properties['Proposed Broad Habitat Type'] = broadHabitat
    feature.properties['Broad Habitat Type'] = broadHabitat
    
    // Extract habitat type without broad habitat prefix (format: "[Broad habitat] - [Habitat type]")
    let habitatTypeToSave = req.body.habitat_type || ''
    if (habitatTypeToSave.includes(' - ')) {
      // Remove the broad habitat prefix (everything before and including " - ")
      habitatTypeToSave = habitatTypeToSave.split(' - ').slice(1).join(' - ')
    }
    feature.properties['Proposed Habitat Type'] = habitatTypeToSave
    feature.properties['Proposed Distinctiveness'] = req.body.distinctiveness || ''
    feature.properties['Proposed Condition'] = req.body.condition || ''
    
    // Save strategic significance to both possible property names to ensure it's found
    const strategicSignificance = req.body.strategic_significance || ''
    feature.properties['Proposed Strategic Significance'] = strategicSignificance
    feature.properties['Strategic significance'] = strategicSignificance
    
    feature.properties['Habitat created in advance/years'] = req.body.created_in_advance || ''
    feature.properties['Delay in starting habitat creation/years'] = req.body.delay_in_starting || ''
    feature.properties['Comments'] = req.body.comments || ''

    // Save updated geometries back to session
    req.session.data['geopackageGeometriesPostIntervention'] = geometries

    // Explicitly save session to ensure data persists before redirect
    req.session.save(function (err) {
      if (err) {
        console.error('[PostIntervention] Session save error:', err)
        return res.status(500).send('Failed to save session')
      }
      // Redirect back to details page
      res.redirect('/on-site-post-intervention/habitat/' + encodeURIComponent(parcelRef) + '/details')
    })
  })


  // API endpoint for getting parsed geometries (for map display)
  router.get('/api/on-site-post-intervention/geometries', function (req, res) {
    const geometries = req.session.data['geopackageGeometriesPostIntervention'] || {}
    res.json(geometries)
  })
}

module.exports = { registerOnSitePostInterventionRoutes }
