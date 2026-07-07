import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import { DUBAI_BOUNDS, DEFAULT_PITCH, DEFAULT_BEARING } from "@/lib/dubai";
import { METRO_LINES, pointAlongPath, type MetroLine } from "@/lib/metro";
import { createWaterLayer } from "./WaterLayer";
import type { ProjectWithRelations } from "@/lib/types";
import { useFiltersStore } from "@/store/filters";

// mapbox-gl v3 style expression — an array that can nest to arbitrary depth.
// We build these by hand, so TypeScript sees them as `any[]` but Mapbox knows better.
type Expr = any;

type Props = {
  accessToken: string;
  projects: ProjectWithRelations[];
  camera: { lat: number; lng: number; zoom: number };
  onCameraChange: (c: { lat: number; lng: number; zoom: number }) => void;
  active: boolean;
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

export function MapboxView({ accessToken, projects, camera, onCameraChange, active }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const trainMarkersRef = useRef<Map<string, mapboxgl.Marker>>(new globalThis.Map());
  const rafRef = useRef<number | null>(null);
  const revealedRef = useRef<Set<string>>(new Set());
  const { selectedProjectId, setSelectedProjectId } = useFiltersStore();

  useEffect(() => {
    if (!containerRef.current || !accessToken) return;
    mapboxgl.accessToken = accessToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
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

    map.on("load", () => {
      // Terrain
      if (!map.getSource("mapbox-dem")) {
        map.addSource("mapbox-dem", {
          type: "raster-dem",
          url: "mapbox://mapbox.mapbox-terrain-dem-v1",
          tileSize: 512,
          maxzoom: 14,
        });
        map.setTerrain({ source: "mapbox-dem", exaggeration: 1.2 });
      }
      // Sky
      if (!map.getLayer("sky")) {
        map.addLayer({
          id: "sky",
          type: "sky",
          paint: { "sky-type": "atmosphere", "sky-atmosphere-sun-intensity": 15 },
        });
      }
      // 3D buildings
      const layers = map.getStyle()?.layers ?? [];
      const labelLayerId = layers.find((l) => l.type === "symbol" && (l.layout as { [k: string]: unknown } | undefined)?.["text-field"])?.id;
      map.addLayer(
        {
          id: "3d-buildings",
          source: "composite",
          "source-layer": "building",
          filter: ["==", "extrude", "true"],
          type: "fill-extrusion",
          minzoom: 12,
          paint: {
            "fill-extrusion-color": "#c9a84c",
            "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 12, 0, 15.05, ["get", "height"]],
            "fill-extrusion-base": ["interpolate", ["linear"], ["zoom"], 12, 0, 15.05, ["get", "min_height"]],
            "fill-extrusion-opacity": 0.75,
          },
        },
        labelLayerId,
      );

      // --- Metro 2030 network ---
      addMetroLayers(map);
      addStationMarkers(map);
      startTrainAnimation(map);
      wireLineClicks(map);

      // --- 3D water + moving ships/yachts (three.js custom layer) ---
      if (!map.getLayer("dubai-water-3d")) {
        try {
          map.addLayer(createWaterLayer());
        } catch (err) {
          // Non-fatal: metro/buildings still render if the water layer fails.
          console.error("Failed to add 3D water layer", err);
        }
      }
    });

    map.on("moveend", () => {
      const c = map.getCenter();
      onCameraChange({ lat: c.lat, lng: c.lng, zoom: map.getZoom() });
    });

    mapRef.current = map;
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      map.remove();
      mapRef.current = null;
      markersRef.current.clear();
      trainMarkersRef.current.clear();
      revealedRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Typed wrapper so we can pass hand-built style-expression arrays without
  // fighting mapbox-gl v3's strict layer typing.
  function addLayerSafe(map: mapboxgl.Map, layer: Record<string, unknown>, before?: string) {
    (map.addLayer as (l: unknown, b?: string) => void)(layer, before);
  }

  // Build the line sources/layers. Each line has a full "base" (dim) layer and a
  // "reveal" layer whose line-gradient is animated on click to draw the route.
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
      // Dim base line (always visible so you can see the whole 2030 network).
      if (!map.getLayer(`${srcId}-base`)) {
        addLayerSafe(map, {
          id: `${srcId}-base`,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": line.color,
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2, 16, 6],
            "line-opacity": line.status === "operational" ? 0.35 : 0.22,
            ...(line.status !== "operational" ? { "line-dasharray": [1.5, 1.2] } : {}),
          },
        });
      }
      // Bright animated reveal line — starts fully "gradient-hidden".
      if (!map.getLayer(`${srcId}-reveal`)) {
        addLayerSafe(map, {
          id: `${srcId}-reveal`,
          type: "line",
          source: srcId,
          layout: { "line-cap": "round", "line-join": "round" },
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

  // Animate the reveal of a single line's gradient from 0 -> 1.
  function revealLine(map: mapboxgl.Map, line: MetroLine) {
    const layerId = `metro-${line.id}-reveal`;
    if (!map.getLayer(layerId)) return;
    const start = performance.now();
    const duration = 1600;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t * (2 - t); // ease-out
      map.setPaintProperty(layerId, "line-gradient", lineGradient(line.color, eased));
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  // Clicking any line (base or reveal) plays its draw animation + flies along it.
  function wireLineClicks(map: mapboxgl.Map) {
    for (const line of METRO_LINES) {
      const targets = [`metro-${line.id}-base`, `metro-${line.id}-reveal`];
      for (const layerId of targets) {
        map.on("click", layerId, () => {
          revealedRef.current.add(line.id);
          revealLine(map, line);
          // Cinematic fly to the start of the line, then ease toward the end.
          const start = line.path[0];
          const end = line.path[line.path.length - 1];
          map.easeTo({
            center: start as [number, number],
            zoom: 13.5,
            pitch: DEFAULT_PITCH,
            bearing: DEFAULT_BEARING,
            duration: 1200,
          });
          setTimeout(() => {
            map.easeTo({ center: end as [number, number], duration: 3500, zoom: 12.5 });
          }, 1400);
        });
        map.on("mouseenter", layerId, () => (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", layerId, () => (map.getCanvas().style.cursor = ""));
      }
    }
  }

  // 3D extruded station structures + a clickable station "pin" marker.
  function addStationMarkers(map: mapboxgl.Map) {
    // Build one fill-extrusion source of small square footprints for stations.
    const features = METRO_LINES.flatMap((line) =>
      line.stations.map((s) => {
        const [lng, lat] = s.coord;
        const d = s.interchange ? 0.0011 : 0.0007; // interchange stations are bigger
        return {
          type: "Feature" as const,
          properties: {
            color: line.color,
            height: s.interchange ? 180 : 110,
            name: s.name,
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
        paint: {
          "fill-extrusion-color": ["get", "color"],
          "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 11, 0, 14, ["get", "height"]],
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.85,
        },
      });
    }
    // Station name labels floating above the structures.
    if (!map.getLayer("metro-stations-label")) {
      addLayerSafe(map, {
        id: "metro-stations-label",
        type: "symbol",
        source: "metro-stations",
        minzoom: 13,
        layout: {
          "text-field": ["get", "name"],
          "text-size": 11,
          "text-offset": [0, -1.4],
          "text-anchor": "bottom",
        },
        paint: {
          "text-color": "#f5ead1",
          "text-halo-color": "#0b3d2c",
          "text-halo-width": 1.5,
        },
      });
    }
  }

  // A DOM marker "train" per line that loops along the route every frame.
  function startTrainAnimation(map: mapboxgl.Map) {
    for (const line of METRO_LINES) {
      if (trainMarkersRef.current.has(line.id)) continue;
      const el = document.createElement("div");
      el.style.width = "22px";
      el.style.height = "22px";
      el.style.display = "grid";
      el.style.placeItems = "center";
      el.style.borderRadius = "9999px";
      el.style.background = line.color;
      el.style.boxShadow = `0 0 14px ${line.color}, 0 2px 6px rgba(0,0,0,0.5)`;
      el.style.border = "2px solid rgba(255,255,255,0.9)";
      el.innerHTML = TRAIN_MARKER_SVG.replace("#c9a84c", "#ffffff");
      const m = new mapboxgl.Marker({ element: el }).setLngLat(line.path[0]).addTo(map);
      trainMarkersRef.current.set(line.id, m);
    }

    const speeds: Record<string, number> = {}; // fraction per ms, varies per line
    METRO_LINES.forEach((l, i) => (speeds[l.id] = 0.00004 + i * 0.000012));
    const startT = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startT;
      for (const line of METRO_LINES) {
        const marker = trainMarkersRef.current.get(line.id);
        if (!marker) continue;
        // ping-pong along the line so trains go back and forth
        const raw = (elapsed * speeds[line.id]) % 2;
        const t = raw <= 1 ? raw : 2 - raw;
        const { coord } = pointAlongPath(line.path, t);
        marker.setLngLat(coord);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }

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

  return <div ref={containerRef} className="h-full w-full" />;
}
