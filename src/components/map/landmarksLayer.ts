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
export const LANDMARKS_LAYER = "landmarks-symbol";

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
      },
    })),
  };
}

function ensureLayer(map: mapboxgl.Map): void {
  if (!map.getSource(LANDMARKS_SOURCE)) {
    map.addSource(LANDMARKS_SOURCE, { type: "geojson", data: EMPTY_FC });
  }
  if (map.getLayer(LANDMARKS_LAYER)) return;
  map.addLayer({
    id: LANDMARKS_LAYER,
    type: "symbol",
    source: LANDMARKS_SOURCE,
    minzoom: 10.5,
    layout: {
      "icon-image": ["get", "sprite"],
      "icon-anchor": "bottom", // chip base sits on the coordinate
      "icon-allow-overlap": true, // every place keeps its icon
      "icon-size": ["interpolate", ["linear"], ["zoom"], 11, 0.62, 14, 0.85, 17, 1],
      // labels appear one zoom step later than the chips, and drop first when crowded
      "text-field": ["step", ["zoom"], "", 12.5, ["get", "name"]],
      "text-anchor": "top",
      "text-offset": [0, 0.5],
      "text-size": ["interpolate", ["linear"], ["zoom"], 12.5, 10.5, 16, 12.5],
      "text-optional": true,
      "text-allow-overlap": false,
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

/**
 * Install / refresh the landmark layer for the current active POIs. Ensures the
 * needed icon images and the source+layer exist, updates the data, and toggles
 * visibility off when nothing is active. Safe to call repeatedly and on every
 * style.load (idempotent). `pois` already contains only the active categories
 * (see usePois), so the data itself is the category filter.
 */
export async function updateLandmarks(map: mapboxgl.Map, pois: PoiPoint[]): Promise<void> {
  if (!map.isStyleLoaded()) return; // addSource/addLayer require a loaded style
  await ensureIcons(map, pois);
  ensureLayer(map);
  const src = map.getSource(LANDMARKS_SOURCE) as mapboxgl.GeoJSONSource | undefined;
  src?.setData(toFeatureCollection(pois));
  if (map.getLayer(LANDMARKS_LAYER)) {
    map.setLayoutProperty(LANDMARKS_LAYER, "visibility", pois.length ? "visible" : "none");
  }
}

/** Wire click (fly to the clicked place) + hover cursor on the landmark layer. */
export function addLandmarkInteractions(map: mapboxgl.Map): void {
  map.on("click", LANDMARKS_LAYER, (e) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return;
    const center = f.geometry.coordinates as [number, number];
    map.flyTo({ center, zoom: Math.max(map.getZoom(), 14.5), duration: 1000, essential: true });
  });
  map.on("mouseenter", LANDMARKS_LAYER, () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", LANDMARKS_LAYER, () => {
    map.getCanvas().style.cursor = "";
  });
}
