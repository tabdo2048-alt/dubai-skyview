import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchMyTenants, canAccessTenant, hasLifetimeAdminAccess, isPeriodExpired, type Tenant } from "@/integrations/supabase/saas";
import { createCheckoutSession } from "@/lib/billing.functions";
import { formatSubscriptionPeriod } from "@/lib/subscription-period";
import { AppNavbar } from "@/components/layout/AppNavbar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const DATA_RETENTION_DAYS = 10;
const MS_PER_DAY = 86_400_000;

function dataDeletionNotice(tenant: Tenant | null): string | null {
  if (!tenant?.current_period_end || tenant.data_purged_at || !isPeriodExpired(tenant.current_period_end)) {
    return null;
  }

  const deletionAt = new Date(tenant.current_period_end).getTime() + DATA_RETENTION_DAYS * MS_PER_DAY;
  if (!Number.isFinite(deletionAt)) return null;

  const date = new Date(deletionAt).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const daysLeft = Math.max(0, Math.ceil((deletionAt - Date.now()) / MS_PER_DAY));

  if (daysLeft === 0) {
    return "The 10-day retention period has ended. Project and media deletion is being processed.";
  }
  return `Your projects and uploaded media will be permanently deleted on ${date} — ${daysLeft} day${daysLeft === 1 ? "" : "s"} left. Renew before then to keep them.`;
}

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
        if (await hasLifetimeAdminAccess()) {
          navigate({ to: "/admin" });
          return;
        }
        const mine = await fetchMyTenants();
        const active = mine.find((m) => canAccessTenant(m.tenant));
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

  // Named `lastPeriod`, not `period`, because `subscribe` below already takes a
  // `period` argument meaning the billing interval — a different concept.
  const lastPeriod = tenant
    ? formatSubscriptionPeriod(tenant.current_period_end, tenant.subscription_status, {
        suspended: tenant.suspended,
      })
    : null;

  const deletionNotice = dataDeletionNotice(tenant);

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
            {tenant ? tenant.name : "Your organization"} — 100 AED/month or 1,000 AED/year, billed securely by Stripe.
          </p>

          {/* Previous period, when there was one. An active or past_due org is
              redirected to /admin above, so this only ever renders for an org
              that is incomplete, canceled or suspended — i.e. it reads as
              "your last period ended on…", which is the context for resubscribing. */}
          {lastPeriod && (
            <p className={`mt-2 text-sm ${lastPeriod.cls}`} title={lastPeriod.title}>
              {lastPeriod.label}
              {lastPeriod.detail ? ` · ${lastPeriod.detail}` : ""}
            </p>
          )}

          {deletionNotice && (
            <div role="alert" className="mt-4 rounded-xl border border-destructive/50 bg-destructive/10 p-3 text-sm leading-relaxed text-cream">
              {deletionNotice}
            </div>
          )}

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
                {busy === "year" ? "Redirecting…" : "Subscribe — 1,000 AED / year"}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
