-- ============================================================================
-- Security hardening (found during an adversarial audit).
--
-- 1) PAYWALL BYPASS (high): the tenants UPDATE policy let an org owner/admin
--    write ANY column of their own tenant row — including subscription_status
--    and suspended. A user could `UPDATE tenants SET subscription_status =
--    'active'` to use the app without paying, or set suspended=false to undo a
--    ban. Billing/suspension columns are now writable only by the Stripe webhook
--    (service_role) and the SECURITY DEFINER platform RPCs. Owners keep name/slug.
--
-- 2) DEFENSE-IN-DEPTH: Supabase default-grants gave `authenticated` full
--    INSERT/UPDATE/DELETE on user_roles, tenant_members and tenants. RLS already
--    denied abuse, but RLS was the ONLY guard. These are mutated solely by
--    SECURITY DEFINER RPCs / the webhook, so the client-role write grants are
--    revoked — a mis-added policy alone can no longer open privilege escalation.
--
-- 3) The public showcase read needs anon to EXECUTE the tenant helper functions
--    (they return empty/false for anon), so grant it.
-- ============================================================================

-- 1) Lock billing columns; allow only safe org-settings columns.
REVOKE UPDATE ON public.tenants FROM anon, authenticated;
GRANT UPDATE (name, slug) ON public.tenants TO authenticated;

-- 2) Membership / roles / tenant creation are RPC/webhook-only.
REVOKE INSERT, UPDATE, DELETE ON public.tenant_members FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.tenants FROM anon, authenticated;

-- 3) Public-showcase read needs these (safe: empty/false for anon).
GRANT EXECUTE ON FUNCTION public.current_tenant_ids() TO anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO anon;
