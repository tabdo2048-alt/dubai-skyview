-- Guarantee the seeded "Default Organization" never loses access.
--
-- CONTEXT — it is already unlimited, and there is nothing to uncap. The org is
-- created by 20260812000000_multitenant_foundation.sql with
-- subscription_status = 'active' and current_period_end = NULL, and this codebase
-- has NO usage/quota system at all: no project cap, no seat cap, no rate cap on
-- tenant data. Access is binary, decided by canAccessTenant() =
-- (active | past_due) AND NOT suspended. So an active org with a NULL period is
-- already permanent, unmetered access.
--
-- What this migration adds is durability and legibility:
--   * Re-asserts active / not-suspended / no period end, in case the row was
--     changed by hand or by a Stripe webhook at some point.
--   * Clears stripe_customer_id / stripe_subscription_id so no future webhook
--     event can ever match this row and flip its status. THIS is the only real
--     risk to "unlimited", and it is what actually gets fixed here.
--   * Sets plan = 'unlimited' so the admin UI prints a word for the state rather
--     than leaving the plan blank.
--
-- Matched on slug = 'default' (UNIQUE) rather than the display name, so renaming
-- the org in the UI does not detach this guarantee. Idempotent.

UPDATE public.tenants
   SET subscription_status     = 'active',
       suspended               = false,
       current_period_end      = NULL,
       plan                    = 'unlimited',
       stripe_customer_id      = NULL,
       stripe_subscription_id  = NULL
 WHERE slug = 'default';
