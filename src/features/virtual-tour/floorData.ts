import { isNormalizedCoordinate } from "./validation";
import type { TourFloorRow, TourSceneRow } from "./types";

export function sortTourFloors(floors: TourFloorRow[]): TourFloorRow[] {
  return [...floors].sort((left, right) => {
    if (left.sort_order !== right.sort_order) return left.sort_order - right.sort_order;
    if (left.floor_number === null && right.floor_number !== null) return 1;
    if (left.floor_number !== null && right.floor_number === null) return -1;
    if (left.floor_number !== null && right.floor_number !== null) {
      const floorNumberOrder = left.floor_number - right.floor_number;
      if (floorNumberOrder !== 0) return floorNumberOrder;
    }
    return left.created_at.localeCompare(right.created_at);
  });
}

export function publishedScenesForFloor(
  floor: TourFloorRow,
  scenes: TourSceneRow[],
): TourSceneRow[] {
  return scenes.filter(
    (scene) => scene.is_published && scene.tour_id === floor.tour_id && scene.floor_id === floor.id,
  );
}

export function visibleTourFloors(
  tourId: string,
  floors: TourFloorRow[],
  scenes: TourSceneRow[],
): TourFloorRow[] {
  return sortTourFloors(
    floors.filter(
      (floor) => floor.tour_id === tourId && publishedScenesForFloor(floor, scenes).length > 0,
    ),
  );
}

export function resolveCurrentFloor(
  scene: TourSceneRow,
  floors: TourFloorRow[],
): TourFloorRow | null {
  if (!scene.floor_id) return null;
  return (
    floors.find((floor) => floor.id === scene.floor_id && floor.tour_id === scene.tour_id) ?? null
  );
}

export function hasFloorPlanPosition(
  scene: TourSceneRow,
): scene is TourSceneRow & { floor_plan_x: number; floor_plan_y: number } {
  return isNormalizedCoordinate(scene.floor_plan_x) && isNormalizedCoordinate(scene.floor_plan_y);
}

export function floorPlanPositionPercent(
  scene: TourSceneRow,
): { left: string; top: string } | null {
  if (!hasFloorPlanPosition(scene)) return null;
  return {
    left: `${scene.floor_plan_x * 100}%`,
    top: `${scene.floor_plan_y * 100}%`,
  };
}
