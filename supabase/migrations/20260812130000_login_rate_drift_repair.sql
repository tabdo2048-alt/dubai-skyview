-- Repair migration for projects where the login-rate objects were created by
-- an earlier manual SQL script but never landed in the repository migrations.
-- All statements are idempotent so this is safe on both old and fresh targets.

CREATE TABLE IF NOT EXISTS public.login_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ip TEXT NOT NULL,
  email TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.login_attempts TO service_role;
REVOKE ALL ON public.login_attempts FROM anon, authenticated;
CREATE INDEX IF NOT EXISTS login_attempts_ip_created_at_idx
  ON public.login_attempts (ip, created_at) WHERE success = false;

CREATE OR REPLACE FUNCTION public.client_ip()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.headers', true)::json->>'cf-connecting-ip', ''),
    NULLIF(current_setting('request.headers', true)::json->>'x-real-ip', ''),
    NULLIF(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), ''),
    inet_client_addr()::text
  )
$$;
REVOKE EXECUTE ON FUNCTION public.client_ip() FROM PUBLIC, anon, authenticated;

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
   WHERE ip = v_ip AND success = false AND created_at > now() - interval '1 hour';
  IF v_n >= 5 THEN
    RAISE EXCEPTION 'rate_limited' USING HINT = 'Too many failed attempts. Try again in an hour.';
  END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_login_rate() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_login_rate() TO anon, authenticated;

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
