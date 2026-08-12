-- Publishing to the public showcase is a platform-admin operation.
-- Keep this server-side guard in addition to hiding the workspace control:
-- direct PostgREST/API updates must not let tenant members publish projects.

CREATE OR REPLACE FUNCTION public.platform_only_publication()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(), 'admin')
     AND (
       (TG_OP = 'INSERT' AND NEW.is_public IS TRUE)
       OR (TG_OP = 'UPDATE' AND NEW.is_public IS DISTINCT FROM OLD.is_public)
     ) THEN
    RAISE EXCEPTION 'Only platform administrators can publish projects';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_only_publication() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_platform_only_publication ON public.projects;
CREATE TRIGGER trg_projects_platform_only_publication
  BEFORE INSERT OR UPDATE OF is_public ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.platform_only_publication();

