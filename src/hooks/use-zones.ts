import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ZoneRow } from "@/lib/zones";

// All zones in one small query, cached client-side. The three highlight buttons
// filter this by category — no per-button network round-trip after the first.
export function useZones() {
  return useQuery({
    queryKey: ["zones"],
    queryFn: async (): Promise<ZoneRow[]> => {
      const { data, error } = await supabase
        .from("zones")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ZoneRow[];
    },
    staleTime: 60_000,
  });
}

// Keep the public map in sync when an admin adds/edits/deletes a zone.
export function useZonesRealtime() {
  const qc = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("zones-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "zones" },
        () => qc.invalidateQueries({ queryKey: ["zones"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
