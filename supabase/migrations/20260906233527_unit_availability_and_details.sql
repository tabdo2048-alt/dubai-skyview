-- Matches the migration version returned by the connected production database.
-- Additive only: no existing rows, columns or access policies are removed.
alter table public.project_unit_types
  add column availability text not null default 'available' check (availability in ('available', 'reserved', 'sold')),
  add column bedrooms integer check (bedrooms >= 0),
  add column bathrooms integer check (bathrooms >= 0),
  add column view_description text;
comment on column public.project_unit_types.availability is 'Unit sales availability; distinct from project construction status.';
