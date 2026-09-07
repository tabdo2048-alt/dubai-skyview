import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AdminLocationPicker } from "@/components/map/AdminLocationPicker";
import { AdminField, LocationFromLink } from "@/components/admin/AdminFormFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMapConfig } from "@/hooks/use-map-config";
import { POI_TABLES, type PoiCategory, type PoiPoint } from "@/hooks/use-pois";
import { supabase } from "@/integrations/supabase/client";

const CATEGORIES = Object.keys(POI_TABLES) as PoiCategory[];
const EMPTY = { name: "", lat: 25.1972, lng: 55.2744, images: "" };

function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }

export function PoiManager({ canManage }: { canManage: boolean }) {
  const { data: config } = useMapConfig();
  const [mapsAvailable, setMapsAvailable] = useState(false);
  const [category, setCategory] = useState<PoiCategory>("tourism");
  const [rows, setRows] = useState<PoiPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const table = POI_TABLES[category].table;

  useEffect(() => {
    try {
      const canvas = document.createElement("canvas");
      setMapsAvailable(Boolean(canvas.getContext("webgl2") || canvas.getContext("webgl")));
    } catch {
      setMapsAvailable(false);
    }
  }, []);

  async function load(selected: PoiCategory) {
    setLoading(true);
    const { data, error } = await supabase.from(POI_TABLES[selected].table).select("*").order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(message(error, "Could not load places"));
    setRows((data ?? []) as PoiPoint[]);
  }
  useEffect(() => { void load(category); setForm(EMPTY); }, [category]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canManage || !form.name.trim()) return;
    setSaving(true);
    const payload = { name: form.name.trim(), lat: Number(form.lat), lng: Number(form.lng), images: form.images.split(",").map((value) => value.trim()).filter(Boolean) };
    const { error } = await supabase.from(table).insert(payload);
    setSaving(false);
    if (error) return toast.error(message(error, "Could not save place"));
    setForm(EMPTY); toast.success("Place added"); void load(category);
  }
  async function remove(row: PoiPoint) {
    if (!canManage || !confirm(`Delete "${row.name}"?`)) return;
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    if (error) return toast.error(message(error, "Delete failed"));
    toast.success("Place deleted"); void load(category);
  }

  return <div id="admin-poi" className="mt-10 scroll-mt-24">
    <h2 className="font-display text-3xl text-cream">Places of interest</h2>
    <div className="mt-3 flex flex-wrap gap-2">{CATEGORIES.map((item) => <button key={item} type="button" onClick={() => setCategory(item)} className={`rounded-full px-4 py-1.5 text-sm transition-all ${category === item ? "bg-gold text-gold-foreground shadow" : "glass gold-hairline text-cream hover:text-gold"}`}>{POI_TABLES[item].icon} {POI_TABLES[item].label}</button>)}</div>
    {canManage ? <form onSubmit={save} className="glass-strong gold-hairline mt-4 grid gap-3 rounded-2xl p-5 sm:grid-cols-2">
      <AdminField label="Name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></AdminField>
      <AdminField label="Image URLs (comma-separated)"><Input value={form.images} onChange={(event) => setForm({ ...form, images: event.target.value })} /></AdminField>
      {config?.mapboxAccessToken && mapsAvailable ? <div className="sm:col-span-2"><Label className="text-xs uppercase tracking-widest text-muted-foreground">Location on map</Label><AdminLocationPicker accessToken={config.mapboxAccessToken} lat={form.lat} lng={form.lng} onChange={({ lat, lng }) => setForm({ ...form, lat, lng })} /></div> : null}
      <div className="sm:col-span-2"><AdminField label="Google Maps link"><LocationFromLink onCoords={({ lat, lng }) => setForm({ ...form, lat, lng })} /></AdminField></div>
      <AdminField label="Latitude"><Input type="number" step="0.0001" value={form.lat} onChange={(event) => setForm({ ...form, lat: Number(event.target.value) })} required /></AdminField>
      <AdminField label="Longitude"><Input type="number" step="0.0001" value={form.lng} onChange={(event) => setForm({ ...form, lng: Number(event.target.value) })} required /></AdminField>
      <Button type="submit" disabled={saving} className="bg-gold text-gold-foreground hover:bg-gold/90 sm:col-span-2"><Plus className="mr-1 h-4 w-4" />{saving ? "Saving…" : "Add place"}</Button>
    </form> : <p className="mt-3 text-sm text-muted-foreground">Read-only access</p>}
    <div className="mt-4 grid gap-2">{loading ? <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div> : null}{!loading && rows.length === 0 ? <div className="glass gold-hairline rounded-2xl p-4 text-center text-sm text-muted-foreground">No places yet.</div> : null}{rows.map((row) => <div key={row.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3"><div className="grid h-10 w-10 place-items-center rounded-md bg-black/30 text-lg" style={{ color: POI_TABLES[category].color }}>{POI_TABLES[category].icon}</div><div className="min-w-0 flex-1"><div className="truncate font-display text-lg text-cream">{row.name}</div><div className="text-xs text-muted-foreground">{row.lat.toFixed(4)}, {row.lng.toFixed(4)}</div></div>{canManage ? <Button size="icon" variant="ghost" onClick={() => void remove(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button> : null}</div>)}</div>
  </div>;
}
