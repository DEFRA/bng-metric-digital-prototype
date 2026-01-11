## Defra mapping client library (prototype)

This folder contains a reusable, BNG-agnostic mapping client implemented as a **class-based API** (no JS modules/bundlers required).

### What you get
- **OpenLayers map bootstrapping** for OS NGD vector tiles in **EPSG:27700**
- **Snapping** to OS feature geometry (via backend-proxied OGC API Features)
- **Draw/edit** a red-line boundary polygon (single polygon mode)
- **Draw/edit/select** habitat parcel polygons (multi-polygon mode)
- **Fill** selection mode (select OS polygons to build a boundary, or add parcels)
- **Slice** tool (split a boundary/parcel into two parcels)
- **Area getters** in **square meters** (clients convert to hectares etc)
- **Hooks/events** for client integration (DOM/UI is owned by the host app)

### How to include
Include the scripts in your page **in order** (example paths for Prototype Kit):

```html
<script src="/public/javascripts/defra-map-lib/event-emitter.js"></script>
<script src="/public/javascripts/defra-map-lib/geometry-validation.js"></script>
<script src="/public/javascripts/defra-map-lib/defra-map-client.js"></script>
```

You must also include OpenLayers (`ol`) and `ol-mapbox-style` (`olms`) globals, and register `EPSG:27700` via `proj4` (see existing `map-layout.html`).

### How to use

```javascript
const client = new window.DefraMapClient({
  target: 'map',
  mode: 'red-line-boundary', // or 'habitat-parcels'
  projection: 'EPSG:27700',
  tiles: {
    collectionId: 'ngd-base',
    crs: '27700',
    tileMatrixSetUrl: 'https://api.os.uk/maps/vector/ngd/ota/v1/tilematrixsets/27700',
    styleUrl: '/api/os/tiles/style/27700',
    tilesUrlTemplate: '/api/os/tiles/ngd-base/27700/{z}/{y}/{x}'
  },
  osFeatures: {
    baseUrl: '/api/os/features',
    minZoomForSnap: 14,
    fetchThrottleMs: 300,
    layers: [ /* OS collection ids to fetch for snapping */ ],
    fillPolygonLayers: [ /* OS polygon collection ids selectable in fill mode */ ]
  },
  endpoints: {
    saveBoundaryUrl: '/api/save-red-line-boundary',
    saveParcelsUrl: '/api/save-habitat-parcels'
  }
});

client.on('map:ready', () => console.log('map ready'));
client.on('boundary:changed', (e) => console.log('boundary area sqm', e.areaSqm));
client.on('parcel:selected', (e) => console.log('parcel selected', e.index));

await client.init();
```

### Events (hooks)
The library emits events via `client.on(eventName, handler)`. Common events:
- `map:ready`
- `view:changed` (zoom + snap availability)
- `osFeatures:loading`, `osFeatures:loaded`, `osFeatures:error`
- `drawing:started`, `drawing:cancelled`, `drawing:completed`
- `boundary:loaded`, `boundary:changed`, `boundary:cleared`, `boundary:saved`
- `parcels:changed`, `parcel:added`, `parcel:removed`, `parcel:changed`
- `parcel:selected`, `parcel:editStarted`, `parcel:editStopped`
- `fill:started`, `fill:selectionChanged`, `fill:confirmed`, `fill:cancelled`, `fill:message`
- `slice:started`, `slice:completed`, `slice:cancelled`, `slice:message`
- `validation:error`

### Area getters (square meters)
- `client.boundaryAreaSqm` (read-only)
- `client.parcelsTotalAreaSqm` (read-only)
- `client.getParcelAreaSqm(index)`

### Notes / constraints
- This is designed for GOV.UK Prototype Kit usage and is not production-hardened.
- The host app is responsible for DOM/UI wiring (buttons, status banners, etc).
- Backend endpoints are provided via `options.tiles`, `options.osFeatures`, and `options.endpoints`.

