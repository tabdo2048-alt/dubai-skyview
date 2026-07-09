import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Star, StarOff, Edit3 } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AdminLocationPicker } from "@/components/map/AdminLocationPicker";
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { useMapConfig } from "@/hooks/use-map-config";
import { useProjects, useCommunities, useDevelopers } from "@/hooks/use-projects";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatAed } from "@/lib/dubai";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { user } = useAuth();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin(user);
  const { data: projects = [], refetch } = useProjects();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  if (adminLoading) return <div className="min-h-screen"><AppNavbar /><div className="p-10 text-center text-muted-foreground">Checking access…</div></div>;
  if (!isAdmin) {
    return (
      <div className="min-h-screen">
        <AppNavbar />
        <div className="mx-auto max-w-md px-4 py-16">
          <div className="glass-strong rounded-3xl p-8 text-center">
            <h1 className="font-display text-3xl text-cream">Admin only</h1>
            <p className="mt-2 text-sm text-muted-foreground">This account is not an administrator.</p>
            <Button asChild className="mt-6 bg-gold text-gold-foreground"><Link to="/">Back to map</Link></Button>
          </div>
        </div>
      </div>
    );
  }

  const del = async (id: string) => {
    if (!confirm("Delete this project?")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Project deleted");
    qc.invalidateQueries();
    refetch();
  };

  const toggleFeatured = async (id: string, next: boolean) => {
    const { error } = await supabase.from("projects").update({ featured: next }).eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  };

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto max-w-6xl px-4 py-8">
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-cream">
          <Link to="/"><ArrowLeft className="mr-1 h-4 w-4" /> Back to map</Link>
        </Button>
        <div className="mt-4 flex items-center justify-between">
          <h1 className="font-display text-4xl text-cream">Admin <span className="text-gold-gradient">Dashboard</span></h1>
          <Button onClick={() => { setCreating(true); setEditing(null); }} className="bg-gold text-gold-foreground hover:bg-gold/90">
            <Plus className="mr-1 h-4 w-4" /> New project
          </Button>
        </div>

        {(creating || editing) && (
          <ProjectForm
            id={editing}
            onClose={() => { setCreating(false); setEditing(null); refetch(); qc.invalidateQueries(); }}
          />
        )}

        <div className="mt-6 grid gap-2">
          {projects.map((p) => (
            <div key={p.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
              <div className="h-14 w-20 overflow-hidden rounded-lg bg-muted">
                {p.main_image_url && <img src={p.main_image_url} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg text-cream">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.developer?.name ?? "—"} · {p.community?.name ?? "—"} · {formatAed(p.starting_price_aed)}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => toggleFeatured(p.id, !p.featured)} title="Toggle featured">
                {p.featured ? <Star className="h-4 w-4 text-gold" /> : <StarOff className="h-4 w-4 text-muted-foreground" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={() => { setEditing(p.id); setCreating(false); }}>
                <Edit3 className="h-4 w-4 text-cream" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => del(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectForm({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data: projects = [] } = useProjects();
  const { data: developers = [] } = useDevelopers();
  const { data: communities = [] } = useCommunities();
  const { data: cfg } = useMapConfig();
  const existing = id ? projects.find((p) => p.id === id) : null;
  const [f, setF] = useState({
    name: existing?.name ?? "",
    slug: existing?.slug ?? "",
    developer_id: existing?.developer?.id ?? "",
    community_id: existing?.community?.id ?? "",
    lat: existing?.lat ?? 25.1972,
    lng: existing?.lng ?? 55.2744,
    address: existing?.address ?? "",
    starting_price_aed: existing?.starting_price_aed ?? 0,
    bedrooms_min: existing?.bedrooms_min ?? 1,
    bedrooms_max: existing?.bedrooms_max ?? 3,
    bathrooms: existing?.bathrooms ?? 2,
    completion_date: existing?.completion_date ?? "",
    payment_plan: existing?.payment_plan ?? "",
    status: existing?.status ?? "off_plan",
    category: existing?.category ?? "apartment",
    description: existing?.description ?? "",
    main_image_url: existing?.main_image_url ?? "",
    featured: existing?.featured ?? false,
  });
  const [saving, setSaving] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...f,
        slug: f.slug || f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        developer_id: f.developer_id || null,
        community_id: f.community_id || null,
      };
      const { error } = id
        ? await supabase.from("projects").update(payload).eq("id", id)
        : await supabase.from("projects").insert(payload);
      if (error) throw error;
      toast.success(id ? "Project updated" : "Project created");
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="glass-strong gold-hairline mt-6 space-y-3 rounded-2xl p-5">
      <h2 className="font-display text-2xl text-cream">{id ? "Edit project" : "New project"}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></Field>
        <Field label="Slug (optional)"><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
        <Field label="Developer">
          <select value={f.developer_id} onChange={(e) => setF({ ...f, developer_id: e.target.value })} className="glass gold-hairline w-full rounded-md p-2 text-cream">
            <option value="">— None —</option>
            {developers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Community">
          <select value={f.community_id} onChange={(e) => setF({ ...f, community_id: e.target.value })} className="glass gold-hairline w-full rounded-md p-2 text-cream">
            <option value="">— None —</option>
            {communities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        {cfg?.mapboxAccessToken && (
          <div className="sm:col-span-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Location on map</Label>
            <div className="mt-1">
              <AdminLocationPicker
                accessToken={cfg.mapboxAccessToken}
                lat={f.lat}
                lng={f.lng}
                onChange={({ lat, lng }) => setF({ ...f, lat, lng })}
              />
            </div>
          </div>
        )}
        <Field label="Latitude"><Input type="number" step="0.0001" value={f.lat} onChange={(e) => setF({ ...f, lat: Number(e.target.value) })} required /></Field>
        <Field label="Longitude"><Input type="number" step="0.0001" value={f.lng} onChange={(e) => setF({ ...f, lng: Number(e.target.value) })} required /></Field>
        <Field label="Starting price (AED)"><Input type="number" value={f.starting_price_aed} onChange={(e) => setF({ ...f, starting_price_aed: Number(e.target.value) })} /></Field>
        <Field label="Completion"><Input value={f.completion_date} onChange={(e) => setF({ ...f, completion_date: e.target.value })} placeholder="Q4 2026" /></Field>
        <Field label="Bedrooms min"><Input type="number" value={f.bedrooms_min} onChange={(e) => setF({ ...f, bedrooms_min: Number(e.target.value) })} /></Field>
        <Field label="Bedrooms max"><Input type="number" value={f.bedrooms_max} onChange={(e) => setF({ ...f, bedrooms_max: Number(e.target.value) })} /></Field>
        <Field label="Category">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="glass gold-hairline w-full rounded-md p-2 text-cream">
            {["apartment","villa","townhouse","penthouse","studio"].map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="glass gold-hairline w-full rounded-md p-2 text-cream">
            <option value="off_plan">Off plan</option><option value="ready">Ready</option>
          </select>
        </Field>
        <Field label="Payment plan"><Input value={f.payment_plan} onChange={(e) => setF({ ...f, payment_plan: e.target.value })} /></Field>
        <Field label="Main image URL"><Input value={f.main_image_url} onChange={(e) => setF({ ...f, main_image_url: e.target.value })} /></Field>
      </div>
      <Field label="Description">
        <Textarea rows={4} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <label className="flex items-center gap-2 text-sm text-cream">
        <input type="checkbox" checked={f.featured} onChange={(e) => setF({ ...f, featured: e.target.checked })} />
        Featured project
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="bg-gold text-gold-foreground hover:bg-gold/90">
          {saving ? "Saving…" : "Save project"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose} className="text-cream">Cancel</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
