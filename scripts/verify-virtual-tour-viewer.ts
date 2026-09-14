import assert from "node:assert/strict";
import { findTourScene, selectDefaultTourScene } from "../src/features/virtual-tour/queries";
import {
  panoramaStoragePathFromValue,
  TOUR_SIGNED_URL_TTL_SECONDS,
} from "../src/features/virtual-tour/panoramaUrl";
import { destroyPannellumViewer, type PannellumViewer } from "../src/features/virtual-tour/viewer/pannellumAdapter";
import type { TourSceneRow } from "../src/features/virtual-tour/types";

function scene(id: string, sortOrder: number): TourSceneRow {
  return {
    id,
    tour_id: "00000000-0000-4000-8000-000000000001",
    floor_id: null,
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
    sort_order: sortOrder,
    is_published: true,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
  };
}

const scenes = [scene("entrance", 0), scene("lobby", 1)];
assert.equal(selectDefaultTourScene(scenes)?.id, "entrance");
assert.equal(selectDefaultTourScene([]), null);
assert.equal(findTourScene(scenes, "lobby")?.id, "lobby");
assert.equal(findTourScene(scenes, "another-tour-scene"), null);

const objectPath = "00000000-0000-4000-8000-000000000001/projects/00000000-0000-4000-8000-000000000002/tours/00000000-0000-4000-8000-000000000003/scenes/00000000-0000-4000-8000-000000000004/panorama.jpg";
assert.equal(panoramaStoragePathFromValue(objectPath), objectPath);
assert.equal(
  panoramaStoragePathFromValue(`https://example.supabase.co/storage/v1/object/public/tour-panoramas/${objectPath}`),
  objectPath,
);
assert.equal(panoramaStoragePathFromValue("../another-tenant/panorama.jpg"), null);
assert.equal(panoramaStoragePathFromValue("folder//panorama.jpg"), null);
assert.equal(TOUR_SIGNED_URL_TTL_SECONDS, 3600);

let offCalls = 0;
let destroyCalls = 0;
const fakeViewer = {
  off: () => { offCalls += 1; return fakeViewer; },
  destroy: () => { destroyCalls += 1; },
} as unknown as PannellumViewer;
destroyPannellumViewer(fakeViewer);
assert.equal(offCalls, 1);
assert.equal(destroyCalls, 1);
destroyPannellumViewer(null);

console.log(
  "Virtual-tour viewer checks passed: default/deep-linked scene selection, storage-path safety, signed URL TTL, and viewer cleanup.",
);
