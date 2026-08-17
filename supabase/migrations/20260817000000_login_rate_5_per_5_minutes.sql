-- Login rate limit: 5 failed attempts per 5 minutes (was 5 per hour).
--
-- SECURITY TRADEOFF, stated plainly: this loosens brute-force protection by a
-- factor of ~12. The old rule allowed 5 guesses per hour from one IP; this one
-- allows 5 per 5 minutes, i.e. up to 60 per hour. The upside is that a legitimate
-- user who mistypes their password five times waits 5 minutes instead of an hour.
-- Supabase Auth's own per-account protections still apply on top of this, and the
-- window is per-IP, so this is a deliberate UX-for-strictness trade, not a hole.
--
-- Only the window changes. The threshold stays 5, the allowlist bypass stays, and
-- the advisory lock still serializes concurrent checks from the same IP.
-- Idempotent: CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.check_login_rate()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip TEXT;
  v_n INT;
BEGIN
  v_ip := public.client_ip();
  IF v_ip IS NULL THEN RETURN; END IF;

  IF EXISTS (SELECT 1 FROM public.login_rate_allowlist a WHERE a.ip = v_ip) THEN
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(v_ip));
  SELECT count(*) INTO v_n FROM public.login_attempts
   WHERE ip = v_ip AND success = false AND created_at > now() - interval '5 minutes';
  IF v_n >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING HINT = 'Too many failed attempts. Try again in 5 minutes.';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.check_login_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_rate() TO anon, authenticated;
