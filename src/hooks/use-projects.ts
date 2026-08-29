import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withSignedProjectMedia } from "@/lib/media";
import type { ProjectWithRelations, ProjectFilters, ProjectRow } from "@/lib/types";
import { lowestUnitPrice } from "@/lib/unit-types";

export function projectsQueryKey() {
  return ["projects", "list"] as const;
}

// `unit_types` is selected with `*` rather than a column list on purpose. Naming
// area_sqm_min/max here would make the WHOLE project list 400 on a database where
// supabase/migrations/20260818000000_unit_area_square_meters.sql has not been
// applied yet — one missing column would cost every project, price and marker on
// the map. With `*`, an un-migrated database simply returns the old sqft columns,
// nothing reads them, and the area line hides itself.
const PROJECT_LIST_SELECT = `
  id,slug,name,developer_id,community_id,lat,lng,address,starting_price_aed,
  bedrooms_min,bedrooms_max,bathrooms,completion_date,payment_plan,status,category,
  tags,description,main_image_url,video_url,tour_360_url,brochure_url,featured,
  created_at,updated_at,plot_geometry,plot_color,is_public,tenant_id,
  developer:developers(*),
  community:communities(id,name,slug),
  unit_types:project_unit_types(*)
`;

// Everything the detail/admin views need EXCEPT payment plans. Kept separate
// because `project_payment_plans` is a whole new table: the `*` trick that makes a
// missing COLUMN harmless does nothing for a missing RELATION, so naming it in a
// select is a hard 400 until
// supabase/migrations/20260821000000_project_payment_plans.sql is applied. Both
// callers below retry with this base select in that case, which costs one extra
// round trip on an un-migrated database and keeps the page working.
const PROJECT_DETAIL_SELECT_BASE = `
  *,
  developer:developers(*),
  community:communities(id,name,slug),
  images:project_images(*),
  unit_types:project_unit_types(*),
  amenities:project_amenities(*)
`;

const PROJECT_DETAIL_SELECT_WITH_PLANS = `${PROJECT_DETAIL_SELECT_BASE},
  payment_plans:project_payment_plans(*, installments:project_payment_plan_installments(*)),
  fees:project_fees(*)
`;

const PROJECT_DETAIL_SELECT_PLANS = `${PROJECT_DETAIL_SELECT_BASE},
  payment_plans:project_payment_plans(*)
`;

// PostgREST's code for "relationship/table not found in the schema cache" — i.e.
// the payment-plans migration has not been applied. Anything else is a real error
// and must not be papered over by a silent retry.
function isMissingRelation(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "PGRST200" ||
    error.code === "42P01" ||
    /could not find (a relationship|the table)|schema cache/i.test(error.message ?? "")
  );
}

async function fetchAllProjects(): Promise<ProjectWithRelations[]> {
  const { data, error } = await supabase
    .from("projects")
    // Map/sidebar consumers need one small image, not every gallery row and
    // amenity. Detail/admin editors fetch the full relation separately.
    .select(PROJECT_LIST_SELECT)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });
  // Resolve only generated thumbnails for this list. This keeps the initial map
  // payload and image downloads small while preserving external/legacy URLs.
  if (!error) return withSignedProjectMedia(normalizeProjects(data ?? []), { includeGallery: false, thumbnailsOnly: true });

  console.warn("[Projects] full query failed; falling back to legacy schema", error.message);
  return fetchLegacyProjects();
}

export function useProjects() {
  return useQuery({
    queryKey: projectsQueryKey(),
    queryFn: fetchAllProjects,
    staleTime: 60_000,
  });
}

// Standalone fetch (used by the detail route's SSR loader so <head> SEO tags can
// be built from real project data, and reused as the react-query queryFn).
export async function fetchProjectBySlug(slug: string): Promise<ProjectWithRelations | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_DETAIL_SELECT_WITH_PLANS)
    .eq("slug", slug)
    .maybeSingle();
  if (!error) return signOne(normalizeProject(data));

  // Payment plans not migrated yet: retry without them rather than dropping all
  // the way to the legacy select, which would also lose images and unit types.
  if (isMissingRelation(error)) {
    const retry = await supabase
      .from("projects")
      .select(PROJECT_DETAIL_SELECT_PLANS)
      .eq("slug", slug)
      .maybeSingle();
    if (!retry.error) return signOne(normalizeProject(retry.data));

    const baseRetry = await supabase
      .from("projects")
      .select(PROJECT_DETAIL_SELECT_BASE)
      .eq("slug", slug)
      .maybeSingle();
    if (!baseRetry.error) return signOne(normalizeProject(baseRetry.data));
  }

  console.warn("[Projects] full project query failed; falling back to legacy schema", error.message);
  const { data: legacyData, error: legacyError } = await supabase
    .from("projects")
    .select("*, developer:developers(id,name,slug)")
    .eq("slug", slug)
    .maybeSingle();
  if (legacyError) throw legacyError;
  return signOne(normalizeProject(legacyData));
}

/** Full project fetch used by the admin editor without loading every project. */
export async function fetchProjectById(id: string): Promise<ProjectWithRelations | null> {
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_DETAIL_SELECT_WITH_PLANS)
    .eq("id", id)
    .maybeSingle();
  if (!error) return signOne(normalizeProject(data));

  // Same tolerance as above: an unapplied payment-plans migration must not stop an
  // admin from editing a project.
  if (isMissingRelation(error)) {
    const retry = await supabase
      .from("projects")
      .select(PROJECT_DETAIL_SELECT_PLANS)
      .eq("id", id)
      .maybeSingle();
    if (!retry.error) return signOne(normalizeProject(retry.data));

    const baseRetry = await supabase
      .from("projects")
      .select(PROJECT_DETAIL_SELECT_BASE)
      .eq("id", id)
      .maybeSingle();
    if (!baseRetry.error) return signOne(normalizeProject(baseRetry.data));
  }

  throw error;
}

// Sign a single project's media (null passes through untouched).
async function signOne(project: ProjectWithRelations | null): Promise<ProjectWithRelations | null> {
  if (!project) return null;
  const [signed] = await withSignedProjectMedia([project]);
  return signed ?? project;
}

export function useProject(slug: string) {
  return useQuery({
    queryKey: ["projects", "slug", slug],
    queryFn: () => fetchProjectBySlug(slug),
  });
}

export function useProjectById(id: string | null) {
  return useQuery({
    queryKey: ["projects", "id", id],
    queryFn: () => fetchProjectById(id!),
    enabled: Boolean(id),
  });
}

export function useCommunities() {
  return useQuery({
    queryKey: ["communities", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("communities")
        .select("*")
        .order("sort_order");
      if (error) {
        console.warn("[Communities] table unavailable; returning empty list", error.message);
        return [];
      }
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function useDevelopers() {
  return useQuery({
    queryKey: ["developers", "list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("developers")
        .select("*")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 5 * 60_000,
  });
}

export function filterProjects(items: ProjectWithRelations[], f: ProjectFilters): ProjectWithRelations[] {
  const q = f.search.trim().toLowerCase();
  return items.filter((p) => {
    if (q && !`${p.name} ${p.developer?.name ?? ""} ${p.community?.name ?? ""} ${p.address ?? ""}`.toLowerCase().includes(q)) return false;
    if (f.categories.length && !f.categories.includes(p.category)) return false;
    if (f.statuses.length && !f.statuses.includes(p.status)) return false;
    if (f.communities.length && !(p.community && f.communities.includes(p.community.slug))) return false;
    if (f.tags.length && !f.tags.some((t) => p.tags?.includes(t))) return false;
    const projectPrice = lowestUnitPrice(p.unit_types, p.starting_price_aed) ?? 0;
    if (f.minPrice != null && projectPrice < f.minPrice) return false;
    if (f.maxPrice != null && projectPrice > f.maxPrice) return false;
    if (f.bedrooms != null && (p.bedrooms_min ?? 0) < f.bedrooms && (p.bedrooms_max ?? 0) < f.bedrooms) return false;
    return true;
  });
}

async function fetchLegacyProjects(): Promise<ProjectWithRelations[]> {
  const { data, error } = await supabase
    .from("projects")
    .select("*, developer:developers(id,name,slug)")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return withSignedProjectMedia(normalizeProjects(data ?? []), { includeGallery: false, thumbnailsOnly: true });
}

function normalizeProjects(items: unknown[]): ProjectWithRelations[] {
  return items.map((item) => normalizeProject(item)).filter(Boolean) as ProjectWithRelations[];
}

function normalizeProject(item: unknown): ProjectWithRelations | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Partial<ProjectRow> & {
    title?: string | null;
    location?: unknown;
    price?: number | null;
    image_url?: string | null;
    developer?: ProjectWithRelations["developer"];
    community?: ProjectWithRelations["community"];
    images?: ProjectWithRelations["images"];
    unit_types?: ProjectWithRelations["unit_types"];
    payment_plans?: ProjectWithRelations["payment_plans"];
    fees?: ProjectWithRelations["fees"];
    amenities?: ProjectWithRelations["amenities"];
  };
  const coords = extractLocation(raw.location);

  return {
    ...raw,
    id: String(raw.id ?? ""),
    name: raw.name ?? raw.title ?? "Dubai Project",
    slug: raw.slug ?? slugify(raw.name ?? raw.title ?? "dubai-project"),
    lat: raw.lat ?? coords?.lat ?? 25.1972,
    lng: raw.lng ?? coords?.lng ?? 55.2744,
    category: raw.category ?? "apartment",
    status: raw.status ?? "off_plan",
    tags: raw.tags ?? [],
    featured: raw.featured ?? false,
    starting_price_aed: raw.starting_price_aed ?? raw.price ?? null,
    main_image_url: raw.main_image_url ?? raw.image_url ?? null,
    developer: raw.developer ?? null,
    community: raw.community ?? null,
    images: raw.images ?? [],
    unit_types: raw.unit_types ?? [],
    payment_plans: raw.payment_plans ?? [],
    fees: raw.fees ?? [],
    amenities: raw.amenities ?? [],
  } as ProjectWithRelations;
}

function extractLocation(value: unknown): { lat: number; lng: number } | null {
  if (!value) return null;
  if (typeof value === "string") {
    const match = value.match(/-?\d+(?:\.\d+)?/g);
    if (match && match.length >= 2) {
      const first = Number(match[0]);
      const second = Number(match[1]);
      if (Number.isFinite(first) && Number.isFinite(second)) {
        return Math.abs(first) > Math.abs(second)
          ? { lng: first, lat: second }
          : { lat: first, lng: second };
      }
    }
  }
  if (typeof value === "object") {
    const loc = value as { x?: number; y?: number; coordinates?: number[] };
    if (Array.isArray(loc.coordinates) && loc.coordinates.length >= 2) {
      return { lng: Number(loc.coordinates[0]), lat: Number(loc.coordinates[1]) };
    }
    if (Number.isFinite(loc.x) && Number.isFinite(loc.y)) {
      return { lng: Number(loc.x), lat: Number(loc.y) };
    }
  }
  return null;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
