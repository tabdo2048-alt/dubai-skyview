-- Optional plot / land boundary for a project, stored as a GeoJSON Polygon.
-- Nullable — projects without a plot keep working unchanged. Existing projects
-- RLS (anon SELECT / admin write) already covers the new column.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS plot_geometry jsonb;
