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
  return process.env.APP_URL ?? process.env.VITE_APP_URL ?? "http://localhost:8080";
}

async function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Billing is not configured (missing STRIPE_SECRET_KEY).");
  const Stripe = (await import("stripe")).default;
  return new Stripe(key);
}

// Load the caller's tenant via the user-scoped client (RLS guarantees they can
// only read tenants they belong to), returning null if they are not a member.
async function loadTenant(
  supabase: unknown,
  tenantId: string,
): Promise<{ id: string; stripe_customer_id: string | null; name: string } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
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
    const tenant = await loadTenant(context.supabase, data.tenantId);
    if (!tenant) throw new Error("Forbidden: not a member of this organization");

    const stripe = await stripeClient();

    // Ensure a Stripe customer exists for this tenant and persist its id.
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: tenant.name,
        metadata: { tenant_id: tenant.id },
      });
      customerId = customer.id;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (context.supabase as any)
        .from("tenants")
        .update({ stripe_customer_id: customerId })
        .eq("id", tenant.id);
    }

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
    const tenant = await loadTenant(context.supabase, data.tenantId);
    if (!tenant?.stripe_customer_id) throw new Error("No billing customer for this organization");
    const stripe = await stripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: `${appUrl()}/admin`,
    });
    return { url: session.url };
  });
