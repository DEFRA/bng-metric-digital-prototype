//
// For guidance on how to create routes see:
// https://prototype-kit.service.gov.uk/docs/create-routes
//

// Load environment variables from .env file
require('dotenv').config()

const { ProxyAgent } = require('undici')
const govukPrototypeKit = require('govuk-prototype-kit')
const router = govukPrototypeKit.requests.setupRouter()

const multer = require('multer')
const proj4 = require('proj4')
const Database = require('better-sqlite3')
const wkx = require('wkx')

// Define British National Grid (EPSG:27700) for server-side reprojection
proj4.defs(
  'EPSG:27700',
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 ' +
    '+x_0=400000 +y_0=-100000 +ellps=airy ' +
    '+towgs84=446.448,-125.157,542.06,0.15,0.247,0.842,-20.489 ' +
    '+units=m +no_defs'
);

// Polyfill `self` for shpjs which expects a browser-like global
if (typeof globalThis.self === 'undefined') {
  globalThis.self = globalThis;
}

// Lazy-load shpjs via dynamic import to ensure we get the ESM default export
let shpPromise = null;
async function getShp() {
  if (!shpPromise) {
    shpPromise = import('shpjs').then((mod) => {
      return mod.default || mod.getShapefile || mod;
    });
  }
  return shpPromise;
}

const upload = multer({ storage: multer.memoryStorage() })

// Note: proj4 and EPSG:27700 definition kept for potential future use
// Currently, shpjs automatically converts shapefiles to WGS84 (EPSG:4326)
// and we pass this through to the frontend which handles projection to EPSG:3857 for display

// Add your routes here

// WFS API test page
router.get('/test-wfs', function (req, res) {
  res.render('test-wfs')
});

// OS API Proxy Endpoints
// These endpoints proxy requests to Ordnance Survey APIs,
// keeping the API key secure on the server side

// Tiles Style Endpoint - proxies OS NGD Vector Tile Styles API
// Supports both EPSG:27700 (British National Grid) and EPSG:3857 (Web Mercator)
router.get('/api/os/tiles/style/:crs?', async function (req, res) {
  const apiKey = process.env.OS_PROJECT_API_KEY
  
  if (!apiKey) {
    console.error('OS_PROJECT_API_KEY not found in environment variables')
    return res.status(500).json({ error: 'API key not configured' })
  }
  
  // Use EPSG:27700 (British National Grid) by default for better alignment
  // Fall back to 3857 if explicitly requested
  const crs = req.params.crs || '27700';
  const collectionId = 'ngd-base';
  const osUrl = `https://api.os.uk/maps/vector/ngd/ota/v1/collections/${collectionId}/styles/${crs}?key=${apiKey}`
  
  console.log(`Fetching style for CRS: ${crs}`);
  
  try {
    const response = await proxyFetch(osUrl, { method: 'GET' })
    
    if (!response.ok) {
      console.error(`OS NGD API error: ${response.status} ${response.statusText}`)
      const errorText = await response.text()
      console.error('Error details:', errorText)
      return res.status(response.status).json({ 
        error: 'OS NGD API request failed',
        status: response.status,
        details: errorText
      })
    }
    
    const data = await response.json()
    
    // Inject API key into tile source URLs
    if (data.sources) {
      Object.keys(data.sources).forEach(sourceKey => {
        const source = data.sources[sourceKey];
        if (source.tiles && Array.isArray(source.tiles)) {
          source.tiles = source.tiles.map(tileUrl => {
            // Add API key to tile URLs if not already present
            if (!tileUrl.includes('key=')) {
              const separator = tileUrl.includes('?') ? '&' : '?';
              return `${tileUrl}${separator}key=${apiKey}`;
            }
            return tileUrl;
          });
        }
      });
    }
    
    res.json(data)
  } catch (error) {
    console.error('Error fetching OS NGD tiles style:', error)
    res.status(500).json({ error: 'Failed to fetch tile styles' })
  }
})

// Tiles Endpoint - proxies OS NGD Vector Tile requests
// OGC API Tiles standard uses {z}/{y}/{x} order (TileMatrix/TileRow/TileCol)
// Supports optional CRS parameter: /api/os/tiles/:collection/:crs/:z/:y/:x
// Default CRS is 27700 (British National Grid) for better alignment with WFS features
router.get('/api/os/tiles/:collection/:crs/:z/:y/:x', async function (req, res) {
  const apiKey = process.env.OS_PROJECT_API_KEY
  
  if (!apiKey) {
    console.error('OS_PROJECT_API_KEY not found in environment variables')
    return res.status(500).json({ error: 'API key not configured' })
  }
  
  const { collection, crs, z, y, x } = req.params
  const osUrl = `https://api.os.uk/maps/vector/ngd/ota/v1/collections/${collection}/tiles/${crs}/${z}/${y}/${x}?key=${apiKey}`
  
  console.log(`Fetching tile: ${collection}/${crs}/${z}/${y}/${x} (CRS/TileMatrix/TileRow/TileCol)`)
  console.log(`OS URL: ${osUrl.replace(apiKey, 'REDACTED')}`)
  
  try {
    const response = await proxyFetch(osUrl, { method: 'GET' })
    
    if (!response.ok) {
      console.error(`OS NGD Tiles API error: ${response.status} ${response.statusText} for tile ${z}/${y}/${x}`)
      const errorText = await response.text()
      console.error('Error details:', errorText)
      return res.status(response.status).send('Tile not found')
    }
    
    // Get the tile data as a buffer
    // Note: Node.js fetch automatically decompresses gzip content
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    console.log(`✓ Tile fetched: ${buffer.length} bytes (decompressed)`)
    
    // Set appropriate headers for MVT
    // DO NOT set Content-Encoding - the data is already decompressed by Node.js fetch
    res.set('Content-Type', 'application/vnd.mapbox-vector-tile')
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Cache-Control', 'public, max-age=3600')
    
    res.send(buffer)
  } catch (error) {
    console.error('Error fetching OS NGD tile:', error)
    res.status(500).send('Failed to fetch tile')
  }
})

// Features Endpoint - proxies OS NGD Features API (OGC API Features)
router.get('/api/os/features/:collection/items', async function (req, res) {
  const apiKey = process.env.OS_PROJECT_API_KEY
  
  if (!apiKey) {
    console.error('OS_PROJECT_API_KEY not found in environment variables')
    return res.status(500).json({ error: 'API key not configured' })
  }
  
  const collection = req.params.collection
  
  // Build OGC API Features query parameters
  const params = new URLSearchParams({
    key: apiKey
  })
  
  // Pass through query parameters from the client
  const allowedParams = ['bbox', 'bbox-crs', 'limit', 'offset', 'crs']
  allowedParams.forEach(param => {
    if (req.query[param]) {
      params.append(param, req.query[param])
    }
  })
  
  const osUrl = `https://api.os.uk/features/ngd/ofa/v1/collections/${collection}/items?${params.toString()}`
  
  try {
    const response = await proxyFetch(osUrl, { method: 'GET' })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error(`OS NGD Features API error: ${response.status} ${response.statusText}`, errorText)
      return res.status(response.status).json({ 
        error: 'OS NGD Features API request failed',
        status: response.status,
        details: errorText
      })
    }
    
    const data = await response.json()
    res.json(data)
  } catch (error) {
    console.error('Error fetching OS NGD features:', error);
    res.status(500).json({ error: 'Failed to fetch features' });
  }
});

// Red Line Boundary API Endpoints

// Save red line boundary to session
router.post('/api/save-red-line-boundary', function(req, res) {
  req.session.data['redLineBoundary'] = req.body;
  console.log('Red line boundary saved to session');
  res.json({ success: true, redirect: '/on-site-habitat-baseline' });
});

// Get red line boundary from session
router.get('/api/red-line-boundary', function(req, res) {
  const boundary = req.session.data['redLineBoundary'] || null;
  res.json(boundary);
});

// Habitat Parcels API Endpoints

// Save habitat parcels to session
router.post('/api/save-habitat-parcels', function(req, res) {
  req.session.data['habitatParcels'] = req.body;
  console.log('Habitat parcels saved to session');
  res.json({ success: true, redirect: '/habitat-parcels-summary' });
});

// Get habitat parcels from session
router.get('/api/habitat-parcels', function(req, res) {
  const parcels = req.session.data['habitatParcels'] || null;
  res.json(parcels);
});

router.post("/api/convert", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.originalname.toLowerCase().endsWith(".zip")) {
      return res.status(400).json({ detail: "Upload must be a .zip file containing a shapefile" });
    }

    // Convert Node.js Buffer to a clean ArrayBuffer slice for shpjs
    const buffer = req.file.buffer;
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);

    const shp = await getShp();
    // shpjs automatically converts shapefiles to WGS84 (EPSG:4326)
    // Frontend will handle projection to EPSG:3857 for display on the map
    const geojson = await shp(arrayBuffer);
    if (!geojson || !geojson.features || !geojson.features.length) {
      return res.status(400).json({ detail: "No features found in the archive" });
    }

    res.json(geojson);
  } catch (err) {
    console.error(err);
    res.status(400).json({ detail: "Could not read shapefile contents" });
  }
});


async function proxyFetch(url, options) {
  const proxyUrlConfig = process.env.HTTP_PROXY

  if (!proxyUrlConfig) {
    return await fetch(url, options)
  }

  return await fetch(url, {
    ...options,
    dispatcher: new ProxyAgent({
      uri: proxyUrlConfig,
      keepAliveTimeout: 10,
      keepAliveMaxTimeout: 10
    })
  })
}

// ============================================
// On-Site Baseline Journey Routes
// ============================================

// Upload Choice Page - GET
router.get('/on-site-baseline/start', function(req, res) {
  res.render('on-site-baseline/start', {
    error: req.query.error || null
  });
});

// Upload Choice Page - POST
router.post('/on-site-baseline/start', function(req, res) {
  const uploadChoice = req.body.uploadChoice;
  
  if (!uploadChoice) {
    return res.redirect('/on-site-baseline/start?error=Select how you want to add your habitat data');
  }
  
  // Store the choice in session
  req.session.data['uploadChoice'] = uploadChoice;
  
  // Route based on selection
  switch (uploadChoice) {
    case 'single-file':
      return res.redirect('/on-site-baseline/upload-single-file');
    case 'separate-files':
      // Future implementation
      return res.redirect('/on-site-baseline/upload-boundary');
    case 'no-files':
      // Future implementation
      return res.redirect('/on-site-baseline/draw-map');
    default:
      return res.redirect('/on-site-baseline/start?error=Invalid selection');
  }
});

// Upload Single File Page - GET
router.get('/on-site-baseline/upload-single-file', function(req, res) {
  res.render('on-site-baseline/upload-single-file', {
    error: req.query.error || null
  });
});

// Upload Single File Page - POST (handles GeoPackage upload)
router.post('/on-site-baseline/upload-single-file', upload.single('fileUpload'), function(req, res) {
  if (!req.file) {
    return res.redirect('/on-site-baseline/upload-single-file?error=Select a file to upload');
  }
  
  const originalName = req.file.originalname.toLowerCase();
  if (!originalName.endsWith('.gpkg')) {
    return res.redirect('/on-site-baseline/upload-single-file?error=Upload a GeoPackage (.gpkg) file');
  }
  
  try {
    // Parse the GeoPackage file
    const gpkgData = parseGeoPackage(req.file.buffer);
    
    if (!gpkgData.layers || gpkgData.layers.length === 0) {
      return res.redirect('/on-site-baseline/upload-single-file?error=No layers found in the GeoPackage file');
    }
    
    // Store parsed data in session
    req.session.data['uploadedFiles'] = {
      habitatFile: {
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        storageKey: `upload-${Date.now()}`
      }
    };
    
    req.session.data['geopackageLayers'] = gpkgData.layers;
    req.session.data['geopackageGeometries'] = gpkgData.geometries;
    
    // Redirect to confirm page
    res.redirect('/on-site-baseline/confirm-layers');
  } catch (err) {
    console.error('GeoPackage parsing error:', err);
    return res.redirect('/on-site-baseline/upload-single-file?error=Could not read the GeoPackage file. Please check the file is valid.');
  }
});

// Confirm Layers Page - GET
router.get('/on-site-baseline/confirm-layers', function(req, res) {
  const layers = req.session.data['geopackageLayers'] || [];
  const geometries = req.session.data['geopackageGeometries'] || {};
  const uploadedFiles = req.session.data['uploadedFiles'] || {};
  
  // Find boundary and parcel layers (heuristic based on layer names)
  let siteBoundary = layers.find(l => 
    l.name.toLowerCase().includes('boundary') || 
    l.name.toLowerCase().includes('red_line') ||
    l.name.toLowerCase().includes('redline')
  ) || layers[0];
  
  let habitatParcels = layers.find(l => 
    l.name.toLowerCase().includes('parcel') || 
    l.name.toLowerCase().includes('habitat')
  ) || (layers.length > 1 ? layers[1] : layers[0]);
  
  // Calculate areas in hectares
  const boundaryAreaHa = siteBoundary ? (siteBoundary.totalAreaSqm / 10000).toFixed(2) : 0;
  const parcelsAreaHa = habitatParcels ? (habitatParcels.totalAreaSqm / 10000).toFixed(2) : 0;
  
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
      }
    },
    coverage: {
      isFull: true // Simplified for prototype
    },
    location: {
      // Mock data for prototype
      lpaName: 'South Oxfordshire District Council',
      nationalCharacterArea: '108: Upper Thames Clay Vales',
      lnrsName: 'Oxfordshire LNRS (published)'
    },
    geometries: geometries,
    boundaryLayerName: siteBoundary ? siteBoundary.name : null,
    parcelsLayerName: habitatParcels ? habitatParcels.name : null
  };
  
  res.render('on-site-baseline/confirm-layers', viewData);
});

// Confirm Layers Page - POST
router.post('/on-site-baseline/confirm-layers', function(req, res) {
  // Mark layers as confirmed
  req.session.data['layersConfirmed'] = true;
  
  // Redirect to habitats summary (future implementation)
  res.redirect('/on-site-baseline/habitats-summary');
});

// Habitats Summary placeholder page
router.get('/on-site-baseline/habitats-summary', function(req, res) {
  const layers = req.session.data['geopackageLayers'] || [];
  const uploadedFiles = req.session.data['uploadedFiles'] || {};
  
  res.render('on-site-baseline/habitats-summary', {
    layers: layers,
    uploadedFiles: uploadedFiles
  });
});

// API endpoint for getting parsed geometries (for map display)
router.get('/api/on-site-baseline/geometries', function(req, res) {
  const geometries = req.session.data['geopackageGeometries'] || {};
  res.json(geometries);
});

// ============================================
// GeoPackage Parsing Helper Function
// ============================================

function parseGeoPackage(buffer) {
  // Create a temporary file path for better-sqlite3
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  
  const tempDir = os.tmpdir();
  const tempFile = path.join(tempDir, `gpkg-${Date.now()}.gpkg`);
  
  try {
    // Write buffer to temp file
    fs.writeFileSync(tempFile, buffer);
    
    // Open the GeoPackage database
    const db = new Database(tempFile, { readonly: true });
    
    // Query gpkg_contents for available layers
    const contentsQuery = db.prepare(`
      SELECT table_name, data_type, identifier, description, srs_id
      FROM gpkg_contents
      WHERE data_type = 'features'
    `);
    const contents = contentsQuery.all();
    
    // Query gpkg_geometry_columns for geometry info
    const geomColsQuery = db.prepare(`
      SELECT table_name, column_name, geometry_type_name, srs_id
      FROM gpkg_geometry_columns
    `);
    const geomCols = geomColsQuery.all();
    
    // Create a map of geometry columns
    const geomColMap = {};
    geomCols.forEach(gc => {
      geomColMap[gc.table_name] = {
        columnName: gc.column_name,
        geometryType: gc.geometry_type_name,
        srsId: gc.srs_id
      };
    });
    
    const layers = [];
    const geometries = {};
    
    // Process each layer
    contents.forEach(layer => {
      const tableName = layer.table_name;
      const geomInfo = geomColMap[tableName];
      
      if (!geomInfo) return;
      
      const geomCol = geomInfo.columnName;
      
      // Count features and get geometries
      const countQuery = db.prepare(`SELECT COUNT(*) as count FROM "${tableName}"`);
      const countResult = countQuery.get();
      const featureCount = countResult.count;
      
      // Get all geometries from the layer
      const featuresQuery = db.prepare(`SELECT "${geomCol}" as geom FROM "${tableName}" WHERE "${geomCol}" IS NOT NULL`);
      const features = featuresQuery.all();
      
      let totalAreaSqm = 0;
      const geoJsonFeatures = [];
      
      features.forEach((row, index) => {
        if (row.geom) {
          try {
            // Parse WKB geometry using wkx
            const geomBuffer = Buffer.isBuffer(row.geom) ? row.geom : Buffer.from(row.geom);
            
            // GeoPackage uses standard WKB with optional envelope
            // Check for GeoPackage WKB header (starts with 'GP')
            let wkbBuffer = geomBuffer;
            if (geomBuffer.length > 8 && geomBuffer[0] === 0x47 && geomBuffer[1] === 0x50) {
              // GeoPackage WKB - skip the header
              const flags = geomBuffer[3];
              const envelopeType = (flags >> 1) & 0x07;
              let headerSize = 8; // Base header
              
              // Add envelope size based on type
              const envelopeSizes = [0, 32, 48, 48, 64];
              if (envelopeType > 0 && envelopeType < envelopeSizes.length) {
                headerSize += envelopeSizes[envelopeType];
              }
              
              wkbBuffer = geomBuffer.slice(headerSize);
            }
            
            const geometry = wkx.Geometry.parse(wkbBuffer);
            const geoJson = geometry.toGeoJSON();
            
            // Calculate area for polygons (rough approximation in sq meters)
            if (geoJson.type === 'Polygon' || geoJson.type === 'MultiPolygon') {
              const area = calculatePolygonArea(geoJson);
              totalAreaSqm += area;
            }
            
            geoJsonFeatures.push({
              type: 'Feature',
              properties: { index: index },
              geometry: geoJson
            });
          } catch (geomErr) {
            console.warn(`Could not parse geometry in ${tableName}:`, geomErr.message);
          }
        }
      });
      
      layers.push({
        name: tableName,
        identifier: layer.identifier || tableName,
        description: layer.description,
        geometryType: geomInfo.geometryType,
        srsId: geomInfo.srsId,
        featureCount: featureCount,
        totalAreaSqm: totalAreaSqm
      });
      
      geometries[tableName] = {
        type: 'FeatureCollection',
        features: geoJsonFeatures
      };
    });
    
    db.close();
    
    // Clean up temp file
    fs.unlinkSync(tempFile);
    
    return { layers, geometries };
    
  } catch (err) {
    // Clean up temp file on error
    try {
      require('fs').unlinkSync(tempFile);
    } catch (cleanupErr) {
      // Ignore cleanup errors
    }
    throw err;
  }
}

// Simple polygon area calculation (for projected coordinates in meters)
function calculatePolygonArea(geoJson) {
  if (geoJson.type === 'Polygon') {
    return calculateRingArea(geoJson.coordinates[0]);
  } else if (geoJson.type === 'MultiPolygon') {
    let totalArea = 0;
    geoJson.coordinates.forEach(polygon => {
      totalArea += calculateRingArea(polygon[0]);
    });
    return totalArea;
  }
  return 0;
}

function calculateRingArea(ring) {
  // Shoelace formula for polygon area
  let area = 0;
  const n = ring.length;
  
  for (let i = 0; i < n - 1; i++) {
    const j = (i + 1) % n;
    area += ring[i][0] * ring[j][1];
    area -= ring[j][0] * ring[i][1];
  }
  
  return Math.abs(area / 2);
}
