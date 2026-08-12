-- Security integrity hardening for tenant-owned project data.
-- Prevent cross-tenant references even when a caller supplies raw foreign keys
-- directly instead of using the UI.

CREATE OR REPLACE FUNCTION public.prevent_tenant_id_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM OLD.tenant_id THEN
    RAISE EXCEPTION 'tenant_id is immutable';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prevent_tenant_id_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_tenant_immutable ON public.projects;
CREATE TRIGGER trg_projects_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_project_images_tenant_immutable ON public.project_images;
CREATE TRIGGER trg_project_images_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.project_images
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_project_amenities_tenant_immutable ON public.project_amenities;
CREATE TRIGGER trg_project_amenities_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.project_amenities
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_developers_tenant_immutable ON public.developers;
CREATE TRIGGER trg_developers_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.developers
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_communities_tenant_immutable ON public.communities;
CREATE TRIGGER trg_communities_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.communities
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

DROP TRIGGER IF EXISTS trg_zones_tenant_immutable ON public.zones;
CREATE TRIGGER trg_zones_tenant_immutable
  BEFORE UPDATE OF tenant_id ON public.zones
  FOR EACH ROW EXECUTE FUNCTION public.prevent_tenant_id_change();

CREATE OR REPLACE FUNCTION public.validate_project_tenant_links()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.developer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.developers d
    WHERE d.id = NEW.developer_id AND d.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'developer does not belong to the project tenant';
  END IF;

  IF NEW.community_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.communities c
    WHERE c.id = NEW.community_id AND c.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'community does not belong to the project tenant';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_project_tenant_links() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_projects_tenant_links ON public.projects;
CREATE TRIGGER trg_projects_tenant_links
  BEFORE INSERT OR UPDATE OF tenant_id, developer_id, community_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_tenant_links();

CREATE OR REPLACE FUNCTION public.validate_project_child_tenant()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = NEW.project_id AND p.tenant_id = NEW.tenant_id
  ) THEN
    RAISE EXCEPTION 'project does not belong to the row tenant';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validate_project_child_tenant() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_project_images_tenant_link ON public.project_images;
CREATE TRIGGER trg_project_images_tenant_link
  BEFORE INSERT OR UPDATE OF project_id, tenant_id ON public.project_images
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_child_tenant();

DROP TRIGGER IF EXISTS trg_project_amenities_tenant_link ON public.project_amenities;
CREATE TRIGGER trg_project_amenities_tenant_link
  BEFORE INSERT OR UPDATE OF project_id, tenant_id ON public.project_amenities
  FOR EACH ROW EXECUTE FUNCTION public.validate_project_child_tenant();

-- Defense in depth at the RLS boundary too: a child row must point to a
-- project in the same tenant, even before the trigger runs.
DROP POLICY IF EXISTS "Tenant members write project_images" ON public.project_images;
CREATE POLICY "Tenant members write project_images"
  ON public.project_images
  FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_images.project_id AND p.tenant_id = project_images.tenant_id
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'member')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_images.project_id AND p.tenant_id = project_images.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant admins write project_amenities" ON public.project_amenities;
CREATE POLICY "Tenant admins write project_amenities"
  ON public.project_amenities
  FOR ALL TO authenticated
  USING (
    public.is_tenant_member(tenant_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_amenities.project_id AND p.tenant_id = project_amenities.tenant_id
    )
  )
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'admin')
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_amenities.project_id AND p.tenant_id = project_amenities.tenant_id
    )
  );

DROP POLICY IF EXISTS "Tenant members write projects" ON public.projects;
CREATE POLICY "Tenant members write projects"
  ON public.projects
  FOR ALL TO authenticated
  USING (public.is_tenant_member(tenant_id, 'member'))
  WITH CHECK (
    public.is_tenant_member(tenant_id, 'member')
    AND (
      developer_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.developers d
        WHERE d.id = projects.developer_id AND d.tenant_id = projects.tenant_id
      )
    )
    AND (
      community_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.communities c
        WHERE c.id = projects.community_id AND c.tenant_id = projects.tenant_id
      )
    )
  );

-- A current upload path is <tenant_id>/<project_id>/<file>. Require both
-- segments to identify an existing project in the same tenant.
CREATE OR REPLACE FUNCTION public.project_media_path_allowed(
  _name TEXT,
  _minimum_role public.tenant_role
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  parts TEXT[];
  path_tenant UUID;
  path_project UUID;
BEGIN
  parts := storage.foldername(_name);
  IF COALESCE(array_length(parts, 1), 0) < 2 THEN
    RETURN FALSE;
  END IF;

  BEGIN
    path_tenant := parts[1]::UUID;
    path_project := parts[2]::UUID;
  EXCEPTION WHEN invalid_text_representation THEN
    RETURN FALSE;
  END;

  RETURN public.is_tenant_member(path_tenant, _minimum_role)
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = path_project AND p.tenant_id = path_tenant
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.project_media_path_allowed(TEXT, public.tenant_role)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_media_path_allowed(TEXT, public.tenant_role)
  TO authenticated;

DROP POLICY IF EXISTS "project-media tenant insert" ON storage.objects;
CREATE POLICY "project-media tenant insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.project_media_path_allowed(name, 'member')
  );

DROP POLICY IF EXISTS "project-media tenant update" ON storage.objects;
CREATE POLICY "project-media tenant update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.project_media_path_allowed(name, 'member')
  )
  WITH CHECK (
    bucket_id = 'project-media'
    AND public.project_media_path_allowed(name, 'member')
  );

DROP POLICY IF EXISTS "project-media tenant delete" ON storage.objects;
CREATE POLICY "project-media tenant delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'project-media'
    AND public.project_media_path_allowed(name, 'member')
  );
