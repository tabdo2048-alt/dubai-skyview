import { hotspotNavigationDirection } from "./hotspotData";
import type { TourHotspotRow, TourSceneRow } from "./types";

export function resolveWalkScenes(
  scenes: TourSceneRow[],
  hotspots: TourHotspotRow[],
  previous: TourSceneRow | null,
  next: TourSceneRow | null,
) {
  const navigation = hotspots.filter(
    (hotspot) => hotspot.type === "navigation" && hotspot.target_scene_id,
  );
  const sceneForDirection = (direction: "forward" | "backward") => {
    const hotspot = navigation.find(
      (candidate) => hotspotNavigationDirection(candidate.metadata) === direction,
    );
    return hotspot?.target_scene_id
      ? (scenes.find((candidate) => candidate.id === hotspot.target_scene_id) ?? null)
      : null;
  };
  const autoTarget = navigation.find(
    (candidate) => hotspotNavigationDirection(candidate.metadata) === "auto",
  )?.target_scene_id;

  return {
    backward: sceneForDirection("backward") ?? previous,
    forward:
      sceneForDirection("forward") ??
      (autoTarget ? (scenes.find((candidate) => candidate.id === autoTarget) ?? null) : null) ??
      next,
  };
}
