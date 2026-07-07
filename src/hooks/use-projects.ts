import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectWithRelations, ProjectFilters } from "@/lib/types";

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
  if (error) throw error;
  return (data ?? []) as unknown as ProjectWithRelations[];
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
      if (error) throw error;
      return (data as unknown as ProjectWithRelations) ?? null;
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
      if (error) throw error;
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
