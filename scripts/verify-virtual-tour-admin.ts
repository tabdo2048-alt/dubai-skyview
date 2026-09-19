import assert from "node:assert/strict";
import {
  hotspotMetadataFromDraft,
  safeHttpsUrl,
  validateAdminImageBasics,
  validateCameraValues,
  validateHotspotDraft,
  validateTourForPublish,
} from "../src/features/virtual-tour/admin/adminValidation";
import {
  imageExtension,
  newFloorPlanPath,
  newPanoramaPath,
} from "../src/features/virtual-tour/admin/adminStorage";
import {
  pannellumCoordinatesFromMouseEvent,
  type PannellumViewer,
} from "../src/features/virtual-tour/viewer/pannellumAdapter";
import type { TourHotspotRow, TourSceneRow } from "../src/features/virtual-tour/types";

const TOUR = "00000000-0000-4000-8000-000000000001";
const TENANT = "00000000-0000-4000-8000-000000000002";
const PROJECT = "00000000-0000-4000-8000-000000000003";

function scene(id: string, overrides: Partial<TourSceneRow> = {}): TourSceneRow {
  return {
    id,
    tour_id: TOUR,
    floor_id: null,
    name: id,
    description: null,
    panorama_url: `${id}.jpg`,
    thumbnail_url: null,
    initial_yaw: 0,
    initial_pitch: 0,
    initial_hfov: 100,
    floor_plan_x: null,
    floor_plan_y: null,
    panorama_type: "equirectangular",
    multires_config: null,
    sort_order: 0,
    is_published: true,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function hotspot(overrides: Partial<TourHotspotRow> = {}): TourHotspotRow {
  return {
    id: "00000000-0000-4000-8000-000000000020",
    scene_id: "00000000-0000-4000-8000-000000000010",
    target_scene_id: null,
    type: "information",
    label: "Info",
    yaw: 0,
    pitch: 0,
    icon: null,
    metadata: {},
    sort_order: 0,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

assert.deepEqual(
  validateAdminImageBasics({ type: "image/jpeg", size: 1024 }, "panorama").errors,
  [],
);
assert.equal(
  validateAdminImageBasics({ type: "image/svg+xml", size: 1024 }, "panorama").errors.length,
  1,
);
assert.equal(
  validateAdminImageBasics({ type: "image/jpeg", size: 51 * 1024 * 1024 }, "panorama").errors
    .length,
  1,
);
assert.equal(imageExtension({ type: "image/webp" }), "webp");
assert.equal(validateCameraValues(0, 0, 100).length, 0);
assert.equal(validateCameraValues(500, 0, 100).length, 1);
assert.equal(validateCameraValues(0, -100, 100).length, 1);
assert.equal(safeHttpsUrl("https://example.com"), "https://example.com");
assert.equal(safeHttpsUrl("http://example.com"), null);
assert.equal(safeHttpsUrl("javascript:alert(1)"), null);

const entrance = scene("00000000-0000-4000-8000-000000000010");
const lobby = scene("00000000-0000-4000-8000-000000000011");
const otherTour = scene("00000000-0000-4000-8000-000000000012", {
  tour_id: "00000000-0000-4000-8000-000000000099",
});
assert.deepEqual(
  validateHotspotDraft(
    { type: "navigation", label: "Lobby", targetSceneId: lobby.id, yaw: 20, pitch: 4 },
    [entrance, lobby],
    entrance.id,
  ),
  [],
);
assert.equal(
  validateHotspotDraft(
    { type: "navigation", label: "Bad", targetSceneId: otherTour.id, yaw: 20, pitch: 4 },
    [entrance, otherTour],
    entrance.id,
  ).length,
  1,
);
assert.equal(
  validateHotspotDraft(
    {
      type: "external_link",
      label: "Unsafe",
      targetSceneId: null,
      yaw: 0,
      pitch: 0,
      url: "data:text/html,x",
    },
    [entrance],
    entrance.id,
  ).length,
  1,
);
assert.deepEqual(
  hotspotMetadataFromDraft({
    type: "unit",
    label: "Unit",
    targetSceneId: null,
    yaw: 0,
    pitch: 0,
    unitTypeId: "00000000-0000-4000-8000-000000000030",
  }),
  { unitTypeId: "00000000-0000-4000-8000-000000000030" },
);

assert.equal(validateTourForPublish([], []).length, 1);
assert.deepEqual(validateTourForPublish([entrance], []), []);
assert.equal(
  validateTourForPublish(
    [entrance, scene(lobby.id, { is_published: false })],
    [hotspot({ type: "navigation", target_scene_id: lobby.id })],
  ).length,
  1,
);

const panoramaPath = newPanoramaPath(
  { tenantId: TENANT, projectId: PROJECT, tourId: TOUR, sceneId: entrance.id },
  { type: "image/jpeg" },
);
assert.match(
  panoramaPath,
  new RegExp(
    `^${TENANT}/projects/${PROJECT}/tours/${TOUR}/scenes/${entrance.id}/panorama-[0-9a-f-]+\\.jpg$`,
  ),
);
const floorPath = newFloorPlanPath(
  { tenantId: TENANT, projectId: PROJECT, tourId: TOUR, floorId: lobby.id },
  { type: "image/png" },
);
assert.match(floorPath, /\/floors\/[0-9a-f-]+\/floor-plan-[0-9a-f-]+\.png$/);

const fakeViewer = { mouseEventToCoords: () => [12, -45] } as unknown as PannellumViewer;
assert.deepEqual(pannellumCoordinatesFromMouseEvent(fakeViewer, {} as MouseEvent), {
  pitch: 12,
  yaw: -45,
});

console.log(
  "Virtual-tour admin checks passed: uploads, paths, camera validation, publish rules, metadata, safe URLs, cross-tour targets, and Pannellum click coordinates.",
);
