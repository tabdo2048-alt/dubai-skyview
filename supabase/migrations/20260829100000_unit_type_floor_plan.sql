-- Optional unit-specific layout image used by the sales offer PDF.
-- A missing image remains missing; no placeholder or project image is copied
-- into the unit slot automatically.
ALTER TABLE public.project_unit_types
  ADD COLUMN IF NOT EXISTS floor_plan_url TEXT;

COMMENT ON COLUMN public.project_unit_types.floor_plan_url IS
  'Optional image URL for this unit type layout/floor plan.';
