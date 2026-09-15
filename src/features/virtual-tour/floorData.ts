import { isNormalizedCoordinate } from "./validation";
import type { TourFloorRow, TourSceneRow } from "./types";

export interface NormalizedFloorPoint {
  x: number;
  y: number;
}

export interface ImageBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clampNormalizedCoordinate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function clampNormalizedPoint(point: NormalizedFloorPoint): NormalizedFloorPoint {
  return {
    x: clampNormalizedCoordinate(point.x),
    y: clampNormalizedCoordinate(point.y),
  };
}

export function normalizedPointToPercent(point: NormalizedFloorPoint): {
  left: string;
  top: string;
} {
  const normalized = clampNormalizedPoint(point);
  return { left: `${normalized.x * 100}%`, top: `${normalized.y * 100}%` };
}

export function calculateContainedImageBounds(
  containerWidth: number,
  containerHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): ImageBounds | null {
  if (
    ![containerWidth, containerHeight, naturalWidth, naturalHeight].every(
      (value) => Number.isFinite(value) && value > 0,
    )
  ) {
    return null;
  }
  const scale = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight);
  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  return {
    left: (containerWidth - width) / 2,
    top: (containerHeight - height) / 2,
    width,
    height,
  };
}

export function clientPointToNormalized(
  clientX: number,
  clientY: number,
  bounds: ImageBounds,
): NormalizedFloorPoint | null {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(clientY) ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.top) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    return null;
  }
  const x = (clientX - bounds.left) / bounds.width;
  const y = (clientY - bounds.top) / bounds.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return clampNormalizedPoint({ x, y });
}

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

export function scenesForFloor(
  tourId: string,
  floorId: string,
  scenes: TourSceneRow[],
): TourSceneRow[] {
  return scenes.filter((scene) => scene.tour_id === tourId && scene.floor_id === floorId);
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
  return normalizedPointToPercent({ x: scene.floor_plan_x, y: scene.floor_plan_y });
}
