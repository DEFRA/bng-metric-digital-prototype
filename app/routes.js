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

// Configure multer with 50MB file size limit
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB in bytes
  }
})

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

// Validate polygon is within England using ArcGIS REST service
router.post("/api/validate-england", async (req, res) => {
  try {
    const { geometry } = req.body; // Esri JSON geometry object
    
    if (!geometry || !geometry.rings) {
      return res.status(400).json({ 
        valid: false, 
        error: "Invalid geometry format. Expected Esri JSON format." 
      });
    }

    // ArcGIS REST query endpoint
    //const arcgisUrl = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Countries_December_2022_GB_BFE/FeatureServer/0/query';
    const arcgisUrl = 'https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Countries_December_2024_Boundaries_UK_BFE/FeatureServer/0/query';

    // Build POST body with form-encoded data
    const formData = new URLSearchParams();
    //formData.append('where', "CTRY24NM = 'England'");
    //formData.append('layerDefs', '%7B%220%22%3A%22CTRY24NM%3D%27England%27%22%7D');
    formData.append('layerDefs', '{"0":"CTRY24NM=\'England\'"}');
    formData.append('geometry', JSON.stringify(geometry));
    formData.append('geometryType', 'esriGeometryPolygon');
    formData.append('spatialRel', 'esriSpatialRelIntersects');
    formData.append('resultType', 'standard');
    formData.append('featureEncoding', 'esriDefault');
    formData.append('applyVCSProjection', 'false');
    formData.append('returnCountOnly', 'true');
    formData.append('f', 'json');

    const response = await proxyFetch(arcgisUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    });

    if (!response.ok) {
      console.error(`ArcGIS API error: ${response.status} ${response.statusText}`);
      const errorText = await response.text();
      console.error('Error details:', errorText);
      return res.status(500).json({ 
        valid: false, 
        error: 'Error validating polygon with England boundary service.' 
      });
    }

    const data = await response.json();
    
    // Check if there's an error in the response
    if (data.error) {
      console.error('ArcGIS API returned error:', data.error);
      return res.status(500).json({ 
        valid: false, 
        error: 'Error validating polygon: ' + (data.error.message || 'Unknown error')
      });
    }

    // If count > 0, the polygon intersects with England
    const count = data.count || 0;
    const isValid = count > 0;

    res.json({ 
      valid: isValid, 
      count: count,
      error: isValid ? null : 'The uploaded boundary does not intersect with England. Please upload a boundary that is within England.'
    });
  } catch (error) {
    console.error('Error validating polygon within England:', error);
    res.status(500).json({ 
      valid: false, 
      error: 'Error validating polygon: ' + error.message 
    });
  }
});

router.post("/api/convert", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      // Handle multer errors, including file size limit
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ detail: "File size exceeds the maximum allowed size of 50MB" });
      }
      return res.status(400).json({ detail: "File upload error: " + err.message });
    }
    next();
  });
}, async (req, res) => {
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
