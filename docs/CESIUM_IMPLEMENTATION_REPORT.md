# Cesium digital-twin pilot — implementation report

Status: ready for senior technical review. This branch must not be merged until the review is complete.

## Architecture

`MapContainer` now mounts exactly one engine at a time. Satellite mode keeps the existing Mapbox satellite-streets implementation; 3D mode mounts Cesium. Shared camera state carries latitude, longitude and approximate zoom/height across the switch. Supabase remains the system of record and no authentication, billing, unit, payment-plan or PDF subsystem was rewritten.

The Cesium scene is split into lifecycle/camera, runtime geodata, contextual city layers, project layers, interaction and admin-placement modules. Context buildings are batched by geographic chunk. Roads, water and communities are separate styleable layers. Existing project plots provide boundaries and suppress contextual buildings within client parcels. Project GLBs retain their PBR materials; `tileset.json` URLs are treated as streamable 3D Tiles.

## Files

### Added

- `src/components/map/cesium/*`: Cesium viewer, camera, scene, city, roads, water, communities, rail, POI, zones, project, interaction, clipping, tileset and placement modules.
- `src/components/map/mapTypes.ts` and `src/types/cesium.d.ts`: shared engine-neutral camera/types and Cesium base-path typing.
- `scripts/geodata/*`: download, OSM processing, layer processing, official import, metadata merge, generation and validation pipeline.
- `scripts/verify-cesium-geodata.ts`: deterministic pilot assertions.
- `public/geodata/dubai-pilot/*`: small OSM-derived Business Bay / Downtown runtime pilot.
- `docs/CESIUM_ARCHITECTURE.md`, `docs/DATA_SOURCES.md`, `docs/3D_MODEL_GUIDE.md` and this report.

### Modified

- `MapContainer.tsx`: Mapbox Satellite / Cesium 3D split and single-WebGL-context lifecycle.
- `MapboxView.tsx`, `filters.ts`: shared map types; existing Mapbox implementation retained.
- `ProjectModelUpload.tsx`, authenticated admin route: GLB/3D Tiles URL support and Cesium visual placement editor.
- `vite.config.ts`: Cesium runtime assets for Vite development and Nitro/Vercel output.
- `.env.example`, `.gitignore`, `package.json`, `package-lock.json`.

### Removed

None of the existing application systems or Mapbox layers were removed. The old Mapbox 3D code remains available in its source module but is no longer mounted as the application's 3D mode.

## Packages

Added runtime package: `cesium@1.145.0`.

Added development/pipeline packages: `vite-plugin-static-copy@4.1.1`, `osm-pbf-parser@2.3.0`, `csv-parse@7.0.2`, `@xmldom/xmldom@0.9.12`, and a direct `esbuild@0.28.2` dependency for repository scripts.

No package was intentionally removed.

## Data actually used

The committed pilot was downloaded from OpenStreetMap for `[55.255, 25.185, 55.275, 25.205]` on 2026-09-09. It contains 1,202 building footprints, 1,157 road segments, 24 bridge segments, 7 tunnel segments and 9 water features. Runtime assets total about 1.2 MB.

No Dubai Pulse source file was available, so no official Municipality building height, official community polygon or RTA major-road geometry is claimed. `Building_Summary_Information.csv`, `Community.kml` and `Major_Roads.kml` importers are ready for files supplied under `data/geodata/raw/dubai-pulse/`. Those raw paths are ignored by Git.

Height provenance in the pilot: 386 OSM `height` values, 81 estimated from OSM levels and 735 conservative type estimates. Estimated values remain marked as estimates. The community output is empty rather than fabricated.

## Database

No database migration was added. Existing `model_3d_url`, transform fields and `plot_geometry` are reused. A URL ending in `tileset.json` selects 3D Tiles; other accepted model URLs select GLB. Existing tenant isolation and RLS were not modified.

## Performance

- Cesium is lazy-loaded and Mapbox is unmounted in 3D mode, avoiding simultaneous WebGL contexts.
- Context geometry is batched per chunk and loaded from a camera-aware manifest.
- Distant chunks are released; project models are loaded only near the camera or when selected.
- 3D Tiles use mobile-sensitive cache and screen-space-error budgets.
- Mobile resolution scale, MSAA and target frame rate are capped.
- Citywide GIS processing is offline. Vercel only serves prepared, versioned runtime assets.
- The current Cesium JavaScript chunk remains large (about 4.1 MB raw / 1.1 MB gzip); it is isolated from Satellite mode by lazy loading.

## Security and configuration

New optional browser variable: `VITE_CESIUM_ION_TOKEN`. Use a public Cesium ion token restricted to approved site origins and only the required ion assets. The local OSM masterplan works without it and displays a development-safe message instead of crashing.

No service-role key, Stripe secret, Cloudinary secret or Dubai Pulse credential was added or exposed. Source acquisition scripts do not bypass protected access.

## Validation completed

Executed successfully:

```bash
git diff --check
npx tsc --noEmit
npm run lint
npm run test:unit-offers
npm run test:cesium-geodata
npm run geodata:validate
NITRO_PRESET=vercel npm run build
```

The Vercel output contains both `/cesium/Workers/createGeometry.js` and `/geodata/dubai-pilot/manifest.json`. A same-process development-server HTTP check also returned 200 for the Cesium worker and geodata manifest.

## Manual QA status

Automated compilation, tests, pipeline validation, development static-asset checks and the Vercel production build pass. Interactive browser QA could not be completed in this environment because no Chrome/Chromium binary was installed; browser installation failed due the environment's certificate/CDN timeout restrictions. Therefore visual claims such as real-device orbit behavior, final color judgement, live Supabase project interaction and sustained mobile GPU usage still require a reviewer with a browser and configured environment variables.

## Remaining issues / review gates

- Supply and license-review the three optional Dubai Pulse files before official metadata/community/RTA validation.
- Run the pilot manually in a configured browser and verify the acceptance flow end to end.
- Verify one real client GLB and one real 3D Tiles source. Plain GLB picking is project-level unless the asset exports feature metadata; tower-level feature mapping should use feature IDs/3D Tiles metadata.
- A citywide release still needs district chunk generation or hosted 3D Tiles and capacity testing; the repository intentionally contains only the pilot.
- Parks are accepted by the OSM processor but do not yet have a dedicated Cesium runtime layer.
- Review Cesium bundle size and determine whether external/runtime-hosted Cesium assets are preferable for production caching.

## Review status

STOP HERE. Do not merge into `main`. Await senior technical review and manual visual QA.
