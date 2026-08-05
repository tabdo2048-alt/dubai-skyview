// Project plot boundaries on the PUBLIC map. One GeoJSON source + one fill + one
// line layer for ALL plots; the highlight is driven by a filter on the hovered
// project's id and faded via Mapbox paint transitions (no per-project layers, no
// rAF, no turf — stays out of the public bundle). GL layers sit under the DOM
// project markers automatically, so plots never cover the markers/popups.
import mapboxgl from "mapbox-gl";
import type { ProjectWithRelations } from "@/lib/types";

export const PLOTS_SRC = "project-plots-src";
export const PLOTS_FILL = "project-plots-fill";
export const PLOTS_LINE = "project-plots-line";

const FADE_MS = 250;
const EMPTY: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
// Match no feature until a plot is shown.
const NONE: mapboxgl.FilterSpecification = ["==", ["get", "id"], "__none__"];

export function ensurePlotLayers(map: mapboxgl.Map): void {
  if (!map.getSource(PLOTS_SRC)) {
    map.addSource(PLOTS_SRC, { type: "geojson", data: EMPTY });
  }
  if (!map.getLayer(PLOTS_FILL)) {
    map.addLayer({
      id: PLOTS_FILL,
      type: "fill",
      source: PLOTS_SRC,
      filter: NONE,
      paint: {
        // Per-project colour from the feature (defaults to project gold).
        "fill-color": ["coalesce", ["get", "color"], "#c9a84c"],
        "fill-opacity": 0,
        "fill-opacity-transition": { duration: FADE_MS, delay: 0 },
      },
    });
  }
  if (!map.getLayer(PLOTS_LINE)) {
    map.addLayer({
      id: PLOTS_LINE,
      type: "line",
      source: PLOTS_SRC,
      filter: NONE,
      paint: {
        "line-color": ["coalesce", ["get", "color"], "#c9a84c"],
        "line-width": 2,
        "line-opacity": 0,
        "line-opacity-transition": { duration: FADE_MS, delay: 0 },
      },
    });
  }
}

/** Rebuild the plots source from the projects that have a plot_geometry. Call on
 *  data change only — never on hover. */
export function setPlotData(map: mapboxgl.Map, projects: ProjectWithRelations[]): void {
  const src = map.getSource(PLOTS_SRC) as mapboxgl.GeoJSONSource | undefined;
  if (!src) return;
  const features: GeoJSON.Feature[] = [];
  for (const p of projects) {
    const g = p.plot_geometry as GeoJSON.Polygon | null | undefined;
    if (g && g.type === "Polygon") {
      const color = (p.plot_color as string | null | undefined) || "#c9a84c";
      features.push({ type: "Feature", geometry: g, properties: { id: p.id, color } });
    }
  }
  src.setData({ type: "FeatureCollection", features });
}

/** Fade in the plot for one project (filter + opacity transition). */
export function showPlot(map: mapboxgl.Map, id: string): void {
  if (!map.getLayer(PLOTS_FILL)) return;
  const filter: mapboxgl.FilterSpecification = ["==", ["get", "id"], id];
  map.setFilter(PLOTS_FILL, filter);
  map.setFilter(PLOTS_LINE, filter);
  map.setPaintProperty(PLOTS_FILL, "fill-opacity", 0.2);
  map.setPaintProperty(PLOTS_LINE, "line-opacity", 0.95);
}

/** Fade the plot back out. */
export function hidePlot(map: mapboxgl.Map): void {
  if (!map.getLayer(PLOTS_FILL)) return;
  map.setPaintProperty(PLOTS_FILL, "fill-opacity", 0);
  map.setPaintProperty(PLOTS_LINE, "line-opacity", 0);
}
