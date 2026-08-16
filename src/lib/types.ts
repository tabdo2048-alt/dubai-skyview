import type { Database } from "@/integrations/supabase/types";

export type ProjectRow = Database["public"]["Tables"]["projects"]["Row"];
export type DeveloperRow = Database["public"]["Tables"]["developers"]["Row"];
export type CommunityRow = Database["public"]["Tables"]["communities"]["Row"];
export type ProjectImageRow = Database["public"]["Tables"]["project_images"]["Row"];
export type ProjectAmenityRow = Database["public"]["Tables"]["project_amenities"]["Row"];

export type ProjectWithRelations = ProjectRow & {
  developer: Pick<DeveloperRow, "id" | "name" | "slug"> | null;
  community: Pick<CommunityRow, "id" | "name" | "slug"> | null;
  images: Array<ProjectImageRow & { src?: string; thumb_src?: string }>;
  amenities: ProjectAmenityRow[];
  // Renderable signed URL for the private media bucket, added on read by
  // withSignedProjectMedia. `main_image_url` stays the canonical stored value —
  // render `main_image_src`, persist `main_image_url`.
  main_image_src?: string | null;
  // Small generated object used by map/list cards. Legacy images fall back to
  // the normal signed URL when no thumbnail object exists.
  main_image_thumb_src?: string | null;
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
