import assert from "node:assert/strict";
import { findTourScene, selectDefaultTourScene } from "../src/features/virtual-tour/queries";
import {
  hotspotExternalUrl,
  hotspotNavigationDirection,
  hotspotUnitTypeId,
  validateSceneHotspots,
} from "../src/features/virtual-tour/hotspotData";
import {
  panoramaStoragePathFromValue,
  TOUR_SIGNED_URL_TTL_SECONDS,
} from "../src/features/virtual-tour/panoramaUrl";
import {
  destroyPannellumViewer,
  setPannellumHotspots,
  type PannellumViewer,
} from "../src/features/virtual-tour/viewer/pannellumAdapter";
import type { TourHotspotRow, TourSceneRow } from "../src/features/virtual-tour/types";
import {
  adjacentTourScenes,
  findTimeOfDayPair,
  normalizeHeading,
  sceneExperienceMetadata,
  withSceneExperienceMetadata,
} from "../src/features/virtual-tour/sceneExperience";
import { resolveWalkScenes } from "../src/features/virtual-tour/walkData";
import {
  projectAvailabilityStyleConditions,
  readProjectFeatureMetadata,
} from "../src/components/map/cesium/projectFeatureMetadata";

function scene(id: string, sortOrder: number): TourSceneRow {
  return {
    id,
    tour_id: "00000000-0000-4000-8000-000000000001",
    floor_id: null,
    name: id,
    description: null,
    panorama_url: id + ".jpg",
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

function hotspot(
  id: string,
  type: TourHotspotRow["type"],
  overrides: Partial<TourHotspotRow> = {},
): TourHotspotRow {
  return {
    id,
    scene_id: "entrance",
    target_scene_id: type === "navigation" ? "lobby" : null,
    type,
    label: id,
    yaw: 10,
    pitch: 2,
    icon: null,
    metadata: {},
    sort_order: 0,
    created_at: "2026-09-14T00:00:00.000Z",
    updated_at: "2026-09-14T00:00:00.000Z",
    ...overrides,
  };
}

const scenes = [scene("entrance", 0), scene("lobby", 1)];
assert.equal(selectDefaultTourScene(scenes)?.id, "entrance");
assert.equal(selectDefaultTourScene([]), null);
assert.equal(findTourScene(scenes, "lobby")?.id, "lobby");
assert.equal(findTourScene(scenes, "another-tour-scene"), null);
assert.equal(adjacentTourScenes(scenes, "entrance").next?.id, "lobby");
assert.equal(adjacentTourScenes(scenes, "lobby").previous?.id, "entrance");
assert.equal(normalizeHeading(-10), 350);
const dayScene = {
  ...scene("tower-day", 2),
  name: "Tower Day",
  multires_config: withSceneExperienceMetadata(null, {
    timeOfDay: "day",
    pairedSceneId: "tower-night",
    compassNorthOffset: 370,
    verticalLabel: "Rooftop",
  }),
};
const nightScene = {
  ...scene("tower-night", 3),
  name: "Tower Night",
  multires_config: withSceneExperienceMetadata(null, { timeOfDay: "night" }),
};
assert.equal(sceneExperienceMetadata(dayScene).compassNorthOffset, 10);
assert.equal(sceneExperienceMetadata(dayScene).verticalLabel, "Rooftop");
assert.equal(findTimeOfDayPair(dayScene, [...scenes, dayScene, nightScene])?.id, "tower-night");

const objectPath =
  "00000000-0000-4000-8000-000000000001/projects/00000000-0000-4000-8000-000000000002/tours/00000000-0000-4000-8000-000000000003/scenes/00000000-0000-4000-8000-000000000004/panorama.jpg";
assert.equal(panoramaStoragePathFromValue(objectPath), objectPath);
assert.equal(
  panoramaStoragePathFromValue(
    "https://example.supabase.co/storage/v1/object/public/tour-panoramas/" + objectPath,
  ),
  objectPath,
);
assert.equal(panoramaStoragePathFromValue("../another-tenant/panorama.jpg"), null);
assert.equal(panoramaStoragePathFromValue("folder//panorama.jpg"), null);
assert.equal(TOUR_SIGNED_URL_TTL_SECONDS, 3600);

const validNavigation = hotspot("go-lobby", "navigation");
const validInfo = hotspot("details", "information");
const validExternal = hotspot("website", "external_link", {
  metadata: { url: "https://example.com" },
});
const invalidExternal = hotspot("unsafe", "external_link", {
  metadata: { url: "javascript:alert(1)" },
});
const invalidTarget = hotspot("bad-target", "navigation", {
  target_scene_id: "another-tour-scene",
});
const wrongScene = hotspot("wrong-scene", "information", { scene_id: "lobby" });
const invalidPitch = hotspot("bad-pitch", "amenity", { pitch: 120 });

const validated = validateSceneHotspots(
  [
    validNavigation,
    validInfo,
    validExternal,
    invalidExternal,
    invalidTarget,
    wrongScene,
    invalidPitch,
  ],
  "entrance",
  scenes,
);
assert.deepEqual(
  validated.map((item) => item.id),
  ["go-lobby", "details", "website"],
);
const availabilityConditions = projectAvailabilityStyleConditions([
  { id: "unit-1704", availability: "available" },
  { id: "unsafe'id", availability: "sold" },
]);
assert.match(availabilityConditions[0][0], /unit-1704/);
assert.equal(
  availabilityConditions.some(([condition]) => condition.includes("unsafe'id")),
  false,
);
assert.equal(hotspotExternalUrl(validExternal.metadata), "https://example.com");
assert.equal(hotspotExternalUrl({ url: "http://example.com" }), null);
assert.equal(hotspotExternalUrl(invalidExternal.metadata), null);
assert.equal(hotspotUnitTypeId({ unitTypeId: "unit-911" }), "unit-911");
assert.equal(hotspotUnitTypeId({ unit_type_id: "legacy-unit" }), "legacy-unit");
assert.equal(hotspotUnitTypeId({ unitTypeId: "" }), null);
assert.equal(hotspotNavigationDirection({ direction: "forward" }), "forward");
assert.equal(hotspotNavigationDirection({ direction: "sideways" }), "auto");

const walkForward = hotspot("walk-forward", "navigation", {
  target_scene_id: "lobby",
  metadata: { direction: "forward" },
});
const walkBackward = hotspot("walk-back", "navigation", {
  target_scene_id: "entrance",
  scene_id: "lobby",
  metadata: { direction: "backward" },
});
assert.equal(resolveWalkScenes(scenes, [walkForward], null, null).forward?.id, "lobby");
assert.equal(resolveWalkScenes(scenes, [walkBackward], null, null).backward?.id, "entrance");
assert.equal(resolveWalkScenes(scenes, [walkBackward], scenes[0], scenes[1]).forward?.id, "lobby");

const featureProperties = new Map<string, unknown>([
  ["name", "Apartment 1704"],
  ["floor_number", 17],
  ["unit_type_id", "unit-1704"],
  ["availability", "Available"],
]);
assert.deepEqual(
  readProjectFeatureMetadata({
    hasProperty: (name) => featureProperties.has(name),
    getProperty: (name) => featureProperties.get(name),
  }),
  {
    featureName: "Apartment 1704",
    floorLabel: "17",
    unitTypeId: "unit-1704",
    availability: "available",
    featureType: undefined,
  },
);

let offCalls = 0;
let destroyCalls = 0;
const addedIds: string[] = [];
const removedIds: string[] = [];
const fakeViewer = {
  addHotSpot: (config: Record<string, unknown>) => {
    addedIds.push(String(config.id));
    return fakeViewer;
  },
  removeHotSpot: (id: string) => {
    removedIds.push(id);
    return true;
  },
  off: () => {
    offCalls += 1;
    return fakeViewer;
  },
  destroy: () => {
    destroyCalls += 1;
  },
} as unknown as PannellumViewer;

setPannellumHotspots(fakeViewer, [
  {
    id: "go-lobby",
    pitch: 2,
    yaw: 10,
    type: "navigation",
    label: "Lobby",
    ariaLabel: "انتقل إلى Lobby",
    onActivate: () => undefined,
  },
]);
setPannellumHotspots(fakeViewer, []);
assert.deepEqual(addedIds, ["go-lobby"]);
assert.deepEqual(removedIds, ["go-lobby"]);

destroyPannellumViewer(fakeViewer);
assert.equal(offCalls, 1);
assert.equal(destroyCalls, 1);
destroyPannellumViewer(null);

const failedViewer = {
  addHotSpot: () => {
    throw new Error("panorama not ready");
  },
  removeHotSpot: () => {
    throw new Error("viewer already failed");
  },
} as unknown as PannellumViewer;
assert.doesNotThrow(() =>
  setPannellumHotspots(failedViewer, [
    {
      id: "safe-after-load-error",
      pitch: 0,
      yaw: 0,
      type: "information",
      label: "Info",
      ariaLabel: "عرض معلومات Info",
      onActivate: () => undefined,
    },
  ]),
);
assert.doesNotThrow(() => setPannellumHotspots(failedViewer, []));

console.log(
  "Virtual-tour checks passed: scene selection, walk navigation, 3D feature metadata, signed URL safety, hotspot validation, external URL rejection, failed-viewer isolation, lifecycle cleanup, and viewer destruction.",
);
