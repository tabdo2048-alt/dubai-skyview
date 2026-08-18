-- Unit-type area is entered and displayed in square metres, not square feet.
--
-- The admin form offers exactly one unit, so the column name has to match what
-- gets typed into it — a column called area_sqft_* holding metres is the kind of
-- mismatch that silently corrupts every future listing. The columns are renamed
-- in place rather than added-then-dropped so nothing has to be dual-written.
--
-- Existing values were typed into a field labelled "Area min (sqft)", so they
-- ARE square feet and are converted here (1 sqft = 0.09290304 m²). The columns
-- stay INT, so the conversion rounds; a sub-1 m² error on an apartment is below
-- the precision anyone quotes. GREATEST(1, …) keeps a very small value from
-- rounding to 0, which the app's "area must be positive" check would reject.
--
-- At the time of writing no publicly visible row had a non-null area, so this is
-- expected to be a no-op on the current database. The conversion runs anyway
-- because rows belonging to unpublished projects cannot be inspected from
-- outside the database.
--
-- Idempotent: each column is converted and renamed only if it still has the old
-- name and the new name is not already taken, so a re-run after a partial apply
-- does nothing and can never convert twice.

DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqft_min')
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqm_min')
  THEN
    -- Convert first, rename second: at no point is a column named _sqm_ holding
    -- a square-foot number.
    UPDATE public.project_unit_types
       SET area_sqft_min = GREATEST(1, ROUND(area_sqft_min * 0.09290304))
     WHERE area_sqft_min IS NOT NULL;

    ALTER TABLE public.project_unit_types RENAME COLUMN area_sqft_min TO area_sqm_min;
  END IF;

  IF EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqft_max')
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'project_unit_types'
           AND column_name = 'area_sqm_max')
  THEN
    UPDATE public.project_unit_types
       SET area_sqft_max = GREATEST(1, ROUND(area_sqft_max * 0.09290304))
     WHERE area_sqft_max IS NOT NULL;

    ALTER TABLE public.project_unit_types RENAME COLUMN area_sqft_max TO area_sqm_max;
  END IF;
END $$;

COMMENT ON COLUMN public.project_unit_types.area_sqm_min IS 'Smallest unit size in square metres.';
COMMENT ON COLUMN public.project_unit_types.area_sqm_max IS 'Largest unit size in square metres. Equal to the minimum for a fixed size.';
