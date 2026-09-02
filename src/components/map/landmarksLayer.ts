// Landmark places (tourism / schools / hospitals) rendered as ONE Mapbox symbol
// layer. Each landmark is a single GL feature carrying BOTH its icon and its
// name on the same source+layer, so the two can never drift apart, the toggle is
// one visibility call, and clicks resolve to the clicked feature's own geometry.
// This replaces the old DOM `.lm` markers (which caused phantom hover + detach +
// wrong-target-click bugs).
//
// Icons: Mapbox has no live backdrop-blur, so the "liquid glass" chip is BAKED —
// each (glyph, category) combo is rasterised once from an inline SVG (frosted
// tile + category ring + dark line-art glyph) and registered via map.addImage.
import mapboxgl from "mapbox-gl";
import type { PoiPoint, PoiCategory } from "@/hooks/use-pois";
import { POI_TABLES } from "@/hooks/use-pois";
import { GLYPH_PATHS, iconKeyFor } from "./poiIcons";

export const LANDMARKS_SOURCE = "landmarks";
export const LANDMARKS_LAYER = "landmarks-symbol"; // icon + label
export const LANDMARKS_DOT = "landmarks-dot"; // always-visible category dot (icon-independent base)
export const LANDMARKS_GLOW = "landmarks-glow"; // soft colour halo under the dot
export const LANDMARKS_HOVER = "landmarks-hover"; // feature-state ring on hover/selected

// Per-category dot colour (matches POI_TABLES / CategoryPanel).
const DOT_COLOR: mapboxgl.ExpressionSpecification = [
  "match",
  ["get", "category"],
  "tourism",
  "#f59e0b",
  "schools",
  "#3b82f6",
  "hospitals",
  "#ef4444",
  "#f59e0b",
];

const CHIP = 44; // logical chip px (viewBox units)
const PR = 2; // rasterise at 2x for crisp icons on retina

const EMPTY_FC: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

const spriteId = (glyph: string, cat: PoiCategory) => `lm-${glyph}-${cat}`;

// Composite chip SVG: squared liquid-glass tile + category-colour ring + dark
// line-art glyph (viewBox 0..24 scaled into the tile centre). Rasterised at
// CHIP*PR physical px so it stays crisp at pixelRatio PR.
function chipSvg(glyph: string, ring: string): string {
  const inner = GLYPH_PATHS[glyph] ?? GLYPH_PATHS.landmark;
  const px = CHIP * PR;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${CHIP} ${CHIP}">` +
    `<defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.92"/>` +
    `<stop offset="1" stop-color="#e9eff6" stop-opacity="0.72"/></linearGradient>` +
    `<filter id="ds" x="-30%" y="-30%" width="160%" height="160%">` +
    `<feDropShadow dx="0" dy="1.5" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.45"/></filter></defs>` +
    // glass tile (rounded square) with drop shadow for lift on any ground
    `<rect x="4" y="3" width="36" height="36" rx="10" fill="url(#lg)" stroke="#ffffff" stroke-opacity="0.85" stroke-width="1" filter="url(#ds)"/>` +
    // category accent ring
    `<rect x="4.7" y="3.7" width="34.6" height="34.6" rx="9.4" fill="none" stroke="${ring}" stroke-opacity="0.9" stroke-width="2"/>` +
    // dark glyph, centred: 24u glyph scaled to ~22u, placed at (11,10.5)
    `<g transform="translate(11,10.5) scale(0.9167)" fill="none" stroke="#131920" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</g>` +
    `</svg>`
  );
}

function loadIcon(map: mapboxgl.Map, glyph: string, cat: PoiCategory): Promise<void> {
  const id = spriteId(glyph, cat);
  if (map.hasImage(id)) return Promise.resolve();
  const url = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(chipSvg(glyph, POI_TABLES[cat].color));
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.onload = () => {
      // hasImage re-checked: a concurrent load or a style reload may have added it
      if (!map.hasImage(id)) {
        try {
          map.addImage(id, img, { pixelRatio: PR });
        } catch {
          /* image already added — ignore */
        }
      }
      resolve();
    };
    img.onerror = () => resolve(); // never block the layer on one bad icon
    img.src = url;
  });
}

/** Register every icon image needed for the given landmarks (idempotent). */
function ensureIcons(map: mapboxgl.Map, pois: PoiPoint[]): Promise<void[]> {
  const needed = new Map<string, { glyph: string; cat: PoiCategory }>();
  for (const p of pois) {
    const glyph = iconKeyFor(p);
    needed.set(spriteId(glyph, p.category), { glyph, cat: p.category });
  }
  return Promise.all([...needed.values()].map(({ glyph, cat }) => loadIcon(map, glyph, cat)));
}

function toFeatureCollection(pois: PoiPoint[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: pois.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: {
        id: p.id,
        name: p.name,
        category: p.category,
        sprite: spriteId(iconKeyFor(p), p.category),
        image: p.images?.[0] ?? "",
      },
    })),
  };
}

function ensureLayer(map: mapboxgl.Map): void {
  if (!map.getSource(LANDMARKS_SOURCE)) {
    // Every place is its own point (no clustering) — promoteId drives the
    // hover/selected ring via feature-state.
    map.addSource(LANDMARKS_SOURCE, {
      type: "geojson",
      data: EMPTY_FC,
      promoteId: "id",
    });
  }
  // Hover / selected ring — a category-coloured halo shown via feature-state, so
  // hovering (or clicking) a place highlights it. Sits under the dot.
  if (!map.getLayer(LANDMARKS_HOVER)) {
    map.addLayer({
      id: LANDMARKS_HOVER,
      type: "circle",
      source: LANDMARKS_SOURCE,
      minzoom: 0,
      paint: {
        "circle-color": DOT_COLOR,
        // Bigger than the icon at every zoom so the ring reads AROUND it.
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 18, 11, 22, 14, 28, 17, 33],
        "circle-opacity": ["case", ["boolean", ["feature-state", "active"], false], 0.18, 0],
        "circle-stroke-color": DOT_COLOR,
        "circle-stroke-width": 2.5,
        "circle-stroke-opacity": ["case", ["boolean", ["feature-state", "active"], false], 0.95, 0],
        "circle-pitch-alignment": "map",
      },
    });
  }
  // Soft colour halo under the dot — gives the point a glowing "beacon" look
  // instead of a flat circle. Pure GL, no dependencies.
  if (!map.getLayer(LANDMARKS_GLOW)) {
    map.addLayer({
      id: LANDMARKS_GLOW,
      type: "circle",
      source: LANDMARKS_SOURCE,
      minzoom: 0,
      paint: {
        "circle-color": DOT_COLOR,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 7, 11, 12, 15, 16],
        "circle-blur": 0.9,
        "circle-opacity": 0.32,
        "circle-pitch-alignment": "map",
      },
    });
  }
  // Base dot — pure GL, NO image/font dependency, so a place is ALWAYS visible at
  // every zoom even if a glyph image hasn't registered. The glass icon draws on
  // top of it. Category-coloured core with a bright white ring.
  if (!map.getLayer(LANDMARKS_DOT)) {
    map.addLayer({
      id: LANDMARKS_DOT,
      type: "circle",
      source: LANDMARKS_SOURCE,
      minzoom: 0,
      paint: {
        "circle-color": DOT_COLOR,
        "circle-radius": ["interpolate", ["linear"], ["zoom"], 6, 3.5, 11, 5.5, 15, 7.5],
        "circle-stroke-color": "#ffffff",
        "circle-stroke-width": 2,
        "circle-opacity": 1,
        "circle-pitch-alignment": "map",
      },
    });
  }
  // Icon + label on top. icon-anchor CENTER so the glass chip sits directly over
  // the dot/coordinate (dot shows through as the anchor / icon fallback).
  if (!map.getLayer(LANDMARKS_LAYER)) {
    map.addLayer({
      id: LANDMARKS_LAYER,
      type: "symbol",
      source: LANDMARKS_SOURCE,
      minzoom: 0, // appear at ALL zooms
      layout: {
        "icon-image": ["get", "sprite"],
        "icon-anchor": "center",
        "icon-allow-overlap": true, // every place keeps its icon
        "icon-optional": true,
        "icon-size": ["interpolate", ["linear"], ["zoom"], 8, 0.68, 11, 0.85, 14, 1.1, 17, 1.3],
        // Declutter priority: when labels collide, keep the hero places first
        // (tourism), then hospitals, then the many schools. Lower key = placed
        // first = survives the collision.
        "symbol-sort-key": ["match", ["get", "category"], "tourism", 0, "hospitals", 1, "schools", 2, 3],
        // labels appear a step later than the chips, and drop first when crowded
        "text-field": ["step", ["zoom"], "", 12.5, ["get", "name"]],
        "text-anchor": "top",
        "text-offset": [0, 1.6],
        "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 10.5, 16, 12.5],
        "text-optional": true,
        "text-allow-overlap": false,
        "text-padding": 6, // more breathing room → fewer overlapping labels shown
        "text-max-width": 8,
      },
      paint: {
        "text-color": "#ffffff",
        "text-halo-color": "rgba(0,0,0,0.9)",
        "text-halo-width": 1.4,
        "text-halo-blur": 0.4,
      },
    });
  }
}

/**
 * Install / refresh the landmark layer for the current active POIs. Ensures the
 * needed icon images and the source+layer exist, updates the data, and toggles
 * visibility off when nothing is active. Safe to call repeatedly and on every
 * style.load (idempotent). `pois` already contains only the active categories
 * (see usePois), so the data itself is the category filter.
 */
export async function updateLandmarks(map: mapboxgl.Map, pois: PoiPoint[]): Promise<void> {
  if (!map.isStyleLoaded()) {
    // Style not ready yet (addSource/addLayer would throw) — retry once it settles
    // so an early call from the effect isn't silently dropped.
    map.once("idle", () => void updateLandmarks(map, pois));
    return;
  }
  await ensureIcons(map, pois);
  ensureLayer(map);
  const src = map.getSource(LANDMARKS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  src?.setData(toFeatureCollection(pois));
  const vis = pois.length ? "visible" : "none";
  for (const id of [LANDMARKS_HOVER, LANDMARKS_GLOW, LANDMARKS_DOT, LANDMARKS_LAYER]) {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", vis);
  }
}

const CAT_LABEL: Record<PoiCategory, string> = {
  tourism: "Tourism",
  schools: "Education",
  hospitals: "Hospital",
};

// One-time popup styling: flush image + rounded card (scoped via the popup's
// className so it never touches the project/station popups).
function ensureLandmarkPopupStyles(): void {
  if (typeof document === "undefined" || document.getElementById("lm-popup-style")) return;
  const s = document.createElement("style");
  s.id = "lm-popup-style";
  s.textContent = `
.lm-popup .mapboxgl-popup-content{padding:0;border-radius:12px;overflow:hidden;
  box-shadow:0 8px 26px rgba(0,0,0,.4);font-family:'Work Sans',Arial,sans-serif}
.lm-popup .mapboxgl-popup-close-button{color:#fff;font-size:17px;width:22px;height:22px;
  top:4px;right:4px;text-shadow:0 1px 3px rgba(0,0,0,.7)}
.lm-pop-img{width:100%;height:112px;object-fit:cover;display:block;background:#dfe6ee}
.lm-pop-body{padding:9px 11px 11px}
.lm-pop-name{font-weight:700;font-size:13px;color:#12181f;line-height:1.25}
.lm-pop-tag{margin-top:5px;font-size:10px;font-weight:700;letter-spacing:.4px;text-transform:uppercase}
.lm-pop-desc{margin-top:7px;font-size:11px;line-height:1.4;color:#3a4653}
.lm-pop-actions{display:flex;gap:6px;margin-top:10px}
.lm-pop-btn{flex:1;text-align:center;padding:6px 8px;border-radius:8px;font-size:11px;font-weight:700;
  text-decoration:none;background:#12181f;color:#fff;border:1px solid rgba(255,255,255,.14)}
.lm-pop-btn:hover{background:#1c2733}`;
  document.head.appendChild(s);
}

// Build popup content from feature props via the DOM (textContent / img.src) —
// never innerHTML, since name/image come from the DB.
function actionButton(label: string, href: string, extraClass = ""): HTMLAnchorElement {
  const a = document.createElement("a");
  a.className = "lm-pop-btn" + (extraClass ? " " + extraClass : "");
  a.href = href;
  a.target = "_blank";
  a.rel = "noreferrer";
  a.textContent = label;
  return a;
}

// Great-circle distance in km between two [lng,lat] points.
function kmBetween(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function buildPopupContent(
  props: Record<string, unknown>,
  coords: [number, number],
  mapCenter: [number, number],
): HTMLElement {
  const cat = String(props.category) as PoiCategory;
  const color = POI_TABLES[cat]?.color ?? "#f59e0b";
  const placeName = String(props.name ?? "");
  const [lng, lat] = coords;
  const root = document.createElement("div");
  root.style.width = "224px";
  const image = typeof props.image === "string" ? props.image : "";
  if (image) {
    const img = document.createElement("img");
    img.className = "lm-pop-img";
    img.loading = "lazy";
    img.src = image;
    img.onerror = () => img.remove(); // drop broken/placeholder images cleanly
    root.appendChild(img);
  }
  const body = document.createElement("div");
  body.className = "lm-pop-body";
  const name = document.createElement("div");
  name.className = "lm-pop-name";
  name.textContent = placeName;
  // Meta line: category + distance from the current view centre.
  const km = kmBetween(mapCenter, [lng, lat]);
  const distStr = km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
  const tag = document.createElement("div");
  tag.className = "lm-pop-tag";
  tag.textContent = `${CAT_LABEL[cat] ?? cat} · ${distStr} away`;
  tag.style.color = color;
  body.append(name, tag);
  // Optional description (shown only if the row carries one — forward-compatible).
  const desc = typeof props.description === "string" ? props.description.trim() : "";
  if (desc) {
    const d = document.createElement("div");
    d.className = "lm-pop-desc";
    d.textContent = desc;
    body.appendChild(d);
  }
  // Directions (Google Maps) — opens in a new tab.
  const actions = document.createElement("div");
  actions.className = "lm-pop-actions";
  actions.append(
    actionButton("Directions", `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`),
  );
  body.appendChild(actions);
  root.appendChild(body);
  return root;
}

/** Wire click (info popup + fly to the place) + hover/selected ring highlight
 *  (feature-state) + cursor. */
export function addLandmarkInteractions(map: mapboxgl.Map): void {
  ensureLandmarkPopupStyles();
  let popup: mapboxgl.Popup | null = null;
  let hoverId: string | number | null = null; // under the cursor
  let selectedId: string | number | null = null; // popup open (sticky highlight)

  const setActive = (id: string | number | null, active: boolean) => {
    if (id != null) map.setFeatureState({ source: LANDMARKS_SOURCE, id }, { active });
  };

  // A place: highlight it, open its popup, fly in.
  const onPlaceClick = (e: mapboxgl.MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return;
    const center = f.geometry.coordinates as [number, number];
    const c = map.getCenter();
    if (selectedId != null && selectedId !== f.id) setActive(selectedId, selectedId === hoverId);
    selectedId = f.id ?? null;
    setActive(selectedId, true);
    popup?.remove(); // one popup at a time
    popup = new mapboxgl.Popup({ offset: 16, closeButton: true, maxWidth: "240px", className: "lm-popup" })
      .setLngLat(center)
      .setDOMContent(buildPopupContent(f.properties ?? {}, center, [c.lng, c.lat]))
      .addTo(map);
    popup.on("close", () => {
      if (selectedId != null && selectedId !== hoverId) setActive(selectedId, false);
      selectedId = null;
    });
    map.flyTo({ center, zoom: Math.max(map.getZoom(), 14.5), duration: 1000, essential: true });
  };

  // Hover highlight: track the feature under the cursor via feature-state.
  const onHoverMove = (e: mapboxgl.MapLayerMouseEvent) => {
    const id = e.features?.[0]?.id ?? null;
    if (id === hoverId) return;
    if (hoverId != null && hoverId !== selectedId) setActive(hoverId, false);
    hoverId = id;
    if (id != null) setActive(id, true);
    map.getCanvas().style.cursor = id != null ? "pointer" : "";
  };
  const onHoverLeave = () => {
    if (hoverId != null && hoverId !== selectedId) setActive(hoverId, false);
    hoverId = null;
    map.getCanvas().style.cursor = "";
  };

  for (const id of [LANDMARKS_DOT, LANDMARKS_LAYER]) {
    map.on("click", id, onPlaceClick);
    map.on("mousemove", id, onHoverMove);
    map.on("mouseleave", id, onHoverLeave);
  }
}
