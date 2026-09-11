# KEYORA: Google Photorealistic city and developer model inserts

Implementation target: CesiumJS **1.145.0**, already installed. The implementation is prepared for review; **live Dubai visual acceptance is not complete**. Do not interpret successful unit tests as evidence of Google coverage or a correctly aligned real development.

## Architecture and scope

`MapContainer` continues to mount Mapbox for Satellite and Cesium for 3D exclusively. Its navigation, camera state and project popup wiring are retained. `CesiumPhotorealisticCity` creates at most one Google tileset during each Viewer lifetime. POI filters, hover, popup selection and layer controls do not reconstruct it.

When enabled and accessible, Google supplies the city geometry, textures, streets, vegetation, terrain and water. No OSM buildings/roads/parks/water are started behind it. The ellipsoid globe is hidden once Google content is first visible. Optional existing POI, rail and zone overlays remain independent. Developer GLB/3D Tiles retain their original materials. No database, auth, RLS, tenant, Stripe, unit or PDF logic is rewritten.

The existing local Masterplan pipeline is started only if Google is disabled, credentials are absent, polygon clipping is unsupported, initial streaming times out, the root request fails or a child tile fails. This is a conservative policy: one child failure switches to Masterplan for the rest of that Viewer session. It avoids repeated paid root retries, at the expense of falling back on transient errors. Google resources are removed before fallback city geometry starts. The retained OSM dataset covers the existing pilot, not every Dubai district; outside it the fallback is the existing general globe/overlays, not invented buildings.

## Official provider methods

- With `VITE_GOOGLE_MAP_TILES_API_KEY`: `createGooglePhotorealistic3DTileset({ key, onlyUsingWithGoogleGeocoder: true }, options)`.
- Without that key, with a configured ion token: `IonResource.fromAssetId(2275207, { accessToken })` then `Cesium3DTileset.fromUrl(resource, options)`. Asset 2275207 is the ion asset used by the installed Cesium factory. Explicit token scoping avoids its global cached-resource/default-token path.
- The direct key takes priority. Invalid direct credentials do not silently switch billing providers.
- No geocoder is mounted. Project selection uses existing business data; no competing geocoder is combined with Google tiles.

An existing ion token **can technically** access this asset if the account has the asset entitlement and the token permits reading it. Possessing a token does not prove entitlement, account-plan suitability, terms acceptance or production permission. The application does not acquire access or accept terms on the user's behalf. A Google API key is an alternative, not always mandatory.

References inspected: [official Sandcastle example](https://sandcastle.cesium.com/?id=google-photorealistic-3d-tiles-with-building-insert), the installed `@cesium/engine` factory source and TypeScript API, [Cesium polygon clipping documentation](https://cesium.com/learn/cesiumjs/ref-doc/ClippingPolygonCollection.html), [Google renderer guide](https://developers.google.com/maps/documentation/tile/use-renderer), [Google Photorealistic tiles guide](https://developers.google.com/maps/documentation/tile/3d-tiles).

## Configuration and deployment

| Variable | Meaning |
| --- | --- |
| `VITE_ENABLE_GOOGLE_PHOTOREALISTIC` | Exact string `true` enables Google. `false`, missing or any other value results in zero Google Photorealistic requests. Default example is false to prevent accidental usage. |
| `VITE_GOOGLE_MAP_TILES_API_KEY` | Optional public browser key. Enable Map Tiles API in the owner's Google project; restrict the key to that API and approved HTTP referrers, including the intended preview origin. |
| `VITE_CESIUM_ION_TOKEN` | Alternative public browser token. Restrict to approved URLs and asset-read access to 2275207 (plus any separately needed developer assets). Never use an administrative/private ion token. |
| `VITE_PROJECT_INSERT_PADDING_METERS` | Parcel buffer, default 2 m, clamped to 0–20 m. Invalid values use 2 m. This is visual clipping padding, not official survey metadata. |

These variables are compiled into the browser build. Changing them requires rebuilding/redeploying. Do not use `GOOGLE_MAPS_API_KEY` (existing server-only configuration) as an implicit browser fallback. Do not expose any Supabase service role, Stripe, Cloudinary or Dubai Pulse secret. Provider error strings/URLs are not logged by the new city/project loaders; browser networking tools inherently expose public request credentials.

No packages or database migrations are required. Turf and Cesium were already dependencies. Existing Vite runtime assets at `/cesium/` and the Nitro Vercel preset are reused. No GIS processing or Google city downloading occurs during a Vercel build. There is no disk tile cache or asset export pipeline.

## Insert geometry and lifecycle

1. Existing `plot_geometry` is validated as a closed finite geographic GeoJSON Polygon, including inner rings. Self-intersecting parcels are rejected.
2. Turf buffers the owned parcel in metres. Concave outlines and holes remain supported; a buffer-created MultiPolygon is handled as multiple clipping polygons. Holes smaller than the padding may close, as expected from a geometric buffer.
3. Cesium `ClippingPolygonCollection({ inverse: false })` is assigned to the **Google city tileset only**. The implementation passes polygon positions and holes to Cesium 1.145's supported API. Developer models are not clipped or recolored by this collection.
4. A GLB is initially hidden and must fire `readyEvent` after textures are loaded. A developer tileset is initially hidden with `preloadWhenHidden`; its initial tile-ready event gates visibility. Resolving the loader promise alone is insufficient for GLBs.
5. The clip is installed and the ready developer resource shown in the same JavaScript turn. On unload, filtering, transform change or model error, the model is hidden and its clip removed. Pending requests finishing after unmount/filter changes are discarded and their resources destroyed.
6. A missing/invalid parcel leaves the Google city visible and the developer resource hidden, with a status message. There is no guessed rectangle around a real project and no intentional duplicate-building overlay.

Clipping removes **all source geometry in a geographic vertical column**, including ground, trees and roads; it is not a semantic building-only delete or a height-bounded excavation. The GLB/tileset must include an appropriate site/base surface covering the clipped footprint and padding. It must have correct position, scale, heading and ellipsoidal altitude. Otherwise holes, exposed edges or a floating/sunken insert can remain. The implementation cannot infer a developer's correct datum or survey alignment from arbitrary files. No automatic model resizing, texture replacement or ground fabrication is performed.

GLBs use the existing model origin and ENU placement fields. Local developer tilesets retain their original local transform. For an ECEF/georeferenced tileset, the source bounding-centre ENU frame becomes the placement anchor; the source-relative transform is preserved before applying saved project placement. This convention is shared by the public renderer and admin editor. Existing globally georeferenced assets previously transformed incorrectly may need an admin placement review. URLs ending in `tileset.json` or `.3dtiles` (including signed-query/hash suffixes) select 3D Tiles; opaque tileset endpoint names are not auto-detected.

Plain GLB picking selects the existing project. Named 3D Tiles features preserve per-building/tower selection metadata. Feature highlights are temporary and restore prior colors; Google features are excluded from this selection recoloring. Arbitrary glTF node names are not automatically equivalent to pickable business entities.

## Streaming and rendering budgets

| Setting | Desktop | Constrained/mobile |
| --- | --- | --- |
| Google maximum screen-space error | 12 | 24 |
| Google cache target + overflow | 384 + 96 MiB | 128 + 32 MiB |
| Developer tileset cache + overflow, per model | 64 + 16 MiB | 32 + 16 MiB |
| Resident developer model cap | 6 | 3 |
| Concurrent project loads | 2 | 2 |
| Target frame rate | 60 | 30 |
| MSAA samples | 4 | 1 |

Dynamic screen-space error and request-render mode are enabled. Flight-destination preload for Google is off. Project preload begins within 6 km; retained resources unload beyond 9 km. Inserts become visible within 3 km and remain visible until 4 km. A selected project takes priority and is eligible outside these radii. Distances are camera-to-anchor distances in ECEF, not just ground distance. Model failures back off for 60 seconds; pending loads have a 60-second watchdog. A camera-change throttle prevents per-frame project loading work. Hover never starts a new root/city request.

Cache values are Cesium targets, not guaranteed GPU memory caps. Large GLBs can still consume substantial memory; their textures are not silently damaged to fit a budget. Optimize owned assets using appropriate mesh/texture compression and sensible texture sizes. Test on actual mobile hardware before release.

Photorealistic mode uses source water directly: no animated cyan overlay and no water-only render timer. Masterplan retains the existing animated water. Daylight uses Cesium's sun and neutral atmosphere grading; existing light presets remain. Source photogrammetry contains baked lighting/shadows, so changing time of day cannot reconstruct a genuine night survey or remove baked shadows.

## Attribution, licensing and costs

`showCreditsOnScreen: true` remains enabled. Cesium aggregates provider-supplied dynamic tile credits and logos into a reserved, normal-flow footer above the map's overlay stacking context. Credits are not truncated or substituted. OSM overlay/fallback attribution remains separately visible. Verify the footer on actual mobile layouts and with project popups before release.

Follow [Google Map Tiles policies](https://developers.google.com/maps/documentation/tile/policies) and [Google Maps Platform terms](https://cloud.google.com/maps-platform/terms), plus applicable Cesium ion terms. Stream only through the supported service. Do not scrape, extract facade imagery, save Google assets to Supabase, permanently download/rehost tiles, convert the city to a dataset, or remove provider attribution. Account/billing-region restrictions may affect availability.

The feature creates one Google root per 3D Viewer lifetime; UI/filter changes reuse it. Switching Satellite → 3D creates a new Viewer/root by design, because retaining the old Viewer would keep a second WebGL context. Requests and normal navigation may incur provider charges. Configure provider-side quotas/budget alerts; a browser cache budget is not a monetary spending limit. Disabled mode does not instantiate the provider or request its root. Automatic fallback does not repeatedly retry Google. Long-lived provider session expiration currently triggers fallback; reload/re-enter 3D to establish a new session rather than silently initiating recurring roots.

## Reproducible development QA

`qa/photorealistic.html` is a development-only Vite entry. It uses the existing owned `public/models/demo-district.glb`, does not seed Supabase and is not a production route. The parcel and development are explicitly fictional; coordinates are camera targets, not claims of a real project or surveyed footprint.

1. Supply an approved browser credential in local env and set the enable variable to true.
2. Run `npm run dev -- --host 127.0.0.1` and open `/qa/photorealistic.html` on the printed port.
3. Select Downtown, Business Bay, Dubai Marina and Palm Jumeirah. Record real coverage/texture detail separately for each.
4. Inspect the original city; press **Insert test GLB**; rotate and inspect parcel edges. Press **Original city** for comparison. The model's altitude/origin must be reviewed against actual source ground before claiming seamless insertion.
5. Use **Fly far away**, then return: confirm model unloading and city restoration. Test the authenticated admin placement editor with a real developer GLB/tileset and saved transforms.
6. In the normal application, test Satellite → 3D → Satellite, selection/popup, persistence, credits, project pages and mobile GPU behavior. The QA page alone does not verify the normal app's mode switch or backend persistence.

## Verification status (2026-09-11)

Automated provider/modeled I/O tests are not geographic visual tests.

| Check | Result |
| --- | --- |
| TypeScript application | Passed |
| Lint | Passed |
| Existing unit-offer/PDF-layout tests | Passed |
| Existing Cesium geodata tests | Passed |
| Geodata validation | Passed; existing warning: zero community features |
| New Photorealistic lifecycle tests | Passed: disabled/missing credentials, one root, concavity, padding, holes, self-intersections, clipping rollback, GLB readiness, hover deduplication, unloading, stale async results and failure backoff |
| Nitro Vercel production build | Passed; existing large-bundle/fontkit warnings remain |
| Real Google requests/entitlement | Not tested; no provider credentials configured locally |
| Downtown / Business Bay / Marina / Palm coverage | All unverified |
| Actual developer insert, facade detail, before/after screenshots | Unverified; no legitimate rendered screenshots produced |
| Browser capability | Official Sandcastle returned “The browser supports WebGL, but initialization failed.” |
| Real-device mobile memory, persisted placement, normal-app switching | Not manually verified |

**Review gate remains open.** The requested final visual acceptance—an aligned developer project without city intersections—requires a WebGL-capable browser, approved source access, coverage inspection and a correctly prepared developer asset. Do not merge or call this visually accepted on the strength of compilation.


## Dubai production correction (2026-09-11)

The public viewer now opens in Cesium 3D. Satellite remains selectable. The
emirates menu is removed from the main map; navigation uses the existing Dubai
view rectangle (a product extent, not official administrative geometry). Cesium
limits camera height to 60 km and returns an out-of-range camera to that extent
when movement finishes; it does not crop Google's data to an administrative border.
Decorative HTML clouds are Satellite-only. OSM buildings and opaque water remain
fallback-only and do not render over an active Google city.

When both credentials exist, Cesium ion is preferred. Direct Google is used only
without an ion token. This prevents a stale Google key from overriding a working
ion asset. `VITE_ENABLE_GOOGLE_PHOTOREALISTIC=true` is still required; explicit
false causes zero photorealistic requests. Values are trimmed and case-normalized.
Keep the ion token configured. A direct Google key is optional with ion.

Live checks before this correction: the production ion asset endpoint and its
Google root JSON returned HTTP 200; the separately configured direct Google key
returned 404. Root availability is not proof of usable Dubai coverage. Browser
WebGL initialization failed, so no facade/insert screenshot is claimed. Existing
fictional demo projects were not deleted from Supabase.
