// Stripe billing server functions. These run server-side only (the handler body
// is stripped from the client bundle); `stripe` and the secret key are imported
// lazily inside the handler so nothing sensitive ships to the browser.
//
// Price is created inline (100.00 AED, recurring monthly or yearly) via
// price_data, so no Stripe Product/Price setup is required — only the secret key
// (STRIPE_SECRET_KEY) and, for the webhook, STRIPE_WEBHOOK_SECRET.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PRICE_AED_FILS = 10000; // 100.00 AED (Stripe amounts are in the minor unit)
const CURRENCY = "aed";
const PRODUCT_NAME = "Dubai SkyView — Subscription";

function appUrl(): string {
  const configured = process.env.APP_URL ?? process.env.VITE_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // Vercel exposes the production URL as a system environment variable. Use
  // it as a safe deployment fallback so Stripe never sends production users to
  // the local development server when APP_URL was omitted.
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) {
    return /^https?:\/\//i.test(vercelHost) ? vercelHost.replace(/\/+$/, "") : `https://${vercelHost}`;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Billing is not configured (missing APP_URL). Set APP_URL to the deployed site URL.");
  }
  return "http://localhost:8080";
}

async function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not configured (missing STRIPE_SECRET_KEY).");
  const Stripe = (await import("stripe")).default;
  return new Stripe(key);
}

// Load the caller's tenant via the user-scoped client (RLS guarantees they can
// only read tenants they belong to), returning null if they are not a member.
//
// Membership alone is NOT enough to act on billing: the tenants SELECT policy
// admits any 'member', and the Stripe portal can cancel the subscription, change
// the card and read every past invoice. Both billing entry points therefore
// require 'admin' or 'owner', checked against tenant_members (itself RLS-scoped
// to rosters the caller belongs to).
async function loadTenantForBilling(
  supabase: unknown,
  tenantId: string,
  userId: string,
): Promise<{ id: string; stripe_customer_id: string | null; name: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: membership } = await sb
    .from("tenant_members")
    .select("role")
    .eq("tenant_id", tenantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (membership?.role !== "admin" && membership?.role !== "owner") return null;

  const { data } = await sb
    .from("tenants")
    .select("id, stripe_customer_id, name")
    .eq("id", tenantId)
    .maybeSingle();
  return data ?? null;
}

/** Create a Stripe Checkout Session for the tenant's subscription; returns its URL. */
export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantId: string; period: "month" | "year" }) => {
    if (!input?.tenantId || (input.period !== "month" && input.period !== "year")) {
      throw new Error("tenantId and period ('month'|'year') are required");
    }
    return input;
  })
  .handler(async ({ data, context }) => {
    const tenant = await loadTenantForBilling(context.supabase, data.tenantId, context.userId);
    if (!tenant) throw new Error("Forbidden: not an admin of this organization");

    const stripe = await stripeClient();

    // Ensure a Stripe customer exists for this tenant and persist its id. The
    // client role cannot UPDATE tenants.stripe_customer_id directly (that would
    // let an org admin repoint their org at another org's Stripe customer and
    // open that customer's billing portal), so persist through the write-once
    // SECURITY DEFINER RPC and re-read the winner: if a concurrent checkout
    // already linked a customer, that one stands and ours is discarded.
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: { tenant_id: tenant.id },
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sb = context.supabase as any;
      const { error: linkError } = await sb.rpc("set_tenant_stripe_customer", {
        _tenant: tenant.id,
        _customer: customer.id,
      });
      if (linkError) throw new Error("Could not link the billing customer to this organization");
      const { data: linked } = await sb
        .from("tenants")
        .select("stripe_customer_id")
        .eq("id", tenant.id)
        .maybeSingle();
      customerId = (linked?.stripe_customer_id as string | null) ?? customer.id;
    }
    if (!customerId) throw new Error("Could not link the billing customer to this organization");

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: tenant.id,
      subscription_data: { metadata: { tenant_id: tenant.id } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: CURRENCY,
            product_data: { name: PRODUCT_NAME },
            unit_amount: PRICE_AED_FILS,
            recurring: { interval: data.period },
          },
        },
      ],
      success_url: `${appUrl()}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl()}/billing/cancel`,
    });

    return { url: session.url };
  });

/** Create a Stripe Billing Portal session (manage / cancel); returns its URL. */
export const createBillingPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { tenantId: string }) => {
    if (!input?.tenantId) throw new Error("tenantId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const tenant = await loadTenantForBilling(context.supabase, data.tenantId, context.userId);
    if (!tenant) throw new Error("Forbidden: not an admin of this organization");
    if (!tenant.stripe_customer_id) throw new Error("No billing customer for this organization");
    const stripe = await stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${appUrl()}/admin`,
    });
    return { url: session.url };
  });
