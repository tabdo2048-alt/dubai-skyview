import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2, Star, StarOff, Edit3, Upload, ImagePlus, X, Globe, Shield, Ban, ArrowUp, ArrowDown } from "lucide-react";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { AdminLocationPicker } from "@/components/map/AdminLocationPicker";
import { ProjectPlotEditor } from "@/components/map/ProjectPlotEditor";
import type { Json } from "@/integrations/supabase/types";
// Client-only: mapbox-gl-draw touches the DOM at import time, so keep it out of
// the SSR bundle (lazy + a mounted gate), same pattern as the Water Editor.
const AdminZoneEditor = lazy(() =>
  import("@/components/map/AdminZoneEditor").then((m) => ({ default: m.AdminZoneEditor })),
);
import { useAuth, useIsAdmin } from "@/hooks/use-auth";
import { useMapConfig } from "@/hooks/use-map-config";
import { useProjects, useProjectById, useCommunities, useDevelopers } from "@/hooks/use-projects";
import { useTenantStore } from "@/store/tenant";
import { fetchPlatformTenants, setTenantSuspended, isActiveStatus, fetchPlatformUsers, deletePlatformUser, type PlatformTenant, type PlatformUser } from "@/integrations/supabase/saas";
import { POI_TABLES, type PoiCategory, type PoiPoint } from "@/hooks/use-pois";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatAed, CATEGORIES } from "@/lib/dubai";
import { mediaSrc } from "@/lib/media";
import { safeHttpUrl } from "@/lib/utils";
import { parseLatLngFromGoogleMapsUrl } from "@/lib/googleMapsLink";
import { setUserBlocked } from "@/lib/user-security.functions";
import { optimizeProjectImage, thumbnailPathFromStoragePath } from "@/lib/image-optimization";
import { formatSubscriptionPeriod } from "@/lib/subscription-period";
import type { ProjectUnitTypeRow, ProjectPaymentPlanRow } from "@/lib/types";
import { lowestUnitPrice } from "@/lib/unit-types";
import { legacyPaymentPlanValue } from "@/lib/payment-plans";

const PROJECT_MEDIA_BUCKET = "project-media";
const MAX_PROJECT_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PROJECT_IMAGES = 12;
const IMAGE_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

const UNIT_TYPE_QUICK_PICKS = ["Studio", "1BHK", "2BHK", "3BHK", "4BHK"];
type UnitTypeDraft = Omit<ProjectUnitTypeRow, "id" | "project_id" | "tenant_id" | "created_at" | "updated_at"> & { id?: string };

function unitTypeDraft(row: ProjectUnitTypeRow): UnitTypeDraft {
  return {
    id: row.id,
    label: row.label,
    price_aed: row.price_aed,
    area_sqm_min: row.area_sqm_min,
    area_sqm_max: row.area_sqm_max,
    sort_order: row.sort_order,
  };
}

// A launch usually offers several plans side by side ("60/40 on handover",
// "1% monthly"), so these are repeating rows like unit types rather than the
// single free-text projects.payment_plan column they replace.
const PAYMENT_PLAN_QUICK_PICKS = ["60/40 Plan", "70/30 Plan", "1% Monthly", "Post-handover 5 years", "Cash"];
type PaymentPlanDraft = Omit<ProjectPaymentPlanRow, "id" | "project_id" | "tenant_id" | "created_at" | "updated_at"> & { id?: string };

function paymentPlanDraft(row: ProjectPaymentPlanRow): PaymentPlanDraft {
  return {
    id: row.id,
    label: row.label,
    details: row.details,
    sort_order: row.sort_order,
  };
}

function imageFileError(file: File): string | null {
  if (!IMAGE_EXTENSIONS[file.type]) return `${file.name}: only JPEG, PNG, WebP, and AVIF images are allowed`;
  if (file.size > MAX_PROJECT_IMAGE_BYTES) return `${file.name}: image must be 10 MB or smaller`;
  return null;
}

async function hasAllowedImageSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const startsWith = (...values: number[]) => values.every((value, index) => bytes[index] === value);
  const isJpeg = startsWith(0xff, 0xd8, 0xff);
  const isPng = startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const isWebp = startsWith(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  const isAvif = bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70 &&
    ((bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x66) ||
      (bytes[8] === 0x61 && bytes[9] === 0x76 && bytes[10] === 0x69 && bytes[11] === 0x73));
  return (file.type === "image/jpeg" && isJpeg) ||
    (file.type === "image/png" && isPng) ||
    (file.type === "image/webp" && isWebp) ||
    (file.type === "image/avif" && isAvif);
}

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

// Preset plot-boundary colours (gold default + a spread of hues); a native colour
// input alongside allows any custom colour.
const PLOT_SWATCHES = ["#c9a84c", "#3b82f6", "#ef4444", "#22c55e", "#a855f7", "#f59e0b", "#06b6d4"];

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
});

function AdminPage() {
  const { data: projects = [], refetch } = useProjects();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  // Access is org-membership based now (the _authenticated gate already ensured
  // an active subscription). The current tenant scopes every write.
  const { currentTenantId, loaded: tenantLoaded, load: loadTenants } = useTenantStore();
  useEffect(() => { void loadTenants(); }, [loadTenants]);
  // Global POI/reference data is edited only by the platform owner (legacy
  // has_role admin), not by tenant admins — hide that section from tenants.
  const { user } = useAuth();
  const { data: isPlatformAdmin } = useIsAdmin(user);

  if (!tenantLoaded) return <div className="min-h-screen"><AppNavbar /><div className="p-10 text-center text-muted-foreground">Loading workspace…</div></div>;
  if (!currentTenantId) {
    return (
      <div className="min-h-screen">
        <AppNavbar />
        <div className="mx-auto max-w-md px-4 py-16">
          <div className="glass-strong rounded-3xl p-8 text-center">
            <h1 className="font-display text-3xl text-cream">No organization</h1>
            <p className="mt-2 text-sm text-muted-foreground">This account has no active organization.</p>
            <Button asChild className="mt-6 bg-gold text-gold-foreground"><Link to="/billing">Subscribe</Link></Button>
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

        <AdminNav />

        <div id="admin-projects" className="mt-4 flex items-center justify-between scroll-mt-24">
          <h1 className="font-display text-4xl text-cream">Admin <span className="text-gold-gradient">Dashboard</span></h1>
          <div className="flex items-center gap-2">
            {isPlatformAdmin && (
              <Button asChild variant="outline" className="glass gold-hairline text-cream">
                <Link to="/admin/platform"><Shield className="mr-1 h-4 w-4" /> Platform</Link>
              </Button>
            )}
            <Button onClick={() => setCreating(true)} className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Plus className="mr-1 h-4 w-4" /> New project
            </Button>
          </div>
        </div>

        {creating && (
          <ProjectForm
            id={null}
            tenantId={currentTenantId}
            onClose={() => { setCreating(false); refetch(); qc.invalidateQueries(); }}
          />
        )}

        <div className="mt-6 grid gap-2">
          {projects.map((p) => (
            <div key={p.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
              <div className="h-14 w-20 overflow-hidden rounded-lg bg-muted">
                {mediaSrc(p.main_image_thumb_src, p.main_image_src ?? p.main_image_url) && <img src={mediaSrc(p.main_image_thumb_src, p.main_image_src ?? p.main_image_url)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg text-cream">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {p.developer?.name ?? "—"} · {p.community?.name ?? "—"} · {formatAed(lowestUnitPrice(p.unit_types, p.starting_price_aed))}
                </div>
              </div>
              <Button size="icon" variant="ghost" onClick={() => toggleFeatured(p.id, !p.featured)} title="Toggle featured">
                {p.featured ? <Star className="h-4 w-4 text-gold" /> : <StarOff className="h-4 w-4 text-muted-foreground" />}
              </Button>
              <Button asChild size="icon" variant="ghost">
                <Link to="/admin/projects/$id" params={{ id: p.id }}>
                  <Edit3 className="h-4 w-4 text-cream" />
                </Link>
              </Button>
              <Button size="icon" variant="ghost" onClick={() => del(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          ))}
        </div>

        <DeveloperManager />
        <CommunityManager />
        <ZoneSection />
      </div>
    </div>
  );
}

// Zone editor lives behind the same admin gate; needs the Mapbox token.
// Rendered only after mount so the client-only editor never runs during SSR.
function ZoneSection() {
  const { data: cfg } = useMapConfig();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !cfg?.mapboxAccessToken) return null;
  return (
    <Suspense fallback={null}>
      <AdminZoneEditor accessToken={cfg.mapboxAccessToken} />
    </Suspense>
  );
}

// Quick-jump nav: each button scrolls to its admin section.
const ADMIN_SECTIONS = [
  { id: "admin-projects", label: "Projects" },
  { id: "admin-developers", label: "Developers" },
  { id: "admin-communities", label: "Communities" },
  { id: "admin-zones", label: "Zone editor" },
] as const;

function AdminNav() {
  const go = (id: string) =>
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  return (
    <div className="sticky top-16 z-30 -mx-4 mt-2 border-b border-gold/15 bg-background/85 px-4 py-3 backdrop-blur-md">
      <div className="flex flex-wrap gap-2">
        {ADMIN_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => go(s.id)}
            className="glass gold-hairline rounded-full px-4 py-1.5 text-sm text-cream transition-all hover:bg-gold hover:text-gold-foreground"
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const POI_CATEGORIES = Object.keys(POI_TABLES) as PoiCategory[];

// Add / list / delete Places of Interest (tourism, schools, hospitals). Mirrors
// DeveloperManager, but the active POI table is chosen with a category tab and
// the location is set with the same map picker used for projects.
export function PoiManager() {
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
    <div id="admin-poi" className="mt-10 scroll-mt-24">
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
        <div className="sm:col-span-2">
          <Field label="Google Maps link (auto-fills location)">
            <LocationFromLink onCoords={({ lat, lng }) => setForm({ ...form, lat, lng })} />
          </Field>
        </div>
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
  const { currentTenantId } = useTenantStore();
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("developers").insert as any)({ ...payload, tenant_id: currentTenantId });
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
    <div id="admin-developers" className="mt-10 scroll-mt-24">
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
              {safeHttpUrl(d.logo_url) && <img src={safeHttpUrl(d.logo_url) ?? undefined} alt="" className="h-full w-full object-cover" />}
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

type CommunityRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  hero_image_url: string | null;
  center_lat: number | null;
  center_lng: number | null;
  sort_order: number;
};

// Add / edit / delete communities. The table already exists (name, slug,
// description, hero image, map centre, sort order) and feeds the project form's
// community dropdown; this just gives it a CRUD surface. Mirrors DeveloperManager.
function CommunityManager() {
  const { data: communities = [] } = useCommunities();
  const { currentTenantId } = useTenantStore();
  const qc = useQueryClient();
  const empty = { name: "", slug: "", description: "", hero_image_url: "", center_lat: "", center_lng: "", sort_order: "0" };
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const startEdit = (c: CommunityRow) => {
    setEditId(c.id);
    setForm({
      name: c.name,
      slug: c.slug,
      description: c.description ?? "",
      hero_image_url: c.hero_image_url ?? "",
      center_lat: c.center_lat != null ? String(c.center_lat) : "",
      center_lng: c.center_lng != null ? String(c.center_lng) : "",
      sort_order: String(c.sort_order ?? 0),
    });
  };
  const reset = () => { setEditId(null); setForm(empty); };
  const refresh = () => { qc.invalidateQueries({ queryKey: ["communities"] }); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return toast.error("Name is required");
    // These feed map coordinates — reject garbage before it reaches the DB.
    if (form.center_lat.trim() && Number.isNaN(Number(form.center_lat))) return toast.error("Latitude must be a number");
    if (form.center_lng.trim() && Number.isNaN(Number(form.center_lng))) return toast.error("Longitude must be a number");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        description: form.description.trim() || null,
        hero_image_url: form.hero_image_url.trim() || null,
        center_lat: form.center_lat.trim() === "" ? null : Number(form.center_lat),
        center_lng: form.center_lng.trim() === "" ? null : Number(form.center_lng),
        sort_order: form.sort_order.trim() === "" ? 0 : Number(form.sort_order),
      };
      if (editId) {
        const { error } = await supabase.from("communities").update(payload).eq("id", editId);
        if (error) throw error;
        toast.success("Community updated");
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("communities").insert as any)({ ...payload, tenant_id: currentTenantId });
        if (error) throw error;
        toast.success("Community added");
      }
      reset();
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const del = async (c: CommunityRow) => {
    // projects.community_id is ON DELETE SET NULL, so this only orphans projects.
    if (!confirm(`Delete community "${c.name}"?`)) return;
    const { error } = await supabase.from("communities").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Community deleted");
    if (editId === c.id) reset();
    refresh();
  };

  return (
    <div id="admin-communities" className="mt-10 scroll-mt-24">
      <h2 className="font-display text-3xl text-cream">Communities</h2>

      <form onSubmit={save} className="glass-strong gold-hairline mt-4 grid gap-3 rounded-2xl p-5 sm:grid-cols-2">
        <Field label="Name"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Slug (optional)"><Input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
        <Field label="Hero image URL"><Input value={form.hero_image_url} onChange={(e) => setForm({ ...form, hero_image_url: e.target.value })} placeholder="https://" /></Field>
        <Field label="Sort order"><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></Field>
        <Field label="Center latitude"><Input type="number" step="any" value={form.center_lat} onChange={(e) => setForm({ ...form, center_lat: e.target.value })} placeholder="25.19" /></Field>
        <Field label="Center longitude"><Input type="number" step="any" value={form.center_lng} onChange={(e) => setForm({ ...form, center_lng: e.target.value })} placeholder="55.27" /></Field>
        <div className="sm:col-span-2">
          <Field label="Description"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} /></Field>
        </div>
        <div className="flex gap-2 sm:col-span-2">
          <Button type="submit" disabled={saving} className="bg-gold text-gold-foreground hover:bg-gold/90">
            {editId ? "Update community" : "Add community"}
          </Button>
          {editId && <Button type="button" variant="ghost" onClick={reset} className="text-muted-foreground">Cancel</Button>}
        </div>
      </form>

      <div className="mt-4 grid gap-2">
        {communities.map((c) => (
          <div key={c.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
            <div className="h-10 w-10 overflow-hidden rounded-md bg-muted">
              {safeHttpUrl(c.hero_image_url) && <img src={safeHttpUrl(c.hero_image_url) ?? undefined} alt="" className="h-full w-full object-cover" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-display text-lg text-cream">{c.name}</div>
              <div className="truncate text-xs text-muted-foreground">
                {c.slug}
                {c.center_lat != null && c.center_lng != null ? ` · ${c.center_lat}, ${c.center_lng}` : ""}
                {` · #${c.sort_order}`}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => startEdit(c as CommunityRow)}><Edit3 className="h-4 w-4 text-cream" /></Button>
            <Button size="icon" variant="ghost" onClick={() => del(c as CommunityRow)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProjectForm({ id, tenantId, onClose }: { id: string | null; tenantId: string; onClose: () => void }) {
  const { data: existingProject } = useProjectById(id);
  const { data: developers = [] } = useDevelopers();
  const { data: communities = [] } = useCommunities();
  const { data: cfg } = useMapConfig();
  const existing = existingProject ?? null;
  const [f, setF] = useState({
    name: existing?.name ?? "",
    slug: existing?.slug ?? "",
    developer_id: existing?.developer?.id ?? "",
    community_id: existing?.community?.id ?? "",
    lat: existing?.lat ?? 25.1972,
    lng: existing?.lng ?? 55.2744,
    address: existing?.address ?? "",
    starting_price_aed: existing?.starting_price_aed ?? null,
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
    plot_geometry: (existing?.plot_geometry as GeoJSON.Polygon | null) ?? null,
    plot_color: existing?.plot_color ?? "#c9a84c",
  });
  const [gallery, setGallery] = useState(existing?.images ?? []);
  const [unitTypes, setUnitTypes] = useState<UnitTypeDraft[]>(() => (existing?.unit_types ?? []).map(unitTypeDraft));
  const [paymentPlans, setPaymentPlans] = useState<PaymentPlanDraft[]>(() => (existing?.payment_plans ?? []).map(paymentPlanDraft));
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  // Child rows (unit types, images) must carry the tenant that owns the PROJECT,
  // not whichever org the switcher currently has selected. Stamping the selected
  // org instead is what makes "add a unit type after changing organization" fail
  // with `project does not belong to the row tenant` — the
  // validate_project_child_tenant trigger (see
  // supabase/migrations/20260812110000_security_integrity_hardening.sql and
  // 20260817100000_project_unit_types.sql) requires child.tenant_id to equal
  // projects.tenant_id. A project being CREATED is stamped with the selected org
  // below, so for a new project the two are the same value.
  //
  // tenant_id is read through a cast because the generated projects Row type
  // predates the multi-tenant migration and does not list it; the column is
  // really there, selected by PROJECT_DETAIL_SELECT's `*`.
  const projectTenantId = (existing as unknown as { tenant_id?: string } | null)?.tenant_id || tenantId;
  const foreignTenant = Boolean(existing) && projectTenantId !== tenantId;

  useEffect(() => {
    setGallery(existing?.images ?? []);
  }, [existing?.id, existing?.images]);

  useEffect(() => {
    setUnitTypes((existing?.unit_types ?? []).map(unitTypeDraft));
  }, [existing?.id, existing?.unit_types]);

  useEffect(() => {
    setPaymentPlans((existing?.payment_plans ?? []).map(paymentPlanDraft));
  }, [existing?.id, existing?.payment_plans]);

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
    if (imageFiles.length > MAX_PROJECT_IMAGES) {
      throw new Error(`You can upload up to ${MAX_PROJECT_IMAGES} images at a time`);
    }
    for (const file of imageFiles) {
      const validationError = imageFileError(file);
      if (validationError) throw new Error(validationError);
      if (!(await hasAllowedImageSignature(file))) {
        throw new Error(`${file.name}: file contents do not match its image type`);
      }
    }

    const uploaded = await Promise.all(
      imageFiles.map(async (file, index) => {
        const optimized = await optimizeProjectImage(file);
        const extension = IMAGE_EXTENSIONS[optimized.full.type] ?? (optimized.full.type === "image/jpeg" ? "jpg" : "webp");
        const safeName = file.name
          .replace(/\.[^/.]+$/, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "")
          .slice(0, 42);
        // Prefix with the OWNING tenant so the storage RLS policy (which checks
        // the leading path segment against tenant membership) authorizes the
        // upload, and so the object sits beside the rest of that project's media.
        const path = `${projectTenantId}/${projectId}/${Date.now()}-${index}-${safeName || "project-image"}.${extension}`;

        const { error: uploadError } = await supabase.storage
          .from(PROJECT_MEDIA_BUCKET)
          .upload(path, optimized.full, {
            cacheControl: "31536000",
            contentType: optimized.full.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        // Keep a tiny, immutable object beside the original. Map/list views
        // resolve this derived path; old objects fall back to the full image.
        if (optimized.thumbnail) {
          const { error: thumbnailError } = await supabase.storage
            .from(PROJECT_MEDIA_BUCKET)
            .upload(thumbnailPathFromStoragePath(path), optimized.thumbnail, {
              cacheControl: "31536000",
              contentType: optimized.thumbnail.type,
              upsert: false,
            });
          if (thumbnailError) throw thumbnailError;
        }

        const { data } = supabase.storage.from(PROJECT_MEDIA_BUCKET).getPublicUrl(path);
        return data.publicUrl;
      }),
    );

    const firstSort = gallery.length;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: imageError } = await (supabase.from("project_images").insert as any)(
      uploaded.map((url, index) => ({
        project_id: projectId,
        tenant_id: projectTenantId, // the project's own tenant, not the selected one
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
      await supabase.storage.from(PROJECT_MEDIA_BUCKET).remove([path, thumbnailPathFromStoragePath(path)]);
    }

    setGallery((items) => items.filter((item) => item.id !== imageId));
    if (f.main_image_url === url) {
      const nextMain = gallery.find((item) => item.id !== imageId)?.url ?? "";
      setF((current) => ({ ...current, main_image_url: nextMain }));
      if (id) await supabase.from("projects").update({ main_image_url: nextMain || null }).eq("id", id);
    }
    toast.success("Image removed");
  };

  const persistUnitTypes = async (projectId: string) => {
    const rows = unitTypes.map((item, index) => ({
      label: item.label.trim(),
      price_aed: item.price_aed,
      area_sqm_min: item.area_sqm_min,
      area_sqm_max: item.area_sqm_max,
      sort_order: index,
    }));
    const existingIds = new Set((existing?.unit_types ?? []).map((item) => item.id));
    const retainedIds = new Set(unitTypes.flatMap((item) => item.id ? [item.id] : []));
    const removedIds = [...existingIds].filter((unitTypeId) => !retainedIds.has(unitTypeId));

    if (removedIds.length) {
      const { error } = await supabase
        .from("project_unit_types")
        .delete()
        .eq("project_id", projectId)
        .in("id", removedIds);
      if (error) throw error;
    }

    const updates = unitTypes.flatMap((item, index) => {
      if (!item.id) return [];
      return [{
        id: item.id,
        values: rows[index],
      }];
    });
    await Promise.all(updates.map(async ({ id: unitTypeId, values }) => {
      const { error } = await supabase
        .from("project_unit_types")
        .update(values)
        .eq("id", unitTypeId)
        .eq("project_id", projectId);
      if (error) throw error;
    }));

    const inserts = unitTypes.flatMap((item, index) => item.id ? [] : [{
      ...rows[index],
      project_id: projectId,
      tenant_id: projectTenantId,
    }]);
    if (inserts.length) {
      const { error } = await supabase.from("project_unit_types").insert(inserts);
      if (error) throw error;
    }
  };

  // Same diff-and-sync shape as persistUnitTypes: delete rows the admin removed,
  // update the ones with an id, insert the new ones. tenant_id on insert is the
  // project's owning tenant (projectTenantId), never the selected org.
  const persistPaymentPlans = async (projectId: string) => {
    const rows = paymentPlans.map((item, index) => ({
      label: item.label.trim(),
      details: item.details?.trim() ? item.details.trim() : null,
      sort_order: index,
    }));
    const existingIds = new Set((existing?.payment_plans ?? []).map((item) => item.id));
    const retainedIds = new Set(paymentPlans.flatMap((item) => item.id ? [item.id] : []));
    const removedIds = [...existingIds].filter((planId) => !retainedIds.has(planId));

    if (removedIds.length) {
      const { error } = await supabase
        .from("project_payment_plans")
        .delete()
        .eq("project_id", projectId)
        .in("id", removedIds);
      if (error) throw error;
    }

    const updates = paymentPlans.flatMap((item, index) => item.id ? [{ id: item.id, values: rows[index] }] : []);
    await Promise.all(updates.map(async ({ id: planId, values }) => {
      const { error } = await supabase
        .from("project_payment_plans")
        .update(values)
        .eq("id", planId)
        .eq("project_id", projectId);
      if (error) throw error;
    }));

    const inserts = paymentPlans.flatMap((item, index) => item.id ? [] : [{
      ...rows[index],
      project_id: projectId,
      tenant_id: projectTenantId,
    }]);
    if (inserts.length) {
      const { error } = await supabase.from("project_payment_plans").insert(inserts);
      if (error) throw error;
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    for (const [index, item] of unitTypes.entries()) {
      if (!item.label.trim()) {
        toast.error(`Unit type ${index + 1}: label is required`);
        return;
      }
      if (item.price_aed != null && (!Number.isFinite(item.price_aed) || item.price_aed <= 0)) {
        toast.error(`Unit type ${index + 1}: price must be positive`);
        return;
      }
      if (item.area_sqm_min != null && (!Number.isFinite(item.area_sqm_min) || item.area_sqm_min <= 0)) {
        toast.error(`Unit type ${index + 1}: minimum area must be positive`);
        return;
      }
      if (item.area_sqm_max != null && (!Number.isFinite(item.area_sqm_max) || item.area_sqm_max <= 0)) {
        toast.error(`Unit type ${index + 1}: maximum area must be positive`);
        return;
      }
      if (item.area_sqm_min != null && item.area_sqm_max != null && item.area_sqm_max < item.area_sqm_min) {
        toast.error(`Unit type ${index + 1}: maximum area must be at least minimum area`);
        return;
      }
    }
    for (const [index, item] of paymentPlans.entries()) {
      if (!item.label.trim()) {
        toast.error(`Payment plan ${index + 1}: name is required`);
        return;
      }
    }
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
        plot_geometry: (f.plot_geometry as unknown as Json) ?? null,
        // Keep the legacy single column in step with the plan rows — the map popup
        // reads it and never sees the rows. See legacyPaymentPlanValue.
        payment_plan: legacyPaymentPlanValue(paymentPlans, existing?.payment_plans ?? [], f.payment_plan),
      };
      let projectId = id ?? "";

      if (id) {
        const { error } = await supabase.from("projects").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        // Stamp tenancy on create (new column). Cast until types are regenerated.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data, error } = await (supabase.from("projects").insert as any)({ ...payload, tenant_id: tenantId }).select("id").single();
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

      await persistUnitTypes(projectId);
      await persistPaymentPlans(projectId);

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
      {/* The switcher is on another org than the one that owns this project. The
          save still works — unit types and images are stamped with the owning org
          (projectTenantId) — but say so, because the project will not appear in
          this org's list and only a member of the owning org can write to it. */}
      {foreignTenant && (
        <p className="rounded-xl border border-gold/40 bg-gold/10 p-2.5 text-xs text-cream">
          This project belongs to a different organization than the one selected. Edits are saved to the owning
          organization.
        </p>
      )}
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
        <div className="sm:col-span-2">
          <Field label="Google Maps link (auto-fills location)">
            <LocationFromLink onCoords={({ lat, lng }) => setF({ ...f, lat, lng })} />
          </Field>
        </div>
        {cfg?.mapboxAccessToken && (
          <div className="sm:col-span-2">
            <Field label="Plot boundary (optional — draw the land parcel)">
              <div className="mb-2 flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Boundary colour:</span>
                {PLOT_SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setF({ ...f, plot_color: c })}
                    title={c}
                    className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${
                      f.plot_color === c ? "border-white ring-2 ring-white/70" : "border-white/30"
                    }`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  value={f.plot_color}
                  onChange={(e) => setF({ ...f, plot_color: e.target.value })}
                  title="Custom colour"
                  className="h-6 w-8 cursor-pointer rounded border border-white/30 bg-transparent p-0"
                />
              </div>
              <ProjectPlotEditor
                accessToken={cfg.mapboxAccessToken}
                lat={f.lat}
                lng={f.lng}
                value={f.plot_geometry}
                onChange={(g) => setF({ ...f, plot_geometry: g })}
              />
            </Field>
          </div>
        )}
        <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Latitude"><Input type="number" step="0.0001" value={f.lat} onChange={(e) => setF({ ...f, lat: Number(e.target.value) })} required /></Field>
        <Field label="Longitude"><Input type="number" step="0.0001" value={f.lng} onChange={(e) => setF({ ...f, lng: Number(e.target.value) })} required /></Field>
        <Field label="Completion"><Input value={f.completion_date} onChange={(e) => setF({ ...f, completion_date: e.target.value })} placeholder="Q4 2026" /></Field>
        <Field label="Bedrooms min"><Input type="number" value={f.bedrooms_min} onChange={(e) => setF({ ...f, bedrooms_min: Number(e.target.value) })} /></Field>
        <Field label="Bedrooms max"><Input type="number" value={f.bedrooms_max} onChange={(e) => setF({ ...f, bedrooms_max: Number(e.target.value) })} /></Field>
        <Field label="Bathrooms"><Input type="number" value={f.bathrooms} onChange={(e) => setF({ ...f, bathrooms: Number(e.target.value) })} /></Field>
        <Field label="Category">
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className="glass gold-hairline w-full rounded-md p-2 text-cream">
            {/* Read from CATEGORIES so this form and the sidebar filter chips
                can never drift apart — the previous hardcoded list had already
                fallen behind. */}
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className="glass gold-hairline w-full rounded-md p-2 text-cream">
            <option value="off_plan">Off plan</option><option value="ready">Ready</option>
          </select>
        </Field>
        {/* Payment plans moved to their own repeating-rows section below (a
            project can have several). The legacy payment_plan column is no longer
            edited here — it is written from those rows on save. */}
        <Field label="Main image URL"><Input value={f.main_image_url} onChange={(e) => setF({ ...f, main_image_url: e.target.value })} /></Field>
        <Field label="Brochure URL"><Input value={f.brochure_url} onChange={(e) => setF({ ...f, brochure_url: e.target.value })} /></Field>
        <Field label="Video URL"><Input value={f.video_url} onChange={(e) => setF({ ...f, video_url: e.target.value })} /></Field>
        <Field label="360 tour URL"><Input value={f.tour_360_url} onChange={(e) => setF({ ...f, tour_360_url: e.target.value })} /></Field>
        <Field label="Tags"><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="waterfront, luxury, family" /></Field>
      </div>
      <div className="space-y-3 rounded-2xl border border-gold/20 bg-black/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Unit type pricing &amp; area</Label>
            <p className="mt-1 text-xs text-muted-foreground">Add a price and optional area range for every unit type.</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="glass gold-hairline text-cream"
            onClick={() => setUnitTypes((current) => [
              ...current,
              { label: "", price_aed: null, area_sqm_min: null, area_sqm_max: null, sort_order: current.length },
            ])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add unit type
          </Button>
        </div>
        {unitTypes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
            No unit types yet. Existing projects are backfilled from their old starting price.
          </div>
        ) : (
          <div className="space-y-2">
            {unitTypes.map((item, index) => (
              <div key={item.id ?? `new-unit-${index}`} className="grid gap-2 rounded-xl border border-border/60 bg-black/20 p-3 sm:grid-cols-[1.1fr_1fr_1fr_1fr_auto] sm:items-end">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Type</span>
                  <Input
                    list="unit-type-quick-picks"
                    value={item.label}
                    placeholder="2BHK"
                    onChange={(e) => setUnitTypes((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: e.target.value } : row))}
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Price (AED)</span>
                  <Input
                    type="number"
                    min="1"
                    value={item.price_aed ?? ""}
                    placeholder="Optional"
                    onChange={(e) => setUnitTypes((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, price_aed: e.target.value === "" ? null : Number(e.target.value) } : row))}
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Area min (m²)</span>
                  <Input
                    type="number"
                    min="1"
                    value={item.area_sqm_min ?? ""}
                    placeholder="Optional"
                    onChange={(e) => setUnitTypes((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, area_sqm_min: e.target.value === "" ? null : Number(e.target.value) } : row))}
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Area max (m²)</span>
                  <Input
                    type="number"
                    min="1"
                    value={item.area_sqm_max ?? ""}
                    placeholder="Optional"
                    onChange={(e) => setUnitTypes((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, area_sqm_max: e.target.value === "" ? null : Number(e.target.value) } : row))}
                  />
                </label>
                <div className="flex items-center justify-end gap-1">
                  <Button type="button" size="icon" variant="ghost" disabled={index === 0} onClick={() => setUnitTypes((current) => {
                    const next = [...current];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    return next;
                  })} aria-label="Move unit type up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={index === unitTypes.length - 1} onClick={() => setUnitTypes((current) => {
                    const next = [...current];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    return next;
                  })} aria-label="Move unit type down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setUnitTypes((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label="Remove unit type">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <datalist id="unit-type-quick-picks">
          {UNIT_TYPE_QUICK_PICKS.map((label) => <option key={label} value={label} />)}
        </datalist>
      </div>
      <div className="space-y-3 rounded-2xl border border-gold/20 bg-black/10 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">Payment plans</Label>
            <p className="mt-1 text-xs text-muted-foreground">Add every plan on offer. Each shows its name; the optional breakdown appears when a buyer expands it on the project page.</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="glass gold-hairline text-cream"
            onClick={() => setPaymentPlans((current) => [
              ...current,
              { label: "", details: null, sort_order: current.length },
            ])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add payment plan
          </Button>
        </div>
        {paymentPlans.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 p-3 text-sm text-muted-foreground">
            No payment plans yet. Existing projects keep their previous single plan until you add rows here.
          </div>
        ) : (
          <div className="space-y-2">
            {paymentPlans.map((item, index) => (
              <div key={item.id ?? `new-plan-${index}`} className="grid gap-2 rounded-xl border border-border/60 bg-black/20 p-3 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Plan name</span>
                  <Input
                    list="payment-plan-quick-picks"
                    value={item.label}
                    placeholder="60/40 Plan"
                    onChange={(e) => setPaymentPlans((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, label: e.target.value } : row))}
                  />
                </label>
                <label className="space-y-1 text-xs text-muted-foreground">
                  <span>Details (optional)</span>
                  <Input
                    value={item.details ?? ""}
                    placeholder="10% booking · 50% during construction · 40% on handover"
                    onChange={(e) => setPaymentPlans((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, details: e.target.value === "" ? null : e.target.value } : row))}
                  />
                </label>
                <div className="flex items-center justify-end gap-1">
                  <Button type="button" size="icon" variant="ghost" disabled={index === 0} onClick={() => setPaymentPlans((current) => {
                    const next = [...current];
                    [next[index - 1], next[index]] = [next[index], next[index - 1]];
                    return next;
                  })} aria-label="Move payment plan up">
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" disabled={index === paymentPlans.length - 1} onClick={() => setPaymentPlans((current) => {
                    const next = [...current];
                    [next[index], next[index + 1]] = [next[index + 1], next[index]];
                    return next;
                  })} aria-label="Move payment plan down">
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button type="button" size="icon" variant="ghost" onClick={() => setPaymentPlans((current) => current.filter((_, rowIndex) => rowIndex !== index))} aria-label="Remove payment plan">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        <datalist id="payment-plan-quick-picks">
          {PAYMENT_PLAN_QUICK_PICKS.map((label) => <option key={label} value={label} />)}
        </datalist>
      </div>
      <div>
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">Project images from device</Label>
        <label className="mt-1 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-gold/35 bg-black/20 px-4 py-6 text-center transition hover:border-gold/70 hover:bg-gold/5">
          <ImagePlus className="h-8 w-8 text-gold" />
          <span className="mt-2 text-sm font-medium text-cream">Upload project photos</span>
          <span className="mt-1 text-xs text-muted-foreground">Select one or more images from your computer.</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/avif"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              const invalid = files.map(imageFileError).find(Boolean);
              if (invalid) {
                toast.error(invalid);
                e.target.value = "";
                return;
              }
              if (imageFiles.length + files.length > MAX_PROJECT_IMAGES) {
                toast.error(`You can upload up to ${MAX_PROJECT_IMAGES} images at a time`);
                e.target.value = "";
                return;
              }
              setImageFiles((current) => [...current, ...files]);
              e.target.value = "";
            }}
          />
        </label>
        {(imagePreviews.length > 0 || gallery.length > 0) && (
          <div className="mt-3 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {gallery.map((image) => (
              <div key={image.id} className="group relative overflow-hidden rounded-xl border border-gold/20 bg-black/30">
                {/* Render the signed URL; every action below still uses
                    image.url, the canonical stored value. */}
                <img src={mediaSrc(image.thumb_src, image.src ?? image.url)} alt="" className="aspect-video w-full object-cover" loading="lazy" decoding="async" />
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

// Platform-admin only: every subscriber org, with a suspend toggle. Data comes
// from the platform_list_tenants RPC (which itself checks has_role admin).
// Platform-admin only: every project across EVERY organization, with the switch
// that puts one on the public showcase map.
//
// A platform admin passes the `has_role(auth.uid(),'admin')` branch of both the
// projects read and write policies, so this list is genuinely global — unlike
// /admin, which RLS scopes to the signed-in user's own org. New projects are
// still stamped with the platform admin's own tenant (tenant_id is NOT NULL);
// what makes a project show on the public map is `is_public`, not which org owns
// it, so publishing from here works regardless of the owning org.
export function PublicProjectsManager() {
  const { data: projects = [], refetch } = useProjects();
  const qc = useQueryClient();
  const { currentTenantId, loaded: tenantLoaded, load: loadTenants } = useTenantStore();
  const [creating, setCreating] = useState(false);
  const [orgNames, setOrgNames] = useState<Record<string, string>>({});
  const [onlyPublic, setOnlyPublic] = useState(false);

  useEffect(() => { void loadTenants(); }, [loadTenants]);

  // Map tenant_id -> org name so each row shows which subscriber owns it.
  useEffect(() => {
    void (async () => {
      try {
        const tenants = await fetchPlatformTenants();
        setOrgNames(Object.fromEntries(tenants.map((t) => [t.id, t.name])));
      } catch {
        /* names are cosmetic — the list still works without them */
      }
    })();
  }, []);

  const isPublic = (p: unknown) => Boolean((p as { is_public?: boolean }).is_public);

  const togglePublic = async (id: string, next: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from("projects").update as any)({ is_public: next }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(next ? "Published to the public map" : "Removed from the public map");
    qc.invalidateQueries();
    refetch();
  };

  const del = async (id: string) => {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    const { error } = await supabase.from("projects").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Project deleted");
    qc.invalidateQueries();
    refetch();
  };

  const shown = onlyPublic ? projects.filter(isPublic) : projects;
  const publicCount = projects.filter(isPublic).length;

  return (
    <div id="admin-public-projects" className="mt-10 scroll-mt-24">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-3xl text-cream">Public map projects</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {publicCount} of {projects.length} project{projects.length === 1 ? "" : "s"} shown to visitors.
            The globe toggles a project on the public map.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOnlyPublic((v) => !v)}
            className="glass gold-hairline text-cream"
          >
            {onlyPublic ? "Show all" : "Show published only"}
          </Button>
          <Button
            onClick={() => setCreating(true)}
            disabled={!tenantLoaded || !currentTenantId}
            className="bg-gold text-gold-foreground hover:bg-gold/90"
          >
            <Plus className="mr-1 h-4 w-4" /> New project
          </Button>
        </div>
      </div>

      {creating && currentTenantId && (
        <ProjectForm
          id={null}
          tenantId={currentTenantId}
          onClose={() => { setCreating(false); refetch(); qc.invalidateQueries(); }}
        />
      )}

      <div className="mt-4 grid gap-2">
        {shown.length === 0 && (
          <div className="glass gold-hairline rounded-2xl p-4 text-center text-sm text-muted-foreground">
            {onlyPublic ? "No projects are published yet." : "No projects yet."}
          </div>
        )}
        {shown.map((p) => {
          const pub = isPublic(p);
          const org = orgNames[(p as unknown as { tenant_id?: string }).tenant_id ?? ""];
          return (
            <div key={p.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
              <div className="h-14 w-20 overflow-hidden rounded-lg bg-muted">
                {mediaSrc(p.main_image_thumb_src, p.main_image_src ?? p.main_image_url) && <img src={mediaSrc(p.main_image_thumb_src, p.main_image_src ?? p.main_image_url)} alt="" className="h-full w-full object-cover" loading="lazy" decoding="async" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-display text-lg text-cream">{p.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {org ? `${org} · ` : ""}{p.developer?.name ?? "—"} · {formatAed(lowestUnitPrice(p.unit_types, p.starting_price_aed))}
                </div>
              </div>
              <span className={`text-xs font-medium ${pub ? "text-emerald-400" : "text-muted-foreground"}`}>
                {pub ? "Public" : "Private"}
              </span>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => togglePublic(p.id, !pub)}
                title={pub ? "Published — click to remove from the public map" : "Private — click to publish"}
              >
                <Globe className={`h-4 w-4 ${pub ? "text-gold" : "text-muted-foreground"}`} />
              </Button>
              <Button asChild size="icon" variant="ghost">
                <Link to="/admin/projects/$id" params={{ id: p.id }}>
                  <Edit3 className="h-4 w-4 text-cream" />
                </Link>
              </Button>
              <Button size="icon" variant="ghost" onClick={() => del(p.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SubscribersManager() {
  const [rows, setRows] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchPlatformTenants());
    } catch (err) {
      toast.error(errMsg(err, "Could not load subscribers"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const toggleSuspend = async (t: PlatformTenant) => {
    setBusyId(t.id);
    try {
      await setTenantSuspended(t.id, !t.suspended);
      toast.success(t.suspended ? "Subscriber re-enabled" : "Subscriber suspended");
      await load();
    } catch (err) {
      toast.error(errMsg(err, "Action failed"));
    } finally {
      setBusyId(null);
    }
  };

  const badge = (t: PlatformTenant) => {
    if (t.suspended) return { label: "Suspended", cls: "text-destructive" };
    if (isActiveStatus(t.subscription_status)) return { label: "Active", cls: "text-emerald-400" };
    return { label: t.subscription_status, cls: "text-muted-foreground" };
  };

  return (
    <div id="admin-subscribers" className="mt-10 scroll-mt-24">
      <h2 className="font-display text-3xl text-cream">Subscribers</h2>
      <p className="mt-1 text-sm text-muted-foreground">{rows.length} organization{rows.length === 1 ? "" : "s"}</p>

      <div className="mt-4 grid gap-2">
        {loading && <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="glass gold-hairline rounded-2xl p-4 text-center text-sm text-muted-foreground">No subscribers yet.</div>
        )}
        {rows.map((t) => {
          const b = badge(t);
          // No `suspended` here: this row already renders a Suspended status
          // badge, so the pill stays focused on the billing period itself.
          const period = formatSubscriptionPeriod(t.current_period_end, t.subscription_status);
          return (
            <div key={t.id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="truncate font-display text-lg text-cream">{t.name}</span>
                  {period && (
                    <span
                      title={period.title}
                      className={`glass gold-hairline shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-tight ${period.cls}`}
                    >
                      {period.label}
                      {period.detail ? ` · ${period.detail}` : ""}
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {t.owner_email ?? "—"} · {t.project_count} project{t.project_count === 1 ? "" : "s"}
                  {t.plan ? ` · ${t.plan}` : ""}
                </div>
              </div>
              <span className={`text-xs font-medium ${b.cls}`}>{b.label}</span>
              {/* Regular platform admins cannot suspend an org containing a
                  platform admin. The designated owner override is enforced by
                  the RPC and is reflected here only for clearer UI feedback. */}
              {t.has_platform_admin && !t.suspended && !t.can_suspend_platform_admins ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground" title="Platform administrators cannot be suspended">
                  <Shield className="h-3.5 w-3.5" /> Platform admin
                </span>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === t.id}
                  onClick={() => toggleSuspend(t)}
                  className="glass gold-hairline text-cream"
                >
                  <Ban className="mr-1 h-3.5 w-3.5" />
                  {t.suspended ? "Unsuspend" : "Suspend"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Platform-admin only: every user account (via platform_list_users RPC).
export function UsersManager() {
  const [rows, setRows] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { user: currentUser } = useAuth();

  const load = async () => {
    setLoading(true);
    try {
      setRows(await fetchPlatformUsers());
    } catch (err) {
      toast.error(errMsg(err, "Could not load users"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const toggleBlock = async (u: PlatformUser) => {
    setBusyId(u.user_id);
    try {
      await setUserBlocked({ data: { userId: u.user_id, blocked: !u.blocked } });
      toast.success(u.blocked ? "User unblocked" : "User blocked");
      await load();
    } catch (err) {
      toast.error(errMsg(err, "Could not change user access"));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (u: PlatformUser) => {
    if (!confirm(`Permanently delete ${u.email ?? "this user"} and the organizations they own? This cannot be undone.`)) return;
    setBusyId(u.user_id);
    try {
      await deletePlatformUser(u.user_id);
      toast.success("User removed");
      await load();
    } catch (err) {
      toast.error(errMsg(err, "Delete failed"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div id="admin-users" className="mt-10 scroll-mt-24">
      <h2 className="font-display text-3xl text-cream">Users</h2>
      <p className="mt-1 text-sm text-muted-foreground">{rows.length} account{rows.length === 1 ? "" : "s"}</p>

      <div className="mt-4 grid gap-2">
        {loading && <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>}
        {!loading && rows.length === 0 && (
          <div className="glass gold-hairline rounded-2xl p-4 text-center text-sm text-muted-foreground">No users.</div>
        )}
        {rows.map((u) => {
          const period = formatSubscriptionPeriod(u.current_period_end, u.subscription_status);
          return (
          <div key={u.user_id} className="glass gold-hairline flex items-center gap-3 rounded-2xl p-3">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="truncate font-display text-lg text-cream">{u.email ?? "—"}</span>
                {period && (
                  <span
                    title={period.title}
                    className={`glass gold-hairline shrink-0 rounded-full px-2 py-0.5 text-[11px] leading-tight ${period.cls}`}
                  >
                    {period.label}
                    {period.detail ? ` · ${period.detail}` : ""}
                  </span>
                )}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {u.orgs ? `${u.orgs} (${u.org_roles ?? "member"})` : "no organization"}
              </div>
            </div>
            {u.blocked && (
              <span className="rounded-full border border-destructive/50 px-2.5 py-1 text-xs text-destructive">
                Blocked
              </span>
            )}
            {u.is_platform_admin ? (
              <span className="glass gold-hairline rounded-full px-2.5 py-1 text-xs text-gold">Platform admin</span>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busyId === u.user_id}
                onClick={() => remove(u)}
                className="glass gold-hairline text-destructive"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={
                busyId === u.user_id ||
                currentUser?.id === u.user_id ||
                // `blocked` is absent until the account-block SQL is applied to
                // the database (supabase/APPLY_THIS_4.sql). Disable rather than
                // let the click fail with a 404 on the missing RPC.
                u.blocked === undefined ||
                (u.is_platform_admin && !u.can_block_platform_admins)
              }
              onClick={() => void toggleBlock(u)}
              title={
                u.blocked === undefined
                  ? "Account blocking is not installed on this database yet"
                  : currentUser?.id === u.user_id
                    ? "You cannot block yourself"
                    : u.is_platform_admin && !u.can_block_platform_admins
                      ? "Only ashraf@admin.com can block a platform administrator"
                      : undefined
              }
              className="glass gold-hairline text-destructive"
            >
              <Ban className="mr-1 h-3.5 w-3.5" /> {u.blocked ? "Unblock" : "Block"}
            </Button>
          </div>
          );
        })}
      </div>
    </div>
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

// Paste a Google Maps link → pull lat/lng out of it and fill the location. Full
// URLs are parsed client-side; short goo.gl links are resolved by the
// `resolve-maps-link` edge function (which follows the redirect server-side).
function LocationFromLink({ onCoords }: { onCoords: (c: { lat: number; lng: number }) => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const apply = async () => {
    let c = parseLatLngFromGoogleMapsUrl(url);
    if (!c && /goo\.gl|maps\.app\.goo\.gl/i.test(url)) {
      setBusy(true);
      try {
        const { data, error } = await supabase.functions.invoke("resolve-maps-link", {
          body: { url: url.trim() },
        });
        if (!error && data && typeof data.lat === "number" && typeof data.lng === "number") {
          c = { lat: data.lat, lng: data.lng };
        }
      } catch {
        /* fall through to the error toast below */
      } finally {
        setBusy(false);
      }
    }
    if (!c) {
      toast.error(
        "Couldn't read coordinates from that link. Paste a full Google Maps URL that contains @lat,lng (or deploy the resolve-maps-link function for short goo.gl links).",
      );
      return;
    }
    onCoords(c);
    toast.success(`Location set to ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`);
    setUrl("");
  };
  return (
    <div className="flex gap-2">
      <Input
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void apply();
          }
        }}
        placeholder="Paste Google Maps link (…/@25.19,55.27,… or a goo.gl short link)"
      />
      <Button type="button" onClick={() => void apply()} disabled={!url.trim() || busy} className="shrink-0">
        {busy ? "…" : "Set"}
      </Button>
    </div>
  );
}
