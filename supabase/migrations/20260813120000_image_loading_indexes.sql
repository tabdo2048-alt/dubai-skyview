-- Keep the relation used by the project list/detail query cheap as galleries
-- grow. The foreign key alone does not create an index on the child table.
CREATE INDEX IF NOT EXISTS idx_project_images_project_id_sort_order
  ON public.project_images(project_id, sort_order);

-- The public project list orders by both columns on every initial map load.
CREATE INDEX IF NOT EXISTS idx_projects_featured_created_at
  ON public.projects(featured DESC, created_at DESC);
