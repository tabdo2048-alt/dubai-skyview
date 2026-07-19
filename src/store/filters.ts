import { create } from "zustand";
import { emptyFilters, type ProjectFilters } from "@/lib/types";
import type { LightPreset } from "@/components/map/MapboxView";

type MapMode = "satellite" | "3d";

type FiltersStore = {
  filters: ProjectFilters;
  setFilters: (patch: Partial<ProjectFilters>) => void;
  reset: () => void;

  selectedProjectId: string | null;
  setSelectedProjectId: (id: string | null) => void;

  mapMode: MapMode;
  setMapMode: (mode: MapMode) => void;

  metroMode: boolean;
  setMetroMode: (on: boolean) => void;

  trainMode: boolean;
  setTrainMode: (on: boolean) => void;

  roadsMode: boolean;
  setRoadsMode: (on: boolean) => void;

  lightPreset: LightPreset;
  setLightPreset: (preset: LightPreset) => void;

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

  metroMode: false,
  setMetroMode: (on) => set({ metroMode: on }),

  trainMode: false,
  setTrainMode: (on) => set({ trainMode: on }),

  roadsMode: false,
  setRoadsMode: (on) => set({ roadsMode: on }),

  lightPreset: "day",
  setLightPreset: (preset) => set({ lightPreset: preset }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));
