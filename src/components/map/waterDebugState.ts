/** Development-only gate for the marine geometry editor. */
export function shouldShowWaterDebugEditor() {
  if (!import.meta.env.DEV) return false;
  if (import.meta.env.VITE_WATER_DEBUG === "true") return true;
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("dubai:water-debug") === "1";
}
