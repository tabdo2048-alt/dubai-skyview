-- Rename the zone category STR ("Short-Term Rental") to FLIP ("Flipping").
--
-- Order matters: the CHECK constraint created in 20260722130000_create_zones_table.sql
-- only allows ('RY','STR','HH'), so it has to be dropped before the UPDATE can write
-- 'FLIP', and re-added afterwards once no row still says 'STR'.

ALTER TABLE public.zones DROP CONSTRAINT IF EXISTS zones_category_check;

UPDATE public.zones SET category = 'FLIP' WHERE category = 'STR';

ALTER TABLE public.zones
  ADD CONSTRAINT zones_category_check CHECK (category IN ('RY', 'FLIP', 'HH'));
