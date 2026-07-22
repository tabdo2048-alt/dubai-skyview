import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Star, StarOff, Edit3, Upload, ImagePlus, X } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AdminLocationPicker } from "@/components/map/AdminLocationPicker";
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { useMapConfig } from "@/hooks/use-map-config";
import { useProjects, useCommunities, useDevelopers } from "@/hooks/use-projects";
import { POI_TABLES, type PoiCategory, type PoiPoint } from "@/hooks/use-pois";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatAed } from "@/lib/dubai";

const PROJECT_MEDIA_BUCKET = "project-media";

// Supabase errors (Postgrest/Storage) are plain objects, not Error instances, so
// `err instanceof Error` misses them and the UI would just say "Save failed".
// Pull the real message out of whatever shape the error is.
function errMsg(err: unknown, fallback = "Save failed"): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    const parts = [e.message, e.error_description, e.error, e.details, e.hint]
      .filter((v) => typeof v === "string" && v)
      .map(String);
    if (parts.length) return parts.join(" — ");
  }
  return fallback;
}

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

        <DeveloperManager />
        <PoiManager />
      </div>
    </div>
  );
}

const POI_CATEGORIES = Object.keys(POI_TABLES) as PoiCategory[];

// Add / list / delete Places of Interest (tourism, schools, hospitals). Mirrors
// DeveloperManager, but the active POI table is chosen with a category tab and
// the location is set with the same map picker used for projects.
function PoiManager() {
  const { data: cfg } = useMapConfig();
  const [category, setCategory] = useState<PoiCategory>("tourism");
  const [rows, setRows] = useState<PoiPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const empty = { name: "", lat: 25.1972, lng: 55.2744, images: "" };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const table = POI_TABLES[category].table;

  const load = async (cat: PoiCategory) => {
    setLoading(true);
    const { data, error } = await supabase
      .from(POI_TABLES[cat].table)
      .select("*")
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(errMsg(error, "Could not load places"));
    setRows((data ?? []) as PoiPoint[]);
  };

  useEffect(() => {
    void load(category);
    setForm(empty);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        lat: Number(form.lat),
        lng: Number(form.lng),
        images: form.images
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      };
      const { error } = await supabase.from(table).insert(payload);
      if (error) throw error;
      toast.success(`${POI_TABLES[category].label} place added`);
      setForm(empty);
      void load(category);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const del = async (row: PoiPoint) => {
    if (!confirm(`Delete "${row.name}"?`)) return;
    const { error } = await supabase.from(table).delete().eq("id", row.id);
    if (error) return toast.error(errMsg(error, "Delete failed"));
    toast.success("Place deleted");
    void load(category);
  };

  return (
    <div className="mt-10">
      <h2 className="font-display text-3xl text-cream">Places of interest</h2>

      {/* Category tabs */}
      <div className="mt-3 flex flex-wrap gap-2">
        {POI_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full px-4 py-1.5 text-sm transition-all ${
              category === c ? "bg-gold text-gold-foreground shadow" : "glass gold-hairline text-cream hover:text-gold"
            }`}
          >
            {POI_TABLES[c].icon} {POI_TABLES[c].label}
          </button>
        ))}
      </div>

      <form onSubmit={save} className="glass-strong gold-hairline mt-4 grid gap-3 rounded-2xl p-5 sm:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Image URLs (comma-separated)"><Input value={form.images} onChange={(e) => setForm({ ...form, images: e.target.value })} placeholder="https://…, https://…" /></Field>
        {cfg?.mapboxAccessToken && (
          <div className="sm:col-span-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Location on map</Label>
            <div className="mt-1">
              <AdminLocationPicker
                accessToken={cfg.mapboxAccessToken}
                lat={form.lat}
                lng={form.lng}
                onChange={({ lat, lng }) => setForm({ ...form, lat, lng })}
              />
            </div>
          </div>
        )}
        <Field label="Latitude"><Input type="number" step="0.0001" value={form.lat} onChange={(e) => setForm({ ...form, lat: Number(e.target.value) })} required /></Field>
        <Field label="Longitude"><Input type="number" step="0.0001" value={form.lng} onChange={(e) => setForm({ ...form, lng: Number(e.target.value) })} required /></Field>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving} className="bg-gold text-gold-foreground hover:bg-gold/90">
            <Plus className="mr-1 h-4 w-4" /> {saving ? "Saving…" : `Add ${POI_TABLES[category].label} place`}
          </Button>
        </div>
      </form>

      <div className="mt-4 grid gap-2">
        {loading && <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="glass gold-hairline rounded-2xl p-4 text-center text-sm text-muted-foreground">
            No {POI_TABLES[category].label.toLowerCase()} places yet.
          </div>
        )}
        {rows.map((row) => (
          <div key={row.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-black/30 text-lg" style={{ color: POI_TABLES[category].color }}>
              {POI_TABLES[category].icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-lg text-cream">{row.name}</div>
              <div className="truncate text-xs text-muted-foreground">{row.lat.toFixed(4)}, {row.lng.toFixed(4)}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => del(row)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

type DeveloperRow = { id: string; name: string; slug: string; website: string | null; logo_url: string | null; description: string | null };

function DeveloperManager() {
  const { data: developers = [] } = useDevelopers();
  const qc = useQueryClient();
  const empty = { name: "", slug: "", website: "", logo_url: "", description: "" };
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const startEdit = (d: DeveloperRow) => {
    setEditId(d.id);
    setForm({
      name: d.name,
      slug: d.slug,
      website: d.website ?? "",
      logo_url: d.logo_url ?? "",
      description: d.description ?? "",
    });
  };
  const reset = () => { setEditId(null); setForm(empty); };

  const refresh = () => { qc.invalidateQueries({ queryKey: ["developers"] }); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        website: form.website.trim() || null,
        logo_url: form.logo_url.trim() || null,
        description: form.description.trim() || null,
      };
      if (editId) {
        const { error } = await supabase.from("developers").update(payload).eq("id", editId);
        if (error) throw error;
        toast.success("Developer updated");
      } else {
        const { error } = await supabase.from("developers").insert(payload);
        if (error) throw error;
        toast.success("Developer added");
      }
      reset();
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const del = async (d: DeveloperRow) => {
    if (!confirm(`Delete developer "${d.name}"?`)) return;
    const { error } = await supabase.from("developers").delete().eq("id", d.id);
    if (error) return toast.error(error.message);
    toast.success("Developer deleted");
    if (editId === d.id) reset();
    refresh();
  };

  return (
    <div className="mt-10">
      <h2 className="font-display text-3xl text-cream">Developers</h2>

      <form onSubmit={save} className="glass-strong gold-hairline mt-4 grid gap-3 rounded-2xl p-5 sm:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Slug (optional)"><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
        <Field label="Website"><Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" /></Field>
        <Field label="Logo URL"><Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://" /></Field>
        <div className="sm:col-span-2">
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></Field>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving} className="bg-gold text-gold-foreground hover:bg-gold/90">
            {editId ? "Update developer" : "Add developer"}
          </Button>
          {editId && <Button type="button" variant="ghost" onClick={reset} className="text-muted-foreground">Cancel</Button>}
        </div>
      </form>

      <div className="mt-4 grid gap-2">
        {developers.map((d) => (
          <div key={d.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
            <div className="h-10 w-10 overflow-hidden rounded-md bg-muted">
              {d.logo_url && <img src={d.logo_url} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-lg text-cream">{d.name}</div>
              <div className="truncate text-xs text-muted-foreground">{d.slug}{d.website ? ` · ${d.website}` : ""}</div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => startEdit(d as DeveloperRow)}><Edit3 className="h-4 w-4 text-cream" /></Button>
            <Button size="icon" variant="ghost" onClick={() => del(d as DeveloperRow)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
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
    brochure_url: existing?.brochure_url ?? "",
    video_url: existing?.video_url ?? "",
    tour_360_url: existing?.tour_360_url ?? "",
    tags: existing?.tags?.join(", ") ?? "",
    featured: existing?.featured ?? false,
  });
  const [gallery, setGallery] = useState(existing?.images ?? []);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setGallery(existing?.images ?? []);
  }, [existing?.id, existing?.images]);

  const imagePreviews = useMemo(
    () =>
      imageFiles.map((file) => ({
        file,
        url: URL.createObjectURL(file),
      })),
    [imageFiles],
  );

  useEffect(() => {
    return () => {
      imagePreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [imagePreviews]);

  const uploadProjectImages = async (projectId: string) => {
    if (!imageFiles.length) return [] as string[];

    const uploaded = await Promise.all(
      imageFiles.map(async (file, index) => {
        const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
        const safeName = file.name
          .replace(/\.[^/.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 42);
        const path = `${projectId}/${Date.now()}-${index}-${safeName || "project-image"}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(PROJECT_MEDIA_BUCKET)
          .upload(path, file, {
            cacheControl: "31536000",
            contentType: file.type || "image/jpeg",
            upsert: false,
          });

        if (uploadError) throw uploadError;

        const { data } = supabase.storage.from(PROJECT_MEDIA_BUCKET).getPublicUrl(path);
        return data.publicUrl;
      }),
    );

    const firstSort = gallery.length;
    const { error: imageError } = await supabase.from("project_images").insert(
      uploaded.map((url, index) => ({
        project_id: projectId,
        url,
        sort_order: firstSort + index,
      })),
    );

    if (imageError) throw imageError;
    return uploaded;
  };

  const removeExistingImage = async (imageId: string, url: string) => {
    const { error } = await supabase.from("project_images").delete().eq("id", imageId);
    if (error) return toast.error(error.message);

    const path = getProjectMediaPath(url);
    if (path) {
      await supabase.storage.from(PROJECT_MEDIA_BUCKET).remove([path]);
    }

    setGallery((items) => items.filter((item) => item.id !== imageId));
    if (f.main_image_url === url) {
      const nextMain = gallery.find((item) => item.id !== imageId)?.url ?? "";
      setF((current) => ({ ...current, main_image_url: nextMain }));
      if (id) await supabase.from("projects").update({ main_image_url: nextMain || null }).eq("id", id);
    }
    toast.success("Image removed");
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const isEditing = Boolean(id);
      const payload = {
        ...f,
        slug: f.slug || f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        developer_id: f.developer_id || null,
        community_id: f.community_id || null,
        main_image_url: f.main_image_url || null,
        brochure_url: f.brochure_url || null,
        video_url: f.video_url || null,
        tour_360_url: f.tour_360_url || null,
        tags: f.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      };
      let projectId = id ?? "";

      if (id) {
        const { error } = await supabase.from("projects").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("projects").insert(payload).select("id").single();
        if (error) throw error;
        if (!data?.id) throw new Error("Project was created without an id");
        projectId = data.id;
      }

      const uploadedUrls = await uploadProjectImages(projectId);
      if (uploadedUrls[0] && !payload.main_image_url) {
        const { error } = await supabase
          .from("projects")
          .update({ main_image_url: uploadedUrls[0] })
          .eq("id", projectId);
        if (error) throw error;
      }

      toast.success(isEditing ? "Project updated" : "Project created");
      onClose();
    } catch (err) {
      toast.error(errMsg(err));
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
        <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Latitude"><Input type="number" step="0.0001" value={f.lat} onChange={(e) => setF({ ...f, lat: Number(e.target.value) })} required /></Field>
        <Field label="Longitude"><Input type="number" step="0.0001" value={f.lng} onChange={(e) => setF({ ...f, lng: Number(e.target.value) })} required /></Field>
        <Field label="Starting price (AED)"><Input type="number" value={f.starting_price_aed} onChange={(e) => setF({ ...f, starting_price_aed: Number(e.target.value) })} /></Field>
        <Field label="Completion"><Input value={f.completion_date} onChange={(e) => setF({ ...f, completion_date: e.target.value })} placeholder="Q4 2026" /></Field>
        <Field label="Bedrooms min"><Input type="number" value={f.bedrooms_min} onChange={(e) => setF({ ...f, bedrooms_min: Number(e.target.value) })} /></Field>
        <Field label="Bedrooms max"><Input type="number" value={f.bedrooms_max} onChange={(e) => setF({ ...f, bedrooms_max: Number(e.target.value) })} /></Field>
        <Field label="Bathrooms"><Input type="number" value={f.bathrooms} onChange={(e) => setF({ ...f, bathrooms: Number(e.target.value) })} /></Field>
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
        <Field label="Brochure URL"><Input value={f.brochure_url} onChange={(e) => setF({ ...f, brochure_url: e.target.value })} /></Field>
        <Field label="Video URL"><Input value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} /></Field>
        <Field label="360 tour URL"><Input value={f.tour_360_url} onChange={(e) => setF({ ...f, tour_360_url: e.target.value })} /></Field>
        <Field label="Tags"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="waterfront, luxury, family" /></Field>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">Project images from device</Label>
        <label className="mt-1 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gold/35 bg-black/20 px-4 py-6 text-center transition hover:border-gold/70 hover:bg-gold/5">
          <ImagePlus className="h-8 w-8 text-gold" />
          <span className="mt-2 text-sm font-medium text-cream">Upload project photos</span>
          <span className="mt-1 text-xs text-muted-foreground">Select one or more images from your computer.</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              setImageFiles((current) => [...current, ...files]);
              e.target.value = "";
            }}
          />
        </label>
        {(imagePreviews.length > 0 || gallery.length > 0) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-xl border border-gold/20 bg-black/30">
                <img src={image.url} alt="" className="aspect-video w-full object-cover" />
                <div className="flex items-center justify-between gap-2 p-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={f.main_image_url === image.url ? "default" : "ghost"}
                    className={f.main_image_url === image.url ? "h-8 bg-gold text-gold-foreground" : "h-8 text-cream"}
                    onClick={() => setF({ ...f, main_image_url: image.url })}
                  >
                    Main
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => removeExistingImage(image.id, image.url)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
            {imagePreviews.map((preview, index) => (
              <div key={preview.url} className="relative overflow-hidden rounded-xl border border-gold/20 bg-black/30">
                <img src={preview.url} alt="" className="aspect-video w-full object-cover" />
                <button
                  type="button"
                  className="absolute right-2 top-2 rounded-full bg-black/70 p-1 text-cream hover:bg-black"
                  onClick={() => setImageFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                  aria-label="Remove selected image"
                >
                  <X className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2 p-2 text-xs text-muted-foreground">
                  <Upload className="h-3.5 w-3.5 text-gold" />
                  <span className="truncate">{preview.file.name}</span>
                </div>
              </div>
            ))}
          </div>
        )}
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

function getProjectMediaPath(url: string) {
  const marker = `/object/public/${PROJECT_MEDIA_BUCKET}/`;
  const index = url.indexOf(marker);
  if (index === -1) return null;
  return decodeURIComponent(url.slice(index + marker.length));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-muted-foreground">{label}</Label>
      <div className="mt-1">{children}</div>
    </div>
  );
}
