// Dev-only Water Debug Editor.
//
// A floating panel for authoring the hand-traced marine geometry in
// src/lib/water.ts, src/lib/shorelines.ts, and src/lib/navigationWater.ts. It is
// never shown in production and never mounted for regular users — it is gated by
// shouldShowWaterDebugEditor() (import.meta.env.DEV + an env/localStorage flag).
//
// Capabilities (spec §5):
//   - Click the map to capture [lng, lat] coordinates into an ordered list.
//   - Copy a single coordinate, or the whole list, to the clipboard.
//   - Draw a polygon ring or a shoreline path (points accumulate; a live GeoJSON
//     preview is drawn on the map).
//   - Undo / Redo over the captured points.
//   - Export the captured points as GeoJSON, or as a water.ts `[lng, lat][]`
//     array literal, ready to paste.
//   - Toggle the water-mask debug overlay (rings/holes/mesh) on the live layer.

import { useEffect, useRef, useState } from "react";
import type mapboxgl from "mapbox-gl";
import { setWaterMaskDebug, isWaterMaskDebugEnabled } from "./WaterLayer";

type DrawMode = "polygon" | "shoreline";
type Point = [number, number];

const DRAW_SOURCE_ID = "water-debug-draw";
const DRAW_FILL_LAYER_ID = "water-debug-draw-fill";
const DRAW_LINE_LAYER_ID = "water-debug-draw-line";
const DRAW_POINT_LAYER_ID = "water-debug-draw-point";

function fmt(point: Point) {
  return `[${point[0].toFixed(6)}, ${point[1].toFixed(6)}]`;
}

function toGeoJSON(points: Point[], mode: DrawMode) {
  if (mode === "polygon") {
    const ring = points.length >= 3 ? [...points, points[0]] : points;
    return {
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [ring] },
    };
  }
  return {
    type: "Feature" as const,
    properties: {},
    geometry: { type: "LineString" as const, coordinates: points },
  };
}

function toArrayLiteral(points: Point[]) {
  if (points.length === 0) return "[]";
  const body = points.map((p) => `  [${p[0].toFixed(6)}, ${p[1].toFixed(6)}],`).join("\n");
  return `[\n${body}\n]`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard may be unavailable (insecure context); fall back to a prompt.
    window.prompt("Copy the text below:", text);
  }
}

type Props = {
  /** The live Mapbox map for the active view, or null until it is ready. */
  map: mapboxgl.Map | null;
};

export function WaterDebugEditor({ map }: Props) {
  const [open, setOpen] = useState(true);
  const [mode, setMode] = useState<DrawMode>("polygon");
  const [points, setPoints] = useState<Point[]>([]);
  const [redoStack, setRedoStack] = useState<Point[]>([]);
  const [maskOn, setMaskOn] = useState(() => isWaterMaskDebugEnabled());
  const [capturing, setCapturing] = useState(true);

  // Latest values available to the (stable) map click handler.
  const capturingRef = useRef(capturing);
  capturingRef.current = capturing;

  // Capture clicks on the map into the point list.
  useEffect(() => {
    if (!map) return;
    const onClick = (e: mapboxgl.MapMouseEvent) => {
      if (!capturingRef.current) return;
      const next: Point = [Number(e.lngLat.lng.toFixed(6)), Number(e.lngLat.lat.toFixed(6))];
      setPoints((prev) => [...prev, next]);
      setRedoStack([]);
    };
    map.on("click", onClick);
    return () => {
      map.off("click", onClick);
    };
  }, [map]);

  // Live GeoJSON preview of the drawing on the map.
  useEffect(() => {
    if (!map) return;
    const feature = toGeoJSON(points, mode);

    const ensureLayers = () => {
      if (!map.getSource(DRAW_SOURCE_ID)) {
        map.addSource(DRAW_SOURCE_ID, {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (mode === "polygon" && !map.getLayer(DRAW_FILL_LAYER_ID)) {
        map.addLayer({
          id: DRAW_FILL_LAYER_ID,
          type: "fill",
          source: DRAW_SOURCE_ID,
          filter: ["==", ["geometry-type"], "Polygon"],
          paint: { "fill-color": "#00e5ff", "fill-opacity": 0.18 },
        });
      }
      if (!map.getLayer(DRAW_LINE_LAYER_ID)) {
        map.addLayer({
          id: DRAW_LINE_LAYER_ID,
          type: "line",
          source: DRAW_SOURCE_ID,
          paint: { "line-color": "#00e5ff", "line-width": 2 },
        });
      }
      if (!map.getLayer(DRAW_POINT_LAYER_ID)) {
        map.addLayer({
          id: DRAW_POINT_LAYER_ID,
          type: "circle",
          source: DRAW_SOURCE_ID,
          paint: {
            "circle-radius": 4,
            "circle-color": "#ffd400",
            "circle-stroke-color": "#000000",
            "circle-stroke-width": 1,
          },
        });
      }
    };

    const pointFeatures = points.map((p) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Point" as const, coordinates: p },
    }));

    const update = () => {
      ensureLayers();
      const source = map.getSource(DRAW_SOURCE_ID) as mapboxgl.GeoJSONSource | undefined;
      source?.setData({
        type: "FeatureCollection",
        features: [feature, ...pointFeatures],
      });
    };

    if (map.isStyleLoaded()) update();
    else map.once("styledata", update);
  }, [map, points, mode]);

  // Remove the preview layers/source when the editor unmounts.
  useEffect(() => {
    return () => {
      if (!map) return;
      for (const id of [DRAW_FILL_LAYER_ID, DRAW_LINE_LAYER_ID, DRAW_POINT_LAYER_ID]) {
        if (map.getLayer(id)) map.removeLayer(id);
      }
      if (map.getSource(DRAW_SOURCE_ID)) map.removeSource(DRAW_SOURCE_ID);
    };
  }, [map]);

  const undo = () => {
    setPoints((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setRedoStack((r) => [...r, last]);
      return prev.slice(0, -1);
    });
  };

  const redo = () => {
    setRedoStack((r) => {
      if (r.length === 0) return r;
      const last = r[r.length - 1];
      setPoints((prev) => [...prev, last]);
      return r.slice(0, -1);
    });
  };

  const clearAll = () => {
    setPoints([]);
    setRedoStack([]);
  };

  const toggleMask = () => {
    const next = !maskOn;
    setMaskOn(next);
    setWaterMaskDebug(next);
  };

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    left: 16,
    top: 16,
    zIndex: 60,
    width: 300,
    maxHeight: "calc(100vh - 32px)",
    overflow: "auto",
    background: "rgba(8, 20, 24, 0.92)",
    border: "1px solid rgba(0, 229, 255, 0.35)",
    borderRadius: 12,
    color: "#e6f7fb",
    font: "12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
    boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
    pointerEvents: "auto",
  };

  const btn: React.CSSProperties = {
    padding: "4px 8px",
    borderRadius: 6,
    border: "1px solid rgba(255,255,255,0.18)",
    background: "rgba(255,255,255,0.06)",
    color: "#e6f7fb",
    cursor: "pointer",
    fontSize: 11,
  };

  const btnActive: React.CSSProperties = {
    ...btn,
    background: "#00e5ff",
    color: "#03151a",
    borderColor: "#00e5ff",
    fontWeight: 700,
  };

  if (!open) {
    return (
      <button
        type="button"
        style={{ ...btnActive, ...panelStyle, width: "auto", padding: "6px 10px" }}
        onClick={() => setOpen(true)}
      >
        Water Editor
      </button>
    );
  }

  return (
    <div style={panelStyle}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          borderBottom: "1px solid rgba(255,255,255,0.12)",
        }}
      >
        <strong style={{ color: "#00e5ff", flex: 1 }}>Water Debug Editor</strong>
        <button type="button" style={btn} onClick={() => setOpen(false)}>
          –
        </button>
      </div>

      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {!map && <div style={{ opacity: 0.7 }}>Waiting for the active map…</div>}

        {/* Mode + capture */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={mode === "polygon" ? btnActive : btn}
            onClick={() => setMode("polygon")}
          >
            Polygon
          </button>
          <button
            type="button"
            style={mode === "shoreline" ? btnActive : btn}
            onClick={() => setMode("shoreline")}
          >
            Shoreline
          </button>
          <button
            type="button"
            style={capturing ? btnActive : btn}
            onClick={() => setCapturing((c) => !c)}
          >
            {capturing ? "Capturing" : "Capture off"}
          </button>
        </div>

        {/* Mask toggle */}
        <button type="button" style={maskOn ? btnActive : btn} onClick={toggleMask}>
          {maskOn ? "Water mask: ON" : "Water mask: OFF"}
        </button>

        {/* Undo / Redo / Clear */}
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" style={btn} onClick={undo} disabled={points.length === 0}>
            Undo
          </button>
          <button type="button" style={btn} onClick={redo} disabled={redoStack.length === 0}>
            Redo
          </button>
          <button type="button" style={btn} onClick={clearAll} disabled={points.length === 0}>
            Clear
          </button>
        </div>

        {/* Export */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <button
            type="button"
            style={btn}
            onClick={() => copyToClipboard(JSON.stringify(toGeoJSON(points, mode), null, 2))}
            disabled={points.length === 0}
          >
            Copy GeoJSON
          </button>
          <button
            type="button"
            style={btn}
            onClick={() => copyToClipboard(toArrayLiteral(points))}
            disabled={points.length === 0}
          >
            Copy array
          </button>
        </div>

        {/* Point list */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.12)", paddingTop: 8 }}>
          <div style={{ opacity: 0.7, marginBottom: 4 }}>
            {points.length} point{points.length === 1 ? "" : "s"} — click the map to add
          </div>
          <ol style={{ margin: 0, paddingLeft: 22, maxHeight: 220, overflow: "auto" }}>
            {points.map((p, i) => (
              <li
                key={`${p[0]},${p[1]},${i}`}
                style={{ display: "flex", alignItems: "center", gap: 6 }}
              >
                <span style={{ flex: 1 }}>{fmt(p)}</span>
                <button
                  type="button"
                  style={{ ...btn, padding: "1px 5px", fontSize: 10 }}
                  onClick={() => copyToClipboard(fmt(p))}
                >
                  copy
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
