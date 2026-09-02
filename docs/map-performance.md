# Map Loading Performance Guide

## Current Performance Bottlenecks

The map loading sequence currently:
1. Loads Mapbox GL JS + styles
2. Waits for `style.load` → adds metro/train layers (vector)
3. Waits for `map.once("idle")` → adds water + 3D models (Three.js custom layers)
4. Fly-in animation (2600ms) → camera transitions

## Quick Wins to Speed Up Initial Load

### Option 1: Lazy-load 3D models (Fastest)
**Effect**: Map appears in ~1-2s instead of waiting for boats/water

Edit `src/components/map/MapboxView.tsx`, line 239:

```typescript
// BEFORE: Always add 3D models
if (mode === "3d" && show3DModelsRef.current && !map.getLayer("dubai-3d-models")) {
  map.addLayer(createModel3DLayer(MODEL_REGISTRY, renderController));
}

// AFTER: Lazy-load 3D models only after delay
setTimeout(() => {
  if (mode === "3d" && show3DModelsRef.current && !map.getLayer("dubai-3d-models")) {
    map.addLayer(createModel3DLayer(MODEL_REGISTRY, renderController));
  }
}, 1500); // Load boats after 1.5s
```

**Result**: Map visible instantly, boats fade in after fly-in completes.

---

### Option 2: Skip water layer on first load
**Effect**: Water appears after 2-3s, map tiles load faster

In `addHeavyLayers()`, gate water to load after delay:

```typescript
// Load water after a short delay to prioritize map rendering
const waterDelay = mode === "satellite" ? 2000 : 1000;
setTimeout(() => {
  if (!map.getLayer("dubai-water-3d")) {
    map.addLayer(createWaterLayer(renderController, mode));
  }
}, waterDelay);
```

---

### Option 3: Pre-cache metro/train GeoJSON
**Effect**: Instant metro line rendering (~200ms faster)

The metro lines are currently fetched on every load. Cache them:

```typescript
// src/lib/metro.ts
const METRO_CACHE = new Map<string, GeoJSON.LineString>();

export function getCachedMetroLine(lineId: string) {
  if (METRO_CACHE.has(lineId)) return METRO_CACHE.get(lineId);
  
  const line = METRO_LINES.find(l => l.id === lineId);
  if (line) METRO_CACHE.set(lineId, line.geojson);
  return line?.geojson;
}
```

---

### Option 4: Reduce Mapbox style complexity (3D mode)
**Effect**: ~500ms faster initial render

In `applyStandardConfig()`, skip non-critical recoloring:

```typescript
// Currently recolors: water, land, buildings, roads, labels
// Reduce to essential: buildings + water only
const criticalLayers = ["building", "water"];
const layer = map.getStyle().layers.find(l => criticalLayers.includes(l.id));
// ... recolor only these
```

---

### Option 5: Use `map.setStyle()` async to pre-warm cache
**Effect**: ~300ms faster style application

```typescript
// In MapboxView, before anything else:
const styleUrl = mode === "3d" 
  ? "mapbox://styles/mapbox/standard"
  : "mapbox://styles/mapbox/satellite-streets-v12";

// Pre-fetch and cache the style JSON
fetch(styleUrl).catch(() => {}); // Warm DNS cache
```

---

## Recommended Priority

| Change | Speed Gain | Difficulty | Recommendation |
|--------|-----------|-----------|-----------------|
| Lazy-load 3D models | **~1-2s** | Easy | ⭐ **Start here** |
| Skip water on first load | **~500ms** | Easy | ⭐ Do together with #1 |
| Metro GeoJSON cache | **~200ms** | Medium | Maybe later |
| Reduce style recolor | **~500ms** | Medium | Nice-to-have |
| Style pre-fetch | **~300ms** | Easy | Quick win |

---

## Implementation: Combined Fast Load (Recommended)

```typescript
// src/components/map/MapboxView.tsx, in useEffect

map.once("idle", () => {
  setMapReady(true);
  
  // Load water after 1s (let map render first)
  setTimeout(() => {
    if (!map.getLayer("dubai-water-3d")) {
      try {
        map.addLayer(createWaterLayer(renderController, mode));
        console.log("[Water] Loaded");
      } catch (err) {
        console.warn("Water load failed", err);
      }
    }
  }, 1000);

  // Load 3D models after 1.5s (after fly-in starts)
  if (mode === "3d" && show3DModelsRef.current) {
    setTimeout(() => {
      if (!map.getLayer("dubai-3d-models")) {
        try {
          map.addLayer(createModel3DLayer(MODEL_REGISTRY, renderController));
          console.log("[3D Models] Loaded");
        } catch (err) {
          console.warn("3D models load failed", err);
        }
      }
    }, 1500);
  }
});
```

**Expected result**: 
- Map visible in ~500ms (Mapbox tiles + metro lines)
- Water shimmer in ~1.5s
- Boats in ~2s (during fly-in)
- All done by ~3.5s total

---

## Monitor Performance

Use browser DevTools Performance tab:
1. Open Chrome → Right-click → Inspect
2. Go to **Performance** tab
3. Click record (⚫), reload page, stop recording
4. Look for long tasks (yellow/red bars)
5. Check if water/boats appear in expected order

---

## Further Optimization

- Reduce metro line complexity (use `simplify-geojson` npm package)
- Enable Mapbox vector tile caching (HTTPs only)
- Use WebP tiles instead of PNG (Mapbox premium)
- Defer non-critical JS (code-split routes, metro animations)
