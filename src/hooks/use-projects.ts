import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectWithRelations, ProjectFilters, ProjectRow } from "@/lib/types";

export function projectsQueryKey() {
  return ["projects", "list"] as const;
}

async function fetchAllProjects(): Promise<ProjectWithRelations[]> {
  const { data, error } = await supabase
    .from("projects")
    .select(`
      *,
      developer:developers(id,name,slug),
      community:communities(id,name,slug),
      images:project_images(*),
      amenities:project_amenities(*)
    `)
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });
  if (!error) return normalizeProjects(data ?? []);

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

export function useProject(slug: string) {
  return useQuery({
    queryKey: ["projects", "slug", slug],
    queryFn: async (): Promise<ProjectWithRelations | null> => {
      const { data, error } = await supabase
        .from("projects")
        .select(`
          *,
          developer:developers(id,name,slug),
          community:communities(id,name,slug),
          images:project_images(*),
          amenities:project_amenities(*)
        `)
        .eq("slug", slug)
        .maybeSingle();
      if (!error) return normalizeProject(data);

      console.warn("[Projects] full project query failed; falling back to legacy schema", error.message);
      const { data: legacyData, error: legacyError } = await supabase
        .from("projects")
        .select("*, developer:developers(id,name,slug)")
        .eq("slug", slug)
        .maybeSingle();
      if (legacyError) throw legacyError;
      return normalizeProject(legacyData);
    },
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
    if (f.minPrice != null && (p.starting_price_aed ?? 0) < f.minPrice) return false;
    if (f.maxPrice != null && (p.starting_price_aed ?? 0) > f.maxPrice) return false;
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
  return normalizeProjects(data ?? []);
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
