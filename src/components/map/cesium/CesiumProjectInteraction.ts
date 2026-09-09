import {
  Cesium3DTileFeature,
  Color,
  ScreenSpaceEventHandler,
  ScreenSpaceEventType,
  type Cartesian2,
  type Viewer,
} from "cesium";
import type { ProjectPick } from "./types";
import { MASTERPLAN_THEME } from "./theme";

export function connectProjectInteraction(
  viewer: Viewer,
  resolvePick: (picked: unknown) => ProjectPick | null,
  onHover: (pick: ProjectPick | null) => void,
  onSelect: (pick: ProjectPick | null) => void,
) {
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  let hoveredFeature: Cesium3DTileFeature | null = null;
  let hoveredOriginal: Color | null = null;
  let selectedFeature: Cesium3DTileFeature | null = null;
  let selectedOriginal: Color | null = null;

  const restoreHover = () => {
    if (hoveredFeature && hoveredFeature !== selectedFeature && hoveredOriginal) {
      hoveredFeature.color = hoveredOriginal;
    }
    hoveredFeature = null;
    hoveredOriginal = null;
  };
  const restoreSelection = () => {
    if (selectedFeature && selectedOriginal) selectedFeature.color = selectedOriginal;
    selectedFeature = null;
    selectedOriginal = null;
  };

  handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition);
    restoreHover();
    if (picked instanceof Cesium3DTileFeature && picked !== selectedFeature) {
      hoveredFeature = picked;
      hoveredOriginal = picked.color.clone();
      picked.color = Color.fromCssColorString(MASTERPLAN_THEME.hovered).withAlpha(0.72);
    }
    const resolved = resolvePick(picked);
    viewer.scene.canvas.style.cursor = resolved ? "pointer" : "grab";
    onHover(resolved);
  }, ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((click: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(click.position);
    restoreSelection();
    if (picked instanceof Cesium3DTileFeature) {
      selectedFeature = picked;
      selectedOriginal = picked.color.clone();
      picked.color = Color.fromCssColorString(MASTERPLAN_THEME.selected).withAlpha(0.82);
    }
    onSelect(resolvePick(picked));
  }, ScreenSpaceEventType.LEFT_CLICK);
  return () => {
    restoreHover();
    restoreSelection();
    handler.destroy();
    viewer.scene.canvas.style.cursor = "";
  };
}
