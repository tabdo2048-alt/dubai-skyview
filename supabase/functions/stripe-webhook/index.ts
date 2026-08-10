// Supabase Edge Function: Stripe webhook — the SINGLE SOURCE OF TRUTH for a
// tenant's subscription state. The browser success redirect is never trusted;
// only signature-verified events here flip a tenant to active/past_due/canceled.
//
// Env required (set in the function's secrets):
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (provided to edge functions)
//
// Deploy:  supabase functions deploy stripe-webhook --no-verify-jwt
//   (--no-verify-jwt: Stripe calls it without a Supabase JWT; auth is the
//    Stripe signature, verified below.)
// Then add the function URL as a webhook endpoint in the Stripe dashboard and
// subscribe to: checkout.session.completed, customer.subscription.updated,
// customer.subscription.deleted.

import Stripe from "https://esm.sh/stripe@22.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } },
);

// Map Stripe's subscription status to our tenant enum.
function mapStatus(s: string): "incomplete" | "active" | "past_due" | "canceled" {
  switch (s) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      return "incomplete";
  }
}

async function updateTenant(
  tenantId: string,
  fields: Record<string, unknown>,
): Promise<void> {
  await admin.from("tenants").update(fields).eq("id", tenantId);
}

// Resolve the tenant id for a subscription: prefer metadata, else look it up by
// the stored stripe_customer_id.
async function tenantForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const metaId = (sub.metadata?.tenant_id as string | undefined) ?? null;
  if (metaId) return metaId;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const { data } = await admin
    .from("tenants")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  return data?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method not allowed", { status: 405 });

  const sig = req.headers.get("stripe-signature");
  if (!sig || !webhookSecret) return new Response("missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, sig, webhookSecret);
  } catch {
    // Bad signature — reject without leaking detail.
    return new Response("invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.client_reference_id;
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
        if (tenantId && subId) {
          const sub = await stripe.subscriptions.retrieve(subId);
          await updateTenant(tenantId, {
            stripe_subscription_id: sub.id,
            subscription_status: mapStatus(sub.status),
            plan: sub.items.data[0]?.price?.recurring?.interval ?? null,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          });
        }
        break;
      }
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const tenantId = await tenantForSubscription(sub);
        if (tenantId) {
          await updateTenant(tenantId, {
            stripe_subscription_id: sub.id,
            subscription_status: mapStatus(sub.status),
            plan: sub.items.data[0]?.price?.recurring?.interval ?? null,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          });
        }
        break;
      }
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    // Return 500 so Stripe retries; no internal detail in the body.
    return new Response("handler error", { status: 500 });
  }
});
