-- ============================================================================
-- Phase 3 — paid onboarding support.
--
-- A SECURITY DEFINER RPC that creates a new organization (tenant, status
-- 'incomplete') and makes the caller its owner. This is the ONLY way a user can
-- create a tenant + a membership row (both tables have no INSERT grant to
-- `authenticated`), so a user cannot fabricate memberships or self-join others.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_tenant_for_owner(_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id   UUID;
  v_slug TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  -- Slug from the name + a short random suffix to avoid collisions.
  v_slug := regexp_replace(lower(coalesce(nullif(_name, ''), 'org')), '[^a-z0-9]+', '-', 'g')
            || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

  INSERT INTO public.tenants (name, slug, subscription_status)
  VALUES (coalesce(nullif(_name, ''), 'My Organization'), v_slug, 'incomplete')
  RETURNING id INTO v_id;

  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (v_id, auth.uid(), 'owner');

  RETURN v_id;
END $$;

REVOKE EXECUTE ON FUNCTION public.create_tenant_for_owner(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_tenant_for_owner(TEXT) TO authenticated;
