# Contributing & Feature Guide — dubai-skyview

A practical guide for adding features to this repo without breaking the map. Read
the section for what you're building, follow the recipe, run the checks at the
bottom before you open a PR.

> Companion docs: [`architecture.md`](./architecture.md) · [`geodata.md`](./geodata.md) · [`map-performance.md`](./map-performance.md) · [`water-layer.md`](./water-layer.md)

---

## 1. Stack

| Area | Choice |
|------|--------|
| Framework | React 19 + Vite 8, SSR via TanStack Start (Nitro) |
| Routing | TanStack Router (file-based, `src/routes/`) |
| Server state | TanStack Query (`src/hooks/use-*.ts`) |
| UI state | Zustand (`src/store/filters.ts`) — single source of truth for map toggles |
| Map | Mapbox GL JS v3 (two instances: Satellite + 3D) |
| 3D | Three.js custom layers (water, station models, vehicles) |
| Data | Supabase (Postgres + RLS + Realtime) |
| Styling | Tailwind v4, Radix primitives, lucide icons, framer-motion |

## 2. Setup & commands

```bash
npm install
npm run dev                 # dev server (default :5173). For a fixed port: npx vite dev --port 8080
npm run build               # production build (must be green before PR)
npx tsc --noEmit            # type-check (must be clean before PR)
npm run lint                # eslint

# Data generators (OSM → seed SQL). Dry-run by default; --replace writes the DB.
npm run generate:schools    # / generate:hospitals / generate:roads / generate:rail / generate:water
npm run validate:water      # / validate:metro / verify:earcut
```

**Env** (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `MAPBOX_ACCESS_TOKEN`, `GOOGLE_MAPS_API_KEY`.
The live Supabase project is **`fdqbdqsmaguxdnaftxbq`**. Keep it aligned with
`supabase/config.toml` before running any database command.

## 3. How the map is wired (data flow)

```
Supabase tables ─► hooks (useProjects / usePois / useZones)  ─► React Query cache
                                                              │
Zustand store (filters.ts): mapMode, metroMode, roadsMode,   │
  activeCategories, zoneCategories, visibleProjectIds ────────┤
                                                              ▼
                                       MapContainer.tsx  (owns camera, mounts UI)
                                                              │  props
                              ┌───────────────────────────────┴───────────────┐
                              ▼                                                 ▼
                   <MapboxView mode="satellite">                    <MapboxView mode="3d">
                     one Mapbox map each; only the active mode's div is visible.
                     Custom layers added inside: roads, metro/rail, water, landmarks…
```

**Key facts to internalise before touching the map:**
- **Two `MapboxView` instances are mounted at once** (satellite + 3D); the inactive
  one is `opacity-0 pointer-events-none`. Anything you add runs on *both* maps — gate
  per-frame work with the render controller (below).
- **`src/store/filters.ts` is the single source of UI truth.** Add a toggle there,
  read it in `MapContainer`, thread it to `MapboxView` as a prop.
- **`MapContainer.tsx` owns the camera** (`camera` state + `onCameraChange`) and mounts
  the control UI (`LayersMenu`, `CategoryPanel`, popups, guides).
- Custom GL layers are (re)registered in `scheduleDeferredLayers` in `MapboxView.tsx`,
  which re-runs on every `style.load` (the guard `deferredLayersScheduledRef` resets
  there). **Mapbox wipes custom layers, sources, and `addImage` images on a style
  change — always re-register idempotently** (`if (!map.getLayer(...))`, `if (!map.hasImage(...))`).

## 4. The three ways to draw on the map — pick the right one

| Technique | Use for | Example | Cost |
|-----------|---------|---------|------|
| **GL layer** (`symbol`/`circle`/`line`/`fill`) on a GeoJSON source | Many points/lines, labels, data-driven styling, GPU collision | `landmarksLayer.ts`, `roadsLayer.ts`, metro layers | Cheapest; prefer this |
| **DOM marker** (`mapboxgl.Marker`) | A few rich/interactive HTML markers | project markers in `MapboxView.tsx` | Expensive at scale — avoid for >~50 |
| **Custom Three.js layer** (`type: "custom"`) | True 3D geometry/shaders | `WaterLayer.ts`, `StationModelLayer.ts` | Heaviest; must obey the perf rules |

**Landmarks are the reference implementation of the GL-layer pattern** — copy it.

---

## 5. Recipes

### 5a. Add a new map overlay layer (GL)
1. Create `src/components/map/<thing>Layer.ts` exporting `update<Thing>(map, data)` +
   `add<Thing>Interactions(map)`. Model it on **`landmarksLayer.ts`**: build a GeoJSON
   `FeatureCollection`, `addSource` + `addLayer` idempotently, drive visibility/data via
   `setData` / `setFilter` / `setLayoutProperty`.
2. Register it in `MapboxView.tsx` → `scheduleDeferredLayers` (next to `addStationLayers`)
   so it survives style reloads, and add a refresh `useEffect` keyed on its data prop.
3. Add a toggle: a boolean in `filters.ts`, a row in **`LayersMenu.tsx`**, and thread the
   flag through `MapContainer` → `MapboxView`.
4. Click/hover: `map.on("click", LAYER_ID, …)` reading `feature.geometry.coordinates`
   (never a captured closure — see the "correct-target click" pattern in `landmarksLayer.ts`).

### 5b. Add a new POI/places category
1. **DB:** add a Supabase table (same shape as `tourism`: `id, name, lat, lng, images, created_at`)
   via a migration in `supabase/migrations/`. Add a seed in `supabase/`.
2. **Generator** (optional, for OSM data): copy `scripts/generate-schools.ts`, adjust the
   Overpass query + filters; it writes a review JSON + seed SQL. Run `--replace` (needs the
   service-role key / Supabase SQL editor) to load the DB.
3. **Wire it:** add the category to `PoiCategory` + `POI_TABLES` (color/label) in
   `src/hooks/use-pois.ts`; add glyphs + mapping in `src/components/map/poiIcons.ts`
   (`GLYPH_PATHS`, `CATEGORY_DEFAULT`, `BY_NAME`); add a button in `CategoryPanel.tsx`.
   Rendering (dots/icons/labels/popup) is automatic via `landmarksLayer.ts`.

### 5c. Add a top-bar toggle
Add the state + setter to `filters.ts`, then a `ToggleRow` in `LayersMenu.tsx` (transit/zone
sections) — no new mount point needed. Read the flag where the layer lives.

### 5d. Add baked geodata (roads/rail/water style)
Write a `scripts/generate-*.ts` that fetches OSM (Overpass) and writes a
`src/lib/*.generated.ts`. Widen bboxes carefully — they must exceed `ZOOM_OUT_BOUNDS`
(`src/lib/dubai.ts`) or layers stop mid-map. Add a `validate:*` audit. See `geodata.md`.

### 5e. Add a page/route
Drop a file in `src/routes/` (TanStack file routing). Auth-gated pages go under
`src/routes/_authenticated/`.

### 5f. Add a moving 3D model (boat/car/plane)
Follow `StationModelLayer.ts` + the project's `map-3d-models` skill: a `type:"custom"`
Three layer, mercator-anchored, animated in a single rAF loop that **respects the render
controller** (below).

---

## 6. Performance rules (non-negotiable for map code)

1. **Custom-layer `render()` must only update shader uniforms per frame** — never rebuild
   geometry or allocate. Build geometry once in `onAdd`. (`WaterLayer.ts` is the model.)
2. **Gate every rAF / per-frame loop with the render controller** (`isActiveRef && isVisibleRef`,
   `makeRenderController()` in `MapboxView.tsx`) so the hidden 2nd map instance does no work.
3. **Pause self-driven repaint loops when idle** (see WaterLayer's `WAVE_IDLE_MS`) — don't
   `triggerRepaint` forever.
4. **Never run `queryRenderedFeatures` on a raw `mousemove`.** Throttle with rAF and query at
   most once per frame (see the roads hover in `roadsLayer.ts`).
5. **Clamp the camera on `moveend`, not `move`** — per-frame `setCenter` rubber-bands
   (`syncPanBounds` in `MapboxView.tsx`).
6. **Declutter labels** with `symbol-sort-key` + `text-padding` + `text-optional`, not by
   hiding layers (see `landmarksLayer.ts`).
7. Keep heavy static imports out of the client bundle — lazy-load (see the dev Water Editor
   and the dynamic `WaterLayer` import).

## 7. Gotchas checklist
- [ ] Runs on **both** map instances — gated the per-frame work?
- [ ] Re-registers source/layer/**images** on `style.load` (Satellite↔3D)?
- [ ] Toggle actually **removes** everything (GL layers via visibility/filter; DOM markers via `.remove()` + cleared refs)?
- [ ] DB writes hit **`fdqbdqsmaguxdnaftxbq`**, not the stale `config.toml` ref; RLS may block anon writes (use the SQL editor / service role).
- [ ] Coordinates are `[lng, lat]` for GeoJSON, and inside the Dubai bbox.
- [ ] No new unused imports/vars (`tsc` with the repo's strict settings will fail the build).

## 8. Before every PR
```bash
npx tsc --noEmit     # clean
npm run build        # green
npm run lint
npm run validate:water && npm run validate:metro && npm run verify:earcut   # if you touched geodata
```
Then **manually verify in the browser, in BOTH Satellite and 3D**: your feature works,
and there's no regression to projects, places, water, roads, metro/rail, popups, or the
Satellite↔3D toggle. Commit with a clear `type(scope): summary` message; open a PR to `main`.

## 9. Scaling recommendations (safe next steps)
These make the codebase grow gracefully — tackle when relevant, each is isolated:
- **Layer registry**: replace the hand-wired `scheduleDeferredLayers` calls with an array of
  `{ id, install(map), refresh(map, state) }` modules the scheduler iterates — adding a layer
  becomes one array entry.
- **Config-driven categories**: derive `POI_TABLES` + `CategoryPanel` + `LayersMenu` rows from
  one `layers.config.ts` so a new category is data, not code in five files.
- **Cluster dense POIs** with `supercluster` (already a dependency) at low zoom.
- **CI**: a GitHub Action running `tsc` + `build` + `lint` on every PR.
- **Split `MapboxView.tsx`** (large) into hook modules per subsystem (camera, stations, roads,
  landmarks) — it already delegates to `*Layer.ts`; finish the extraction.
- **Feature flags** for experimental layers, and a tiny map **error boundary** so one WebGL
  failure can't blank the app.
