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

// Saturated 3-tone scheme by importance: orange-gold highways, green arterials,
// blue collectors. Only MAIN classes are drawn (see MAIN_ROADS filter) so there
// are no residential "streets between homes" and no ferry lines over water.
const CLASS_COLOR = [
  "match",
  ["get", "class"],
  "motorway", "#ff7a00", // vivid orange — highways
  "motorway_link", "#ff7a00",
  "trunk", "#ff9500",
  "trunk_link", "#ff9500",
  "primary", "#ffc400", // vivid gold — major roads
  "primary_link", "#ffc400",
  "secondary", "#22c55e", // vivid green — arterials
  "secondary_link", "#22c55e",
  "tertiary", "#1e90ff", // vivid blue — collectors
  "tertiary_link", "#1e90ff",
  /* other (filtered out anyway) */ "#1e90ff",
] as unknown as Expr;

// Main roads only — matches the reference map: motorways/trunks/primaries down
// to tertiary collectors, but NO street/street_limited/service/track/path/ferry.
// Excluding ferry (and the minor classes) is what removes the stray line the
// user saw crossing the sea.
const MAIN_ROADS = [
  "match",
  ["get", "class"],
  [
    "motorway", "motorway_link",
    "trunk", "trunk_link",
    "primary", "primary_link",
    "secondary", "secondary_link",
    "tertiary", "tertiary_link",
  ],
  true,
  false,
] as unknown as mapboxgl.FilterSpecification;

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
    filter: MAIN_ROADS,
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
    filter: MAIN_ROADS,
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
