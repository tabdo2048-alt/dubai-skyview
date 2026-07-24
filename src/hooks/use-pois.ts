import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type PoiCategory = "hospitals" | "schools" | "tourism";
export type PoiPoint = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  images: string[];
  created_at: string;
  category: PoiCategory; // which table it came from — drives marker colour/glyph
};

// Table names deliberately equal the category ids, and all three POI tables
// share an identical shape — so narrowing `table` to the POI-only union (not
// `keyof Tables`) lets supabase.from(table) type both inserts and selects
// against the real POI columns instead of the whole-schema union.
type PoiTable = Extract<keyof Database["public"]["Tables"], PoiCategory>;

export const POI_TABLES: Record<
  PoiCategory,
  {
    table: PoiTable;
    label: string;
    icon: string;
    color: string;
  }
> = {
  hospitals: {
    table: "hospitals",
    label: "Hospitals",
    icon: "✚", // white medical cross on the red button badge
    color: "#ef4444",
  },
  schools: {
    table: "schools",
    label: "Schools",
    icon: "🎓",
    color: "#3b82f6",
  },
  tourism: {
    table: "tourism",
    label: "Tourism",
    icon: "🏝️",
    color: "#f59e0b",
  },
};

/**
 * Load every POI in the given active categories, tagging each row with the
 * category it came from so markers can be coloured per-category when several
 * are shown together. The query key is the sorted category list, so toggling a
 * category refetches (and cached results are reused).
 */
export function usePois(categories: Set<PoiCategory>) {
  const list = [...categories].sort();
  return useQuery({
    queryKey: ["pois", list],
    queryFn: async (): Promise<PoiPoint[]> => {
      if (list.length === 0) return [];
      const perCategory = await Promise.all(
        list.map(async (category) => {
          const { data, error } = await supabase.from(POI_TABLES[category].table).select("*");
          if (error) throw error;
          return (data ?? []).map((row) => ({ ...row, category }) as PoiPoint);
        }),
      );
      return perCategory.flat();
    },
    staleTime: 60_000,
    enabled: list.length > 0,
  });
}

export function usePoiRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const channels = Object.entries(POI_TABLES).map(([_, { table }]) => {
      const channel = supabase
        .channel(`poi-${table}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: table as string,
          },
          () => {
            qc.invalidateQueries({
              queryKey: ["pois"],
            });
          }
        )
        .subscribe();

      return channel;
    });

    return () => {
      channels.forEach((ch) => {
        supabase.removeChannel(ch);
      });
    };
  }, [qc]);
}
