# dubai-skyview — Session Handoff

Point a new chat at this file to continue. It captures project state + what was done + what's open.

## Project
Luxury 3D Dubai real-estate map. Stack: React + Vite + **TanStack Start (SSR/nitro)**, **Mapbox GL v3**, **Three.js** (custom animated water layer), **Supabase** (POI + zones + projects), **Zustand** store, **TanStack Query**.

- **Branch:** `water-osm-rebuild` · **Remote:** github.com/tabdo2048-alt/dubai-skyview
- **Run:** `npm run dev -- --port 8080 --host` — SSR cold start ~1–2 min; the Three.js water build freezes the first ~40–60s of interaction on load.
- **Typecheck:** `npx tsc --noEmit` (~3–5 min, slow). **Pre-commit hook is slow (~2 min)** — commit via background + poll.

## Key files
- `src/components/map/MapboxView.tsx` — map init, bounds/opening, **landmark chip markers**, metro/train, style setup.
- `src/components/map/WaterLayer.ts` — Three.js animated water (heaviest thing; load-freeze source).
- `src/components/map/roadsLayer.ts` — coloured signature roads.
- `src/components/map/poiIcons.ts` — landmark glyph registry + `iconFor()`.
- `src/components/map/MapContainer.tsx` — composes map + panels (CategoryPanel now removed).
- `src/lib/dubai.ts` — bounds constants. `src/lib/zones.ts` — RY/FLIP/HH zones.
- `src/hooks/use-pois.ts` — POI query (tourism/schools/hospitals).
- `src/routes/_authenticated/admin.tsx` — admin CRUD (places live here).
- `src/components/map/CategoryPanel.tsx` — **now orphaned** (removed from public map; safe to delete).

## Done this session (commits on `water-osm-rebuild`)
- **Bounds/opening:** opening frames **Dubai only** (`DUBAI_BOUNDS`), pan borders reach **Ghantoot (W) → Umm Al Quwain (NE)** (`MAP_MAX_BOUNDS`), zoom-out widened to the water-mesh `SEA_COVER` limit (`ZOOM_OUT_BOUNDS`). Opening fit is gated on a real container size (was locking a wrong 0×0 fit).
- **Landmark markers REBUILT from scratch** (LANDMARK_CHIPS spec): glass squircle chip, category-colour ring, **distinct lucide line-art glyph per place** via `iconFor()`. **Phantom hit area made structurally impossible**: root `pointer-events:none`, only the 38px chip interactive, label absolutely positioned + non-interactive. Dropped old logo/photo/hero/ping/hover-popup.
- **Multi-category works together:** `use-pois` uses `keepPreviousData` + `Promise.allSettled` (no flash-off on toggle; one failing category can't drop the others).
- **Water:** satellite → bright azure, opacity 0.42; **shore ribbons cut 9→5** (load-perf).
- **Roads:** added mint (`Al Wasl` — placeholder) + orange (`Al Yalayis St`).
- **FLIP↔HH swapped** (label/colour/caption) in `zones.ts` + `MapContainer`.
- **Places removed from the PUBLIC map** (CategoryPanel dropped from MapContainer); still managed in **admin**.
- `getStyle()` consolidated to one snapshot per `style.load`.

## Open / pending
1. **Site slowness (main issue):** the Three.js water build (satellite shore geometry + open-sea subdivision) blocks the main thread ~40–60s on load; heap ~790 MB. Ribbons were reduced this session. Deeper fix = dynamic **vector-tile water** (see `UNBOUNDED_MAP_DYNAMIC_WATER_PROMPT`, deferred because user wanted a *bounded* Dubai map) or reduce `openSea` subdivision levels in `buildWaterGeometry`.
2. **Phantom-hit-area LIVE proof** (`elementsFromPoint` ring test) was never run — the Chrome extension was unreliable all session. Structure guarantees zero phantom, but it's not empirically confirmed.
3. **Road 1 real name** ("AL alfy") still unknown — mint road is a placeholder (`Al Wasl`). Swap the `match` regex in `roadsLayer.ts` when known.
4. **Popup description** field for landmarks — needs a Supabase `description` column + admin input; not done.
5. **`.env` push was blocked** by the safety classifier. It holds only client/publishable keys (Mapbox public token, Supabase publishable/anon key + URL, Google Maps key, `VITE_*`). If pushing it: **ensure the Google Maps key is domain-restricted** first (permanent in git history).

## Environment quirks
- Chrome extension (browser automation) is **flaky**: screenshots/CDP freeze while the water build runs; use lightweight JS probes when responsive; tab ids churn between calls (re-read `tabs_context`).
- Verify visually via the live app — user watches the screen and confirms per step.
