type TourStorageIds = {
  tenantId: string;
  projectId: string;
  tourId: string;
};

type SceneStorageIds = TourStorageIds & { sceneId: string };
type FloorStorageIds = TourStorageIds & { floorId: string };
export type TourImageExtension = "jpg" | "png" | "webp";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function assertStorageIds(ids: Record<string, string>): void {
  for (const [name, value] of Object.entries(ids)) {
    if (!UUID_PATTERN.test(value)) throw new Error(`Invalid ${name} for virtual-tour storage path`);
  }
}

function tourRoot(ids: TourStorageIds): string {
  assertStorageIds(ids);
  return `${ids.tenantId}/projects/${ids.projectId}/tours/${ids.tourId}`;
}

export function panoramaStoragePath(
  ids: SceneStorageIds,
  extension: TourImageExtension = "jpg",
): string {
  assertStorageIds({ sceneId: ids.sceneId });
  return `${tourRoot(ids)}/scenes/${ids.sceneId}/panorama.${extension}`;
}

export function sceneThumbnailStoragePath(
  ids: SceneStorageIds,
  extension: TourImageExtension = "jpg",
): string {
  assertStorageIds({ sceneId: ids.sceneId });
  return `${tourRoot(ids)}/scenes/${ids.sceneId}/thumbnail.${extension}`;
}

export function floorPlanStoragePath(
  ids: FloorStorageIds,
  extension: TourImageExtension = "jpg",
): string {
  assertStorageIds({ floorId: ids.floorId });
  return `${tourRoot(ids)}/floors/${ids.floorId}/floor-plan.${extension}`;
}
