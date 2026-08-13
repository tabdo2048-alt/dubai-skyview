// Supabase Edge Function: Stripe webhook — the SINGLE SOURCE OF TRUTH for a
// tenant's subscription state. The browser success redirect is never trusted;
// only signature-verified events here flip a tenant to active/past_due/canceled.
//
// Delivery is neither exactly-once nor ordered, so every event is claimed by id
// before any work (see migration 20260812030000_stripe_webhook_hardening) and
// every billing write is gated on the event not being older than the one behind
// the current row.
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
// customer.subscription.deleted, invoice.paid, invoice.payment_failed.

import Stripe from "https://esm.sh/stripe@22.5.0?target=deno";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "");
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") ?? "";
const MONTHLY_PRICE_AED_FILS = 10000;
const YEARLY_PRICE_AED_FILS = 100000;
const CURRENCY = "aed";

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

// As of the 2025-03-31.basil API version, the billing period lives on each
// subscription ITEM, not on the subscription itself — reading the old top-level
// field yields undefined and `new Date(NaN)` throws. Read the item, fall back to
// the legacy field for subscriptions created under a pre-Basil version, and
// return null rather than an invalid date so a missing period can't 500 the
// handler into an infinite Stripe retry loop.
function periodEndIso(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as { current_period_end?: number } | undefined;
  const seconds =
    item?.current_period_end ??
    (sub as unknown as { current_period_end?: number }).current_period_end;
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000).toISOString();
}

function expectedPrice(period: "month" | "year"): number {
  return period === "year" ? YEARLY_PRICE_AED_FILS : MONTHLY_PRICE_AED_FILS;
}

function configuredPriceId(period: "month" | "year"): string | undefined {
  return (period === "year"
    ? Deno.env.get("STRIPE_YEARLY_PRICE_ID")
    : Deno.env.get("STRIPE_MONTHLY_PRICE_ID"))?.trim() || undefined;
}

// Never grant access based only on a signed event's metadata. The subscription
// must contain one of our exact recurring prices (or a configured Price ID).
function isApprovedSubscription(sub: Stripe.Subscription): boolean {
  const item = sub.items?.data?.[0];
  const price = item?.price;
  if (!price || typeof price === "string") return false;

  const interval = price.recurring?.interval;
  if (interval !== "month" && interval !== "year") return false;

  const expectedId = configuredPriceId(interval);
  if (expectedId && price.id !== expectedId) return false;

  return (
    item.quantity === 1 &&
    price.currency === CURRENCY &&
    price.unit_amount === expectedPrice(interval)
  );
}

// Fields written to `tenants` from a subscription, shared by every event branch.
function tenantFieldsFrom(sub: Stripe.Subscription): Record<string, unknown> {
  return {
    stripe_subscription_id: sub.id,
    subscription_status: mapStatus(sub.status),
    plan: sub.items.data[0]?.price?.recurring?.interval ?? null,
    current_period_end: periodEndIso(sub),
  };
}

// Basil moved the invoice's subscription reference under `parent`; fall back to
// the legacy top-level field for invoices raised under a pre-Basil version.
function subscriptionIdFromInvoice(invoice: Stripe.Invoice): string | null {
  const parent = (invoice as unknown as {
    parent?: { subscription_details?: { subscription?: string | { id: string } } };
    subscription?: string | { id: string };
  });
  const ref = parent.parent?.subscription_details?.subscription ?? parent.subscription;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id;
}

// Apply billing fields, but only if this event is not older than the one that
// last wrote the row — Stripe does not guarantee ordering, and a late-arriving
// stale `subscription.updated` must not downgrade a tenant that already renewed.
async function updateTenant(
  tenantId: string,
  fields: Record<string, unknown>,
  eventCreated: number,
): Promise<void> {
  const eventAt = new Date(eventCreated * 1000).toISOString();
  const { error } = await admin
    .from("tenants")
    .update({ ...fields, last_stripe_event_at: eventAt })
    .eq("id", tenantId)
    .or(`last_stripe_event_at.is.null,last_stripe_event_at.lte.${eventAt}`);
  if (error) throw new Error("billing state update failed");
}

// Resolve the tenant only through the stored Stripe customer association. If
// metadata is present, it must agree with that association; metadata alone is
// never trusted to select a tenant.
async function tenantForSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const metaId = (sub.metadata?.tenant_id as string | undefined) ?? null;
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
  if (!customerId) return null;
  const { data, error } = await admin
    .from("tenants")
    .select("id, stripe_customer_id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();
  if (error) throw new Error("billing customer lookup failed");
  if (!data?.id || data.stripe_customer_id !== customerId) return null;
  if (metaId && metaId !== data.id) return null;
  return data.id;
}

async function tenantForCheckout(
  tenantId: string,
  sessionCustomerId: string,
  subscriptionCustomerId: string,
): Promise<string | null> {
  if (sessionCustomerId !== subscriptionCustomerId) return null;
  const { data, error } = await admin
    .from("tenants")
    .select("id, stripe_customer_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) throw new Error("checkout tenant lookup failed");
  if (!data || data.stripe_customer_id !== sessionCustomerId) return null;
  return data.id;
}

// Sync a tenant from the authoritative subscription object. Invoice events carry
// only a reference, so re-reading the subscription keeps status derivation in
// one place rather than inferring "paid means active" from the event type.
async function syncFromSubscriptionId(subId: string, eventCreated: number): Promise<void> {
  const sub = await stripe.subscriptions.retrieve(subId);
  if (!isApprovedSubscription(sub)) {
    console.error("Ignoring subscription with an unapproved price", sub.id);
    return;
  }
  const tenantId = await tenantForSubscription(sub);
  if (tenantId) await updateTenant(tenantId, tenantFieldsFrom(sub), eventCreated);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const tenantId = session.client_reference_id;
      const subId = typeof session.subscription === "string"
        ? session.subscription
        : session.subscription?.id;
      const sessionCustomerId = typeof session.customer === "string"
        ? session.customer
        : session.customer?.id;
      if (session.mode === "subscription" && tenantId && subId && sessionCustomerId) {
        const sub = await stripe.subscriptions.retrieve(subId);
        if (!isApprovedSubscription(sub)) {
          console.error("Ignoring checkout with an unapproved price", session.id);
          break;
        }
        const subscriptionCustomerId = typeof sub.customer === "string"
          ? sub.customer
          : sub.customer?.id;
        if (!subscriptionCustomerId) break;
        const verifiedTenantId = await tenantForCheckout(
          tenantId,
          sessionCustomerId,
          subscriptionCustomerId,
        );
        if (verifiedTenantId) {
          await updateTenant(verifiedTenantId, tenantFieldsFrom(sub), event.created);
        }
      }
      break;
    }
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      if (!isApprovedSubscription(sub)) {
        console.error("Ignoring subscription update with an unapproved price", sub.id);
        break;
      }
      const tenantId = await tenantForSubscription(sub);
      if (tenantId) await updateTenant(tenantId, tenantFieldsFrom(sub), event.created);
      break;
    }
    // Renewal outcomes. `subscription.updated` usually accompanies these, but
    // subscribing to them directly means a failed renewal shows up as past_due
    // from the payment event itself rather than only via an inferred status.
    case "invoice.paid":
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subId = subscriptionIdFromInvoice(invoice);
      if (subId) await syncFromSubscriptionId(subId, event.created);
      break;
    }
  }
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

  // Claim the event BEFORE any work. A redelivery of an event we already handled
  // hits the primary key and is acknowledged without repeating the write.
  const { error: claimError } = await admin
    .from("stripe_events")
    .insert({ event_id: event.id, type: event.type });
  if (claimError) {
    if (claimError.code === "23505") return json({ received: true, duplicate: true });
    // Couldn't reach the claim table — 500 so Stripe retries rather than
    // processing unguarded.
    return new Response("claim failed", { status: 500 });
  }

  try {
    await handleEvent(event);
    return json({ received: true });
  } catch {
    // Release the claim so Stripe's retry can actually reprocess this event,
    // then 500 to ask for that retry. No internal detail in the body.
    await admin.from("stripe_events").delete().eq("event_id", event.id);
    return new Response("handler error", { status: 500 });
  }
});
