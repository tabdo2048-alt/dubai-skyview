-- zones: admin-drawn investment-performance areas highlighted on the main map.
-- category in (RY = Rental Yield, STR = Short-Term Rental, HH = Holiday Home).
-- geometry holds a GeoJSON Polygon (array of [lng,lat] rings).
-- RLS: public SELECT (anon reads for the highlight buttons); admin INSERT/UPDATE/DELETE.

CREATE TABLE public.zones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('RY','STR','HH')),
  value NUMERIC,
  geometry JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.zones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zones TO authenticated;
GRANT ALL ON public.zones TO service_role;

ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read zones" ON public.zones FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write zones" ON public.zones FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE INDEX idx_zones_category ON public.zones(category);

ALTER PUBLICATION supabase_realtime ADD TABLE public.zones;
