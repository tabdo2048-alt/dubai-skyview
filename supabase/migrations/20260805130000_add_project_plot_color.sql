-- Per-project colour for the plot boundary (fill + outline on the public map).
-- Nullable — null renders as the default gold.
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS plot_color text;
