declare global {
  // Cesium resolves workers, widgets and other runtime assets from this public URL.
  var CESIUM_BASE_URL: string | undefined;
}

export {};
