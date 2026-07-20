import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import { DUBAI_BOUNDS, DEFAULT_PITCH, DEFAULT_BEARING } from "@/lib/dubai";
import {
  METRO_LINES,
  TRAIN_LINES,
  ALL_RAIL_LINES,
  STATION_PROGRESS,
  pointAlongPath,
  type MetroLine,
} from "@/lib/metro";
import { createWaterLayer, setWaterMaskDebug } from "./WaterLayer";
import { addRoadsLayers, setRoadsVisible } from "./roadsLayer";
import type { ProjectWithRelations } from "@/lib/types";
import { useFiltersStore } from "@/store/filters";

// mapbox-gl v3 style expression — an array that can nest to arbitrary depth.
// We build these by hand, so TypeScript sees them as `any[]` but Mapbox knows better.
type Expr = [string, ...unknown[]];
type MapboxFilter = Parameters<mapboxgl.Map["setFilter"]>[1];
type MapboxExpression = mapboxgl.ExpressionSpecification;

type TrainMotionState = {
  t: number;
  dir: 1 | -1;
  last: number;
  pausedUntil: number;
  lastStopId?: string;
};

export type LightPreset = "dawn" | "day" | "dusk" | "night";

type Props = {
  accessToken: string;
  projects: ProjectWithRelations[];
  camera: { lat: number; lng: number; zoom: number };
  onCameraChange: (c: { lat: number; lng: number; zoom: number }) => void;
  onReady?: () => void;
  /**
   * Fires with the live Mapbox map instance once it is ready (map + heavy layers
   * in), and again when this view re-activates. Used by the dev-only Water Debug
   * Editor to attach click handlers / draw sources to the active map.
   */
  onMapReady?: (map: mapboxgl.Map) => void;
  active: boolean;
  metroMode: boolean;
  trainMode: boolean;
  roadsMode: boolean;
  lightPreset: LightPreset;
  mode?: "satellite" | "3d";
};

// Small SVG metro/train icon used for the project markers.
const TRAIN_MARKER_SVG = `
<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#c9a84c" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="4" y="3" width="16" height="16" rx="2"/>
  <path d="M4 11h16"/>
  <path d="M12 3v8"/>
  <path d="M8 19l-2 3"/>
  <path d="M16 19l2 3"/>
  <circle cx="8.5" cy="15" r="1"/>
  <circle cx="15.5" cy="15" r="1"/>
</svg>`;

// Building glyph shown inside the liquid-glass project markers.
const PROJECT_ICON_SVG = `
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 21h18"/>
  <path d="M6 21V7l6-4 6 4v14"/>
  <path d="M10 12h3"/>
  <path d="M10 16h3"/>
</svg>`;

// Solid project marker: compact dark badge with the project name, lifts and
// glows gold on hover. Injected once, on first use.
const PROJECT_MARKER_CSS = `
.proj-marker{display:grid;place-items:center;width:44px;height:44px;padding:0 6px;border-radius:9999px;
  background:rgba(10,15,20,.92);
  border:1px solid rgba(201,168,76,.5);
  box-shadow:0 4px 16px rgba(0,0,0,.4);
  color:#fff;font:600 9px/1.05 'Work Sans',Arial,sans-serif;letter-spacing:.2px;
  cursor:pointer;position:relative;transform:translateZ(0);
  transition:transform .3s cubic-bezier(.2,.9,.25,1),box-shadow .3s ease,border-color .3s ease}
.proj-marker .proj-dot{display:none}
.proj-marker .proj-nm{width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.proj-marker:hover{transform:scale(1.1);border-color:#c9a84c;
  box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 18px rgba(201,168,76,.55)}
.proj-marker.selected{transform:scale(1.14);border-color:#c9a84c;
  box-shadow:0 0 24px rgba(201,168,76,.9)}
@media (prefers-reduced-motion:reduce){.proj-marker{transition:none}}`;

function ensureProjectMarkerStyles() {
  if (typeof document === "undefined" || document.getElementById("proj-marker-style")) return;
  const s = document.createElement("style");
  s.id = "proj-marker-style";
  s.textContent = PROJECT_MARKER_CSS;
  document.head.appendChild(s);
}

const DRAW_DURATION = 2400; // ms per line's draw animation
const LINE_STAGGER = 350; // ms delay between each line starting to draw

export function MapboxView({
  accessToken,
  projects,
  camera,
  onCameraChange,
  onReady,
  onMapReady,
  active,
  metroMode,
  trainMode,
  roadsMode,
  lightPreset,
  mode = "3d",
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const trainMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const pulseMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const metroFrameRef = useRef<Map<string, number>>(new globalThis.Map());
  const metroTimeoutsRef = useRef<number[]>([]);
  const trainRafRef = useRef<number | null>(null);
  const trainMotionRef = useRef<Map<string, TrainMotionState>>(new globalThis.Map());
  const styleLoadedRef = useRef(false);
  const stationInteractionAddedRef = useRef(false);
  const heavyLayerFallbackTimeoutRef = useRef<number | null>(null);
  const deferredLayerTimeoutsRef = useRef<number[]>([]);
  const deferredLayersScheduledRef = useRef(false);
  // Set when this instance is inactive at load time, so heavy layers (water,
  // vessels) are skipped until it actually becomes visible — the hidden
  // instance doesn't need to pay that cost during the initial load window.
  const pendingHeavyLayersRef = useRef<mapboxgl.Map | null>(null);
  // Ensures the map-ready signal (setMapReady + onReady) fires exactly once,
  // whether the idle handler or the style.load fallback timeout gets there first.
  const readySignaledRef = useRef(false);
  // Latest toggle state, readable inside the (stale-closure) style.load handler.
  const metroModeRef = useRef(metroMode);
  const trainModeRef = useRef(trainMode);
  const roadsModeRef = useRef(roadsMode);
  // Per-network station-reveal thresholds (0 = none revealed, 1 = all).
  const revealThreshRef = useRef<{ metro: number; train: number }>({ metro: 0, train: 0 });
  // Track whether this map instance is the active one and whether the tab is visible.
  // Threaded into custom layers so they can gate their render loops.
  const isActiveRef = useRef(active);
  const isVisibleRef = useRef(document.visibilityState === "visible");
  // Loading overlay: shown only until the base Mapbox map is ready. All custom
  // layers are scheduled after that so the map appears quickly.
  const [mapReady, setMapReady] = useState(false);
  const { selectedProjectId, setSelectedProjectId } = useFiltersStore();

  useEffect(() => {
    if (!containerRef.current || !accessToken) return;
    mapboxgl.accessToken = accessToken;

    // Set the container background to a soft fallback color (not black during loading)
    containerRef.current.style.backgroundColor = "#d9eef2";
    const projectMarkers = markersRef.current;
    const activeTrainMarkers = trainMarkersRef.current;
    const trainMotion = trainMotionRef.current;
    const isMobile = window.innerWidth < 768;
    const mobilePitch = mode === "3d" ? 42 : 0;
    const mobileZoom = mode === "3d" ? Math.min(camera.zoom, 11.5) : Math.min(camera.zoom, 10.5);

    const map = new mapboxgl.Map({
      container: containerRef.current,
      // Satellite mode → flat Mapbox satellite imagery; 3D mode → Standard style.
      style:
        mode === "3d"
          ? "mapbox://styles/2shraf-tamer/cmrarm85z002x01shfp2680g9"
          : "mapbox://styles/mapbox/satellite-streets-v12",
      center: [camera.lng, camera.lat],
      zoom: isMobile ? mobileZoom : camera.zoom,
      pitch: isMobile ? mobilePitch : 0,
      bearing: 0,
      maxBounds: [
        [DUBAI_BOUNDS.west, DUBAI_BOUNDS.south],
        [DUBAI_BOUNDS.east, DUBAI_BOUNDS.north],
      ],
      antialias: true,
    });

    map.on("style.load", () => {
      // Trigger a resize to ensure the map renders properly after style loads
      setTimeout(() => {
        map.resize();
        if (isMobile) {
          map.easeTo({
            pitch: mode === "3d" ? 42 : 0,
            zoom: mode === "3d" ? 11.5 : 10.5,
            duration: 600,
          });
        }
      }, 50);

      // 3D-only scene setup: Standard-style recoloring, decluttered labels, and
      // exaggerated terrain. Flat satellite imagery has no vector fills/symbols to
      // touch and shouldn't be exaggerated, so this is skipped in satellite mode.
      if (mode === "3d") {
        try {
          applyStandardConfig(map, lightPreset);
        } catch (err) {
          console.warn("applyStandardConfig failed (non-fatal)", err);
        }

        try {
          hideLabelsAndPois(map);
        } catch (err) {
          console.warn("hideLabelsAndPois failed (non-fatal)", err);
        }

        try {
          neutralizeRoadColors(map);
        } catch (err) {
          console.warn("neutralizeRoadColors failed (non-fatal)", err);
        }

        // No DEM terrain: raising the draped imagery misregisters every custom
        // layer (water, boats, foam render at ellipsoid z=0), so tilting the
        // camera slid the water off the coastline. Dubai's coast is nearly
        // flat — the exaggerated terrain added nothing visually.
      } else {
        try {
          neutralizeRoadColors(map);
        } catch (err) {
          console.warn("neutralizeRoadColors failed (non-fatal)", err);
        }
      }

      styleLoadedRef.current = true;

      // Far-field water: the animated water mesh only covers the COVER rectangle
      // (a bounded area around Dubai), but at pitch the camera sees the Gulf far
      // past maxBounds toward the horizon — beyond the mesh that showed as a
      // black/empty void. Tint the basemap's own worldwide water (and the style
      // background) to the mesh's base sea colour so everything past the mesh
      // reads as continuous sea instead of black. The animated mesh sits on top
      // within COVER; the seam is tens of km out and foreshortened at pitch.
      try {
        const seaHex = mode === "satellite" ? "#1d7187" : "#1a6d82";
        for (const layer of map.getStyle().layers ?? []) {
          const isWater =
            layer.id === "water" ||
            layer.id.startsWith("water") ||
            ("source-layer" in layer && (layer as { "source-layer"?: string })["source-layer"] === "water");
          if (isWater && layer.type === "fill") {
            map.setPaintProperty(layer.id, "fill-color", seaHex);
          }
          if (layer.type === "background") {
            map.setPaintProperty(layer.id, "background-color", seaHex);
          }
        }
      } catch (err) {
        console.warn("basemap water tint failed (non-fatal)", err);
      }

      // Fallback: if idle arrives late (or already fired) the water still gets
      // added shortly after the style loads, so satellite mode shows animated
      // water without waiting on tiles. Duplicate-guarded inside addHeavyLayers.
      heavyLayerFallbackTimeoutRef.current = window.setTimeout(() => {
        signalReady();
        scheduleDeferredLayers(map);
      }, 900);
    });

    // Heavy Three.js custom layers are added only AFTER the map is idle —
    // style loaded, tiles in — so the first frames are never a black/blank
    // WebGL canvas. Runs once.
    map.once("idle", () => {
      signalReady();
      scheduleDeferredLayers(map);
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      onCameraChange({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });

    mapRef.current = map;
    // Dev-only test seam: expose the live map per mode so Playwright/verification
    // harnesses can drive the camera (bearing/pitch/flyTo) and read state. Never
    // present in production builds (guarded by import.meta.env.DEV).
    if (import.meta.env.DEV) {
      (window as unknown as Record<string, unknown>)[
        mode === "3d" ? "__mapView3d" : "__mapViewSat"
      ] = map;
      (window as unknown as Record<string, unknown>).__setWaterMaskDebug = setWaterMaskDebug;
    }
    return () => {
      stopNetworkAnimation(map, METRO_LINES, "metro");
      stopNetworkAnimation(map, TRAIN_LINES, "train");
      if (heavyLayerFallbackTimeoutRef.current != null) {
        clearTimeout(heavyLayerFallbackTimeoutRef.current);
        heavyLayerFallbackTimeoutRef.current = null;
      }
      clearDeferredLayerTimeouts();
      deferredLayersScheduledRef.current = false;
      styleLoadedRef.current = false;
      stationInteractionAddedRef.current = false;
      readySignaledRef.current = false;
      pendingHeavyLayersRef.current = null;
      map.remove();
      mapRef.current = null;
      projectMarkers.clear();
      activeTrainMarkers.clear();
      trainMotion.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // When this map instance becomes active again (after being hidden), reset the
  // ready flag so it can signal ready again. Allows mode switching to work correctly.
  useEffect(() => {
    if (active) {
      readySignaledRef.current = false;
    }
  }, [active]);

  // Hide every symbol layer in the base style — this removes place/street/POI
  // text labels and POI icons, giving a clean uncluttered surface.
  function hideLabelsAndPois(map: mapboxgl.Map) {
    const layers = map.getStyle()?.layers ?? [];
    for (const layer of layers) {
      if (layer.type === "symbol") {
        map.setLayoutProperty(layer.id, "visibility", "none");
      }
    }
  }

  function neutralizeRoadColors(map: mapboxgl.Map) {
    const layers = map.getStyle()?.layers ?? [];
    for (const layer of layers) {
      const layerMeta = layer as { id: string; type?: string; ["source-layer"]?: string };
      const id = layerMeta.id.toLowerCase();
      const sourceLayer = (layerMeta["source-layer"] ?? "").toLowerCase();
      const isRoad = id.includes("road") || sourceLayer.includes("road") || id.includes("street");
      if (!isRoad) continue;

      if (layer.type === "line") {
        map.setPaintProperty(
          layer.id,
          "line-color",
          mode === "satellite" ? "rgba(255,255,255,0)" : "#e8e0d6",
        );
        map.setPaintProperty(layer.id, "line-opacity", mode === "satellite" ? 0 : 0.28);
        map.setPaintProperty(layer.id, "line-blur", 0.3);
      }
      if (layer.type === "fill") {
        map.setPaintProperty(
          layer.id,
          "fill-color",
          mode === "satellite" ? "rgba(255,255,255,0)" : "#eee8df",
        );
        map.setPaintProperty(layer.id, "fill-opacity", mode === "satellite" ? 0 : 0.2);
      }
    }
  }

  // Configure Mapbox Standard's built-in basemap: light preset (day/dawn/dusk/
  // night), a warm premium color theme, and decluttered labels.
  function applyStandardConfig(map: mapboxgl.Map, preset: LightPreset) {
    // For custom styles, use paint properties to brighten
    const setColor = (id: string, prop: string, value: unknown) => {
      if (map.getLayer(id))
        (map.setPaintProperty as (id: string, prop: string, value: unknown) => void)(
          id,
          prop,
          value,
        );
    };

    // Brighten land/background for premium look
    const layers = map.getStyle()?.layers ?? [];
    for (const layer of layers) {
      if (layer.type === "fill" && (layer.id.includes("land") || layer.id === "background")) {
        setColor(layer.id, "fill-color", "#f5f3f0"); // bright beige
        setColor(layer.id, "fill-opacity", 1);
      }
      // Brighten buildings
      if (layer.type === "fill-extrusion" && layer.id.includes("building")) {
        setColor(layer.id, "fill-extrusion-color", "#f0e8e0");
        setColor(layer.id, "fill-extrusion-opacity", 0.95);
      }
    }
  }

  // Typed wrapper so we can pass hand-built style-expression arrays without
  // fighting mapbox-gl v3's strict layer typing.
  function addLayerSafe(map: mapboxgl.Map, layer: Record<string, unknown>, before?: string) {
    (map.addLayer as (l: unknown, b?: string) => void)(layer, before);
  }

  // Signal that the map is ready (tiles + heavy layers in). Idempotent — the
  // idle handler and the style.load fallback both call it, but only the first
  // wins so onReady never double-fires.
  function signalReady() {
    if (readySignaledRef.current) return;
    readySignaledRef.current = true;
    setMapReady(true);
    onReady?.();
    if (mapRef.current) onMapReady?.(mapRef.current);
  }

  function clearDeferredLayerTimeouts() {
    for (const timeout of deferredLayerTimeoutsRef.current) clearTimeout(timeout);
    deferredLayerTimeoutsRef.current = [];
  }

  // Build the roads layers (async: lazy-imports the road data) and, once they
  // exist, apply the current Roads toggle state.
  function ensureRoadsLayers(map: mapboxgl.Map) {
    void addRoadsLayers(map).then(() => {
      if (mapRef.current !== map) return;
      setRoadsVisible(map, roadsModeRef.current);
    });
  }

  function scheduleDeferredLayers(map: mapboxgl.Map) {
    if (deferredLayersScheduledRef.current) return;
    deferredLayersScheduledRef.current = true;
    clearDeferredLayerTimeouts();

    const schedule = (delay: number, task: () => void) => {
      const timeout = window.setTimeout(() => {
        if (!mapRef.current || mapRef.current !== map) return;
        task();
      }, delay);
      deferredLayerTimeoutsRef.current.push(timeout);
    };

    // OPTIMIZED: Load metro/roads/stations ASAP (before water) for better interactivity
    schedule(80, () => {
      try {
        addMetroLayers(map);
        addStationLayers(map);
        // Colored street network (baked GeoJSON) — added hidden (async: it lazy
        // imports the road data), then drawn on if Roads is already toggled on.
        ensureRoadsLayers(map);
      } catch (err) {
        console.error("Failed to add deferred metro/train/roads layers", err);
      }
    });

    // OPTIMIZED: Play animations in parallel with water loading
    schedule(200, () => {
      if (metroModeRef.current) playNetworkSequence(map, METRO_LINES, "metro");
      if (trainModeRef.current) playNetworkSequence(map, TRAIN_LINES, "train");
    });

    // Water/vessels are expensive. Parallelize their loading instead of sequential delays.
    // The active instance loads them sooner; hidden instances defer.
    if (!isActiveRef.current) {
      pendingHeavyLayersRef.current = map;
      return;
    }
    // OPTIMIZED: Load water and vessels in parallel instead of sequential
    scheduleHeavyLayers(map, [320, 400, 480]); // Tighter schedule: all 3 start ~100ms apart
  }

  // Each heavy layer gets its own schedule slot so no single deferred task
  // stalls the main thread — WaterLayer itself further chunks its per-basin
  // builds (see WaterLayer.ts onAdd).
  function scheduleHeavyLayers(map: mapboxgl.Map, delays: [number, number, number]) {
    const schedule = (delay: number, task: () => void) => {
      const timeout = window.setTimeout(() => {
        if (!mapRef.current || mapRef.current !== map) return;
        task();
      }, delay);
      deferredLayerTimeoutsRef.current.push(timeout);
    };
    schedule(delays[0], () => addWaterLayer(map));
    schedule(delays[2], () => logCustomLayerOrder(map));
  }

  // Controller object passed to custom layers so they can gate their render loops
  // based on whether this instance is active and the tab is visible.
  function makeRenderController() {
    return { shouldRender: () => isActiveRef.current && isVisibleRef.current };
  }

  function addWaterLayer(map: mapboxgl.Map) {
    if (map.getLayer("dubai-water-3d")) return;
    try {
      if (import.meta.env.DEV && mode === "satellite") console.log("[Water] satellite layer requested");
      map.addLayer(createWaterLayer(makeRenderController(), mode));
      if (import.meta.env.DEV) console.log("[Water] layer added");
    } catch (err) {
      console.error("Failed to add water wave layer", err);
    }
  }

  function logCustomLayerOrder(map: mapboxgl.Map) {
    if (import.meta.env.DEV) {
      console.log(
        "[MapLayers] custom layer order",
        map
          .getStyle()
          .layers?.filter((layer) => layer.id === "dubai-water-3d")
          .map((layer) => layer.id),
      );
    }
  }

  // A station is shown when its network's reveal threshold has passed its
  // position along the line. Each network reveals independently.
  function stationFilter(): Expr {
    const { metro, train } = revealThreshRef.current;
    return [
      "any",
      ["all", ["==", ["get", "network"], "metro"], ["<=", ["get", "progress"], metro]],
      ["all", ["==", ["get", "network"], "train"], ["<=", ["get", "progress"], train]],
    ];
  }

  function applyStationFilters(map: mapboxgl.Map) {
    const filter = stationFilter() as MapboxFilter;
    if (map.getLayer("metro-stations-3d")) map.setFilter("metro-stations-3d", filter);
    if (map.getLayer("metro-station-halo")) map.setFilter("metro-station-halo", filter);
    if (map.getLayer("metro-station-core")) map.setFilter("metro-station-core", filter);
    if (map.getLayer("metro-stations-label")) map.setFilter("metro-stations-label", filter);
  }

  // Build the line sources/layers once (hidden until metroMode plays them).
  // Each line has: a glow layer (wide, blurred), and a crisp reveal layer —
  // both driven by the same `line-gradient` progress during the draw animation.
  function addMetroLayers(map: mapboxgl.Map) {
    for (const line of ALL_RAIL_LINES) {
      const srcId = `metro-${line.id}`;
      if (!map.getSource(srcId)) {
        map.addSource(srcId, {
          type: "geojson",
          lineMetrics: true,
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "LineString", coordinates: line.path },
          },
        });
      }
      if (!map.getLayer(`${srcId}-glow`)) {
        addLayerSafe(map, {
          id: `${srcId}-glow`,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 7, 16, 18],
            "line-blur": 6,
            "line-opacity": 0.45,
            "line-gradient": lineGradient(line.color, 0),
          },
        });
      }
      if (!map.getLayer(`${srcId}-reveal`)) {
        addLayerSafe(map, {
          id: `${srcId}-reveal`,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint: {
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3, 16, 8],
            "line-gradient": lineGradient(line.color, 0),
          },
        });
      }
      if (!map.getLayer(`${srcId}-guide`)) {
        addLayerSafe(map, {
          id: `${srcId}-guide`,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round", visibility: "none" },
          paint: {
            "line-color": "rgba(100,100,100,0.1)",
            "line-width": 1.5,
            "line-dasharray": [4, 4],
            "line-opacity": 0.15,
          },
        });
      }
    }
  }

  // Build a line-gradient expression that is fully colored up to `progress`
  // (0..1) and transparent afterwards — moving `progress` "draws" the line.
  function lineGradient(color: string, progress: number): Expr {
    // Stops must be strictly ascending. Clamp p so the fade-out stop
    // (p + 0.02) and the final stop never collapse onto p or onto each other.
    const p = Math.max(0.0001, Math.min(0.9799, progress));
    const fadeEnd = Math.min(0.99, p + 0.02);
    return [
      "interpolate",
      ["linear"],
      ["line-progress"],
      0,
      color,
      p,
      color,
      fadeEnd,
      "rgba(0,0,0,0)",
      1,
      "rgba(0,0,0,0)",
    ];
  }

  function addStationInteractions(map: mapboxgl.Map) {
    if (stationInteractionAddedRef.current) return;

    const openStation = (event: mapboxgl.MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const geometry = feature?.geometry as { type?: string; coordinates?: number[] } | undefined;
      if (geometry?.type !== "Point" || !geometry.coordinates) return;

      const [lng, lat] = geometry.coordinates;
      const coord: [number, number] = [lng, lat];
      const name = String(feature?.properties?.name ?? "Metro Station");
      const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

      map.flyTo({
        center: coord,
        zoom: Math.max(map.getZoom(), 15.25),
        pitch: mode === "3d" ? 58 : 0,
        bearing: map.getBearing(),
        duration: 1200,
        essential: true,
      });

      const content = document.createElement("div");
      content.className = "min-w-[180px] space-y-2";
      const header = document.createElement("div");
      header.style.display = "flex";
      header.style.alignItems = "center";
      header.style.gap = "8px";
      const badge = document.createElement("div");
      badge.textContent = "SN";
      badge.style.width = "28px";
      badge.style.height = "28px";
      badge.style.borderRadius = "9999px";
      badge.style.background = "#064e3b";
      badge.style.color = "#c9a84c";
      badge.style.display = "grid";
      badge.style.placeItems = "center";
      badge.style.fontWeight = "800";
      badge.style.fontSize = "10px";
      const title = document.createElement("div");
      title.textContent = name;
      title.style.fontWeight = "700";
      title.style.color = "#18211f";
      header.append(badge, title);
      content.appendChild(header);
      const link = document.createElement("a");
      link.href = googleMapsUrl;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open street location";
      link.style.color = "#0d7a5f";
      link.style.fontWeight = "700";
      link.style.fontSize = "12px";
      content.appendChild(link);

      new mapboxgl.Popup({ offset: 18, closeButton: true })
        .setLngLat(coord)
        .setDOMContent(content)
        .addTo(map);
    };

    map.on("click", "metro-station-halo", openStation);
    map.on("mouseenter", "metro-station-halo", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "metro-station-halo", () => {
      map.getCanvas().style.cursor = "";
    });
    stationInteractionAddedRef.current = true;
  }

  // Station footprints (3D extrusions) + labels, created once and hidden;
  // revealed progressively as each line's draw animation reaches them.
  function addStationLayers(map: mapboxgl.Map) {
    const metroIds = new Set(METRO_LINES.map((l) => l.id));
    const features = ALL_RAIL_LINES.flatMap((line) =>
      line.stations.map((s) => {
        const [lng, lat] = s.coord;
        const d = s.interchange ? 0.0011 : 0.0007;
        return {
          type: "Feature" as const,
          properties: {
            id: s.id,
            color: line.color,
            height: s.interchange ? 180 : 110,
            name: s.name,
            progress: STATION_PROGRESS[s.id] ?? 0,
            network: metroIds.has(line.id) ? "metro" : "train",
          },
          geometry: {
            type: "Polygon" as const,
            coordinates: [
              [
                [lng - d, lat - d],
                [lng + d, lat - d],
                [lng + d, lat + d],
                [lng - d, lat + d],
                [lng - d, lat - d],
              ],
            ],
          },
        };
      }),
    );
    const pointFeatures = ALL_RAIL_LINES.flatMap((line) =>
      line.stations.map((s) => ({
        type: "Feature" as const,
        properties: {
          id: s.id,
          color: line.color,
          name: s.name,
          progress: STATION_PROGRESS[s.id] ?? 0,
          network: metroIds.has(line.id) ? "metro" : "train",
          interchange: !!s.interchange,
        },
        geometry: { type: "Point" as const, coordinates: s.coord },
      })),
    );

    if (!map.getSource("metro-stations")) {
      map.addSource("metro-stations", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
    }
    if (!map.getSource("metro-station-points")) {
      map.addSource("metro-station-points", {
        type: "geojson",
        data: { type: "FeatureCollection", features: pointFeatures },
      });
    }
    if (!map.getLayer("metro-stations-3d")) {
      addLayerSafe(map, {
        id: "metro-stations-3d",
        type: "fill-extrusion",
        source: "metro-stations",
        minzoom: 11,
        filter: stationFilter(),
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": [
            "interpolate",
            ["linear"],
            ["zoom"],
            11,
            0,
            14,
            ["get", "height"],
          ],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.9,
        },
      });
    }
    if (!map.getLayer("metro-station-halo")) {
      addLayerSafe(map, {
        id: "metro-station-halo",
        type: "circle",
        source: "metro-station-points",
        minzoom: 10.5,
        filter: stationFilter(),
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            10,
            3,
            13,
            ["case", ["get", "interchange"], 9, 6],
            16,
            ["case", ["get", "interchange"], 14, 10],
          ],
          "circle-color": "#ffffff",
          "circle-stroke-color": ["get", "color"],
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, 1, 16, 3],
          "circle-opacity": 0.96,
          "circle-stroke-opacity": 1,
        },
      });
    }
    if (!map.getLayer("metro-station-core")) {
      addLayerSafe(map, {
        id: "metro-station-core",
        type: "circle",
        source: "metro-station-points",
        minzoom: 11.2,
        filter: stationFilter(),
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 1.6, 16, 4],
          "circle-color": ["get", "color"],
          "circle-opacity": 0.95,
        },
      });
    }
    if (!map.getLayer("metro-stations-label")) {
      addLayerSafe(map, {
        id: "metro-stations-label",
        type: "symbol",
        source: "metro-station-points",
        minzoom: 11,
        filter: stationFilter(),
        layout: {
          "text-field": ["get", "name"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 11, 9, 14, 12],
          "text-offset": [0, -1.4],
          "text-anchor": "bottom",
          "text-allow-overlap": false,
          "text-optional": true,
        },
        paint: {
          "text-color": "#3b332a",
          "text-halo-color": "#faf4e6",
          "text-halo-width": 1.4,
          "text-opacity": 0,
          "text-opacity-transition": { duration: 500, delay: 0 },
        },
      });
    }
    // "M" station badges. Unlike the layers above, these are NOT gated by
    // stationFilter() — every metro station shows its badge as soon as Metro
    // mode turns them visible, so stations are never invisible waiting on the
    // line-draw reveal. Metro network only (trains keep their own styling).
    const metroOnly: Expr = ["==", ["get", "network"], "metro"];
    if (!map.getLayer("metro-station-M-disc")) {
      addLayerSafe(map, {
        id: "metro-station-M-disc",
        type: "circle",
        source: "metro-station-points",
        minzoom: 9.5,
        filter: metroOnly,
        layout: { visibility: "none" },
        paint: {
          "circle-radius": [
            "interpolate",
            ["linear"],
            ["zoom"],
            9.5,
            5,
            13,
            ["case", ["get", "interchange"], 12, 9],
            16,
            ["case", ["get", "interchange"], 17, 13],
          ],
          "circle-color": ["get", "color"],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 9.5, 1, 16, 2.5],
          "circle-opacity": 0.98,
          "circle-stroke-opacity": 1,
        },
      });
    }
    if (!map.getLayer("metro-station-M")) {
      addLayerSafe(map, {
        id: "metro-station-M",
        type: "symbol",
        source: "metro-station-points",
        minzoom: 9.5,
        filter: metroOnly,
        layout: {
          visibility: "none",
          "text-field": "M",
          "text-font": ["DIN Pro Bold", "Arial Unicode MS Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 9.5, 7, 13, 12, 16, 17],
          "text-allow-overlap": true,
          "text-ignore-placement": true,
        },
        paint: {
          "text-color": "#ffffff",
          "text-halo-color": ["get", "color"],
          "text-halo-width": 0.6,
        },
      });
    }
    addStationInteractions(map);
  }

  // Stop and hide one network's animation (metro or train), leaving the other
  // untouched. Called when that network's toggle turns off (and on unmount).
  function stopNetworkAnimation(map: mapboxgl.Map, lines: MetroLine[], network: "metro" | "train") {
    for (const line of lines) {
      const id = metroFrameRef.current.get(line.id);
      if (id != null) cancelAnimationFrame(id);
      metroFrameRef.current.delete(line.id);

      const marker = trainMarkersRef.current.get(line.id);
      if (marker) {
        marker.remove();
        trainMarkersRef.current.delete(line.id);
        trainMotionRef.current.delete(line.id);
      }
    }
    // Clear any pending stagger timeouts (shared; cheap to clear all).
    for (const t of metroTimeoutsRef.current) clearTimeout(t);
    metroTimeoutsRef.current = [];
    for (const m of pulseMarkersRef.current) m.remove();
    pulseMarkersRef.current = [];
    if (trainMarkersRef.current.size === 0 && trainRafRef.current) {
      cancelAnimationFrame(trainRafRef.current);
      trainRafRef.current = null;
    }

    if (!styleLoadedRef.current) return;
    for (const line of lines) {
      const srcId = `metro-${line.id}`;
      if (map.getLayer(`${srcId}-glow`)) {
        map.setLayoutProperty(`${srcId}-glow`, "visibility", "none");
        map.setPaintProperty(
          `${srcId}-glow`,
          "line-gradient",
          lineGradient(line.color, 0) as MapboxExpression,
        );
      }
      if (map.getLayer(`${srcId}-reveal`)) {
        map.setLayoutProperty(`${srcId}-reveal`, "visibility", "none");
        map.setPaintProperty(
          `${srcId}-reveal`,
          "line-gradient",
          lineGradient(line.color, 0) as MapboxExpression,
        );
      }
      if (map.getLayer(`${srcId}-guide`)) {
        map.setLayoutProperty(`${srcId}-guide`, "visibility", "none");
      }
    }
    revealThreshRef.current[network] = 0;
    applyStationFilters(map);
  }

  // Small pulse marker dropped at a station the instant the drawing line
  // reaches it — a glass dot with a colored outer glow that fades out.
  function spawnStationPulse(map: mapboxgl.Map, coord: [number, number], color: string) {
    const el = document.createElement("div");
    el.className = "cursor-pointer";
    el.innerHTML = `<div style="width:28px;height:28px;border-radius:9999px;border:2px solid rgba(201,168,76,0.9);background:rgba(6,78,59,0.92);box-shadow:0 4px 18px rgba(0,0,0,0.35);display:grid;place-items:center;font-family:system-ui;font-size:10px;font-weight:bold;color:#c9a84c;user-select:none;">SN</div>`;
    el.style.animation = "metro-station-pulse 800ms ease-out";
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(coord).addTo(map);
    pulseMarkersRef.current.push(marker);
    setTimeout(() => {
      marker.remove();
      pulseMarkersRef.current = pulseMarkersRef.current.filter((m) => m !== marker);
    }, 850);
  }

  // Play one network's full draw animation: each line staggered slightly,
  // glow + crisp line grow together, stations pulse in as the line reaches
  // them, labels fade in, then a train starts once that line finishes.
  function playNetworkSequence(map: mapboxgl.Map, lines: MetroLine[], network: "metro" | "train") {
    const revealedStations = new Set<string>();
    if (map.getLayer("metro-stations-label")) {
      map.setPaintProperty("metro-stations-label", "text-opacity", 1);
    }

    lines.forEach((line, lineIdx) => {
      const timeout = window.setTimeout(() => {
        const srcId = `metro-${line.id}`;
        if (!map.getLayer(`${srcId}-glow`) || !map.getLayer(`${srcId}-reveal`)) return;
        map.setLayoutProperty(`${srcId}-glow`, "visibility", "visible");
        map.setLayoutProperty(`${srcId}-reveal`, "visibility", "visible");
        if (map.getLayer(`${srcId}-guide`))
          map.setLayoutProperty(`${srcId}-guide`, "visibility", "visible");

        const stationsForLine = line.stations
          .map((s) => ({ ...s, progress: STATION_PROGRESS[s.id] ?? 0 }))
          .sort((a, b) => a.progress - b.progress);

        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / DRAW_DURATION);
          const eased = t * (2 - t); // ease-out
          map.setPaintProperty(
            `${srcId}-glow`,
            "line-gradient",
            lineGradient(line.color, eased) as MapboxExpression,
          );
          map.setPaintProperty(
            `${srcId}-reveal`,
            "line-gradient",
            lineGradient(line.color, eased) as MapboxExpression,
          );

          for (const s of stationsForLine) {
            if (s.progress <= eased && !revealedStations.has(s.id)) {
              revealedStations.add(s.id);
              spawnStationPulse(map, s.coord, line.color);
            }
          }
          // Advance this network's station reveal threshold to the furthest
          // line-draw progress reached so far.
          revealThreshRef.current[network] = Math.max(revealThreshRef.current[network], eased);
          applyStationFilters(map);

          if (t < 1) {
            metroFrameRef.current.set(line.id, requestAnimationFrame(step));
          } else {
            metroFrameRef.current.delete(line.id);
            startTrainForLine(map, line);
          }
        };
        metroFrameRef.current.set(line.id, requestAnimationFrame(step));
      }, lineIdx * LINE_STAGGER);
      metroTimeoutsRef.current.push(timeout);
    });
  }

  // Start a single line's train marker, looping along its path. Called once
  // that line's draw animation completes.
  function startTrainForLine(map: mapboxgl.Map, line: MetroLine) {
    if (trainMarkersRef.current.has(line.id)) return;
    const el = document.createElement("div");
    el.style.width = "22px";
    el.style.height = "22px";
    el.style.display = "grid";
    el.style.placeItems = "center";
    el.style.borderRadius = "9999px";
    el.style.background = line.color;
    el.style.boxShadow = `0 0 14px ${line.color}, 0 2px 6px rgba(0,0,0,0.35)`;
    el.style.border = "2px solid rgba(255,255,255,0.9)";
    const icon = document.createElement("div");
    icon.style.width = "100%";
    icon.style.height = "100%";
    icon.style.display = "grid";
    icon.style.placeItems = "center";
    icon.style.transition = "transform 180ms linear";
    icon.innerHTML = TRAIN_MARKER_SVG.replace("#c9a84c", "#ffffff");
    el.appendChild(icon);
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(line.path[0]).addTo(map);
    trainMarkersRef.current.set(line.id, marker);
    trainMotionRef.current.set(line.id, { t: 0, dir: 1, last: performance.now(), pausedUntil: 0 });
    ensureTrainLoop();
  }

  // A single shared requestAnimationFrame loop drives every active train
  // marker, ping-ponging each along its own line.path.
  function ensureTrainLoop() {
    if (trainRafRef.current) return;
    const speeds: Record<string, number> = {};
    ALL_RAIL_LINES.forEach((l, i) => (speeds[l.id] = 0.000035 + i * 0.000006));
    const stationStops = Object.fromEntries(
      ALL_RAIL_LINES.map((line) => [
        line.id,
        line.stations
          .map((station) => ({ id: station.id, progress: STATION_PROGRESS[station.id] ?? 0 }))
          .filter((station) => station.progress > 0.01 && station.progress < 0.99)
          .sort((a, b) => a.progress - b.progress),
      ]),
    ) as Record<string, { id: string; progress: number }[]>;

    const tick = (now: number) => {
      for (const line of ALL_RAIL_LINES) {
        const marker = trainMarkersRef.current.get(line.id);
        if (!marker) continue;
        const state = trainMotionRef.current.get(line.id) ?? {
          t: 0,
          dir: 1,
          last: now,
          pausedUntil: 0,
        };
        if (!trainMotionRef.current.has(line.id)) trainMotionRef.current.set(line.id, state);

        if (now < state.pausedUntil) {
          marker.setLngLat(pointAlongPath(line.path, state.t).coord);
          continue;
        }

        const dt = Math.min(80, now - state.last);
        state.last = now;
        const prev = state.t;
        let next = prev + state.dir * (speeds[line.id] ?? 0.00005) * dt;

        if (next >= 1) {
          next = 1;
          state.dir = -1;
          state.pausedUntil = now + 1000;
          state.lastStopId = `${line.id}-end`;
        } else if (next <= 0) {
          next = 0;
          state.dir = 1;
          state.pausedUntil = now + 1000;
          state.lastStopId = `${line.id}-start`;
        } else {
          const from = Math.min(prev, next);
          const to = Math.max(prev, next);
          const stop = stationStops[line.id]?.find(
            (station) =>
              station.progress >= from && station.progress <= to && station.id !== state.lastStopId,
          );
          if (stop) {
            next = stop.progress;
            state.pausedUntil = now + 1000;
            state.lastStopId = stop.id;
          } else if (state.lastStopId && Math.abs(next - prev) > 0.00001) {
            const lastStop = stationStops[line.id]?.find(
              (station) => station.id === state.lastStopId,
            );
            if (!lastStop || Math.abs(next - lastStop.progress) > 0.018)
              state.lastStopId = undefined;
          }
        }

        state.t = next;
        const { coord, bearing } = pointAlongPath(line.path, state.t);
        marker.setLngLat(coord);
        const icon = marker.getElement().firstElementChild as HTMLElement | null;
        if (icon) icon.style.transform = `rotate(${bearing + (state.dir === -1 ? 180 : 0)}deg)`;
      }
      trainRafRef.current = requestAnimationFrame(tick);
    };
    trainRafRef.current = requestAnimationFrame(tick);
  }

  // Drive the metro network draw animation on/off as metroMode changes.
  useEffect(() => {
    metroModeRef.current = metroMode;
    const map = mapRef.current;
    if (!map) return;
    // If the style is loaded, act now. Otherwise the style.load handler reads
    // metroModeRef and plays it once the layers exist.
    if (!styleLoadedRef.current) return;
    if (!map.getLayer("metro-red-reveal") && !map.getLayer(`metro-${METRO_LINES[0]?.id}-reveal`)) {
      scheduleDeferredLayers(map);
      return;
    }
    if (metroMode) playNetworkSequence(map, METRO_LINES, "metro");
    else stopNetworkAnimation(map, METRO_LINES, "metro");
    // "M" station badges follow metro mode directly (independent of the reveal
    // animation) so every station is visible the moment Metro is on.
    const badgeVis = metroMode ? "visible" : "none";
    for (const id of ["metro-station-M-disc", "metro-station-M"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", badgeVis);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metroMode]);

  // Drive the regional train network draw animation on/off as trainMode changes.
  useEffect(() => {
    trainModeRef.current = trainMode;
    const map = mapRef.current;
    if (!map) return;
    if (!styleLoadedRef.current) return;
    if (TRAIN_LINES[0] && !map.getLayer(`metro-${TRAIN_LINES[0].id}-reveal`)) {
      scheduleDeferredLayers(map);
      return;
    }
    if (trainMode) playNetworkSequence(map, TRAIN_LINES, "train");
    else stopNetworkAnimation(map, TRAIN_LINES, "train");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trainMode]);

  // Toggle the colored street network on/off as roadsMode changes.
  useEffect(() => {
    roadsModeRef.current = roadsMode;
    const map = mapRef.current;
    if (!map) return;
    if (!styleLoadedRef.current) return;
    // Build the roads layers if they do not exist yet, then toggle their
    // visibility. This avoids a dead end when the initial deferred layer run
    // already completed but the roads layer wasn't created yet.
    if (!map.getLayer("roads-colored-line")) {
      ensureRoadsLayers(map);
      return;
    }
    setRoadsVisible(map, roadsMode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadsMode]);

  // Switch Mapbox Standard's built-in light preset (day/dawn/dusk/night) live,
  // any time — no full style reload needed.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      try {
        map.setConfigProperty("basemap", "lightPreset", lightPreset);
      } catch {
        // Style not ready yet — style.load handler already applies the initial preset.
      }
    };
    if (styleLoadedRef.current) apply();
  }, [lightPreset]);

  // Track visibility state for gating render loops in custom layers.
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === "visible";
      // If this map became visible again and is the active one, kick the render loops back on.
      if (isVisibleRef.current && isActiveRef.current && mapRef.current) {
        mapRef.current.triggerRepaint();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  // Cinematic fly-in when this view becomes active, and gate the render loops.
  useEffect(() => {
    isActiveRef.current = active;
    if (!mapRef.current) return;
    const map = mapRef.current;

    if (active) {
      const isMobile = window.innerWidth < 768;
      const mobilePitch = mode === "3d" ? 42 : 0;
      const mobileZoom = mode === "3d" ? 11.5 : 10.5;
      // The container was hidden (0-size) while inactive; Mapbox must recompute
      // its dimensions now that it's visible or nothing renders / tiles are wrong.
      map.resize();
      map.jumpTo({
        center: [camera.lng, camera.lat],
        zoom: isMobile ? Math.min(camera.zoom, mobileZoom) : camera.zoom,
        pitch: isMobile ? mobilePitch : 0,
        bearing: 0,
      });
      // Extra resizes after the mode-switch transition settles, so the canvas
      // never ends up sized to the old (hidden/zero) container → no black bands.
      const r0 = setTimeout(() => {
        map.resize();
        if (isMobile) {
          map.easeTo({
            pitch: mode === "3d" ? 42 : 0,
            zoom: mode === "3d" ? 11.5 : 10.5,
            duration: 600,
          });
        }
      }, 100);
      const r1 = setTimeout(() => map.resize(), 400);
      const r2 = setTimeout(() => map.resize(), 900);
      // Kick the custom layers' render loops back on (they were paused while inactive).
      map.triggerRepaint();
      // This instance skipped water/vessels at load because it was hidden —
      // build them now, masked by the cinematic transition just kicked off.
      if (pendingHeavyLayersRef.current === map) {
        pendingHeavyLayersRef.current = null;
        scheduleHeavyLayers(map, [0, 200, 400]);
      }
      if (isMobile) {
        return () => {
          clearTimeout(r0);
          clearTimeout(r1);
          clearTimeout(r2);
        };
      }
      // Satellite mode stays a flat top-down view — no pitch/bearing animation.
      if (mode === "3d") {
        // 3D mode: optimized cinematic fly — faster for better UX (reduced from 2600ms to 1800ms).
        const t = setTimeout(() => {
          map.resize();
          map.easeTo({
            pitch: DEFAULT_PITCH,
            bearing: DEFAULT_BEARING,
            // Cinematic 3D view — a gentle push-in, NOT a deep city zoom (keeps
            // the wide Dubai overview + clouds readable). Clamped to 11.2–12.2.
            zoom: Math.min(12.2, Math.max(camera.zoom + 0.8, 11.2)), // Reduced zoom-in for faster load
            duration: 1800, // Reduced from 2600ms for snappier interaction
            easing: (t2) => t2 * (2 - t2),
          });
        }, 150);
        return () => {
          clearTimeout(t);
          clearTimeout(r0);
          clearTimeout(r1);
          clearTimeout(r2);
        };
      }
      return () => {
        clearTimeout(r0);
        clearTimeout(r1);
        clearTimeout(r2);
      };
    } else {
      // Cancel any in-flight animations when this instance becomes inactive.
      map.stop();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // A map can finish loading while hidden behind the other mode. When it later
  // becomes active, notify the parent again so the shared loading overlay exits.
  useEffect(() => {
    if (active && mapReady) {
      onReady?.();
      if (mapRef.current) onMapReady?.(mapRef.current);
    }
  }, [active, mapReady, onReady, onMapReady]);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = markersRef.current;
    const seen = new Set<string>();
    ensureProjectMarkerStyles();
    for (const p of projects) {
      seen.add(p.id);
      if (existing.has(p.id)) continue;
      const el = document.createElement("div");
      el.className = "proj-marker";
      el.innerHTML = `<span class="proj-nm"></span>`;
      const nm = el.querySelector(".proj-nm");
      if (nm) nm.textContent = p.name; // textContent — never inject the name as HTML
      el.onclick = () => setSelectedProjectId(p.id);
      const m = new mapboxgl.Marker({ element: el }).setLngLat([p.lng, p.lat]).addTo(map);
      existing.set(p.id, m);
    }
    for (const [id, marker] of existing.entries()) {
      if (!seen.has(id)) {
        marker.remove();
        existing.delete(id);
      }
    }
  }, [projects, setSelectedProjectId]);

  // Highlight selected — toggle the .selected class (styling lives in CSS).
  useEffect(() => {
    for (const [id, m] of markersRef.current.entries()) {
      m.getElement().classList.toggle("selected", id === selectedProjectId);
    }
  }, [selectedProjectId]);

  if (!accessToken) {
    return (
      <div className="grid h-full w-full place-items-center bg-background">
        <div className="glass gold-hairline max-w-md rounded-2xl p-6 text-center">
          <div className="font-display text-xl text-cream">Mapbox access token required</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a Mapbox public token to <code>.env</code> as <code>MAPBOX_ACCESS_TOKEN</code> to
            enable the 3D metro view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Neutral Dubai water/land tone behind the canvas so the first paint is
          never black while Mapbox loads its style + tiles. */}
      <div ref={containerRef} className="h-full w-full" style={{ background: "#d9eef2" }} />
      <div
        className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-700"
        style={{ opacity: metroMode ? 0.28 : 0 }}
      />

      {/* Premium loading overlay — shown until the map is idle (style + tiles in
          and heavy Three.js layers added), then fades out. No black flicker. */}
      <div
        className="pointer-events-none absolute inset-0 z-[5] grid place-items-center transition-opacity duration-700"
        style={{
          opacity: mapReady ? 0 : 1,
          background: "linear-gradient(180deg, #dff0f5 0%, #c9e6ee 100%)",
        }}
        aria-hidden={mapReady}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          <div className="font-display text-sm tracking-wide text-emerald-deep/80">
            Loading Dubai map…
          </div>
        </div>
      </div>

      <style>{`
        @keyframes metro-station-pulse {
          0% { transform: scale(0.6); box-shadow: 0 0 0 0 currentColor; opacity: 0.9; }
          60% { transform: scale(1.6); box-shadow: 0 0 16px 6px currentColor; opacity: 0.6; }
          100% { transform: scale(1); box-shadow: 0 0 0 0 transparent; opacity: 1; }
        }
      `}</style>
    </div>
  );
}
