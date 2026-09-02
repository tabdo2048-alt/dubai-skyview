-- Exact public storage URLs must not bypass project visibility.
-- The application signs internal project-media URLs after checking the same
-- project visibility policy, so making the bucket private closes the remaining
-- object-download bypass left by the old public bucket setting.

UPDATE storage.buckets
SET public = false
WHERE id = 'project-media';

