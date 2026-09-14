import assert from "node:assert/strict";
import {
  areFloorPlanCoordinatesValid,
  isNormalizedCoordinate,
  isPanoramaType,
  isSafeTourExternalUrl,
  isTourHotspotType,
  validatePanoramaMetadata,
} from "../src/features/virtual-tour/validation";
import {
  floorPlanStoragePath,
  panoramaStoragePath,
  sceneThumbnailStoragePath,
} from "../src/features/virtual-tour/storage";
import type {
  TourCameraState,
  VirtualTourInsert,
} from "../src/features/virtual-tour/types";

assert.equal(isNormalizedCoordinate(0), true);
assert.equal(isNormalizedCoordinate(1), true);
assert.equal(isNormalizedCoordinate(-0.01), false);
assert.equal(isNormalizedCoordinate(1.01), false);
assert.equal(areFloorPlanCoordinatesValid(null, null), true);
assert.equal(areFloorPlanCoordinatesValid(0.25, 0.75), true);
assert.equal(areFloorPlanCoordinatesValid(0.25, null), false);

assert.equal(isTourHotspotType("navigation"), true);
assert.equal(isTourHotspotType("external_link"), true);
assert.equal(isTourHotspotType("script"), false);
assert.equal(isPanoramaType("equirectangular"), true);
assert.equal(isPanoramaType("video"), false);
assert.equal(isSafeTourExternalUrl("https://example.com/tour"), true);
assert.equal(isSafeTourExternalUrl("javascript:alert(1)"), false);

const validPanorama = validatePanoramaMetadata({
  width: 8192,
  height: 4096,
  fileSizeBytes: 24 * 1024 * 1024,
  mimeType: "image/jpeg",
  panoramaType: "equirectangular",
});
assert.equal(validPanorama.isValid, true);
assert.deepEqual(validPanorama.warnings, []);

const unusualRatio = validatePanoramaMetadata({
  width: 4000,
  height: 3000,
  fileSizeBytes: 4 * 1024 * 1024,
  mimeType: "image/webp",
  panoramaType: "equirectangular",
});
assert.equal(unusualRatio.isValid, true);
assert.equal(unusualRatio.warnings.length, 1);

const oversizedPanorama = validatePanoramaMetadata({
  width: 8192,
  height: 4096,
  fileSizeBytes: 51 * 1024 * 1024,
  mimeType: "image/jpeg",
  panoramaType: "equirectangular",
});
assert.equal(oversizedPanorama.isValid, false);

const ids = {
  tenantId: "00000000-0000-4000-8000-00000000a001",
  projectId: "00000000-0000-4000-8000-00000000b001",
  tourId: "00000000-0000-4000-8000-00000000d001",
  sceneId: "00000000-0000-4000-8000-00000000f001",
};
assert.equal(
  panoramaStoragePath(ids),
  "00000000-0000-4000-8000-00000000a001/projects/00000000-0000-4000-8000-00000000b001/tours/00000000-0000-4000-8000-00000000d001/scenes/00000000-0000-4000-8000-00000000f001/panorama.jpg",
);
assert.equal(
  sceneThumbnailStoragePath(ids, "webp").endsWith(
    "/scenes/00000000-0000-4000-8000-00000000f001/thumbnail.webp",
  ),
  true,
);
assert.equal(
  floorPlanStoragePath({
    tenantId: ids.tenantId,
    projectId: ids.projectId,
    tourId: ids.tourId,
    floorId: "00000000-0000-4000-8000-00000000e001",
  }).endsWith("/floors/00000000-0000-4000-8000-00000000e001/floor-plan.jpg"),
  true,
);
assert.throws(() => panoramaStoragePath({ ...ids, tenantId: "../other-tenant" }));

// Compile-time checks keep the domain layer aligned with the regenerated
// Supabase schema without introducing casts.
const insert: VirtualTourInsert = {
  tenant_id: ids.tenantId,
  project_id: ids.projectId,
  name: "Compile-time tour",
};
const camera: TourCameraState = {
  longitude: 55.2708,
  latitude: 25.2048,
  height: 1200,
  heading: 0,
  pitch: -0.5,
  roll: 0,
  timestamp: Date.now(),
  version: 1,
};
assert.equal(insert.name, "Compile-time tour");
assert.equal(camera.version, 1);

console.log(
  "Virtual-tour data checks passed: domain types, normalized coordinates, hotspot/panorama validation, safe URLs, upload metadata, and tenant-scoped storage paths.",
);
