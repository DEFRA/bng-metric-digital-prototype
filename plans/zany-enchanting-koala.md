# Plan: Server-Side Vector Tile Caching

## Problem

Every map pan/zoom fetches vector tiles through the Express proxy (`/api/os/tiles/:collection/:crs/:z/:y/:x`). Each tile request:
1. Hits the Node.js server
2. Makes an HTTP request to OS API
3. Returns the tile to the browser

When users pan back to a previously-viewed area, the same tiles are re-fetched from OS API unnecessarily.

## Solution

Add an **in-memory LRU cache** to the tile proxy endpoint. Tiles are cached by their path key (`collection/crs/z/y/x`), with a 20MB memory cap and 24-hour TTL.

**Result**: Repeat tile requests serve instantly from memory; OS API calls reduced significantly during typical pan/zoom sessions.

## Memory Safety

| Metric | Value |
|--------|-------|
| Typical tile size | 2-25 KB |
| Cache limit | 500 entries OR 20 MB (whichever hits first) |
| Worst-case memory | ~20 MB (0.5% of Node.js heap) |
| TTL | 24 hours |

## Files to Change

### 1. `package.json` — Add lru-cache dependency

```bash
npm install lru-cache
```

Adds `lru-cache` (most popular Node.js LRU implementation, zero dependencies, ~15KB).

### 2. `app/routes/os-api.js` — Add tile caching

**Add** at top of file (after imports):
```javascript
const { LRUCache } = require('lru-cache')

const tileCache = new LRUCache({
  max: 500,
  maxSize: 20_000_000, // 20MB hard cap
  sizeCalculation: (value) => value.length,
  ttl: 1000 * 60 * 60 * 24 // 24 hours
})
```

**Modify** tile endpoint (lines 77-126):
- Build cache key from params: `${collection}/${crs}/${z}/${y}/${x}`
- Check cache before fetching: `tileCache.get(cacheKey)`
- If hit: return cached buffer immediately
- If miss: fetch from OS API, store in cache, then return
- Add `X-Cache: HIT` or `X-Cache: MISS` header for debugging

**Increase** `Cache-Control` from 1 hour to 24 hours:
```javascript
res.set('Cache-Control', 'public, max-age=86400') // 24 hours
```

**Remove** verbose `console.log` statements (lines 90-93, 112) — at 20+ tiles per view, these add I/O overhead.

### No Changes Required

- Client-side code unchanged (same tile URL pattern)
- Other OS API endpoints (style, features, batch) unchanged
- No database or file storage needed

## Implementation Detail

```javascript
// Pseudocode for modified tile endpoint
router.get('/api/os/tiles/:collection/:crs/:z/:y/:x', async (req, res) => {
  const { collection, crs, z, y, x } = req.params
  const cacheKey = `${collection}/${crs}/${z}/${y}/${x}`

  // Check cache
  const cached = tileCache.get(cacheKey)
  if (cached) {
    res.set('X-Cache', 'HIT')
    res.set('Content-Type', 'application/vnd.mapbox-vector-tile')
    res.set('Cache-Control', 'public, max-age=86400')
    return res.send(cached)
  }

  // Fetch from OS API
  const buffer = await fetchFromOS(...)

  // Store in cache
  tileCache.set(cacheKey, buffer)

  res.set('X-Cache', 'MISS')
  res.set('Content-Type', 'application/vnd.mapbox-vector-tile')
  res.set('Cache-Control', 'public, max-age=86400')
  res.send(buffer)
})
```

## Verification

1. Run `npm install` to add lru-cache dependency
2. Run `npm run dev`
3. Open a map page, pan around, note tile requests in Network tab
4. Pan back to the original view
5. Check Network tab: tiles should return instantly with `X-Cache: HIT` header
6. Check server console: no OS API fetch logs for cached tiles
7. Run `npm run format:check` to verify code style
