-- Enforce the subscription period end, and clear the subscription when it lapses.
--
-- Access was gated on subscription_status alone, which is written only by the
-- Stripe webhook. If the webhook is misconfigured or an event is missed, a tenant
-- stays 'active' forever past current_period_end — the period end was displayed
-- but never enforced. The client now also compares the date (see
-- canAccessTenant in src/integrations/supabase/saas.ts) and calls this function
-- so the database agrees rather than the two drifting apart.
--
-- Scope: only the caller's own orgs, and only rows whose period has genuinely
-- elapsed. SECURITY DEFINER is needed because tenants is not client-writable, but
-- there is nothing to abuse — the WHERE clause states a fact about the clock, so
-- the worst a caller can do is ask for something that is already true.
--
-- What "remove the subscription" clears:
--   subscription_status    -> 'canceled'  (blocks access)
--   plan                   -> NULL
--   stripe_subscription_id -> NULL        (that subscription is over)
--
-- stripe_customer_id is deliberately KEPT. supabase/functions/stripe-webhook
-- resolves a tenant BY stripe_customer_id, so clearing it would orphan every
-- future Stripe event for this org — including the payment that renews it, and
-- including a late event proving the subscription never actually lapsed. Keeping
-- it also stops a resubscribe from creating a duplicate Stripe customer.
--
-- current_period_end is kept too, so the UI can say "Ended 18 Aug 2026" instead
-- of losing the date entirely.
--
-- Projects, images, memberships and the org row itself are untouched: paying
-- again restores the workspace exactly as it was.

CREATE OR REPLACE FUNCTION public.expire_my_subscriptions()
RETURNS INTEGER
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  UPDATE public.tenants t
     SET subscription_status    = 'canceled',
         plan                   = NULL,
         stripe_subscription_id = NULL
   WHERE t.id IN (
           SELECT m.tenant_id FROM public.tenant_members m WHERE m.user_id = auth.uid()
         )
     -- NULL current_period_end means "does not expire" (the unlimited default
     -- org), so it must never be swept up here.
     AND t.current_period_end IS NOT NULL
     AND t.current_period_end < now()
     AND t.subscription_status <> 'canceled';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END $$;

REVOKE EXECUTE ON FUNCTION public.expire_my_subscriptions() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_my_subscriptions() TO authenticated;
