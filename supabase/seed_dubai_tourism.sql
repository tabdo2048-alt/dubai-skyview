-- Dubai tourism landmarks — curated (no OSM generator; these are the named hero
-- places the map's glyph map in src/components/map/poiIcons.ts is keyed to).
-- Replaces the tourism table only; schools/hospitals rows are untouched.
--
-- Apply with service_role (bypasses RLS): Supabase SQL editor, or
--   psql "$SUPABASE_DB_URL" -f supabase/seed_dubai_tourism.sql
BEGIN;
TRUNCATE TABLE public.tourism;
INSERT INTO public.tourism (name, lat, lng, images) VALUES
  ('Burj Khalifa',              25.19720, 55.27440, '{}'),
  ('The Dubai Mall',            25.19850, 55.27960, '{}'),
  ('The Dubai Fountain',        25.19550, 55.27480, '{}'),
  ('Burj Al Arab',             25.14120, 55.18530, '{}'),
  ('Palm Jumeirah',            25.11240, 55.13900, '{}'),
  ('Atlantis The Palm',        25.13040, 55.11710, '{}'),
  ('Dubai Marina',             25.08050, 55.14030, '{}'),
  ('JBR Beach',                25.07850, 55.13300, '{}'),
  ('Ain Dubai',                25.07900, 55.12000, '{}'),
  ('Museum of the Future',     25.21970, 55.28200, '{}'),
  ('Dubai Frame',              25.23540, 55.30070, '{}'),
  ('Global Village',           25.06990, 55.30700, '{}'),
  ('Dubai Miracle Garden',     25.06080, 55.24360, '{}'),
  ('Ski Dubai',                25.11810, 55.20030, '{}'),
  ('IMG Worlds of Adventure',  25.07250, 55.30200, '{}'),
  ('Dubai Creek',              25.26110, 55.32000, '{}'),
  ('Gold Souk (Deira)',        25.27030, 55.29600, '{}'),
  ('Jumeirah Mosque',          25.23330, 55.26640, '{}'),
  ('La Mer',                   25.23400, 55.25400, '{}'),
  ('Dubai Opera',              25.19300, 55.27200, '{}'),
  ('Wild Wadi Waterpark',      25.14000, 55.19000, '{}');
COMMIT;
