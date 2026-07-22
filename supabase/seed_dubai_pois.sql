-- Seed real Dubai POIs: tourism, schools, hospitals.
-- Tables created by migration 20260722120000_create_poi_tables.sql.
-- Re-runnable: clears sample rows first. Run with service_role (bypasses RLS),
-- e.g. Supabase SQL editor or `supabase db execute`.

BEGIN;

TRUNCATE public.tourism, public.schools, public.hospitals;

-- ── Tourism ────────────────────────────────────────────────────────────────
INSERT INTO public.tourism (name, lat, lng) VALUES
  ('Burj Khalifa',              25.19720, 55.27440),
  ('The Dubai Mall',            25.19850, 55.27960),
  ('The Dubai Fountain',        25.19550, 55.27480),
  ('Burj Al Arab',             25.14120, 55.18530),
  ('Palm Jumeirah',            25.11240, 55.13900),
  ('Atlantis The Palm',        25.13040, 55.11710),
  ('Dubai Marina',             25.08050, 55.14030),
  ('JBR Beach',                25.07850, 55.13300),
  ('Ain Dubai',                25.07900, 55.12000),
  ('Museum of the Future',     25.21970, 55.28200),
  ('Dubai Frame',              25.23540, 55.30070),
  ('Global Village',           25.06990, 55.30700),
  ('Dubai Miracle Garden',     25.06080, 55.24360),
  ('Ski Dubai',                25.11810, 55.20030),
  ('IMG Worlds of Adventure',  25.07250, 55.30200),
  ('Dubai Creek',              25.26110, 55.32000),
  ('Gold Souk (Deira)',        25.27030, 55.29600),
  ('Jumeirah Mosque',          25.23330, 55.26640),
  ('La Mer',                   25.23400, 55.25400),
  ('Dubai Opera',              25.19300, 55.27200),
  ('Wild Wadi Waterpark',      25.14000, 55.19000);

-- ── Schools ────────────────────────────────────────────────────────────────
INSERT INTO public.schools (name, lat, lng) VALUES
  ('GEMS Wellington International School', 25.11500, 55.19000),
  ('Dubai American Academy',               25.10800, 55.18500),
  ('Jumeirah College',                     25.16000, 55.22000),
  ('Repton School Dubai',                  25.15600, 55.30600),
  ('Kings'' School Al Barsha',             25.11200, 55.20500),
  ('Dubai English Speaking College',       25.22700, 55.33500),
  ('GEMS Modern Academy',                  25.21000, 55.34000),
  ('Nord Anglia International School Dubai',25.10000, 55.24000),
  ('Dubai British School Jumeirah Park',   25.04000, 55.16000),
  ('Raffles World Academy',                25.13300, 55.24000),
  ('GEMS World Academy',                   25.11800, 55.24500),
  ('American School of Dubai',             25.04500, 55.19000);

-- ── Hospitals ──────────────────────────────────────────────────────────────
INSERT INTO public.hospitals (name, lat, lng) VALUES
  ('Rashid Hospital',                 25.23400, 55.32300),
  ('Dubai Hospital',                  25.28300, 55.31700),
  ('American Hospital Dubai',         25.25300, 55.31200),
  ('Mediclinic City Hospital',        25.22800, 55.32600),
  ('Saudi German Hospital Dubai',     25.10300, 55.19300),
  ('NMC Royal Hospital DIP',          24.99000, 55.16000),
  ('King''s College Hospital Dubai',  25.12000, 55.38000),
  ('Aster Hospital Mankhool',         25.25300, 55.29600),
  ('Zulekha Hospital Dubai',          25.29000, 55.38000),
  ('Medcare Hospital Al Safa',        25.17000, 55.24000),
  ('Emirates Hospital Jumeirah',      25.21300, 55.25300),
  ('Canadian Specialist Hospital',    25.26500, 55.34000);

COMMIT;
