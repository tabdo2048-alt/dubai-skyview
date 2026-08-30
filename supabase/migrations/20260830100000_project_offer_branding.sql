-- Optional visual settings for the dynamically generated sales offer.
-- Null values intentionally keep the existing navy/gold defaults.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS offer_primary_color TEXT,
  ADD COLUMN IF NOT EXISTS offer_accent_color TEXT,
  ADD COLUMN IF NOT EXISTS offer_header_image_url TEXT;

COMMENT ON COLUMN public.projects.offer_primary_color IS
  'Optional primary brand colour used by the sales offer PDF.';

COMMENT ON COLUMN public.projects.offer_accent_color IS
  'Optional accent brand colour used by the sales offer PDF.';

COMMENT ON COLUMN public.projects.offer_header_image_url IS
  'Optional canonical project image selected for the sales offer PDF header.';
