-- ============================================================================
-- Billing hardening + the public showcase read fix.
--
-- 1) BILLING CUSTOMER LINK (privilege issue + regression).
--    createCheckoutSession persisted the new Stripe customer with a plain
--    `UPDATE tenants SET stripe_customer_id = …` through the USER-scoped client.
--    After the billing columns were locked (20260812040000) that write is denied,
--    and its error was ignored — so the id never persisted and a fresh Stripe
--    customer was created on every checkout, leaving the billing portal with
--    "No billing customer for this organization".
--    Granting UPDATE(stripe_customer_id) back would be worse than the bug: an org
--    admin could repoint their org at ANOTHER org's Stripe customer and then open
--    that customer's billing portal — reading their invoices and cancelling their
--    subscription. Instead the link goes through a write-once, admin-only
--    SECURITY DEFINER RPC that refuses to overwrite an existing link.
--
-- 2) PUBLIC SHOWCASE READ (the public map was empty).
--    The map selects projects with `developer` and `community` embedded. anon had
--    neither a SELECT grant nor a SELECT policy on those tables, so PostgREST
--    failed the whole embedded query — published projects never rendered. anon may
--    now read exactly the developers/communities referenced by a PUBLIC project.
--
-- 3) The `auth.uid() IS NULL` guard on every public branch mirrors the projects
--    policy: signed-in users see only their own org, so the public branch must not
--    leak other orgs' rows to them. project_images/project_amenities were missing
--    that guard, letting a signed-in user read another org's images and amenities
--    for a published project even though the project row itself stayed hidden.
--
-- 4) anon never reads org/billing/role tables. RLS already returned zero rows
--    (those policies are TO authenticated), but the grant should not exist either.
-- ============================================================================

-- 1) Write-once, admin-only Stripe customer link.
CREATE OR REPLACE FUNCTION public.set_tenant_stripe_customer(_tenant UUID, _customer TEXT)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_tenant_member(_tenant, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _customer IS NULL OR _customer !~ '^cus_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid customer id';
  END IF;
  -- Write-once: an existing link is never repointed.
  UPDATE public.tenants
     SET stripe_customer_id = _customer
   WHERE id = _tenant AND stripe_customer_id IS NULL;
END $$;
REVOKE EXECUTE ON FUNCTION public.set_tenant_stripe_customer(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tenant_stripe_customer(UUID, TEXT) TO authenticated;

-- 4) anon has no business reading orgs, rosters or roles.
REVOKE SELECT ON public.tenants        FROM anon;
REVOKE SELECT ON public.tenant_members FROM anon;
REVOKE SELECT ON public.user_roles     FROM anon;

-- 2) Public showcase needs the embedded developer/community rows.
GRANT SELECT ON public.developers  TO anon;
GRANT SELECT ON public.communities TO anon;

DROP POLICY IF EXISTS "Tenant read developers" ON public.developers;
DROP POLICY IF EXISTS "Read developers" ON public.developers;
CREATE POLICY "Read developers" ON public.developers
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR (auth.uid() IS NULL AND EXISTS (
          SELECT 1 FROM public.projects p
           WHERE p.developer_id = developers.id AND p.is_public))
  );

DROP POLICY IF EXISTS "Tenant read communities" ON public.communities;
DROP POLICY IF EXISTS "Read communities" ON public.communities;
CREATE POLICY "Read communities" ON public.communities
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR (auth.uid() IS NULL AND EXISTS (
          SELECT 1 FROM public.projects p
           WHERE p.community_id = communities.id AND p.is_public))
  );

-- 3) Close the signed-in leak on the project child tables.
DROP POLICY IF EXISTS "Tenant or public read project_images" ON public.project_images;
CREATE POLICY "Tenant or public read project_images" ON public.project_images
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR (auth.uid() IS NULL AND EXISTS (
          SELECT 1 FROM public.projects p
           WHERE p.id = project_images.project_id AND p.is_public))
  );

DROP POLICY IF EXISTS "Tenant or public read project_amenities" ON public.project_amenities;
CREATE POLICY "Tenant or public read project_amenities" ON public.project_amenities
  FOR SELECT TO anon, authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR tenant_id IN (SELECT public.current_tenant_ids())
    OR (auth.uid() IS NULL AND EXISTS (
          SELECT 1 FROM public.projects p
           WHERE p.id = project_amenities.project_id AND p.is_public))
  );
