-- Optional, project-specific digital-twin model rendered on top of Mapbox.
-- The heavy GLB stays on the media CDN; Postgres stores only placement metadata.
alter table public.projects
  add column if not exists model_3d_url text,
  add column if not exists model_3d_enabled boolean not null default false,
  add column if not exists model_3d_lat double precision,
  add column if not exists model_3d_lng double precision,
  add column if not exists model_3d_altitude double precision not null default 0,
  add column if not exists model_3d_scale double precision not null default 1,
  add column if not exists model_3d_rotation double precision not null default 0;

comment on column public.projects.model_3d_url is
  'Public HTTPS URL of a self-contained GLB digital-twin model.';
comment on column public.projects.model_3d_lat is
  'Optional model anchor latitude; falls back to the project marker latitude.';
comment on column public.projects.model_3d_lng is
  'Optional model anchor longitude; falls back to the project marker longitude.';
comment on column public.projects.model_3d_altitude is
  'Model base altitude in metres.';
comment on column public.projects.model_3d_scale is
  'Multiplier applied to the GLB, whose units should be metres.';
comment on column public.projects.model_3d_rotation is
  'Clockwise heading in degrees.';

alter table public.projects
  drop constraint if exists projects_model_3d_url_https,
  add constraint projects_model_3d_url_https
    check (model_3d_url is null or model_3d_url ~ '^https://');

alter table public.projects
  drop constraint if exists projects_model_3d_scale_positive,
  add constraint projects_model_3d_scale_positive
    check (model_3d_scale > 0 and model_3d_scale <= 10000);

alter table public.projects
  drop constraint if exists projects_model_3d_rotation_range,
  add constraint projects_model_3d_rotation_range
    check (model_3d_rotation >= -360 and model_3d_rotation <= 360);
