import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyTenants, isActiveStatus, type Tenant } from "@/integrations/supabase/saas";
import { createCheckoutSession } from "@/lib/billing.functions";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/billing/")({
  ssr: false,
  head: () => ({ meta: [{ title: "Subscribe — Dubai SkyView" }] }),
  component: BillingPage,
});

function BillingPage() {
  const navigate = useNavigate();
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState<"month" | "year" | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        navigate({ to: "/auth" });
        return;
      }
      try {
        const mine = await fetchMyTenants();
        const active = mine.find((m) => isActiveStatus(m.tenant.subscription_status));
        if (active) {
          navigate({ to: "/admin" });
          return;
        }
        setTenant(mine[0]?.tenant ?? null);
      } catch {
        /* no tenant yet */
      } finally {
        setReady(true);
      }
    })();
  }, [navigate]);

  const subscribe = async (period: "month" | "year") => {
    if (!tenant) {
      toast.error("No organization found for this account.");
      return;
    }
    setBusy(period);
    try {
      const { url } = await createCheckoutSession({ data: { tenantId: tenant.id, period } });
      if (!url) throw new Error("Could not start checkout");
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Checkout failed");
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto grid max-w-md px-4 py-16">
        <div className="glass-strong gold-hairline rounded-3xl p-8">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Subscription</div>
          <h1 className="mt-1 font-display text-4xl text-cream">
            Activate <span className="text-gold-gradient">your workspace</span>
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {tenant ? tenant.name : "Your organization"} — 100 AED, billed securely by Stripe.
          </p>

          {!ready ? (
            <div className="mt-6 text-sm text-muted-foreground">Loading…</div>
          ) : (
            <div className="mt-6 space-y-3">
              <Button onClick={() => subscribe("month")} disabled={busy !== null}
                className="shimmer w-full bg-gold text-gold-foreground hover:bg-gold/90">
                {busy === "month" ? "Redirecting…" : "Subscribe — 100 AED / month"}
              </Button>
              <Button onClick={() => subscribe("year")} disabled={busy !== null} variant="outline"
                className="glass gold-hairline w-full text-cream">
                {busy === "year" ? "Redirecting…" : "Subscribe — 100 AED / year"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
