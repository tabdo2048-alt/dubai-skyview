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
  onDoubleClick?: (pick: ProjectPick) => void,
) {
  const handler = new ScreenSpaceEventHandler(viewer.scene.canvas);
  let hoveredFeature: Cesium3DTileFeature | null = null;
  let hoveredOriginal: Color | null = null;
  let selectedFeature: Cesium3DTileFeature | null = null;
  let selectedOriginal: Color | null = null;

  const restoreHover = () => {
    if (hoveredFeature && hoveredFeature !== selectedFeature && hoveredOriginal) {
      if (!hoveredFeature.tileset.isDestroyed()) {
        try {
          hoveredFeature.color = hoveredOriginal;
        } catch {
          /* Feature content may have been evicted. */
        }
      }
    }
    hoveredFeature = null;
    hoveredOriginal = null;
  };
  const restoreSelection = () => {
    if (selectedFeature && selectedOriginal && !selectedFeature.tileset.isDestroyed()) {
      try {
        selectedFeature.color = selectedOriginal;
      } catch {
        /* Feature content may have been evicted. */
      }
    }
    selectedFeature = null;
    selectedOriginal = null;
  };

  handler.setInputAction((movement: { endPosition: Cartesian2 }) => {
    const picked = viewer.scene.pick(movement.endPosition);
    restoreHover();
    const resolved = resolvePick(picked);
    if (resolved && picked instanceof Cesium3DTileFeature && picked !== selectedFeature) {
      hoveredFeature = picked;
      hoveredOriginal = picked.color.clone();
      picked.color = Color.fromCssColorString(MASTERPLAN_THEME.hovered).withAlpha(0.72);
    }
    viewer.scene.canvas.style.cursor = resolved ? "pointer" : "grab";
    onHover(resolved);
    viewer.scene.requestRender();
  }, ScreenSpaceEventType.MOUSE_MOVE);
  handler.setInputAction((click: { position: Cartesian2 }) => {
    const picked = viewer.scene.pick(click.position);
    restoreHover();
    restoreSelection();
    const resolved = resolvePick(picked);
    if (resolved && picked instanceof Cesium3DTileFeature) {
      selectedFeature = picked;
      selectedOriginal = picked.color.clone();
      picked.color = Color.fromCssColorString(MASTERPLAN_THEME.selected).withAlpha(0.82);
    }
    onSelect(resolved);
    viewer.scene.requestRender();
  }, ScreenSpaceEventType.LEFT_CLICK);
  handler.setInputAction((click: { position: Cartesian2 }) => {
    const resolved = resolvePick(viewer.scene.pick(click.position));
    if (resolved) onDoubleClick?.(resolved);
  }, ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  return () => {
    restoreHover();
    restoreSelection();
    handler.destroy();
    viewer.scene.canvas.style.cursor = "";
  };
}
