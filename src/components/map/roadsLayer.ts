// Colored, labelled main-road network for the map — toggled by the "Roads"
// button. Premium treatment:
//   • a faint always-present "ghost" substrate of the whole network, over which
//     the colored line sweeps on (constant-speed snake head) — the reveal reads
//     as illuminating an existing network, not drawing on emptiness;
//   • a per-class width hierarchy (motorway thickest → secondary thinnest) so
//     arterials dominate and secondary streets stay clearly subordinate — not a
//     communications grid;
//   • hover highlight: the road under the cursor lights up with a luminous glow,
//     brightens and thickens, with a generous invisible hit-line so thin roads
//     are easy to catch.
//
// Uses a baked GeoJSON source (src/lib/roadsMain.generated.ts, from Overpass)
// with lineMetrics (for the line-trim-offset draw) and generateId (for the
// per-feature hover feature-state). The data is dynamically imported the first
// time Roads is added so its ~2.8 MB stays out of the initial bundle.

import type mapboxgl from "mapbox-gl";

type Expr = mapboxgl.ExpressionSpecification;

export const ROADS_SOURCE_ID = "roads-main-geo";
export const ROADS_BASE_ID = "roads-ghost-line";
export const ROADS_LINE_ID = "roads-colored-line";
export const ROADS_GLOW_ID = "roads-hover-glow";
export const ROADS_HIT_ID = "roads-hit-line";
export const ROADS_LABEL_ID = "roads-name-label";

const LINE_OPACITY = 0.92;
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

// Per-class width hierarchy: motorways read as spines, secondary streets stay
// thin; hover thickens the live road. NOTE: Mapbox requires ["zoom"] to drive
// the OUTERMOST interpolate of a paint property, so the class/hover multipliers
// live inside each zoom stop (["*", zoomStop, classMult] at the top level is
// rejected by style validation and kills the whole layer).
const CLASS_MULT = [
  "match", ["get", "class"],
  "motorway", 1.5, "trunk", 1.25, "primary", 1.0, "secondary", 0.6,
  /* other */ 1.0,
] as const;
const HOVER_MULT = [
  "case", ["boolean", ["feature-state", "hover"], false], 1.9, 1,
] as const;

function classWidth(scale: number, withHover: boolean): Expr {
  const stop = (v: number) =>
    withHover ? ["*", v * scale, CLASS_MULT, HOVER_MULT] : ["*", v * scale, CLASS_MULT];
  return [
    "interpolate", ["linear"], ["zoom"],
    9, stop(0.6), 12, stop(1.6), 15, stop(3.4), 18, stop(8),
  ] as unknown as Expr;
}
const LINE_WIDTH = classWidth(1, true);
const BASE_WIDTH = classWidth(0.85, false);
const GLOW_WIDTH = classWidth(2.6, false);

// Hovered road brightens to full opacity; others hold at LINE_OPACITY.
const LINE_OPACITY_EXPR = [
  "case", ["boolean", ["feature-state", "hover"], false], 1, LINE_OPACITY,
] as unknown as Expr;

const GLOW_BLUR = [
  "interpolate", ["linear"], ["zoom"], 10, 1.5, 16, 5, 18, 7,
] as unknown as Expr;

const HIT_WIDTH = [
  "interpolate", ["linear"], ["zoom"], 9, 6, 15, 14, 18, 22,
] as unknown as Expr;

const LABEL_SIZE = [
  "interpolate", ["linear"], ["zoom"], 12, 9, 16, 13, 19, 16,
] as unknown as Expr;

const LABEL_FIELD = ["coalesce", ["get", "name"], ""] as unknown as Expr;

// Filter that matches no feature — the hover-glow layer's resting state.
const MATCH_NONE = ["==", ["id"], -1] as unknown as Expr;

const ALL_LAYERS = [ROADS_BASE_ID, ROADS_LINE_ID, ROADS_GLOW_ID, ROADS_HIT_ID, ROADS_LABEL_ID];

let addingInFlight = false;

/** Add the roads GeoJSON source + layers (hidden until toggled on). */
export async function addRoadsLayers(map: mapboxgl.Map): Promise<void> {
  if (addingInFlight) return;
  const layersReady = ALL_LAYERS.every((id) => map.getLayer(id));
  if (layersReady) return;

  addingInFlight = true;
  try {
    const { ROADS_MAIN_GEOJSON } = await import("@/lib/roadsMain.generated");
    if (!map.getSource(ROADS_SOURCE_ID)) {
      map.addSource(ROADS_SOURCE_ID, {
        type: "geojson",
        data: ROADS_MAIN_GEOJSON,
        lineMetrics: true, // required for the line-trim-offset draw reveal
        generateId: true, // required for per-feature hover feature-state
      });
    }

    // Faint substrate — the whole network, always full, so the reveal reads as
    // illuminating an existing network rather than drawing from nothing.
    map.addLayer({
      id: ROADS_BASE_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": CLASS_COLOR,
        "line-width": BASE_WIDTH,
        "line-opacity": 0.16,
      },
    } as unknown as mapboxgl.LayerSpecification);

    // Luminous glow, shown only under the hovered road (filtered to its id).
    map.addLayer({
      id: ROADS_GLOW_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      filter: MATCH_NONE,
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": "#ffffff",
        "line-width": GLOW_WIDTH,
        "line-blur": GLOW_BLUR,
        "line-opacity": 0.55,
      },
    } as unknown as mapboxgl.LayerSpecification);

    // The colored network that draws on and carries the hover brighten.
    map.addLayer({
      id: ROADS_LINE_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": CLASS_COLOR,
        "line-width": LINE_WIDTH,
        "line-opacity": LINE_OPACITY_EXPR,
        // Whole line trimmed (hidden) initially; the reveal shrinks the trim.
        "line-trim-offset": [0, 1],
      },
    } as unknown as mapboxgl.LayerSpecification);

    // Invisible generous hit target so thin roads are easy to hover.
    map.addLayer({
      id: ROADS_HIT_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#000000", "line-width": HIT_WIDTH, "line-opacity": 0 },
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

    attachHover(map);
  } catch (err) {
    console.error("[roads] failed to add layers", err);
  } finally {
    addingInFlight = false;
  }
}

// Per-map reveal animation handle so a re-toggle cancels the in-flight one.
const revealFrames = new WeakMap<mapboxgl.Map, number>();

/** p 0→1 draws the roads on. Head advances at a constant speed (linear) so the
 *  line draws itself like a snake gliding forward, leaving the drawn trail. */
function setProgress(map: mapboxgl.Map, p: number): void {
  const head = Math.max(0, Math.min(1, p));
  if (map.getLayer(ROADS_LINE_ID)) {
    map.setPaintProperty(ROADS_LINE_ID, "line-trim-offset", [head, 1]);
  }
  if (map.getLayer(ROADS_LABEL_ID)) {
    // Labels fade in over the back half of the draw.
    map.setPaintProperty(ROADS_LABEL_ID, "text-opacity", Math.max(0, (head - 0.5) * 2));
  }
}

/** Show the roads with a snake-style draw-on; hide instantly (no reverse). */
export function setRoadsVisible(map: mapboxgl.Map, on: boolean): void {
  if (!map.getLayer(ROADS_LINE_ID)) return;

  const prev = revealFrames.get(map);
  if (prev) {
    cancelAnimationFrame(prev);
    revealFrames.delete(map);
  }

  // Hiding is immediate — no ending / reverse animation.
  if (!on) {
    setProgress(map, 0);
    clearHover(map);
    for (const id of ALL_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    }
    return;
  }

  for (const id of ALL_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
  }

  // Respect reduced-motion: show the network fully, skip the draw.
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  if (reduce) {
    setProgress(map, 1);
    return;
  }

  const start = performance.now();
  const tick = () => {
    const t = Math.min(1, (performance.now() - start) / REVEAL_MS);
    setProgress(map, t);
    if (t < 1) {
      revealFrames.set(map, requestAnimationFrame(tick));
    } else {
      revealFrames.delete(map);
    }
  };
  setProgress(map, 0);
  revealFrames.set(map, requestAnimationFrame(tick));
}

// --- Hover highlight -------------------------------------------------------

const hoveredId = new WeakMap<mapboxgl.Map, number>();
const hoverWired = new WeakSet<mapboxgl.Map>();

function clearHover(map: mapboxgl.Map): void {
  const id = hoveredId.get(map);
  if (id !== undefined) {
    map.setFeatureState({ source: ROADS_SOURCE_ID, id }, { hover: false });
    hoveredId.delete(map);
  }
  if (map.getLayer(ROADS_GLOW_ID)) map.setFilter(ROADS_GLOW_ID, MATCH_NONE);
  map.getCanvas().style.cursor = "";
}

function attachHover(map: mapboxgl.Map): void {
  if (hoverWired.has(map)) return;
  hoverWired.add(map);

  map.on("mousemove", ROADS_HIT_ID, (e) => {
    const f = e.features?.[0];
    if (f?.id === undefined) return;
    const id = f.id as number;
    if (hoveredId.get(map) === id) return;
    const prev = hoveredId.get(map);
    if (prev !== undefined) map.setFeatureState({ source: ROADS_SOURCE_ID, id: prev }, { hover: false });
    hoveredId.set(map, id);
    map.setFeatureState({ source: ROADS_SOURCE_ID, id }, { hover: true });
    map.setFilter(ROADS_GLOW_ID, ["==", ["id"], id] as unknown as Expr);
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", ROADS_HIT_ID, () => clearHover(map));
}
