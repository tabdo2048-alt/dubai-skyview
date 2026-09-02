
-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
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

CREATE POLICY "Users view own role" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Developers
CREATE TABLE public.developers (
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
CREATE POLICY "Public read developers" ON public.developers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write developers" ON public.developers FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_developers_updated BEFORE UPDATE ON public.developers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Communities
CREATE TABLE public.communities (
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
CREATE POLICY "Public read communities" ON public.communities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write communities" ON public.communities FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_communities_updated BEFORE UPDATE ON public.communities FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Projects
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  developer_id UUID REFERENCES public.developers(id) ON DELETE SET NULL,
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
GRANT SELECT ON public.projects TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read projects" ON public.projects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write projects" ON public.projects FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_projects_community ON public.projects(community_id);
CREATE INDEX idx_projects_developer ON public.projects(developer_id);
CREATE INDEX idx_projects_featured ON public.projects(featured);

-- Project images
CREATE TABLE public.project_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_images TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_images TO authenticated;
GRANT ALL ON public.project_images TO service_role;
ALTER TABLE public.project_images ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read project_images" ON public.project_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write project_images" ON public.project_images FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Project amenities
CREATE TABLE public.project_amenities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_amenities TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_amenities TO authenticated;
GRANT ALL ON public.project_amenities TO service_role;
ALTER TABLE public.project_amenities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read project_amenities" ON public.project_amenities FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Admin write project_amenities" ON public.project_amenities FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Auto-assign 'user' role and first user becomes admin
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  SELECT NOT EXISTS (SELECT 1 FROM public.user_roles WHERE role = 'admin') INTO is_first;
  IF is_first THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'user');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
