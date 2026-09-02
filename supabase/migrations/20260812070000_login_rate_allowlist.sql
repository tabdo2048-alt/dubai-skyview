-- ============================================================================
-- Login rate-limit allowlist.
--
-- The throttle (5 failed password attempts per IP per hour) applies to everyone,
-- including the owner locking themselves out during admin work. This adds an
-- explicit bypass list rather than hardcoding an IP into the function, so entries
-- can be added/removed with a plain INSERT/DELETE.
--
-- The table is locked down exactly like login_attempts: RLS enabled with NO
-- policies and no grants to anon/authenticated, so only the service role and the
-- SECURITY DEFINER check function can touch it. That matters both ways — reading
-- it would reveal which IP skips the throttle, and writing it would let an
-- attacker allowlist themselves and disable the throttle outright.
--
-- Caveat worth knowing: a residential IP is usually dynamic. If the ISP hands out
-- a new address the bypass silently stops applying (you are simply throttled
-- normally again) — re-add the new IP when that happens.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.login_rate_allowlist (
  ip         TEXT PRIMARY KEY,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_rate_allowlist ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.login_rate_allowlist FROM anon, authenticated;

-- Return early (unlimited attempts) for an allowlisted IP.
CREATE OR REPLACE FUNCTION public.check_login_rate()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ip TEXT; v_n INT;
BEGIN
  v_ip := public.client_ip();
  IF v_ip IS NULL THEN RETURN; END IF; -- can't identify IP -> don't block

  IF EXISTS (SELECT 1 FROM public.login_rate_allowlist a WHERE a.ip = v_ip) THEN
    RETURN;
  END IF;

  SELECT count(*) INTO v_n FROM public.login_attempts
   WHERE ip = v_ip AND success = false AND created_at > now() - interval '1 hour';
  IF v_n >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING HINT = 'Too many failed attempts. Try again in an hour.';
  END IF;
END $$;

-- Record only the minimum needed for the IP throttle. The public RPC is
-- intentionally bounded because an anonymous caller can invoke it directly.
CREATE OR REPLACE FUNCTION public.record_login_failure(_email TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ip TEXT;
  v_email TEXT;
BEGIN
  v_ip := public.client_ip();
  IF v_ip IS NULL THEN RETURN; END IF;
  v_email := left(lower(trim(coalesce(_email, ''))), 320);

  IF (
    SELECT count(*) FROM public.login_attempts
    WHERE ip = v_ip AND created_at > now() - interval '1 minute'
  ) >= 20 THEN
    RETURN;
  END IF;

  INSERT INTO public.login_attempts (ip, email, success)
  VALUES (v_ip, NULLIF(v_email, ''), false);

  DELETE FROM public.login_attempts
  WHERE created_at < now() - interval '2 days';
END $$;

REVOKE EXECUTE ON FUNCTION public.record_login_failure(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login_failure(TEXT) TO anon, authenticated;

-- Do not commit a real residential/admin IP here. Add a temporary bypass only
-- through a privileged database session when operationally necessary.
