-- Dubai Skyview sample data for a fresh Supabase database.
-- Run this in Supabase Dashboard > SQL Editor after applying the main schema.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Users view own role'
  ) THEN
    CREATE POLICY "Users view own role"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Admins view all roles'
  ) THEN
    CREATE POLICY "Admins view all roles"
    ON public.user_roles
    FOR SELECT
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_roles'
      AND policyname = 'Admins manage roles'
  ) THEN
    CREATE POLICY "Admins manage roles"
    ON public.user_roles
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.developers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  description TEXT,
  website TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.developers TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.developers TO authenticated;
GRANT ALL ON public.developers TO service_role;
ALTER TABLE public.developers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'developers'
      AND policyname = 'Public read developers'
  ) THEN
    CREATE POLICY "Public read developers"
    ON public.developers
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'developers'
      AND policyname = 'Admin write developers'
  ) THEN
    CREATE POLICY "Admin write developers"
    ON public.developers
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

INSERT INTO public.developers (name, slug, description, website)
VALUES
  ('Emaar Properties', 'emaar', 'Dubai master developer behind Downtown Dubai, Dubai Marina, and Dubai Hills communities.', 'https://www.emaar.com'),
  ('DAMAC Properties', 'damac', 'Luxury real estate developer with residential towers and branded residences across Dubai.', 'https://www.damacproperties.com'),
  ('Nakheel', 'nakheel', 'Developer of landmark waterfront communities including Palm Jumeirah.', 'https://www.nakheel.com'),
  ('Meraas', 'meraas', 'Lifestyle-led Dubai developer known for premium mixed-use districts and waterfront destinations.', 'https://www.meraas.com'),
  ('Sobha Realty', 'sobha', 'Luxury developer focused on refined residential communities and high-quality delivery.', 'https://www.sobharealty.com'),
  ('Azizi Developments', 'azizi', 'Dubai developer with investment-focused apartment communities across freehold districts.', 'https://www.azizidevelopments.com'),
  ('Dubai Properties', 'dubai-properties', 'Dubai-based developer of residential communities, waterfront districts, and family neighborhoods.', 'https://www.dp.ae'),
  ('Select Property', 'select-property', 'Developer and investment specialist focused on waterfront residential projects.', 'https://www.selectproperty.com')
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  website = EXCLUDED.website,
  updated_at = now();

CREATE TABLE IF NOT EXISTS public.communities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  hero_image_url TEXT,
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.communities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.communities TO authenticated;
GRANT ALL ON public.communities TO service_role;
ALTER TABLE public.communities ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  project_id_type TEXT;
  project_count BIGINT;
BEGIN
  SELECT udt_name
  INTO project_id_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'projects'
    AND column_name = 'id';

  IF project_id_type IS NULL THEN
    CREATE TABLE public.projects (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      developer_id UUID,
      community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
      lat DOUBLE PRECISION NOT NULL,
      lng DOUBLE PRECISION NOT NULL,
      address TEXT,
      starting_price_aed BIGINT,
      bedrooms_min INT,
      bedrooms_max INT,
      bathrooms INT,
      completion_date TEXT,
      payment_plan TEXT,
      status TEXT NOT NULL DEFAULT 'off_plan',
      category TEXT NOT NULL DEFAULT 'apartment',
      tags TEXT[] NOT NULL DEFAULT '{}',
      description TEXT,
      main_image_url TEXT,
      video_url TEXT,
      tour_360_url TEXT,
      brochure_url TEXT,
      featured BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  ELSIF project_id_type <> 'uuid' THEN
    EXECUTE 'SELECT count(*) FROM public.projects' INTO project_count;
    IF project_count = 0 THEN
      DROP TABLE IF EXISTS public.project_amenities;
      DROP TABLE IF EXISTS public.project_images;
      DROP TABLE public.projects;
      CREATE TABLE public.projects (
        id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        developer_id UUID,
        community_id UUID REFERENCES public.communities(id) ON DELETE SET NULL,
        lat DOUBLE PRECISION NOT NULL,
        lng DOUBLE PRECISION NOT NULL,
        address TEXT,
        starting_price_aed BIGINT,
        bedrooms_min INT,
        bedrooms_max INT,
        bathrooms INT,
        completion_date TEXT,
        payment_plan TEXT,
        status TEXT NOT NULL DEFAULT 'off_plan',
        category TEXT NOT NULL DEFAULT 'apartment',
        tags TEXT[] NOT NULL DEFAULT '{}',
        description TEXT,
        main_image_url TEXT,
        video_url TEXT,
        tour_360_url TEXT,
        brochure_url TEXT,
        featured BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    ELSE
      RAISE EXCEPTION 'public.projects.id is %, not uuid, and the table has % rows. Stop before data migration.', project_id_type, project_count;
    END IF;
  END IF;
END $$;

GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS developer_id UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS community_id UUID;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS starting_price_aed BIGINT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS bedrooms_min INT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS bedrooms_max INT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS bathrooms INT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS completion_date TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS payment_plan TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'off_plan';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'apartment';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS main_image_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS tour_360_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS brochure_url TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS featured BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.projects
SET
  slug = COALESCE(slug, lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))),
  lat = COALESCE(lat, 25.1972),
  lng = COALESCE(lng, 55.2744),
  category = COALESCE(category, 'apartment'),
  tags = COALESCE(tags, '{}'),
  featured = COALESCE(featured, false),
  updated_at = COALESCE(updated_at, now())
WHERE slug IS NULL
   OR lat IS NULL
   OR lng IS NULL
   OR category IS NULL
   OR tags IS NULL
   OR featured IS NULL
   OR updated_at IS NULL;

ALTER TABLE public.projects ALTER COLUMN slug SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN name SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN lat SET NOT NULL;
ALTER TABLE public.projects ALTER COLUMN lng SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS projects_slug_key ON public.projects(slug);
CREATE INDEX IF NOT EXISTS idx_projects_community ON public.projects(community_id);
CREATE INDEX IF NOT EXISTS idx_projects_developer ON public.projects(developer_id);
CREATE INDEX IF NOT EXISTS idx_projects_featured ON public.projects(featured);

CREATE TABLE IF NOT EXISTS public.project_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_amenities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.project_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_images TO authenticated;
GRANT ALL ON public.project_images TO service_role;
ALTER TABLE public.project_images ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.project_amenities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_amenities TO authenticated;
GRANT ALL ON public.project_amenities TO service_role;
ALTER TABLE public.project_amenities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'communities'
      AND policyname = 'Public read communities'
  ) THEN
    CREATE POLICY "Public read communities"
    ON public.communities
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'communities'
      AND policyname = 'Admin write communities'
  ) THEN
    CREATE POLICY "Admin write communities"
    ON public.communities
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
      WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND policyname = 'Public read projects'
  ) THEN
    CREATE POLICY "Public read projects"
    ON public.projects
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'projects'
      AND policyname = 'Admin write projects'
  ) THEN
    CREATE POLICY "Admin write projects"
    ON public.projects
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_community_id_fkey'
      AND conrelid = 'public.projects'::regclass
  ) THEN
    ALTER TABLE public.projects
    ADD CONSTRAINT projects_community_id_fkey
    FOREIGN KEY (community_id)
    REFERENCES public.communities(id)
    ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'developers')
     AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'projects_developer_id_fkey'
        AND conrelid = 'public.projects'::regclass
    ) THEN
    ALTER TABLE public.projects
    ADD CONSTRAINT projects_developer_id_fkey
    FOREIGN KEY (developer_id)
    REFERENCES public.developers(id)
    ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_images'
      AND policyname = 'Public read project_images'
  ) THEN
    CREATE POLICY "Public read project_images"
    ON public.project_images
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_images'
      AND policyname = 'Admin write project_images'
  ) THEN
    CREATE POLICY "Admin write project_images"
    ON public.project_images
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_amenities'
      AND policyname = 'Public read project_amenities'
  ) THEN
    CREATE POLICY "Public read project_amenities"
    ON public.project_amenities
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'project_amenities'
      AND policyname = 'Admin write project_amenities'
  ) THEN
    CREATE POLICY "Admin write project_amenities"
    ON public.project_amenities
    FOR ALL
    TO authenticated
    USING (public.has_role(auth.uid(), 'admin'))
    WITH CHECK (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;

INSERT INTO public.communities (name, slug, description, center_lat, center_lng, sort_order)
VALUES
  ('Downtown Dubai', 'downtown-dubai', 'Iconic city-center living around Burj Khalifa, Dubai Mall, and the Opera District.', 25.1972, 55.2744, 10),
  ('Dubai Marina', 'dubai-marina', 'Waterfront towers, yacht views, and direct access to JBR and Bluewaters.', 25.0806, 55.1404, 20),
  ('Palm Jumeirah', 'palm-jumeirah', 'Resort-style beachfront residences across Dubai''s landmark island.', 25.1124, 55.1390, 30),
  ('Business Bay', 'business-bay', 'Canal-side residential and commercial district beside Downtown Dubai.', 25.1850, 55.2725, 40),
  ('Dubai Creek Harbour', 'dubai-creek-harbour', 'Master-planned waterfront community facing the skyline and Ras Al Khor.', 25.2088, 55.3450, 50),
  ('Dubai Hills Estate', 'dubai-hills-estate', 'Green master community with golf, villas, parks, and family apartments.', 25.1169, 55.2548, 60),
  ('Jumeirah Village Circle', 'jumeirah-village-circle', 'Popular freehold community with apartments, townhouses, and parks.', 25.0554, 55.2048, 70),
  ('Bluewaters Island', 'bluewaters-island', 'Premium island destination beside JBR with sea and skyline views.', 25.0805, 55.1222, 80)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  center_lat = EXCLUDED.center_lat,
  center_lng = EXCLUDED.center_lng,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

WITH seed_projects (
  slug,
  name,
  developer_slug,
  community_slug,
  lat,
  lng,
  address,
  starting_price_aed,
  bedrooms_min,
  bedrooms_max,
  bathrooms,
  completion_date,
  payment_plan,
  status,
  category,
  tags,
  description,
  main_image_url,
  featured
) AS (
  VALUES
    (
      'burj-crown-downtown',
      'Burj Crown Downtown',
      'emaar',
      'downtown-dubai',
      25.19465,
      55.27144,
      'Sheikh Mohammed bin Rashid Boulevard, Downtown Dubai',
      1850000,
      1,
      3,
      2,
      'Ready',
      '20/80',
      'ready',
      'apartment',
      ARRAY['downtown', 'burj-khalifa-view', 'ready'],
      'Refined Downtown residences with quick access to Dubai Mall, Burj Khalifa, and the Opera District.',
      'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1400&q=80',
      true
    ),
    (
      'damac-canal-heights',
      'DAMAC Canal Heights',
      'damac',
      'business-bay',
      25.18472,
      55.27281,
      'Marasi Drive, Business Bay',
      1320000,
      1,
      2,
      2,
      'Q4 2027',
      '70/30',
      'off_plan',
      'apartment',
      ARRAY['canal-view', 'off-plan', 'business-bay'],
      'Premium canal-facing apartments in Business Bay with resort-inspired amenities and skyline views.',
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80',
      true
    ),
    (
      'emaar-beachfront-seapoint',
      'Emaar Beachfront Seapoint',
      'emaar',
      'dubai-marina',
      25.09862,
      55.14003,
      'Emaar Beachfront, Dubai Harbour',
      2600000,
      1,
      4,
      3,
      'Q2 2028',
      '90/10',
      'off_plan',
      'apartment',
      ARRAY['beachfront', 'sea-view', 'marina'],
      'Beachfront tower living between Palm Jumeirah and Dubai Marina with private beach access.',
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1400&q=80',
      true
    ),
    (
      'palm-beach-towers',
      'Palm Beach Towers',
      'nakheel',
      'palm-jumeirah',
      25.11317,
      55.13883,
      'Palm Jumeirah Gateway, Dubai',
      3900000,
      1,
      4,
      3,
      'Q1 2027',
      '60/40',
      'off_plan',
      'apartment',
      ARRAY['palm', 'beachfront', 'luxury'],
      'Luxury residences at the entrance of Palm Jumeirah with beach, marina, and skyline views.',
      'https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?auto=format&fit=crop&w=1400&q=80',
      true
    ),
    (
      'bluewaters-bay',
      'Bluewaters Bay',
      'meraas',
      'bluewaters-island',
      25.07884,
      55.12476,
      'Bluewaters Island, Dubai',
      3100000,
      1,
      4,
      3,
      'Q3 2027',
      '75/25',
      'off_plan',
      'apartment',
      ARRAY['island', 'sea-view', 'jbr'],
      'Elegant island apartments minutes from JBR, Ain Dubai, and the Bluewaters promenade.',
      'https://images.unsplash.com/photo-1528909514045-2fa4ac7a08ba?auto=format&fit=crop&w=1400&q=80',
      false
    ),
    (
      'sobha-creek-vistas',
      'Sobha Creek Vistas',
      'sobha',
      'dubai-creek-harbour',
      25.20766,
      55.34342,
      'Dubai Creek Harbour',
      1150000,
      1,
      3,
      2,
      'Ready',
      '10/90',
      'ready',
      'apartment',
      ARRAY['creek', 'skyline-view', 'ready'],
      'Creekside residences with long skyline views and quick access to Ras Al Khor and Downtown Dubai.',
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1400&q=80',
      false
    ),
    (
      'golf-grand-dubai-hills',
      'Golf Grand Dubai Hills',
      'emaar',
      'dubai-hills-estate',
      25.11615,
      55.25521,
      'Dubai Hills Estate',
      1750000,
      1,
      3,
      2,
      'Q1 2028',
      '80/20',
      'off_plan',
      'apartment',
      ARRAY['golf', 'family', 'parks'],
      'Golf-facing apartments inside Dubai Hills Estate with parks, retail, and family amenities nearby.',
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1400&q=80',
      false
    ),
    (
      'azizi-riviera-jvc',
      'Azizi Riviera JVC',
      'azizi',
      'jumeirah-village-circle',
      25.05607,
      55.20562,
      'Jumeirah Village Circle, Dubai',
      780000,
      0,
      2,
      1,
      'Q4 2026',
      '50/50',
      'off_plan',
      'studio',
      ARRAY['entry-price', 'jvc', 'investment'],
      'Accessible studio and apartment collection in JVC for investors and first-time Dubai buyers.',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80',
      false
    )
)
INSERT INTO public.projects (
  slug,
  name,
  developer_id,
  community_id,
  lat,
  lng,
  address,
  starting_price_aed,
  bedrooms_min,
  bedrooms_max,
  bathrooms,
  completion_date,
  payment_plan,
  status,
  category,
  tags,
  description,
  main_image_url,
  featured
)
SELECT
  seed_projects.slug,
  seed_projects.name,
  developers.id,
  communities.id,
  seed_projects.lat,
  seed_projects.lng,
  seed_projects.address,
  seed_projects.starting_price_aed,
  seed_projects.bedrooms_min,
  seed_projects.bedrooms_max,
  seed_projects.bathrooms,
  seed_projects.completion_date,
  seed_projects.payment_plan,
  seed_projects.status,
  seed_projects.category,
  seed_projects.tags,
  seed_projects.description,
  seed_projects.main_image_url,
  seed_projects.featured
FROM seed_projects
LEFT JOIN public.developers ON developers.slug = seed_projects.developer_slug
LEFT JOIN public.communities ON communities.slug = seed_projects.community_slug
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name,
  developer_id = EXCLUDED.developer_id,
  community_id = EXCLUDED.community_id,
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  address = EXCLUDED.address,
  starting_price_aed = EXCLUDED.starting_price_aed,
  bedrooms_min = EXCLUDED.bedrooms_min,
  bedrooms_max = EXCLUDED.bedrooms_max,
  bathrooms = EXCLUDED.bathrooms,
  completion_date = EXCLUDED.completion_date,
  payment_plan = EXCLUDED.payment_plan,
  status = EXCLUDED.status,
  category = EXCLUDED.category,
  tags = EXCLUDED.tags,
  description = EXCLUDED.description,
  main_image_url = EXCLUDED.main_image_url,
  featured = EXCLUDED.featured,
  updated_at = now();

DELETE FROM public.project_images
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE slug IN (
    'burj-crown-downtown',
    'damac-canal-heights',
    'emaar-beachfront-seapoint',
    'palm-beach-towers',
    'bluewaters-bay',
    'sobha-creek-vistas',
    'golf-grand-dubai-hills',
    'azizi-riviera-jvc'
  )
);

WITH project_gallery (project_slug, image_url, sort_order) AS (
  VALUES
    ('burj-crown-downtown', 'https://images.unsplash.com/photo-1546412414-e1885259563a?auto=format&fit=crop&w=1200&q=80', 1),
    ('burj-crown-downtown', 'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1200&q=80', 2),
    ('damac-canal-heights', 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80', 1),
    ('emaar-beachfront-seapoint', 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80', 1),
    ('palm-beach-towers', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80', 1),
    ('bluewaters-bay', 'https://images.unsplash.com/photo-1499793983690-e29da59ef1c2?auto=format&fit=crop&w=1200&q=80', 1),
    ('sobha-creek-vistas', 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1200&q=80', 1),
    ('golf-grand-dubai-hills', 'https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=1200&q=80', 1),
    ('azizi-riviera-jvc', 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80', 1)
)
INSERT INTO public.project_images (project_id, url, sort_order)
SELECT projects.id, project_gallery.image_url, project_gallery.sort_order
FROM project_gallery
JOIN public.projects ON projects.slug = project_gallery.project_slug;

DELETE FROM public.project_amenities
WHERE project_id IN (
  SELECT id FROM public.projects
  WHERE slug IN (
    'burj-crown-downtown',
    'damac-canal-heights',
    'emaar-beachfront-seapoint',
    'palm-beach-towers',
    'bluewaters-bay',
    'sobha-creek-vistas',
    'golf-grand-dubai-hills',
    'azizi-riviera-jvc'
  )
);

WITH amenities (project_slug, name, icon) AS (
  VALUES
    ('burj-crown-downtown', 'Infinity pool', 'waves'),
    ('burj-crown-downtown', 'Concierge', 'bell'),
    ('damac-canal-heights', 'Canal promenade', 'map-pin'),
    ('damac-canal-heights', 'Wellness deck', 'sparkles'),
    ('emaar-beachfront-seapoint', 'Private beach', 'umbrella'),
    ('emaar-beachfront-seapoint', 'Marina access', 'anchor'),
    ('palm-beach-towers', 'Beach club', 'waves'),
    ('palm-beach-towers', 'Sky lounge', 'building-2'),
    ('bluewaters-bay', 'Sea-view pool', 'waves'),
    ('bluewaters-bay', 'Retail promenade', 'shopping-bag'),
    ('sobha-creek-vistas', 'Creek views', 'sun'),
    ('sobha-creek-vistas', 'Fitness center', 'dumbbell'),
    ('golf-grand-dubai-hills', 'Golf course views', 'flag'),
    ('golf-grand-dubai-hills', 'Family park', 'trees'),
    ('azizi-riviera-jvc', 'Smart layouts', 'home'),
    ('azizi-riviera-jvc', 'Community pool', 'waves')
)
INSERT INTO public.project_amenities (project_id, name, icon)
SELECT projects.id, amenities.name, amenities.icon
FROM amenities
JOIN public.projects ON projects.slug = amenities.project_slug;
