import { useEffect, useRef, useState } from "react";
import mapboxgl from "mapbox-gl";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import { kinks, cleanCoords } from "@turf/turf";
import { Trash2, Edit3, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { DUBAI_BOUNDS, DUBAI_CENTER } from "@/lib/dubai";
import {
  ZONE_ORDER,
  ZONE_CATEGORIES,
  isZoneCategory,
  type ZoneCategory,
  type ZoneRow,
} from "@/lib/zones";

function errMsg(err: unknown, fallback = "Save failed"): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.details, e.hint].filter((v) => typeof v === "string" && v).map(String);
    if (parts.length) return parts.join(" — ");
  }
  return fallback;
}

type PolygonGeom = { type: "Polygon"; coordinates: [number, number][][] };

// Auto-close the outer ring and strip duplicate/redundant coords for a clean save.
function normalizePolygon(geometry: PolygonGeom): PolygonGeom {
  const cleaned = cleanCoords({ type: "Feature", properties: {}, geometry }) as {
    geometry: PolygonGeom;
  };
  const rings = cleaned.geometry.coordinates.map((ring) => {
    if (ring.length === 0) return ring;
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) return [...ring, first];
    return ring;
  });
  return { type: "Polygon", coordinates: rings };
}

type Props = { accessToken: string };

// Admin-only Zone Editor: draw a boundary on the map (Mapbox GL Draw), name it,
// pick RY/STR/HH + a yield value, and save to the `zones` table. Existing zones
// list below with edit (reload polygon into Draw) and delete.
export function AdminZoneEditor({ accessToken }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = { name: "", category: "RY" as ZoneCategory, value: "" };
  const [form, setForm] = useState(emptyForm);
  // The currently drawn polygon (from Draw), or null when nothing is drawn.
  const [drawn, setDrawn] = useState<PolygonGeom | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("zones")
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(errMsg(error, "Could not load zones"));
    setZones((data ?? []) as ZoneRow[]);
  };

  // Pull the (single) drawn polygon out of Draw and validate it.
  const syncDrawn = () => {
    const draw = drawRef.current;
    if (!draw) return;
    const fc = draw.getAll();
    const poly = fc.features.find((f) => f.geometry?.type === "Polygon");
    if (!poly) {
      setDrawn(null);
      setWarning(null);
      return;
    }
    const geom = poly.geometry as PolygonGeom;
    setDrawn(geom);
    // Non-blocking quality warnings.
    const ring = geom.coordinates[0] ?? [];
    const verts = ring.length > 0 && ring[0][0] === ring[ring.length - 1][0] ? ring.length - 1 : ring.length;
    if (verts < 3) {
      setWarning("Polygon has fewer than 3 points.");
    } else {
      const self = kinks({ type: "Feature", properties: {}, geometry: geom });
      setWarning(self.features.length > 0 ? "Polygon self-intersects — points cross over." : null);
    }
  };

  // Init the map + Draw once.
  useEffect(() => {
    if (!containerRef.current || !accessToken) return;
    mapboxgl.accessToken = accessToken;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-streets-v12",
      center: [DUBAI_CENTER.lng, DUBAI_CENTER.lat],
      zoom: 10.5,
      maxBounds: [
        [DUBAI_BOUNDS.west - 0.3, DUBAI_BOUNDS.south - 0.3],
        [DUBAI_BOUNDS.east + 0.3, DUBAI_BOUNDS.north + 0.3],
      ],
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), "top-right");

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: { polygon: true, trash: true },
    });
    map.addControl(draw, "top-left");

    map.on("draw.create", syncDrawn);
    map.on("draw.update", syncDrawn);
    map.on("draw.delete", syncDrawn);
    map.on("load", () => setTimeout(() => map.resize(), 60));

    mapRef.current = map;
    drawRef.current = draw;
    void load();

    return () => {
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setDrawn(null);
    setWarning(null);
    drawRef.current?.deleteAll();
  };

  // Load an existing zone's polygon back into Draw so its points can be adjusted.
  const startEdit = (z: ZoneRow) => {
    const draw = drawRef.current;
    const map = mapRef.current;
    if (!draw || !map) return;
    const geom = z.geometry as PolygonGeom;
    if (geom?.type !== "Polygon") return toast.error("Zone geometry is not a polygon");
    draw.deleteAll();
    draw.add({ type: "Feature", properties: {}, geometry: geom });
    setEditingId(z.id);
    setForm({ name: z.name, category: isZoneCategory(z.category) ? z.category : "RY", value: z.value?.toString() ?? "" });
    setDrawn(geom);
    setWarning(null);
    // Frame the zone.
    const ring = geom.coordinates[0] ?? [];
    if (ring.length) {
      const b = new mapboxgl.LngLatBounds();
      for (const [lng, lat] of ring) b.extend([lng, lat]);
      map.fitBounds(b, { padding: 80, duration: 700 });
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!drawn) return toast.error("Draw a zone boundary on the map first");
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const geometry = normalizePolygon(drawn);
      const payload = {
        name: form.name.trim(),
        category: form.category,
        value: form.value.trim() === "" ? null : Number(form.value),
        geometry: geometry as unknown as Json,
      };
      if (editingId) {
        const { error } = await supabase.from("zones").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Zone updated");
      } else {
        const { error } = await supabase.from("zones").insert(payload);
        if (error) throw error;
        toast.success("Zone saved");
      }
      resetForm();
      void load();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const del = async (z: ZoneRow) => {
    if (!confirm(`Delete zone "${z.name}"?`)) return;
    const { error } = await supabase.from("zones").delete().eq("id", z.id);
    if (error) return toast.error(errMsg(error, "Delete failed"));
    toast.success("Zone deleted");
    if (editingId === z.id) resetForm();
    void load();
  };

  return (
    <div className="mt-10">
      <h2 className="font-display text-3xl text-cream">Zone editor</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Click the polygon tool, click points on the map to trace a boundary, close it, then name it and save.
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="overflow-hidden rounded-2xl border border-gold/20">
          <div ref={containerRef} className="h-[420px] w-full bg-[#d9eef2]" />
        </div>

        <form onSubmit={save} className="glass-strong gold-hairline grid h-fit gap-3 rounded-2xl p-5">
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Name</Label>
            <Input className="mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dubai Marina" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Category</Label>
            <div className="mt-1 flex gap-2">
              {ZONE_ORDER.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm({ ...form, category: c })}
                  className={`flex-1 rounded-full px-3 py-1.5 text-xs transition-all ${
                    form.category === c ? "text-black" : "glass gold-hairline text-cream hover:text-gold"
                  }`}
                  style={form.category === c ? { background: ZONE_CATEGORIES[c].color } : undefined}
                  title={ZONE_CATEGORIES[c].label}
                >
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">{ZONE_CATEGORIES[form.category].label}</div>
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Value (yield %, optional)</Label>
            <Input className="mt-1" type="number" step="0.1" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="e.g. 7.5" />
          </div>

          <div className="text-xs text-muted-foreground">
            {drawn ? "Boundary drawn ✓" : "No boundary drawn yet."}
          </div>
          {warning && (
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
              ⚠ {warning} You can still save.
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={saving} className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Plus className="mr-1 h-4 w-4" /> {saving ? "Saving…" : editingId ? "Update zone" : "Save zone"}
            </Button>
            {(editingId || drawn) && (
              <Button type="button" variant="ghost" onClick={resetForm} className="text-muted-foreground">
                <X className="mr-1 h-4 w-4" /> Clear
              </Button>
            )}
          </div>
        </form>
      </div>

      {/* Existing zones, grouped by category. */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {ZONE_ORDER.map((cat) => {
          const rows = zones.filter((z) => z.category === cat);
          return (
            <div key={cat}>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: ZONE_CATEGORIES[cat].color }} />
                <span className="font-display text-lg text-cream">{ZONE_CATEGORIES[cat].label}</span>
                <span className="text-xs text-muted-foreground">({rows.length})</span>
              </div>
              <div className="mt-2 grid gap-2">
                {loading && <div className="text-xs text-muted-foreground">Loading…</div>}
                {!loading && rows.length === 0 && (
                  <div className="glass gold-hairline rounded-xl p-3 text-center text-xs text-muted-foreground">None yet.</div>
                )}
                {rows.map((z) => (
                  <div key={z.id} className="glass gold-hairline flex items-center gap-2 rounded-xl p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm text-cream">{z.name}</div>
                      <div className="text-[11px] text-muted-foreground">{z.value != null ? `${z.value}% yield` : "no value"}</div>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => startEdit(z)}><Edit3 className="h-4 w-4 text-cream" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => del(z)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
