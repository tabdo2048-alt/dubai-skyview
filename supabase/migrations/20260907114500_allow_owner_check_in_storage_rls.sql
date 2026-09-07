-- Storage RLS evaluates this boolean helper as the authenticated caller.
-- EXECUTE exposes only the owner/not-owner check and grants no table access.
grant execute on function public.is_platform_owner(uuid) to authenticated;
