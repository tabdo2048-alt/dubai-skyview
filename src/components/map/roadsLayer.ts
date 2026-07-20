// Colored, labelled main-road network for the map — toggled by the "Roads"
// button. Premium treatment:
//   • ten signature roads each carry their own brand color (defined as CSS
//     variables on :root so they can be re-themed without touching code); all
//     other roads fall back to the per-class hierarchy colors;
//   • staggered draw-on: the background network washes in first while each
//     signature road draws itself (~1s each, cascading delays);
//   • hover: the road under the cursor smoothly thickens, brightens and gains a
//     soft glow in its own color (60 fps rAF-driven feature-state — Mapbox GL
//     lines are WebGL, CSS transitions don't apply);
//   • click: a subtle 300 ms pulse plus a dark glass tooltip with the road name.
//
// Uses a baked GeoJSON source (src/lib/roadsMain.generated.ts, from Overpass)
// with lineMetrics (for the line-trim-offset draw) and generateId (for the
// per-feature hover feature-state). The data is dynamically imported the first
// time Roads is added so its ~2.8 MB stays out of the initial bundle.

import mapboxgl from "mapbox-gl";

type Expr = mapboxgl.ExpressionSpecification;

export const ROADS_SOURCE_ID = "roads-main-geo";
export const ROADS_BASE_ID = "roads-ghost-line";
export const ROADS_LINE_ID = "roads-colored-line"; // non-signature roads
export const ROADS_GLOW_ID = "roads-hover-glow";
export const ROADS_HIT_ID = "roads-hit-line";
export const ROADS_LABEL_ID = "roads-name-label";

const LINE_OPACITY = 0.92;

// --- Signature roads -------------------------------------------------------
// `match` is tested against the OSM `name` property (note OSM spellings:
// "Lahbab", "Dubai - Al Ain Road", "Sheikh Zayed bin Hamdan Al Nahyan Street").
// Colors live in CSS variables (see ROADS_CSS) and are read at layer-add time;
// the hex here is only the fallback if the variable is missing.
const ROUTES = [
  { key: "mbz", name: "Mohammed Bin Zayed Road", cssVar: "--road-mbz", color: "#2563EB", match: /mohammed bin zayed/i },
  { key: "hamdan", name: "Zayed Bin Hamdan Road", cssVar: "--road-hamdan", color: "#16A34A", match: /zayed bin hamdan/i },
  { key: "emirates", name: "Emirates Road", cssVar: "--road-emirates", color: "#F97316", match: /^emirates road$/i },
  { key: "alkhail", name: "Al Khail Road", cssVar: "--road-alkhail", color: "#8B5CF6", match: /^al khail road$/i },
  { key: "alain", name: "Dubai–Al Ain Road", cssVar: "--road-alain", color: "#DC2626", match: /dubai\s*-\s*al ain road/i },
  { key: "hessa", name: "Hessa Street", cssVar: "--road-hessa", color: "#06B6D4", match: /^hessa street/i },
  { key: "ummsuqeim", name: "Umm Suqeim Street", cssVar: "--road-ummsuqeim", color: "#EAB308", match: /^umm suqeim street/i },
  { key: "expo", name: "Expo Road", cssVar: "--road-expo", color: "#EC4899", match: /^expo road$/i },
  { key: "lehbab", name: "Lehbab Road", cssVar: "--road-lehbab", color: "#14B8A6", match: /lahbab road/i },
  { key: "szr", name: "Sheikh Zayed Road", cssVar: "--road-szr", color: "#4F46E5", match: /^sheikh zayed road/i },
] as const;

type Route = (typeof ROUTES)[number];

const routeLayerId = (key: string) => `roads-route-${key}`;

const ROADS_CSS = `:root{${ROUTES.map((r) => `${r.cssVar}:${r.color};`).join("")}}
.road-popup .mapboxgl-popup-content{background:rgba(12,16,22,.92);backdrop-filter:blur(8px);
  border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px 14px;
  box-shadow:0 8px 28px rgba(0,0,0,.45);color:#fff;
  font:600 12px/1.3 'Work Sans',Arial,sans-serif;letter-spacing:.2px}
.road-popup .mapboxgl-popup-tip{border-top-color:rgba(12,16,22,.92);border-bottom-color:rgba(12,16,22,.92)}
.road-popup .road-tip-row{display:flex;align-items:center;gap:8px}
.road-popup .road-tip-dot{width:8px;height:8px;border-radius:9999px;flex:none;
  box-shadow:0 0 8px currentColor;background:currentColor}`;

function ensureRoadsStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById("roads-route-style")) return;
  const el = document.createElement("style");
  el.id = "roads-route-style";
  el.textContent = ROADS_CSS;
  document.head.appendChild(el);
}

function routeColor(route: Route): string {
  if (typeof document === "undefined") return route.color;
  const v = getComputedStyle(document.documentElement).getPropertyValue(route.cssVar).trim();
  return v || route.color;
}

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

// Signature roads use their tagged color; everything else the class palette.
const ROAD_COLOR = ["to-color", ["coalesce", ["get", "routeColor"], CLASS_COLOR]] as unknown as Expr;

// Per-class width hierarchy: motorways read as spines, secondary streets stay
// thin; hover/pulse thicken the live road. NOTE: Mapbox requires ["zoom"] to
// drive the OUTERMOST interpolate of a paint property, so the class/effect
// multipliers live inside each zoom stop (["*", zoomStop, classMult] at the top
// level is rejected by style validation and kills the whole layer).
const CLASS_MULT = [
  "match", ["get", "class"],
  "motorway", 1.5, "trunk", 1.25, "primary", 1.0, "secondary", 0.6,
  /* other */ 1.0,
] as const;

// hoverT/pulseT are 0..1 feature-state values animated at 60 fps by the fx
// loop below (eased there, so the paint expression stays linear).
const HOVER_T = ["to-number", ["feature-state", "hoverT"]] as const;
const PULSE_T = ["to-number", ["feature-state", "pulseT"]] as const;
const FX_MULT = ["+", 1, ["*", 0.9, HOVER_T], ["*", 0.35, PULSE_T]] as const;

function classWidth(scale: number, withFx: boolean): Expr {
  const stop = (v: number) =>
    withFx ? ["*", v * scale, CLASS_MULT, FX_MULT] : ["*", v * scale, CLASS_MULT];
  return [
    "interpolate", ["linear"], ["zoom"],
    9, stop(0.6), 12, stop(1.6), 15, stop(3.4), 18, stop(8),
  ] as unknown as Expr;
}
const LINE_WIDTH = classWidth(1, true);
const BASE_WIDTH = classWidth(0.85, false);
const GLOW_WIDTH = classWidth(2.6, true);

// Hovered road brightens to full opacity; others hold at LINE_OPACITY.
const LINE_OPACITY_EXPR = [
  "+", LINE_OPACITY, ["*", 1 - LINE_OPACITY, HOVER_T],
] as unknown as Expr;

// Glow fades in/out with hover and flashes with the click pulse.
const GLOW_OPACITY_EXPR = ["*", 0.6, ["max", HOVER_T, PULSE_T]] as unknown as Expr;

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

const ROUTE_LAYER_IDS = ROUTES.map((r) => routeLayerId(r.key));
const ALL_LAYERS = [
  ROADS_BASE_ID, ROADS_GLOW_ID, ROADS_LINE_ID, ...ROUTE_LAYER_IDS, ROADS_HIT_ID, ROADS_LABEL_ID,
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

let addingInFlight = false;

/** Add the roads GeoJSON source + layers (hidden until toggled on). */
export async function addRoadsLayers(map: mapboxgl.Map): Promise<void> {
  if (addingInFlight) return;
  const layersReady = ALL_LAYERS.every((id) => map.getLayer(id));
  if (layersReady) return;

  addingInFlight = true;
  try {
    ensureRoadsStyles();
    const { ROADS_MAIN_GEOJSON } = await import("@/lib/roadsMain.generated");

    // Tag signature-road features with their route key + CSS-variable color so
    // paint expressions (line, glow) and the tooltip share one color source.
    for (const f of ROADS_MAIN_GEOJSON.features as GeoJSON.Feature[]) {
      const nm = f.properties?.name;
      if (typeof nm !== "string") continue;
      const route = ROUTES.find((r) => r.match.test(nm));
      if (route && f.properties) {
        f.properties.route = route.key;
        f.properties.routeColor = routeColor(route);
      }
    }

    if (!map.getSource(ROADS_SOURCE_ID)) {
      map.addSource(ROADS_SOURCE_ID, {
        type: "geojson",
        data: ROADS_MAIN_GEOJSON,
        lineMetrics: true, // required for the line-trim-offset draw reveal
        generateId: true, // required for per-feature hover feature-state
      });
    }

    const lineLayout = {
      visibility: "none",
      "line-cap": "round",
      "line-join": "round",
    } as const;

    // Faint substrate — the whole network, always full, so the reveal reads as
    // illuminating an existing network rather than drawing from nothing.
    map.addLayer({
      id: ROADS_BASE_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      layout: { ...lineLayout },
      paint: {
        "line-color": ROAD_COLOR,
        "line-width": BASE_WIDTH,
        "line-opacity": 0.16,
      },
    } as unknown as mapboxgl.LayerSpecification);

    // Soft glow in the road's own color — opacity rides the hover/pulse
    // feature-state, filter narrows it to the animating roads only.
    map.addLayer({
      id: ROADS_GLOW_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      filter: MATCH_NONE,
      layout: { ...lineLayout },
      paint: {
        "line-color": ROAD_COLOR,
        "line-width": GLOW_WIDTH,
        "line-blur": GLOW_BLUR,
        "line-opacity": GLOW_OPACITY_EXPR,
      },
    } as unknown as mapboxgl.LayerSpecification);

    // Non-signature roads: one layer, washes in first during the reveal.
    map.addLayer({
      id: ROADS_LINE_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      filter: ["!", ["has", "route"]] as unknown as Expr,
      layout: { ...lineLayout },
      paint: {
        "line-color": ROAD_COLOR,
        "line-width": LINE_WIDTH,
        "line-opacity": LINE_OPACITY_EXPR,
        // Whole line trimmed (hidden) initially; the reveal shrinks the trim.
        "line-trim-offset": [0, 1],
      },
    } as unknown as mapboxgl.LayerSpecification);

    // One layer per signature road so each can draw on with its own staggered
    // timeline (line-trim-offset is per-layer, not per-feature).
    for (const r of ROUTES) {
      map.addLayer({
        id: routeLayerId(r.key),
        type: "line",
        source: ROADS_SOURCE_ID,
        filter: ["==", ["get", "route"], r.key] as unknown as Expr,
        layout: { ...lineLayout },
        paint: {
          "line-color": ROAD_COLOR,
          "line-width": LINE_WIDTH,
          "line-opacity": LINE_OPACITY_EXPR,
          "line-trim-offset": [0, 1],
        },
      } as unknown as mapboxgl.LayerSpecification);
    }

    // Invisible generous hit target so thin roads are easy to hover.
    map.addLayer({
      id: ROADS_HIT_ID,
      type: "line",
      source: ROADS_SOURCE_ID,
      layout: { ...lineLayout },
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

    attachInteractions(map);
  } catch (err) {
    console.error("[roads] failed to add layers", err);
  } finally {
    addingInFlight = false;
  }
}

// --- Draw-on reveal --------------------------------------------------------

// Background network washes in over OTHERS_MS; each signature road draws
// itself over ROUTE_MS, cascading ROUTE_STAGGER apart.
const OTHERS_MS = 1800;
const ROUTE_MS = 1000;
const ROUTE_STAGGER = 130;
const ROUTE_DELAY0 = 250;
const REVEAL_TOTAL = Math.max(
  OTHERS_MS,
  ROUTE_DELAY0 + (ROUTES.length - 1) * ROUTE_STAGGER + ROUTE_MS,
);

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Per-map reveal animation handle so a re-toggle cancels the in-flight one.
const revealFrames = new WeakMap<mapboxgl.Map, number>();

function setTrim(map: mapboxgl.Map, layerId: string, head: number): void {
  if (map.getLayer(layerId)) {
    map.setPaintProperty(layerId, "line-trim-offset", [clamp01(head), 1]);
  }
}

/** Drive every draw-layer + the labels to `elapsed` ms of the reveal timeline. */
function setRevealElapsed(map: mapboxgl.Map, elapsed: number): void {
  setTrim(map, ROADS_LINE_ID, smoothstep(clamp01(elapsed / OTHERS_MS)));
  ROUTES.forEach((r, i) => {
    const t = clamp01((elapsed - ROUTE_DELAY0 - i * ROUTE_STAGGER) / ROUTE_MS);
    setTrim(map, routeLayerId(r.key), smoothstep(t));
  });
  if (map.getLayer(ROADS_LABEL_ID)) {
    // Labels fade in over the last portion of the reveal.
    const t = clamp01((elapsed - (REVEAL_TOTAL - 700)) / 700);
    map.setPaintProperty(ROADS_LABEL_ID, "text-opacity", t);
  }
}

/** Show the roads with staggered draw-on; hide instantly (no reverse). */
export function setRoadsVisible(map: mapboxgl.Map, on: boolean): void {
  if (!map.getLayer(ROADS_LINE_ID)) return;

  const prev = revealFrames.get(map);
  if (prev) {
    cancelAnimationFrame(prev);
    revealFrames.delete(map);
  }

  // Hiding is immediate — no ending / reverse animation.
  if (!on) {
    setRevealElapsed(map, 0);
    clearHover(map);
    closePopup(map);
    for (const id of ALL_LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    }
    return;
  }

  for (const id of ALL_LAYERS) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
  }

  // Respect reduced-motion: show the network fully, skip the draw.
  if (prefersReducedMotion()) {
    setRevealElapsed(map, REVEAL_TOTAL);
    return;
  }

  const start = performance.now();
  const tick = () => {
    const elapsed = performance.now() - start;
    setRevealElapsed(map, elapsed);
    if (elapsed < REVEAL_TOTAL) {
      revealFrames.set(map, requestAnimationFrame(tick));
    } else {
      revealFrames.delete(map);
    }
  };
  setRevealElapsed(map, 0);
  revealFrames.set(map, requestAnimationFrame(tick));
}

// --- Hover / click effects -------------------------------------------------
// Mapbox feature-state changes are not CSS-transitionable, so a single rAF
// loop eases hoverT toward its target (~350 ms, smoothstep) and runs the
// 300 ms click pulse. It only touches feature-state + the glow filter — no
// DOM layout or repaint; the expressions evaluate on the GPU.

const HOVER_MS = 350;
const PULSE_MS = 300;

type FxState = { t: number; target: number; pulseStart: number | null };

const fxStates = new WeakMap<mapboxgl.Map, Map<number, FxState>>();
const fxFrames = new WeakMap<mapboxgl.Map, number>();
const fxLast = new WeakMap<mapboxgl.Map, number>();
const hoveredId = new WeakMap<mapboxgl.Map, number>();
const interactionsWired = new WeakSet<mapboxgl.Map>();
const popups = new WeakMap<mapboxgl.Map, { popup: mapboxgl.Popup; timer: number }>();

function states(map: mapboxgl.Map): Map<number, FxState> {
  let s = fxStates.get(map);
  if (!s) {
    s = new Map();
    fxStates.set(map, s);
  }
  return s;
}

function syncGlowFilter(map: mapboxgl.Map): void {
  if (!map.getLayer(ROADS_GLOW_ID)) return;
  const ids = [...states(map).keys()];
  map.setFilter(
    ROADS_GLOW_ID,
    ids.length ? (["in", ["id"], ["literal", ids]] as unknown as Expr) : MATCH_NONE,
  );
}

function startFxLoop(map: mapboxgl.Map): void {
  if (fxFrames.has(map)) return;
  fxLast.set(map, performance.now());
  const step = () => {
    const now = performance.now();
    const dt = now - (fxLast.get(map) ?? now);
    fxLast.set(map, now);

    const s = states(map);
    let filterDirty = false;
    for (const [id, fx] of s) {
      const dir = fx.target > fx.t ? 1 : -1;
      fx.t = clamp01(fx.t + (dir * dt) / HOVER_MS);

      let pulse = 0;
      if (fx.pulseStart !== null) {
        const p = (now - fx.pulseStart) / PULSE_MS;
        if (p >= 1) fx.pulseStart = null;
        else pulse = Math.sin(Math.PI * clamp01(p)); // grow then settle back
      }

      map.setFeatureState(
        { source: ROADS_SOURCE_ID, id },
        { hoverT: smoothstep(fx.t), pulseT: pulse },
      );

      if (fx.t === 0 && fx.target === 0 && fx.pulseStart === null) {
        s.delete(id);
        filterDirty = true;
      }
    }
    if (filterDirty) syncGlowFilter(map);

    if (s.size) {
      fxFrames.set(map, requestAnimationFrame(step));
    } else {
      fxFrames.delete(map);
    }
  };
  fxFrames.set(map, requestAnimationFrame(step));
}

function setHoverTarget(map: mapboxgl.Map, id: number, target: number): void {
  const s = states(map);
  const fx = s.get(id) ?? { t: 0, target: 0, pulseStart: null };
  fx.target = target;
  if (prefersReducedMotion()) fx.t = target;
  s.set(id, fx);
  syncGlowFilter(map);
  startFxLoop(map);
}

function startPulse(map: mapboxgl.Map, id: number): void {
  if (prefersReducedMotion()) return;
  const s = states(map);
  const fx = s.get(id) ?? { t: 0, target: 0, pulseStart: null };
  fx.pulseStart = performance.now();
  s.set(id, fx);
  syncGlowFilter(map);
  startFxLoop(map);
}

function clearHover(map: mapboxgl.Map): void {
  const id = hoveredId.get(map);
  if (id !== undefined) {
    setHoverTarget(map, id, 0);
    hoveredId.delete(map);
  }
  map.getCanvas().style.cursor = "";
}

function closePopup(map: mapboxgl.Map): void {
  const p = popups.get(map);
  if (p) {
    window.clearTimeout(p.timer);
    p.popup.remove();
    popups.delete(map);
  }
}

function showRoadPopup(map: mapboxgl.Map, lngLat: mapboxgl.LngLat, name: string, color: string): void {
  closePopup(map);
  const row = document.createElement("div");
  row.className = "road-tip-row";
  const dot = document.createElement("span");
  dot.className = "road-tip-dot";
  dot.style.color = color;
  const label = document.createElement("span");
  label.textContent = name; // textContent — never HTML
  row.append(dot, label);

  const popup = new mapboxgl.Popup({
    className: "road-popup",
    closeButton: false,
    closeOnClick: false,
    offset: 10,
    maxWidth: "260px",
  })
    .setLngLat(lngLat)
    .setDOMContent(row)
    .addTo(map);

  const timer = window.setTimeout(() => closePopup(map), 2600);
  popups.set(map, { popup, timer });
}

function attachInteractions(map: mapboxgl.Map): void {
  if (interactionsWired.has(map)) return;
  interactionsWired.add(map);

  map.on("mousemove", ROADS_HIT_ID, (e) => {
    const f = e.features?.[0];
    if (f?.id === undefined) return;
    const id = f.id as number;
    if (hoveredId.get(map) === id) return;
    const prev = hoveredId.get(map);
    if (prev !== undefined) setHoverTarget(map, prev, 0);
    hoveredId.set(map, id);
    setHoverTarget(map, id, 1);
    map.getCanvas().style.cursor = "pointer";
  });

  map.on("mouseleave", ROADS_HIT_ID, () => clearHover(map));

  map.on("click", ROADS_HIT_ID, (e) => {
    const f = e.features?.[0];
    if (f?.id === undefined) return;
    startPulse(map, f.id as number);
    const props = (f.properties ?? {}) as Record<string, unknown>;
    const route = ROUTES.find((r) => r.key === props.route);
    const name =
      route?.name ?? (typeof props.name === "string" && props.name ? props.name : "Road");
    const color =
      typeof props.routeColor === "string" && props.routeColor ? props.routeColor : "#c9a84c";
    showRoadPopup(map, e.lngLat, name, color);
  });
}
