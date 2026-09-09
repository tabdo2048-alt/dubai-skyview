# Cesium digital-twin architecture

## Runtime split

`MapContainer` owns the shared camera state and mounts exactly one rendering engine:

- Satellite mode: the existing `MapboxView` with satellite-streets and its existing layers.
- 3D mode: `CesiumView`, a stylized non-satellite masterplan scene.

Switching engines preserves latitude, longitude and approximate zoom/height. The inactive engine is unmounted so mobile devices do not keep two WebGL contexts and duplicate GPU allocations.

## Cesium layers

- `CesiumSceneController`: Viewer lifecycle, ellipsoid terrain, sand land color, lighting and mobile render budget.
- `CesiumCameraController`: shared camera conversion, smooth emirate/project flight and change throttling.
- `CesiumRuntimeGeodata`: camera-aware manifest/chunk loading and GPU resource release.
- `CesiumCityBuildings`: batched polygon extrusion; no React component or GLB per building.
- `CesiumRoadsLayer`: class-specific width/color, ground roads, elevated bridge geometry and hidden tunnels.
- `CesiumWaterLayer`: batched OSM water polygons with an inexpensive teal material.
- `CesiumCommunitiesLayer`: independently pickable polygon fills/outlines when official/OSM geometry exists.
- `CesiumProjectLayer`: project markers, distance-based GLB/3D Tiles loading and reversible silhouette selection.
- `CesiumProjectBoundaries` / `CesiumProjectClipping`: reuse `plot_geometry`, draw active sites and suppress contextual building centroids inside client parcels.
- `CesiumProjectPlacementEditor`: admin visual placement that stores latitude, longitude, altitude, scale and heading without modifying the source asset.

All masterplan colors and all documented numeric estimates live in `theme.ts` or `scripts/geodata/config.ts`.

## Client project models

The existing `model_3d_url` supports:

- GLB URLs for a building or compact development;
- URLs ending in `tileset.json` for streamed 3D Tiles.

Existing transform columns are reused; no database migration was required. GLB PBR materials and textures are not recolored. Hover/selection uses Cesium silhouettes and is reversible. 3D Tiles features expose useful feature names when the tileset contains feature metadata. Plain GLB picking is project-level because Cesium cannot reliably map a picked draw command back to arbitrary glTF node names without feature IDs; export feature metadata/3D Tiles for tower-level business mapping.

## Performance contract

- Pilot geometry is batched into primitives.
- The manifest format partitions data into deterministic geographic chunks.
- Distant chunks are removed from the scene.
- Project models load only near the camera or when selected.
- 3D Tiles use stricter screen-space error and cache budgets on mobile.
- Mobile caps Cesium resolution scale and target frame rate.
- Cesium is code-split from the initial Satellite route, although the engine chunk itself remains large.
- A citywide rollout must use many chunks or 3D Tiles, never one `Dubai.glb`.

## Deployment

Cesium Workers, ThirdParty, Assets and Widgets are copied to `/cesium/` by Vite. `VITE_CESIUM_ION_TOKEN` is optional for the local masterplan; when used, it must be a public browser token restricted to the production origins and only the required ion assets. No service-role, Stripe, Cloudinary or Dubai Pulse secret reaches the browser.

Vercel consumes committed small pilot assets or a remote versioned manifest. GIS conversion is intentionally absent from the build command.

