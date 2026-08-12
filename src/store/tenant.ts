import { create } from "zustand";
import { fetchMyTenants, canAccessTenant, type Tenant } from "@/integrations/supabase/saas";

// Current-organization context. A paid signup creates exactly one org owned by
// the user, so `currentTenantId` is normally that org; the field also supports a
// future org switcher (Phase 5 invites/teams). Writes stamp this id; reads are
// already scoped by RLS to the user's tenants.
type TenantStore = {
  tenants: Tenant[];
  currentTenantId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  setCurrent: (id: string) => void;
};

export const useTenantStore = create<TenantStore>((set, get) => ({
  tenants: [],
  currentTenantId: null,
  loaded: false,
  load: async () => {
    try {
      const mine = await fetchMyTenants();
      const tenants = mine.map((m) => m.tenant);
      const preferred =
        tenants.find((t) => canAccessTenant(t)) ?? tenants[0] ?? null;
      set({
        tenants,
        currentTenantId: get().currentTenantId ?? preferred?.id ?? null,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
  setCurrent: (id) => set({ currentTenantId: id }),
}));
