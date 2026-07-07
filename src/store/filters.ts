import { create } from "zustand";
import { emptyFilters, type ProjectFilters } from "@/lib/types";

type MapMode = "satellite" | "3d";

type FiltersStore = {
  filters: ProjectFilters;
  setFilters: (patch: Partial<ProjectFilters>) => void;
  reset: () => void;

  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

export const useFiltersStore = create<FiltersStore>((set) => ({
  filters: emptyFilters,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  reset: () => set({ filters: emptyFilters }),

  selectedProjectId: null,
  setSelectedProjectId: (id) => set({ selectedProjectId: id }),

  mapMode: "satellite",
  setMapMode: (mode) => set({ mapMode: mode }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
