-- ============================================================================
-- Least-privilege grant cleanup (adversarial audit, round 2).
--
-- RLS was holding — anon INSERT attempts on projects/login_attempts were
-- rejected with "violates row-level security policy". But the client roles still
-- carried Supabase's broad default table grants: anon AND authenticated had
-- INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER on nearly every table, so RLS
-- was the ONLY thing between the open internet and the data.
--
--   * TRUNCATE is a table-level operation and is NOT filtered by RLS. A role
--     holding it can empty a table regardless of row policies.
--   * anon needs zero writes anywhere: the public showcase is read-only and all
--     privileged writes go through SECURITY DEFINER RPCs or the service role.
--   * login_attempts (rate-limit log) and stripe_events (webhook idempotency
--     ledger) are touched only by SECURITY DEFINER functions, which run as the
--     owner, and by the webhook's service-role client. No client grant needed.
--   * client_ip() is an internal helper for the login-rate functions; no client
--     role should be able to call it directly.
--
-- No RLS policy changes here — this removes grants that RLS should never have
-- had to compensate for. `authenticated` keeps SELECT/INSERT/UPDATE/DELETE,
-- still governed by the existing tenant policies.
-- ============================================================================

-- 1) anon: read-only everywhere.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM anon;

-- 2) authenticated: keep RLS-governed DML, never table-level operations.
REVOKE TRUNCATE, REFERENCES, TRIGGER
  ON ALL TABLES IN SCHEMA public FROM authenticated;

-- 3) Security/audit tables: service-role + SECURITY DEFINER only.
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
REVOKE ALL ON public.stripe_events  FROM anon, authenticated;

-- 4) Internal helper for the login-rate functions.
REVOKE EXECUTE ON FUNCTION public.client_ip() FROM anon, authenticated, PUBLIC;

-- 5) Future tables must not re-inherit the broad defaults.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;
