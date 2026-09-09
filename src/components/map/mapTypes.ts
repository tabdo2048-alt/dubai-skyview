export type LightPreset = "dawn" | "day" | "dusk" | "night";

/** Camera state shared between Mapbox satellite and Cesium 3D. */
export type MapCameraState = {
  lat: number;
  lng: number;
  zoom: number;
  height?: number;
  heading?: number;
  pitch?: number;
};

