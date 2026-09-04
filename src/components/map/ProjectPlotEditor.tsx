import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  drawnPolygon,
  normalizePolygon,
  ringVertexCount,
  hasKinks,
  polygonAreaM2,
  formatArea,
  markerInsidePlot,
} from "@/lib/mapDraw";

type Props = {
  accessToken: string;
  lat: number;
  lng: number;
  value: GeoJSON.Polygon | null;
  onChange: (poly: GeoJSON.Polygon | null) => void;
};

// Draw / edit a project's plot boundary. Reuses the same mapbox-gl-draw + shared
// geometry helpers as the zone editor. Emits a normalised GeoJSON Polygon (or null).
export function ProjectPlotEditor({ accessToken, lat, lng, value, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const markerRef = useRef<mapboxgl.Marker | null>(null); // the project's location point
  // The geometry we last emitted — lets the value-sync effect ignore our own echo.
  const emittedRef = useRef<GeoJSON.Polygon | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const latRef = useRef(lat);
  latRef.current = lat;
  const lngRef = useRef(lng);
  lngRef.current = lng;

  const [ready, setReady] = useState(false);
  const [areaM2, setAreaM2] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const validate = (geom: GeoJSON.Polygon | null) => {
    if (!geom) {
      setAreaM2(null);
      setWarning(null);
      return;
    }
    setAreaM2(polygonAreaM2(geom));
    if (ringVertexCount(geom) < 3) return setWarning("Fewer than 3 points.");
    if (hasKinks(geom)) return setWarning("Boundary self-intersects — points cross over.");
    if (!markerInsidePlot(lngRef.current, latRef.current, geom))
      return setWarning("The project marker is OUTSIDE this plot — did you draw the right parcel?");
    setWarning(null);
  };

  // Pull the drawn polygon out, normalise, emit.
  const sync = () => {
    const draw = drawRef.current;
    if (!draw) return;
    const raw = drawnPolygon(draw);
    const geom = raw ? normalizePolygon(raw) : null;
    emittedRef.current = geom;
    onChangeRef.current(geom);
    validate(geom);
  };

  const frame = (map: mapboxgl.Map, geom: GeoJSON.Polygon, duration: number) => {
    const ring = geom.coordinates[0] ?? [];
    if (!ring.length) return;
    const b = new mapboxgl.LngLatBounds();
    for (const [lo, la] of ring) b.extend([lo, la]);
    map.fitBounds(b, { padding: 60, duration });
  };

  // Init map + Draw once.
  useEffect(() => {
    if (!containerRef.current || !accessToken) return;
    mapboxgl.accessToken = accessToken;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [lngRef.current, latRef.current],
      zoom: 15.5,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");
    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { polygon: true, trash: true } });
    map.addControl(draw, "top-left");
    map.on("draw.create", sync);
    map.on("draw.update", sync);
    map.on("draw.delete", sync);
    map.on("load", () => {
      setTimeout(() => map.resize(), 60);
      // Show the project's location so the admin can trace the plot around it.
      const dot = document.createElement("div");
      dot.style.cssText =
        "width:14px;height:14px;border-radius:9999px;background:#e9c766;" +
        "border:2px solid #fff;box-shadow:0 1px 6px rgba(0,0,0,.5);pointer-events:none";
      markerRef.current = new mapboxgl.Marker({ element: dot, anchor: "center" })
        .setLngLat([lngRef.current, latRef.current])
        .addTo(map);
      setReady(true);
    });
    mapRef.current = map;
    drawRef.current = draw;
    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Keep the location dot on the current project coordinate as it's edited.
  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lat, lng]);

  // Load an EXTERNAL value into Draw (existing project on open, or a reset from the
  // parent) — never our own echo. Runs once the map is ready and whenever value changes.
  useEffect(() => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !map || !ready) return;
    if (value === emittedRef.current) return; // our own edit — Draw already has it
    draw.deleteAll();
    if (value) {
      draw.add({ type: "Feature", properties: {}, geometry: value });
      frame(map, value, 400);
    }
    emittedRef.current = value;
    validate(value);
  }, [value, ready]);

  const clear = () => {
    drawRef.current?.deleteAll();
    emittedRef.current = null;
    onChange(null);
    validate(null);
  };

  return (
    <div>
      <div className="overflow-hidden rounded-xl border border-gold/20">
        <div ref={containerRef} className="h-[280px] w-full bg-[#d9eef2]" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-xs">
        <span className="text-muted-foreground">
          {areaM2 != null ? `Area: ${formatArea(areaM2)}` : "Use the polygon tool to trace the plot boundary."}
        </span>
        {value && (
          <Button type="button" variant="ghost" size="sm" onClick={clear} className="text-muted-foreground">
            <X className="mr-1 h-3.5 w-3.5" /> Clear plot
          </Button>
        )}
      </div>
      {warning && (
        <div className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          ⚠ {warning} You can still save.
        </div>
      )}
    </div>
  );
}
