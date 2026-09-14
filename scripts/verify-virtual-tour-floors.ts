import assert from "node:assert/strict";
import {
  floorPlanPositionPercent,
  hasFloorPlanPosition,
  publishedScenesForFloor,
  resolveCurrentFloor,
  sortTourFloors,
  visibleTourFloors,
} from "../src/features/virtual-tour/floorData";
import {
  FLOOR_PLAN_SIGNED_URL_TTL_SECONDS,
  floorPlanStoragePathFromValue,
} from "../src/features/virtual-tour/floorPlanUrl";
import type { TourFloorRow, TourSceneRow } from "../src/features/virtual-tour/types";

const TOUR_A = "00000000-0000-4000-8000-000000000001";
const TOUR_B = "00000000-0000-4000-8000-000000000002";

function floor(id: string, overrides: Partial<TourFloorRow> = {}): TourFloorRow {
  return {
    id,
    tour_id: TOUR_A,
    name: id,
    floor_number: null,
    floor_plan_url: null,
    width: 1600,
    height: 900,
    sort_order: 0,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

function scene(
  id: string,
  floorId: string | null,
  overrides: Partial<TourSceneRow> = {},
): TourSceneRow {
  return {
    id,
    tour_id: TOUR_A,
    floor_id: floorId,
    name: id,
    description: null,
    panorama_url: `${id}.jpg`,
    thumbnail_url: null,
    initial_yaw: 0,
    initial_pitch: 0,
    initial_hfov: null,
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

const ground = floor("ground", { sort_order: 0, floor_number: 0 });
const floor17 = floor("floor-17", { sort_order: 1, floor_number: 17 });
const roof = floor("roof", { sort_order: 2, floor_number: null });
const otherTourFloor = floor("other-tour", { tour_id: TOUR_B, sort_order: -1 });
const emptyFloor = floor("empty", { sort_order: 3 });
const livingRoom = scene("living-room", floor17.id, {
  floor_plan_x: 0.5,
  floor_plan_y: 0.25,
});
const lobby = scene("lobby", ground.id);
const unpublishedRoof = scene("roof-private", roof.id, { is_published: false });
const crossTourScene = scene("cross-tour", otherTourFloor.id);
const outdoor = scene("outdoor", null);

assert.deepEqual(
  sortTourFloors([roof, floor17, ground]).map((item) => item.id),
  ["ground", "floor-17", "roof"],
);
assert.deepEqual(
  visibleTourFloors(
    TOUR_A,
    [emptyFloor, otherTourFloor, roof, floor17, ground],
    [livingRoom, lobby, unpublishedRoof, crossTourScene, outdoor],
  ).map((item) => item.id),
  ["ground", "floor-17"],
);
assert.deepEqual(
  publishedScenesForFloor(floor17, [livingRoom, lobby, crossTourScene]).map((item) => item.id),
  ["living-room"],
);
assert.equal(resolveCurrentFloor(livingRoom, [ground, floor17])?.id, floor17.id);
assert.equal(resolveCurrentFloor(outdoor, [ground, floor17]), null);
assert.equal(resolveCurrentFloor(crossTourScene, [otherTourFloor]), null);
assert.equal(hasFloorPlanPosition(livingRoom), true);
assert.deepEqual(floorPlanPositionPercent(livingRoom), { left: "50%", top: "25%" });
assert.equal(floorPlanPositionPercent(scene("missing-x", floor17.id, { floor_plan_y: 0.5 })), null);
assert.equal(
  floorPlanPositionPercent(scene("bad-x", floor17.id, { floor_plan_x: 1.2, floor_plan_y: 0.5 })),
  null,
);

const objectPath = `${TOUR_A}/projects/00000000-0000-4000-8000-000000000003/tours/${TOUR_A}/floors/${floor17.id}/floor-plan.jpg`;
assert.equal(floorPlanStoragePathFromValue(objectPath), objectPath);
assert.equal(
  floorPlanStoragePathFromValue(
    `https://example.supabase.co/storage/v1/object/sign/tour-floorplans/${objectPath}?token=short-lived`,
  ),
  objectPath,
);
assert.equal(floorPlanStoragePathFromValue("../another-tenant/floor-plan.jpg"), null);
assert.equal(FLOOR_PLAN_SIGNED_URL_TTL_SECONDS, 3600);

console.log(
  "Virtual-tour floor checks passed: sorting, visibility, current floor, cross-tour isolation, normalized markers, missing coordinates, and private storage paths.",
);
