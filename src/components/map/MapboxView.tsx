import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { DUBAI_BOUNDS, DEFAULT_PITCH, DEFAULT_BEARING } from "@/lib/dubai";
import { METRO_LINES, STATION_PROGRESS, pointAlongPath, type MetroLine } from "@/lib/metro";
import { createWaterLayer } from "./WaterLayer";
import { createThreeWaterLayer } from "@/lib/mapbox/ThreeWaterLayer";
import type { ProjectWithRelations } from "@/lib/types";
import { useFiltersStore } from "@/store/filters";

// mapbox-gl v3 style expression — an array that can nest to arbitrary depth.
// We build these by hand, so TypeScript sees them as `any[]` but Mapbox knows better.
type Expr = any;

export type LightPreset = "dawn" | "day" | "dusk" | "night";

type Props = {
  accessToken: string;
  projects: ProjectWithRelations[];
  camera: { lat: number; lng: number; zoom: number };
  onCameraChange: (c: { lat: number; lng: number; zoom: number }) => void;
  active: boolean;
  metroMode: boolean;
  lightPreset: LightPreset;
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

const DRAW_DURATION = 2400; // ms per line's draw animation
const LINE_STAGGER = 350; // ms delay between each line starting to draw

export function MapboxView({ accessToken, projects, camera, onCameraChange, active, metroMode, lightPreset }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const trainMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const pulseMarkersRef = useRef<mapboxgl.Marker[]>([]);
  const metroFrameRef = useRef<Map<string, number>>(new globalThis.Map());
  const metroTimeoutsRef = useRef<number[]>([]);
  const trainRafRef = useRef<number | null>(null);
  const styleLoadedRef = useRef(false);
  const { selectedProjectId, setSelectedProjectId } = useFiltersStore();

  useEffect(() => {
    if (!containerRef.current || !accessToken) return;
    mapboxgl.accessToken = accessToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/standard",
      center: [camera.lng, camera.lat],
      zoom: camera.zoom,
      pitch: 0,
      bearing: 0,
      maxBounds: [
        [DUBAI_BOUNDS.west, DUBAI_BOUNDS.south],
        [DUBAI_BOUNDS.east, DUBAI_BOUNDS.north],
      ],
      antialias: true,
    });

    map.on("style.load", () => {
      // Mapbox Standard config: premium, clean, uncluttered — its own built-in
      // 3D buildings, atmosphere and lighting are driven by lightPreset below.
      applyStandardConfig(map, lightPreset);

      // Hide any remaining text labels/POI icons Standard's config didn't cover.
      hideLabelsAndPois(map);

      // Terrain — Standard doesn't enable elevation exaggeration by default.
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.2 });
      }

      // --- Metro 2030 network (layers created hidden; metroMode drives them) ---
      addMetroLayers(map);
      addStationLayers(map);

      // --- 3D water + moving ships/yachts (three.js custom layer) ---
      if (!map.getLayer("dubai-water-3d")) {
        try {
          map.addLayer(createWaterLayer());
        } catch (err) {
          // Non-fatal: metro/buildings still render if the water layer fails.
          console.error("Failed to add 3D water layer", err);
        }
      }

      // --- Premium sky-blue/cyan animated water overlay (separate, lightweight
      // three.js custom layer) — added after buildings/metro/other layers are
      // registered so it stays visually beneath markers and metro overlays. ---
      if (!map.getLayer("three-water-layer")) {
        try {
          map.addLayer(createThreeWaterLayer());
        } catch (err) {
          console.error("Failed to add three-water-layer", err);
        }
      }

      styleLoadedRef.current = true;
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      onCameraChange({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });

    mapRef.current = map;
    return () => {
      stopMetroAnimation(map);
      styleLoadedRef.current = false;
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      trainMarkersRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

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

  // Configure Mapbox Standard's built-in basemap: light preset (day/dawn/dusk/
  // night), a warm premium color theme, decluttered labels, and a brighter
  // turquoise water tint layered on top via setPaintProperty.
  function applyStandardConfig(map: mapboxgl.Map, preset: LightPreset) {
    const setConfig = (key: string, value: unknown) => {
      try {
        map.setConfigProperty("basemap", key, value);
      } catch {
        // Config key not present in this style version — ignore.
      }
    };
    setConfig("lightPreset", preset);
    setConfig("theme", "faded"); // Standard's softest, warmest built-in theme
    setConfig("showPointOfInterestLabels", false);
    setConfig("showTransitLabels", false);
    setConfig("showPlaceLabels", true);
    setConfig("showRoadLabels", false);
    setConfig("show3dObjects", true);

    // Brighter Dubai-sea turquoise, layered over Standard's own water color.
    const setColor = (id: string, prop: string, value: unknown) => {
      if (map.getLayer(id)) (map.setPaintProperty as (id: string, prop: string, value: unknown) => void)(id, prop, value);
    };
    setColor("water", "fill-color", "#6fd8cd");
  }

  // Typed wrapper so we can pass hand-built style-expression arrays without
  // fighting mapbox-gl v3's strict layer typing.
  function addLayerSafe(map: mapboxgl.Map, layer: Record<string, unknown>, before?: string) {
    (map.addLayer as (l: unknown, b?: string) => void)(layer, before);
  }

  // Build the line sources/layers once (hidden until metroMode plays them).
  // Each line has: a glow layer (wide, blurred), and a crisp reveal layer —
  // both driven by the same `line-gradient` progress during the draw animation.
  function addMetroLayers(map: mapboxgl.Map) {
    for (const line of METRO_LINES) {
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
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 8, 16, 18],
            "line-blur": 6,
            "line-opacity": 0.4,
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
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.5, 16, 9],
            "line-gradient": lineGradient(line.color, 0),
          },
        });
      }
    }
  }

  // Build a line-gradient expression that is fully colored up to `progress`
  // (0..1) and transparent afterwards — moving `progress` "draws" the line.
  function lineGradient(color: string, progress: number): Expr {
    const p = Math.max(0.0001, Math.min(0.9999, progress));
    return [
      "interpolate",
      ["linear"],
      ["line-progress"],
      0,
      color,
      p,
      color,
      Math.min(1, p + 0.02),
      "rgba(0,0,0,0)",
      1,
      "rgba(0,0,0,0)",
    ];
  }

  // Station footprints (3D extrusions) + labels, created once and hidden;
  // revealed progressively as each line's draw animation reaches them.
  function addStationLayers(map: mapboxgl.Map) {
    const features = METRO_LINES.flatMap((line) =>
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

    if (!map.getSource("metro-stations")) {
      map.addSource("metro-stations", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
    }
    if (!map.getLayer("metro-stations-3d")) {
      addLayerSafe(map, {
        id: "metro-stations-3d",
        type: "fill-extrusion",
        source: "metro-stations",
        minzoom: 11,
        filter: ["<=", ["get", "progress"], 0],
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 11, 0, 14, ["get", "height"]],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.9,
        },
      });
    }
    if (!map.getLayer("metro-stations-label")) {
      addLayerSafe(map, {
        id: "metro-stations-label",
        type: "symbol",
        source: "metro-stations",
        minzoom: 13,
        filter: ["<=", ["get", "progress"], 0],
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, -1.4],
          "text-anchor": "bottom",
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
  }

  // Cancel every metro animation frame/timeout, hide all metro layers, and
  // remove train + pulse markers. Called on metroMode -> off and on unmount.
  function stopMetroAnimation(map: mapboxgl.Map) {
    for (const id of metroFrameRef.current.values()) cancelAnimationFrame(id);
    metroFrameRef.current.clear();
    if (trainRafRef.current) cancelAnimationFrame(trainRafRef.current);
    trainRafRef.current = null;
    for (const t of metroTimeoutsRef.current) clearTimeout(t);
    metroTimeoutsRef.current = [];

    for (const m of trainMarkersRef.current.values()) m.remove();
    trainMarkersRef.current.clear();
    for (const m of pulseMarkersRef.current) m.remove();
    pulseMarkersRef.current = [];

    if (!styleLoadedRef.current) return;
    for (const line of METRO_LINES) {
      const srcId = `metro-${line.id}`;
      if (map.getLayer(`${srcId}-glow`)) {
        map.setLayoutProperty(`${srcId}-glow`, "visibility", "none");
        map.setPaintProperty(`${srcId}-glow`, "line-gradient", lineGradient(line.color, 0));
      }
      if (map.getLayer(`${srcId}-reveal`)) {
        map.setLayoutProperty(`${srcId}-reveal`, "visibility", "none");
        map.setPaintProperty(`${srcId}-reveal`, "line-gradient", lineGradient(line.color, 0));
      }
    }
    if (map.getLayer("metro-stations-3d")) map.setFilter("metro-stations-3d", ["<=", ["get", "progress"], 0]);
    if (map.getLayer("metro-stations-label")) {
      map.setFilter("metro-stations-label", ["<=", ["get", "progress"], 0]);
      map.setPaintProperty("metro-stations-label", "text-opacity", 0);
    }
  }

  // Small pulse marker dropped at a station the instant the drawing line
  // reaches it — a glass dot with a colored outer glow that fades out.
  function spawnStationPulse(map: mapboxgl.Map, coord: [number, number], color: string) {
    const el = document.createElement("div");
    el.style.width = "18px";
    el.style.height = "18px";
    el.style.borderRadius = "9999px";
    el.style.background = "rgba(255,255,255,0.85)";
    el.style.border = `2px solid ${color}`;
    el.style.color = color;
    el.style.animation = "metro-station-pulse 800ms ease-out";
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(coord).addTo(map);
    pulseMarkersRef.current.push(marker);
    setTimeout(() => {
      marker.remove();
      pulseMarkersRef.current = pulseMarkersRef.current.filter((m) => m !== marker);
    }, 850);
  }

  // Play the full-network draw animation: each line staggered slightly,
  // glow + crisp line grow together, stations pulse in as the line reaches
  // them, labels fade in, then a train starts once that line finishes.
  function playMetroSequence(map: mapboxgl.Map) {
    const revealedStations = new Set<string>();

    METRO_LINES.forEach((line, lineIdx) => {
      const timeout = window.setTimeout(() => {
        const srcId = `metro-${line.id}`;
        if (!map.getLayer(`${srcId}-glow`) || !map.getLayer(`${srcId}-reveal`)) return;
        map.setLayoutProperty(`${srcId}-glow`, "visibility", "visible");
        map.setLayoutProperty(`${srcId}-reveal`, "visibility", "visible");

        const stationsForLine = line.stations
          .map((s) => ({ ...s, progress: STATION_PROGRESS[s.id] ?? 0 }))
          .sort((a, b) => a.progress - b.progress);

        const start = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - start) / DRAW_DURATION);
          const eased = t * (2 - t); // ease-out
          map.setPaintProperty(`${srcId}-glow`, "line-gradient", lineGradient(line.color, eased));
          map.setPaintProperty(`${srcId}-reveal`, "line-gradient", lineGradient(line.color, eased));

          for (const s of stationsForLine) {
            if (s.progress <= eased && !revealedStations.has(s.id)) {
              revealedStations.add(s.id);
              spawnStationPulse(map, s.coord, line.color);
            }
          }
          if (map.getLayer("metro-stations-3d")) {
            map.setFilter("metro-stations-3d", ["<=", ["get", "progress"], eased]);
          }
          if (map.getLayer("metro-stations-label")) {
            map.setFilter("metro-stations-label", ["<=", ["get", "progress"], eased]);
          }

          if (t < 1) {
            metroFrameRef.current.set(line.id, requestAnimationFrame(step));
          } else {
            metroFrameRef.current.delete(line.id);
            if (map.getLayer("metro-stations-label")) {
              map.setPaintProperty("metro-stations-label", "text-opacity", 1);
            }
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
    el.innerHTML = TRAIN_MARKER_SVG.replace("#c9a84c", "#ffffff");
    const marker = new mapboxgl.Marker({ element: el }).setLngLat(line.path[0]).addTo(map);
    trainMarkersRef.current.set(line.id, marker);
    ensureTrainLoop();
  }

  // A single shared requestAnimationFrame loop drives every active train
  // marker, ping-ponging each along its own line.path.
  function ensureTrainLoop() {
    if (trainRafRef.current) return;
    const speeds: Record<string, number> = {};
    METRO_LINES.forEach((l, i) => (speeds[l.id] = 0.00004 + i * 0.000012));
    const startT = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startT;
      for (const line of METRO_LINES) {
        const marker = trainMarkersRef.current.get(line.id);
        if (!marker) continue;
        const raw = (elapsed * speeds[line.id]) % 2;
        const t = raw <= 1 ? raw : 2 - raw;
        const { coord } = pointAlongPath(line.path, t);
        marker.setLngLat(coord);
      }
      trainRafRef.current = requestAnimationFrame(tick);
    };
    trainRafRef.current = requestAnimationFrame(tick);
  }

  // Drive the metro draw animation on/off as the metroMode prop changes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const run = () => {
      if (metroMode) playMetroSequence(map);
      else stopMetroAnimation(map);
    };
    if (styleLoadedRef.current) run();
    else map.once("load", run);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metroMode]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightPreset]);

  // Cinematic fly-in when this view becomes active
  useEffect(() => {
    if (!mapRef.current || !active) return;
    const map = mapRef.current;
    map.jumpTo({ center: [camera.lng, camera.lat], zoom: camera.zoom, pitch: 0, bearing: 0 });
    // Two-stage cinematic fly
    const t = setTimeout(() => {
      map.easeTo({
        pitch: DEFAULT_PITCH,
        bearing: DEFAULT_BEARING,
        zoom: Math.max(camera.zoom, 15),
        duration: 2400,
        easing: (t2) => t2 * (2 - t2),
      });
    }, 150);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const existing = markersRef.current;
    const seen = new Set<string>();
    for (const p of projects) {
      seen.add(p.id);
      if (existing.has(p.id)) continue;
      const el = document.createElement("div");
      el.className = "cursor-pointer";
      el.innerHTML = `<div style="width:30px;height:30px;border-radius:9999px;border:2px solid rgba(201,168,76,0.9);background:rgba(6,78,59,0.92);box-shadow:0 4px 18px rgba(0,0,0,0.35);display:grid;place-items:center;">${TRAIN_MARKER_SVG}</div>`;
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

  // Highlight selected
  useEffect(() => {
    for (const [id, m] of markersRef.current.entries()) {
      const el = m.getElement().firstElementChild as HTMLElement | null;
      if (!el) continue;
      const selected = id === selectedProjectId;
      el.style.transform = selected ? "scale(1.35)" : "scale(1)";
      el.style.boxShadow = selected ? "0 0 24px rgba(251,191,36,0.9)" : "0 4px 18px rgba(0,0,0,0.35)";
      el.style.background = selected ? "#c9a84c" : "rgba(6,78,59,0.92)";
    }
  }, [selectedProjectId]);

  if (!accessToken) {
    return (
      <div className="grid h-full w-full place-items-center bg-background">
        <div className="glass gold-hairline max-w-md rounded-2xl p-6 text-center">
          <div className="font-display text-xl text-cream">Mapbox access token required</div>
          <p className="mt-2 text-sm text-muted-foreground">
            Add a Mapbox public token to <code>.env</code> as <code>MAPBOX_ACCESS_TOKEN</code> to enable the 3D metro view.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      <div
        className="pointer-events-none absolute inset-0 bg-black transition-opacity duration-700"
        style={{ opacity: metroMode ? 0.28 : 0 }}
      />
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
