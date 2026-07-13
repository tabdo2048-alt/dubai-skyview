# Dubai Skyview — Map Refinement Project Plan

**Goal:** Clean land/water boundaries, enhanced vessels, accurate metro network imported from a reference Google My Maps map, and a shareable way to view the result.

**Stack context:** React 19 + TanStack Start, Mapbox GL JS (custom 3D layers), Three.js (water shader + vessel models), Supabase. Water, boats, and metro are custom layers over the Mapbox basemap.

**Status legend:** Each phase notes whether it is already implemented in this codebase (✅ done) or remains open (⬜ todo).

---

## Phase 1 — Confine Water to Sea Areas ✅ done

Water rendering must never appear over land: no animated surface, no foam ribbons, no wave crests on streets or buildings.

### 1.1 Understand the water pipeline
- `src/lib/water.ts` — hand-traced water polygons (`WATER_AREAS`), each with an outer ring and optional holes, in `[lng, lat]`.
- `src/components/map/WaterLayer.ts` — Mapbox custom layer; triangulates the polygons and renders an animated Gerstner-wave surface via Three.js.
- `src/lib/mapbox/waterWaveModel.ts` — single source of truth for wave parameters; generates matching GLSL (surface) and CPU (boat buoyancy) implementations.
- `src/lib/shorelines.ts` — polylines where breaking-wave foam ribbons appear.

### 1.2 Fix water-over-land intrusions
1. Enable the built-in mask debug mode (Water Debug Editor toggles `setWaterMaskDebug(true)`) — draws outer rings cyan, holes red, mesh edges green over the satellite basemap, and logs clicked `[lng, lat]` to the console.
2. Compare every polygon edge against the satellite shoreline at zoom 14–16.
3. Where water covers land: move boundary vertices onto the true shoreline, or add hole rings for islands/peninsulas (Palm fronds, Marina piers).
4. Shore foam: clamp ribbon geometry so ribbons extend only into water — sample each ribbon vertex against the water masks (`pointInAnyLocalWaterMask`) and drop segments that fall on land.
5. Keep wave amplitude from visually spilling: crest displacement near polygon edges must stay inside the polygon (edge vertices pinned, `uIntensity` faded at boundaries).

### 1.3 Verify
- Toggle mask debug: green mesh must align with the satellite coastline everywhere.
- Zoom 10 → 17 sweep along the full coast: Marina, Palm, JBR, Creek, Business Bay canal. No white foam or animated water over land.

---

## Phase 2 — Faster, Better-Looking Boats and Ships ✅ done

### 2.1 Where vessels live
- `src/lib/mapbox/modelRegistry.ts` — vessel fleet definitions (counts, sizes, speeds, colors, per-route assignment).
- `src/lib/mapbox/Model3DLayer.ts` — Three.js instanced rendering, movement along routes, buoyancy from the shared wave model.
- `src/lib/marineRoutes.ts` + `src/lib/navigationWater.ts` — routes vessels sail, constrained to navigable water.
- `src/lib/mapbox/waterRouteGuards.ts` — validation that routes/vessels stay in water with safe clearance.

### 2.2 Speed
- Raise per-class cruise speeds in the registry (ships slowest, speedboats fastest; abras modest). Keep relative hierarchy: abra < ship < yacht < boat.
- Movement uses metres/second along route arc length — verify no frame-rate coupling (speed must come from elapsed time, not per-frame increments).

### 2.3 Appearance
- Increase hull dimensions per class so vessels read clearly at zoom 12–14.
- Improve materials: distinct hull/superstructure colors, higher contrast at distance.
- Wake effect scaled with speed (wake length/opacity proportional to velocity).
- Buoyancy: pitch/roll from `sampleWaterWave()` slopes so vessels ride the same waves the shader draws.

### 2.4 Verify
- `npm run validate:marine` — must report 0 failures (samples every route at 10 m steps, checks water containment + clearance for every vessel size). Current: 107 vessels, 33 routes, 0 failures.
- Visual: vessels never clip land, wakes trail correctly, speeds look natural.

---

## Phase 3 — Import Metro Network from Reference Map ✅ done

Source: Google My Maps “Dubai.al 2025-2030 Public Transport Scheme”
`https://www.google.com/maps/d/u/0/viewer?mid=1_gUNTCMw_3ltChX8p5DHiDTr3o3n5Pc`

### 3.1 Export the data (no manual clicking needed)
```
curl -sL "https://www.google.com/maps/d/kml?mid=1_gUNTCMw_3ltChX8p5DHiDTr3o3n5Pc&forcekml=1" -o metro-import.kml
```
KML contains folders: Red, Green, Yellow, Blue, Сyan (Cyrillic С — normalize), Pink, Etihad Rail (+ Urban Buildings / Malls folders to skip).

### 3.2 Parse and transform (importer script: `build-metro.mjs`)
1. Parse each folder’s Placemarks: `<Point>` → station (name + `[lng, lat]`), `<LineString>` → path segment.
2. **Chain segments**: each line ships as multiple broken LineStrings; join them endpoint-to-endpoint (with reversal, ~400 m snap tolerance) into continuous polylines. Disconnected corridors stay separate branches.
3. **Assign stations** to their nearest chain; order them by arc-length along the path so travel order is correct.
4. **Names**: keep real names verbatim (Burj Khalifa, Union, DMCC…); rename placeholder `Point N` stations to `<Line> Station <n>` in travel order — coordinates unchanged.
5. **Interchanges**: mark stations on 2+ lines within ~150 m as interchange.
6. Emit `src/lib/metroImported.generated.ts` — typed `MetroLine[]` with real path polylines and ordered stations. Never edit by hand; re-run the importer.

### 3.3 Wire into the app (`src/lib/metro.ts`)
- `METRO_LINES` ← imported lines; `TRAIN_LINES` ← Etihad Rail corridor.
- Add `cyan` line category + color (`#26C6DA`); categories drive legend + recoloring.
- Preserve imported KML paths — do **not** rebuild paths from station-to-station straight lines.
- Result: Red (31 + 20-station branch), Green (30), Yellow (27), Blue (25 + 4, under construction), Cyan (33 across 4 corridors), Pink (11), Etihad Rail path.

### 3.4 Verify
- `npx tsc --noEmit` clean; lint clean.
- Toggle Metro control: lines draw with correct colors, stations appear as the draw animation reaches them (`STATION_PROGRESS`), alignment matches the reference map at z12.

---

## Phase 4 — Open / Share the Result ⬜ todo (choose one)

1. **Local:** `npm run dev` → open printed URL, toggle Metro + boats.
2. **Deploy:** push to the Lovable-connected branch (auto-syncs) or `vercel deploy` (config present in `vercel.json`). Share the deployment URL — the map with all updated lines/stations is the home route.
3. Optional: add a `?metro=1` URL param that auto-enables the metro layer so shared links open with the network visible.

---

## Acceptance Checklist

- [x] No animated water or foam over land at any zoom (10–17)
- [x] Water polygon edges match satellite shoreline
- [x] Vessels: faster, larger, improved materials; validator passes (0 failures)
- [x] Metro lines + stations exactly match the reference map layout
- [x] Real path alignments (curves), not straight station connectors
- [x] `tsc` and `eslint` clean
- [ ] Deployed URL shared with metro layer visible

## Regeneration / Maintenance

- Reference map changed? Re-run: fetch KML → `node build-metro.mjs` → `tsc` → visual check.
- New water areas: trace with the Water Debug Editor click-logging, add to `WATER_AREAS`, re-check foam masks.
- New vessels/routes: edit `modelRegistry.ts` / `marineRoutes.ts`, then `npm run validate:marine` must stay at 0 failures.
