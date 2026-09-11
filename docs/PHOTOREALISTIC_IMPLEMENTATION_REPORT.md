# Photorealistic building-insert implementation report

Status: code implementation prepared for technical review; **visual acceptance blocked and incomplete**. No merge or production deployment performed.

Branch: `codex/google-photorealistic-building-inserts`.
Base: local current work through `9bae6f9` (includes prior satellite-hybrid and water work). GitHub `main` was verified at `c2a1d0827cea5b138498482d77061dff495e218a` before implementation.
Commit: see the branch commit that adds this report (`git log -1 --format=%H`).

## Changes

- `CesiumPhotorealisticCity.ts`: one official Google/ion city source, explicit feature flag, bounded cache, readiness/error handling and fallback.
- `CesiumBuildingInserts.ts`, `CesiumProjectClipping.ts`: validated and buffered parcel clipping, concavity/holes, only while developer resources are ready and visible.
- `CesiumProjectLayer.ts`: remove pre-existing selection/load recursion; add two-request concurrency, caps, hysteresis, readiness gating, stale-load cleanup and retry backoff.
- `CesiumTilesetManager.ts`: pending request deduplication/invalidation, hidden preloading, bounded caches and late-result disposal.
- `projectModelTransforms.ts`: shared local/ECEF developer tileset placement convention and URL type detection.
- `photorealisticConfig.ts`: public configuration parsing and model distance policy.
- `CesiumView.tsx`: start Google as normal 3D source when enabled; start OSM/water only on fallback; reserve attribution space; surface WebGL failures without rewriting other app systems.
- `CesiumSceneController.ts`, `credits.css`: neutral atmosphere settings and explicit credit container support.
- `CesiumProjectInteraction.ts`: only highlight owned project features and safely restore evicted selections.
- `CesiumProjectPlacementEditor.tsx`: source city preview, parcel clipping, readiness/error behavior and shared transform convention.
- `src/routes/_authenticated/admin.tsx`: one prop forwards the existing plot to the editor.
- `CesiumRuntimeGeodata.ts`: guard fallback asynchronous teardown and tolerate partial layer failures.
- `.env.example`, `package.json`: public feature/config examples and new regression-test command.
- `vite.config.ts`: development-only QA HTML route; no production QA route or GIS build processing.
- `scripts/verify-photorealistic.ts`: geometry, provider lifecycle and actual project-loader orchestration tests with provider/GPU I/O stubbed.
- `qa/photorealistic.html`, `qa/photorealistic.ts`, `qa/tsconfig.json`: isolated development fixture using an already owned model.
- `docs/PHOTOREALISTIC_3D.md`, this report: methods, deployment, licensing, limitations and QA steps.

No files removed. No packages added/removed. No migrations, Google assets downloaded, official geographic records imported, authentication changes, Stripe changes or PDF business-code changes. Pre-existing untracked four-tower demonstration files were left outside this change.

## Methods, configuration and performance

See `PHOTOREALISTIC_3D.md` for the exact factory/ion asset path, variable scopes, cache budgets, distances, attribution and cost controls. Google clipping is a geographic column cut, not a semantic building delete; a developer asset must cover the cut ground and be survey-aligned. No georeferenced source details or Dubai coverage are fabricated.

## Validation commands

```bash
npx tsc --noEmit
npx tsc --noEmit --project qa/tsconfig.json
npm run lint
npm run test:unit-offers
npm run test:cesium-geodata
npm run geodata:validate
npm run test:photorealistic
NITRO_PRESET=vercel npm run build
git diff --check
```

Application/QA TypeScript, lint, unit-offer tests, geodata tests, geodata validation, new lifecycle tests and production build passed. Geodata keeps its existing zero-community warning; build keeps existing large-chunk/fontkit warnings. Same-process HTTP checks returned 200 for `/qa/photorealistic.html`, `/qa/photorealistic.ts`, `/cesium/Workers/createGeometry.js`, and `/geodata/dubai-pilot/manifest.json`. The first QA HTML check found a 404 and was fixed with a development-only Vite middleware. These HTTP checks are not substitutes for browser QA. Build and lint must run sequentially: lint can otherwise race with regenerated `.vercel/output` files.

## Browser QA and remaining requirements

The official Cesium example itself failed to initialize WebGL in the provided Chrome environment. Local public provider credentials are absent. Consequently no actual Dubai coverage (Downtown, Business Bay, Marina, Palm), live Google facade quality, real developer model insertion, before/after screenshots, persistence, normal-app engine switching or real-mobile memory behavior has been verified.

Coverage cannot be inferred from a successful root request or a coarse ground tile. Initial tile absence times out to Masterplan, but the implementation does not automatically classify coarse imagery as unsupported high-detail building coverage. A reviewer must check it at each target location. Runtime source failure falls back; it never fabricates missing architecture.

The 3D Tiles readiness event is a first-view readiness gate, not proof that every future LOD is resident. Later developer tile failures remove that model and restore Google. Browser/GPU memory budgets and valid parcel/model alignment still require field verification. The retained fallback outside the pilot does not magically provide citywide contextual buildings.

**STOP HERE. Do not merge to main. Senior technical review and visual acceptance are still required.**
