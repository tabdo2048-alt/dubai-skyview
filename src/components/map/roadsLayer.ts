// Colored, labelled main-road network for the map — toggled by the "Roads"
// button, and drawn on with a metro-style line-trim reveal.
//
// Uses a baked GeoJSON source (src/lib/roadsMain.generated.ts, from Overpass)
// with lineMetrics enabled so the reveal can animate `line-trim-offset` — each
// road draws itself from start to end along its length, exactly like the metro
// line reveal. (Vector-tile sources can't do this; they lack lineMetrics.) The
// data is dynamically imported the first time Roads is added so its ~2.8 MB
// stays out of the initial bundle.

import type mapboxgl from "mapbox-gl";

type Expr = mapboxgl.ExpressionSpecification;

export const ROADS_SOURCE_ID = "roads-main-geo";
export const ROADS_LINE_ID = "roads-colored-line";
export const ROADS_LABEL_ID = "roads-name-label";

const LINE_OPACITY = 0.9;
const REVEAL_MS = 5000; // roads draw on over 5 seconds

// Saturated by importance: orange-gold highways, green arterials, blue collectors.
const CLASS_COLOR = [
  "match",
  ["get", "class"],
  "motorway", "#ff7a00",
  "trunk", "#ff9500",
  "primary", "#ffc400",
  "secondary", "#22c55e",
  /* other */ "#1e90ff",
] as unknown as Expr;

const LINE_WIDTH = [
  "interpolate", ["linear"], ["zoom"], 9, 0.6, 12, 1.6, 15, 3.6, 18, 9,
] as unknown as Expr;

const LABEL_SIZE = [
  "interpolate", ["linear"], ["zoom"], 12, 9, 16, 13, 19, 16,
] as unknown as Expr;

const LABEL_FIELD = ["coalesce", ["get", "name"], ""] as unknown as Expr;

let addingInFlight = false;

/** Add the roads GeoJSON source + line/label layers (hidden until toggled on). */
export async function addRoadsLayers(map: mapboxgl.Map): Promise<void> {
  if (map.getSource(ROADS_SOURCE_ID) || addingInFlight) return;
  addingInFlight = true;
  try {
    const { ROADS_MAIN_GEOJSON } = await import("@/lib/roadsMain.generated");
    if (map.getSource(ROADS_SOURCE_ID)) return;

    map.addSource(ROADS_SOURCE_ID, {
      type: "geojson",
      data: ROADS_MAIN_GEOJSON,
      lineMetrics: true, // required for line-trim-offset / gradient draw reveal
    });

    map.addLayer({
      id: ROADS_LINE_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": CLASS_COLOR,
        "line-width": LINE_WIDTH,
        "line-opacity": LINE_OPACITY,
        // Whole line trimmed (hidden) initially; the reveal shrinks the trim.
        "line-trim-offset": [0, 1],
      },
    } as unknown as mapboxgl.LayerSpecification);

    map.addLayer({
      id: ROADS_LABEL_ID,
      type: "symbol",
      source: ROADS_SOURCE_ID,
      layout: {
        visibility: "none",
        "symbol-placement": "line",
        "text-field": LABEL_FIELD,
        "text-size": LABEL_SIZE,
        "text-font": ["DIN Pro Medium", "Arial Unicode MS Regular"],
        "text-max-angle": 40,
        "text-padding": 4,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "#101418",
        "text-halo-width": 1.6,
        "text-opacity": 0,
      },
    } as unknown as mapboxgl.LayerSpecification);
  } catch (err) {
    console.error("[roads] failed to add layers", err);
  } finally {
    addingInFlight = false;
  }
}

// Per-map reveal animation handle so a re-toggle cancels the in-flight one.
const revealFrames = new WeakMap<mapboxgl.Map, number>();

/** p 0→1 draws the roads on (trim shrinks from the whole line to nothing). */
function setProgress(map: mapboxgl.Map, p: number): void {
  const eased = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  if (map.getLayer(ROADS_LINE_ID)) {
    // Show 0..eased of each line; trim (hide) eased..1. eased=0 → all hidden,
    // eased=1 → [1,1] trims nothing → fully drawn.
    map.setPaintProperty(ROADS_LINE_ID, "line-trim-offset", [eased, 1]);
  }
  if (map.getLayer(ROADS_LABEL_ID)) {
    // Labels fade in over the back half of the draw.
    map.setPaintProperty(ROADS_LABEL_ID, "text-opacity", Math.max(0, (eased - 0.5) * 2));
  }
}

/** Show/hide the roads with a 5s metro-style draw-on (reverse on hide). */
export function setRoadsVisible(map: mapboxgl.Map, on: boolean): void {
  if (!map.getLayer(ROADS_LINE_ID)) return;

  const prev = revealFrames.get(map);
  if (prev) cancelAnimationFrame(prev);

  if (on) {
    for (const id of [ROADS_LINE_ID, ROADS_LABEL_ID]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    }
  }

  const start = performance.now();
  const from = on ? 0 : 1;
  const to = on ? 1 : 0;
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / REVEAL_MS);
    setProgress(map, from + (to - from) * t);
    if (t < 1) {
      revealFrames.set(map, requestAnimationFrame(tick));
    } else {
      revealFrames.delete(map);
      if (!on) {
        for (const id of [ROADS_LINE_ID, ROADS_LABEL_ID]) {
          if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
        }
      }
    }
  };
  setProgress(map, from);
  revealFrames.set(map, requestAnimationFrame(tick));
}
