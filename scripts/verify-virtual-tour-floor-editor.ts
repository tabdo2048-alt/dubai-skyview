import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  calculateContainedImageBounds,
  clampNormalizedCoordinate,
  clampNormalizedPoint,
  clientPointToNormalized,
  normalizedPointToPercent,
  scenesForFloor,
} from "../src/features/virtual-tour/floorData";
import type { TourSceneRow } from "../src/features/virtual-tour/types";

function scene(id: string, tourId: string, floorId: string | null): TourSceneRow {
  return {
    id,
    tour_id: tourId,
    floor_id: floorId,
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
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

assert.equal(clampNormalizedCoordinate(-0.3), 0);
assert.equal(clampNormalizedCoordinate(0.45), 0.45);
assert.equal(clampNormalizedCoordinate(1.4), 1);
assert.deepEqual(clampNormalizedPoint({ x: -1, y: 2 }), { x: 0, y: 1 });
assert.deepEqual(normalizedPointToPercent({ x: 0.25, y: 0.75 }), {
  left: "25%",
  top: "75%",
});

const landscapeBounds = calculateContainedImageBounds(1000, 1000, 2000, 1000);
assert.deepEqual(landscapeBounds, { left: 0, top: 250, width: 1000, height: 500 });
assert.deepEqual(clientPointToNormalized(500, 500, landscapeBounds!), { x: 0.5, y: 0.5 });
assert.equal(clientPointToNormalized(500, 100, landscapeBounds!), null);

const portraitBounds = calculateContainedImageBounds(1200, 600, 600, 1200);
assert.deepEqual(portraitBounds, { left: 450, top: 0, width: 300, height: 600 });
assert.deepEqual(clientPointToNormalized(450, 0, portraitBounds!), { x: 0, y: 0 });
assert.deepEqual(clientPointToNormalized(750, 600, portraitBounds!), { x: 1, y: 1 });
assert.equal(calculateContainedImageBounds(0, 100, 100, 100), null);

const floorScenes = scenesForFloor("tour-a", "floor-a", [
  scene("allowed", "tour-a", "floor-a"),
  scene("wrong-floor", "tour-a", "floor-b"),
  scene("wrong-tour", "tour-b", "floor-a"),
]);
assert.deepEqual(
  floorScenes.map((item) => item.id),
  ["allowed"],
);

const [editorSource, queriesSource, routeSource] = await Promise.all([
  readFile("src/features/virtual-tour/admin/AdminFloorPlanEditor.tsx", "utf8"),
  readFile("src/features/virtual-tour/admin/adminQueries.ts", "utf8"),
  readFile(
    "src/routes/_authenticated/admin_.projects.$id_.tours_.$tourId_.floors_.$floorId_.editor.tsx",
    "utf8",
  ),
]);

assert.match(editorSource, /onPointerDown/);
assert.match(editorSource, /onPointerMove/);
assert.match(editorSource, /Keep existing markers/);
assert.match(editorSource, /Clear all positions/);
assert.match(editorSource, /resolveFloorPlanUrl/);
assert.doesNotMatch(editorSource, /service_role|dangerouslySetInnerHTML|window\.location/);
assert.match(queriesSource, /\.eq\("tour_id", tourId\)/);
assert.match(queriesSource, /\.eq\("floor_id", floorId\)/);
assert.match(routeSource, /AdminFloorPlanEditor/);

console.log("Virtual tour visual floor plan editor checks passed.");
