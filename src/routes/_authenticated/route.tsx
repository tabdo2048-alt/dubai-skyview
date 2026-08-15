import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyTenants, canAccessTenant, isCurrentUserBlocked } from "@/integrations/supabase/saas";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Block gate: catches a block applied after this session signed in. The
    // helper returns false when the block SQL is not applied (nothing can be
    // blocked then); any real failure signs out rather than letting the user in.
    try {
      if (await isCurrentUserBlocked()) {
        await supabase.auth.signOut();
        if (typeof window !== "undefined") sessionStorage.setItem("dubai:blocked", "1");
        throw redirect({ to: "/auth" });
      }
    } catch (e) {
      if (e && typeof e === "object" && "to" in e) throw e;
      await supabase.auth.signOut();
      throw redirect({ to: "/auth" });
    }

    // Subscription gate: only accounts with an active (or in-grace past_due)
    // tenant may enter the workspace. Everyone else goes to the pay page. The
    // tenant status is written solely by the Stripe webhook (never the client).
    try {
      const mine = await fetchMyTenants();
      if (!mine.some((m) => canAccessTenant(m.tenant))) {
        throw redirect({ to: "/billing" });
      }
    } catch (e) {
      // A thrown redirect must propagate; any other failure (e.g. tenant tables
      // not migrated yet) also routes to billing rather than silently unlocking.
      if (e && typeof e === "object" && "to" in e) throw e;
      throw redirect({ to: "/billing" });
    }

    return { user: data.user };
  },
  component: () => <Outlet />,
});
