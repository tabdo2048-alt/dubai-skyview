import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchMyTenants, isActiveStatus } from "@/integrations/supabase/saas";
import { AppNavbar } from "@/components/layout/AppNavbar";

export const Route = createFileRoute("/billing/success")({
  ssr: false,
  head: () => ({ meta: [{ title: "Activating — Dubai SkyView" }] }),
  component: BillingSuccessPage,
});

// The Stripe redirect lands here BEFORE the webhook may have flipped the tenant
// to active (webhooks are async). Poll the tenant status until active, then go
// to the app. Never trust the redirect itself — the webhook is the source of truth.
function BillingSuccessPage() {
  const navigate = useNavigate();
  const [waited, setWaited] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const MAX = 20; // ~40s of polling
    const tick = async (n: number) => {
      if (cancelled) return;
      try {
        const mine = await fetchMyTenants();
        if (mine.some((m) => isActiveStatus(m.tenant.subscription_status))) {
          navigate({ to: "/admin" });
          return;
        }
      } catch {
        /* keep polling */
      }
      setWaited(n);
      if (n < MAX) setTimeout(() => tick(n + 1), 2000);
    };
    tick(1);
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="min-h-screen">
      <AppNavbar />
      <div className="mx-auto grid max-w-md place-items-center px-4 py-24 text-center">
        <div className="glass-strong gold-hairline rounded-3xl p-8">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
          <h1 className="mt-4 font-display text-2xl text-cream">Activating your workspace…</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Confirming your payment with Stripe. This usually takes a few seconds.
          </p>
          {waited >= 20 && (
            <p className="mt-4 text-xs text-muted-foreground">
              Taking longer than expected. Your subscription may still be processing —
              refresh in a moment, or contact support if it persists.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
