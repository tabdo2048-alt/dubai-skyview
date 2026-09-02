-- POI tables: hospitals, schools, tourism (Places of Interest)
-- Each follows the spec: id, name, lat, lng, images[], created_at
-- RLS: public SELECT; admin INSERT/UPDATE/DELETE

CREATE TABLE public.hospitals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.hospitals TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hospitals TO authenticated;
GRANT ALL ON public.hospitals TO service_role;
ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read hospitals" ON public.hospitals FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write hospitals" ON public.hospitals FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_hospitals_location ON public.hospitals(lat, lng);

CREATE TABLE public.schools (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.schools TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;
ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read schools" ON public.schools FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write schools" ON public.schools FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_schools_location ON public.schools(lat, lng);

CREATE TABLE public.tourism (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  images TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tourism TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tourism TO authenticated;
GRANT ALL ON public.tourism TO service_role;
ALTER TABLE public.tourism ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read tourism" ON public.tourism FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write tourism" ON public.tourism FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_tourism_location ON public.tourism(lat, lng);

-- Enable Realtime for all three tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.hospitals, public.schools, public.tourism;
