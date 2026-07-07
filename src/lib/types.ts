import type { Database } from "@/integrations/supabase/types";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type DeveloperRow = Database["public"]["Tables"]["developers"]["Row"];
export type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];
export type ProjectImageRow = Database["public"]["Tables"]["project_images"]["Row"];
export type ProjectAmenityRow = Database["public"]["Tables"]["project_amenities"]["Row"];

export type ProjectWithRelations = ProjectRow & {
  developer: Pick<DeveloperRow, "id" | "name" | "slug"> | null;
  community: Pick<CommunityRow, "id" | "name" | "slug"> | null;
  images: ProjectImageRow[];
  amenities: ProjectAmenityRow[];
};

export type ProjectFilters = {
  search: string;
  categories: string[];
  statuses: string[];
  communities: string[];
  tags: string[];
  minPrice: number | null;
  maxPrice: number | null;
  bedrooms: number | null;
};

export const emptyFilters: ProjectFilters = {
  search: "",
  categories: [],
  statuses: [],
  communities: [],
  tags: [],
  minPrice: null,
  maxPrice: null,
  bedrooms: null,
};
