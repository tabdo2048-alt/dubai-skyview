-- ============================================================================
-- Phase 2b — Stripe webhook hardening.
--
-- Two guarantees the webhook handler could not make on its own:
--
--   1. EXACTLY-ONCE. Stripe redelivers events (on 5xx, on timeout, and
--      occasionally at-least-once even on success). `stripe_events` is a claim
--      table: the handler inserts the event id BEFORE doing any work, so a
--      redelivery hits the primary key and is skipped. A claim is deleted again
--      if the handler throws, so a genuine failure still gets retried.
--
--   2. IN-ORDER. Stripe does not guarantee delivery order, so a stale
--      `customer.subscription.updated` can land after a newer one and downgrade
--      a live tenant. `tenants.last_stripe_event_at` records the Stripe event
--      timestamp behind the current row, and billing writes are conditional on
--      the incoming event being no older than it.
--
-- Both tables are service_role-only: the webhook runs with the service key and
-- nothing client-side has any reason to read event plumbing.
--
-- NOTE: not yet applied. Live project ref is fdqbdqsmaguxdnaftxbq (config.toml
-- ref is stale). Apply with `supabase db push`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Processed-event claim table (idempotency)
-- ---------------------------------------------------------------------------
CREATE TABLE public.stripe_events (
  event_id    TEXT NOT NULL PRIMARY KEY,   -- Stripe's evt_... id
  type        TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS on with NO policies: anon/authenticated are denied everything. service_role
-- bypasses RLS, which is the only caller (the webhook edge function).
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.stripe_events TO service_role;

-- Lets an operator prune old claims cheaply; the table is otherwise append-only.
CREATE INDEX stripe_events_received_at_idx ON public.stripe_events (received_at);

COMMENT ON TABLE public.stripe_events IS
  'Claimed Stripe webhook event ids. Insert-before-work makes redelivery a no-op. '
  'Safe to prune rows older than ~30 days (Stripe stops retrying long before that).';

-- ---------------------------------------------------------------------------
-- Ordering guard on tenant billing state
-- ---------------------------------------------------------------------------
ALTER TABLE public.tenants
  ADD COLUMN last_stripe_event_at TIMESTAMPTZ;

COMMENT ON COLUMN public.tenants.last_stripe_event_at IS
  'Stripe `event.created` of the event that last wrote this row''s billing '
  'fields. Billing updates are conditional on the incoming event being no older, '
  'so out-of-order delivery cannot revert a newer subscription state.';
