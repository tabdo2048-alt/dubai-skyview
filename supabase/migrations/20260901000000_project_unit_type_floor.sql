-- Optional floor label for each unit type (for example: Ground, 16, or 16th Floor).
-- A missing floor stays absent from the unit details and sales offer PDF.
ALTER TABLE public.project_unit_types
  ADD COLUMN IF NOT EXISTS floor TEXT;

COMMENT ON COLUMN public.project_unit_types.floor IS
  'Optional display label for the unit type floor.';
