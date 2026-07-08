# Water Customization Guide

## Overview

This guide explains how to customize water appearance in both **Satellite** and **3D modes**, and how to add the same Three.js water shimmer effect to Satellite mode for consistency.

---

## Part 1: Change Water Color in Satellite Mode

### Current Setup

In Satellite mode, the map uses Mapbox's `satellite-streets-v12` style, which includes native satellite imagery. The water color is embedded in this style and controlled via Mapbox's style properties.

### How to Change Water Color in Satellite

Edit **`src/components/map/MapboxView.tsx`** in the `addHeavyLayers()` function or the style.load handler:

#### Option A: Via Mapbox Style (Recommended for Satellite)

In the `style.load` event handler (around line 91-122), add code to modify the water layer color:

```typescript
// In style.load event handler
map.on("style.load", () => {
  // ... existing code ...
  
  // Change satellite water color
  if (mode === "satellite") {
    try {
      // Find and recolor the native water layer in satellite-streets style
      const waterLayers = map.getStyle().layers.filter(l => l.id.includes("water"));
      waterLayers.forEach(layer => {
        if (layer.type === "fill" && layer.paint) {
          // Change to your desired color (hex or RGB)
          map.setPaintProperty(layer.id, "fill-color", "#1e90ff"); // Example: Dodger blue
        }
      });
    } catch (err) {
      console.warn("Failed to recolor satellite water", err);
    }
  }
});
```

#### Option B: Via Environment Variable

1. Add a new environment variable in `.env`:
   ```
   VITE_WATER_COLOR_SATELLITE=#1e90ff
   ```

2. Update `MapboxView.tsx`:
   ```typescript
   const waterColorSatellite = import.meta.env.VITE_WATER_COLOR_SATELLITE || "#1e90ff";
   
   // In style.load:
   map.setPaintProperty("water-layer-id", "fill-color", waterColorSatellite);
   ```

#### Available Water Layer Names (Satellite)

Mapbox `satellite-streets-v12` uses these common water layer IDs:
- `water` (main ocean/water)
- `water-shadow` (depth effect)

Use `map.getStyle().layers` to inspect all available layers.

---

## Part 2: Add Three.js Water Shimmer to Satellite Mode

### Current State

- **3D mode**: Has Three.js water shimmer overlay (cyan #BEEFFF, additive blending, 0.22 opacity)
- **Satellite mode**: Uses native Mapbox water (no Three.js overlay)

### Goal

Render the same Three.js water shimmer effect in Satellite mode for visual consistency.

### Implementation

The water layer is **already enabled in both modes**. It's added in `addHeavyLayers()` without mode gating:

```typescript
// src/components/map/MapboxView.tsx, line 232-238
if (!map.getLayer("dubai-water-3d")) {
  try {
    map.addLayer(createWaterLayer(renderController)); // Runs in BOTH modes
  } catch (err) {
    console.error("Failed to add water shimmer layer", err);
  }
}
```

The water shimmer already renders in **both Satellite and 3D modes**.

### To Adjust Water Shimmer in Satellite

Edit **`src/components/map/WaterLayer.ts`** (lines 131-138) to customize the shimmer for Satellite:

```typescript
// Current settings (work for both modes)
uniforms: {
  uTime: { value: 0 },
  uShimmer: { value: new THREE.Color(0xbeefff) },     // Cyan highlight
  uDistortion: { value: 0.25 },                        // Wave sharpness
  uOpacity: { value: 0.22 },                           // Transparency (0.12-0.22 range)
},
```

#### Customization Options

| Property | Range | Effect | Example |
|----------|-------|--------|---------|
| `uShimmer` | Any hex color | Shimmer highlight tint | `0xbeefff` (cyan), `0x87ceeb` (sky blue) |
| `uOpacity` | 0.12 - 0.22 | Overall shimmer strength | Increase for visible shimmer, decrease for subtle effect |
| `uDistortion` | 0.15 - 0.35 | Wave line sharpness | Higher = thinner, brighter lines |

#### Example: Make Water Shimmer More Orange-ish

```typescript
uShimmer: { value: new THREE.Color(0xffa500) },  // Orange
uOpacity: { value: 0.25 },                        // Slightly stronger
```

#### Example: Make Water Shimmer More Subtle (Better for Satellite)

```typescript
uShimmer: { value: new THREE.Color(0xb0e0e6) },  // Powder blue
uOpacity: { value: 0.15 },                        // More transparent
```

### To Use Different Shimmer in Satellite vs 3D

Modify the `createWaterLayer()` function to accept mode as parameter:

```typescript
// src/components/map/WaterLayer.ts
export function createWaterLayer(
  controller?: { shouldRender: () => boolean },
  mode: "satellite" | "3d" = "3d"
): mapboxgl.CustomLayerInterface {
  // ... existing code ...
  
  // In makeWaterMaterial():
  const opacityValue = mode === "satellite" ? 0.15 : 0.22;
  const shimmerColor = mode === "satellite" ? 0xa0c4ff : 0xbeefff;
  
  uniforms: {
    uTime: { value: 0 },
    uShimmer: { value: new THREE.Color(shimmerColor) },
    uDistortion: { value: 0.25 },
    uOpacity: { value: opacityValue },
  },
}
```

Then update the call in `MapboxView.tsx`:

```typescript
// Line 234
map.addLayer(createWaterLayer(renderController, mode));
```

---

## Part 3: Verify Changes

### In the Browser

1. **Satellite Mode**: Switch to Satellite view and look for the cyan shimmer overlay on water areas (Marina, Palm, Creek, etc.)
2. **3D Mode**: Switch to 3D View and confirm the shimmer appears the same
3. **Zoom & Pan**: Water shimmer should move smoothly as you navigate

### Console Logs

If water layer loads successfully, you should see no errors. To debug, add temporary logs:

```typescript
// In MapboxView.tsx, addHeavyLayers()
console.log("[Water] Layer added:", map.getLayer("dubai-water-3d") ? "✓" : "✗");
```

### Performance Impact

The Three.js water shimmer uses:
- **One geometry per water basin** (not per frame)
- **Additive blending** (no opaque fill)
- **Render gating** (pauses when tab is hidden)
- **Minimal overhead** (~1-2ms per frame)

---

## FAQ

**Q: Why does water look different in Satellite vs 3D?**
A: Satellite uses real photo tiles (flat), while 3D uses vector fills. The Three.js shimmer is the same in both, but the base water layer differs.

**Q: Can I make the shimmer stronger in Satellite?**
A: Yes, increase `uOpacity` from 0.22 to 0.3 (though higher values may look artificial over photos).

**Q: How do I disable the shimmer in Satellite only?**
A: Add a condition in `addHeavyLayers()`:
```typescript
if (mode === "3d" && !map.getLayer("dubai-water-3d")) {
  map.addLayer(createWaterLayer(renderController, mode));
}
```

**Q: Can I animate the shimmer differently?**
A: Yes, modify the shader in `WATER_FRAGMENT` (line 83-118) to adjust wave speed, frequency, or intensity.

---

## Files Modified

- `src/components/map/WaterLayer.ts` — Shimmer color, opacity, distortion
- `src/components/map/MapboxView.tsx` — Water layer toggle (mode-gated or not)
- `.env` — Optional environment variables for colors

---

## Further Reading

- [Mapbox GL Style Spec](https://docs.mapbox.com/mapbox-gl-js/style-spec/)
- [Three.js Custom Layers](https://docs.mapbox.com/mapbox-gl-js/api/map/#addlayer)
- GLSL Shader Reference (in `WaterLayer.ts`, lines 70-118)
