import {
  createWorldImageryAsync,
  ImageryLayer,
  IonWorldImageryStyle,
  type Viewer,
} from "cesium";

/**
 * Adds Cesium ion's global aerial imagery to the 3D scene.
 * The public ion token must be restricted to the deployed application origins.
 */
export async function addCesiumSatelliteImagery(viewer: Viewer) {
  const provider = await createWorldImageryAsync({
    style: IonWorldImageryStyle.AERIAL,
  });
  if (viewer.isDestroyed()) return null;

  const layer = new ImageryLayer(provider, {
    brightness: 1.04,
    contrast: 1.08,
    saturation: 1.08,
    gamma: 1,
  });
  viewer.imageryLayers.add(layer, 0);
  viewer.scene.requestRender();
  return layer;
}
