// Colored, labelled street network for the map — toggled by the "Roads" button.
//
// Self-contained and base-style-agnostic: instead of recoloring whichever road
// layers a given Mapbox style ships, it adds its OWN Mapbox Streets v8 vector
// source (mapbox://mapbox.mapbox-streets-v8, source-layer "road") and draws two
// layers on top — a line layer colored by road `class`, and a name label layer.
// That way the exact same colored streets appear over BOTH the satellite-streets
// basemap and the custom 3D Standard style. Both layers start hidden; the Roads
// toggle flips their visibility.

import type mapboxgl from "mapbox-gl";

type Expr = mapboxgl.ExpressionSpecification;

export const ROADS_SOURCE_ID = "mapbox-streets-roads";
export const ROADS_LINE_ID = "roads-colored-line";
export const ROADS_LABEL_ID = "roads-name-label";

// Distinct hue per road class — high-chroma so the streets read clearly over
// dark satellite imagery. Link ramps share their parent road's color.
const CLASS_COLOR = [
  "match",
  ["get", "class"],
  "motorway", "#ff3b30", // red — highways
  "motorway_link", "#ff3b30",
  "trunk", "#ff9500", // orange
  "trunk_link", "#ff9500",
  "primary", "#ffcc00", // amber
  "primary_link", "#ffcc00",
  "secondary", "#34c759", // green
  "secondary_link", "#34c759",
  "tertiary", "#32ade6", // cyan
  "tertiary_link", "#32ade6",
  "street", "#5e5ce6", // indigo — local streets
  "street_limited", "#5e5ce6",
  "service", "#af52de", // purple — service / access
  "track", "#af52de",
  "pedestrian", "#ff2d92", // pink — pedestrian / path
  "path", "#ff2d92",
  /* other */ "#ffffff",
] as unknown as Expr;

// Line width grows with zoom; readable at city zoom, bold up close.
const LINE_WIDTH = [
  "interpolate",
  ["linear"],
  ["zoom"],
  9, 0.4,
  12, 1.4,
  15, 3.5,
  18, 9,
] as unknown as Expr;

const LABEL_SIZE = [
  "interpolate",
  ["linear"],
  ["zoom"],
  12, 9,
  16, 13,
  19, 16,
] as unknown as Expr;

// Prefer the English name, fall back to the local name. Empty → Mapbox omits it.
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
    layout: {
      visibility: "none",
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": CLASS_COLOR,
      "line-width": LINE_WIDTH,
      "line-opacity": 0.95,
    },
  } as unknown as mapboxgl.LayerSpecification);

  // Name labels on top of the colored lines — white with a dark halo so they
  // stay legible over both bright roads and satellite imagery.
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
    },
  } as unknown as mapboxgl.LayerSpecification);
}

/** Show/hide the colored roads + labels. Safe to call before the layers exist. */
export function setRoadsVisible(map: mapboxgl.Map, on: boolean): void {
  const vis = on ? "visible" : "none";
  for (const id of [ROADS_LINE_ID, ROADS_LABEL_ID]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}
