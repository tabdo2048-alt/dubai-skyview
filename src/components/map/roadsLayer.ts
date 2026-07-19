// Colored, labelled street network for the map — toggled by the "Roads" button.
//
// Self-contained and base-style-agnostic: adds its OWN Mapbox Streets v8 vector
// source (source-layer "road") and draws a line layer colored by road `class`
// plus a name label layer, so the same streets appear over both the satellite
// and 3D base styles. Palette + reveal animation mirror the reference
// investments map: a muted gold / green / light-blue scheme that fades and grows
// in when Roads is switched on.

import type mapboxgl from "mapbox-gl";

type Expr = mapboxgl.ExpressionSpecification;

export const ROADS_SOURCE_ID = "mapbox-streets-roads";
export const ROADS_LINE_ID = "roads-colored-line";
export const ROADS_LABEL_ID = "roads-name-label";

const LINE_OPACITY = 0.9;
const REVEAL_MS = 950;

// Muted 3-tone scheme by importance: gold highways, green arterials, blue minor.
const CLASS_COLOR = [
  "match",
  ["get", "class"],
  "motorway", "#e0b34d",
  "motorway_link", "#e0b34d",
  "trunk", "#e0b34d",
  "trunk_link", "#e0b34d",
  "primary", "#e0b34d", // gold — major roads
  "primary_link", "#e0b34d",
  "secondary", "#86b96a", // green — arterials
  "secondary_link", "#86b96a",
  "tertiary", "#86bbd8", // light blue
  "tertiary_link", "#86bbd8",
  "street", "#86bbd8",
  "street_limited", "#86bbd8",
  "service", "#86bbd8",
  "track", "#86bbd8",
  "pedestrian", "#5b8fb9", // deeper blue — paths
  "path", "#5b8fb9",
  /* other */ "#86bbd8",
] as unknown as Expr;

// Zoom → width stops; the reveal scales these by progress for the grow-in.
const WIDTH_STOPS: [number, number][] = [
  [9, 0.4],
  [12, 1.4],
  [15, 3.5],
  [18, 9],
];

function widthExpr(scale: number): Expr {
  const stops: unknown[] = [];
  for (const [z, w] of WIDTH_STOPS) stops.push(z, w * scale);
  return ["interpolate", ["linear"], ["zoom"], ...stops] as unknown as Expr;
}

const LABEL_SIZE = [
  "interpolate", ["linear"], ["zoom"], 12, 9, 16, 13, 19, 16,
] as unknown as Expr;

const LABEL_FIELD = ["coalesce", ["get", "name_en"], ["get", "name"]] as unknown as Expr;

/** Add the colored roads source + line/label layers (hidden until toggled on). */
export function addRoadsLayers(map: mapboxgl.Map): void {
  if (map.getSource(ROADS_SOURCE_ID)) return;

  map.addSource(ROADS_SOURCE_ID, {
    type: "vector",
    url: "mapbox://mapbox.mapbox-streets-v8",
  });

  map.addLayer({
    id: ROADS_LINE_ID,
    type: "line",
    source: ROADS_SOURCE_ID,
    "source-layer": "road",
    layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": CLASS_COLOR,
      "line-width": widthExpr(1),
      "line-opacity": LINE_OPACITY,
    },
  } as unknown as mapboxgl.LayerSpecification);

  map.addLayer({
    id: ROADS_LABEL_ID,
    type: "symbol",
    source: ROADS_SOURCE_ID,
    "source-layer": "road",
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
      "text-opacity": 1,
    },
  } as unknown as mapboxgl.LayerSpecification);
}

// Per-map reveal animation handles so a re-toggle cancels the in-flight one.
const revealFrames = new WeakMap<mapboxgl.Map, number>();

function setProgress(map: mapboxgl.Map, p: number): void {
  const eased = 1 - (1 - p) * (1 - p); // ease-out quad
  if (map.getLayer(ROADS_LINE_ID)) {
    map.setPaintProperty(ROADS_LINE_ID, "line-width", widthExpr(eased));
    map.setPaintProperty(ROADS_LINE_ID, "line-opacity", LINE_OPACITY * eased);
  }
  if (map.getLayer(ROADS_LABEL_ID)) {
    map.setPaintProperty(ROADS_LABEL_ID, "text-opacity", eased);
  }
}

/** Show/hide the colored roads + labels with a fade + grow-in reveal. */
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
