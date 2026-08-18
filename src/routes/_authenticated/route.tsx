import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyTenants, canAccessTenant, isCurrentUserBlocked, expireMySubscriptions } from "@/integrations/supabase/saas";

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
    // tenant whose paid period has not run out may enter the workspace. The
    // status itself is written solely by the Stripe webhook (never the client);
    // canAccessTenant additionally enforces current_period_end so a missed
    // webhook cannot leave an expired org unlocked forever.
    //
    // An expired account is signed OUT rather than left holding a session with no
    // workspace: the session is what would keep rendering their organization name
    // and cached project data. It lands on /auth with a notice; signing in again
    // routes straight to /billing (see src/routes/auth.tsx), which is how they
    // renew — so this is not a loop, and /billing stays reachable.
    try {
      const mine = await fetchMyTenants();
      if (!mine.some((m) => canAccessTenant(m.tenant))) {
        // Settle the database to match: cancel any of the user's own orgs whose
        // period has elapsed. Best-effort — access is already denied above, so a
        // failure here must not change the outcome.
        try {
          await expireMySubscriptions();
        } catch {
          /* keep going: the gate above has already decided */
        }
        await supabase.auth.signOut();
        if (typeof window !== "undefined") sessionStorage.setItem("dubai:subscription-ended", "1");
        throw redirect({ to: "/auth" });
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
