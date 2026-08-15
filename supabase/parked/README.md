# Parked migrations — written, reviewed, NOT applied yet

These three files are valid migrations that have **not been applied** to the live
Supabase project (`fdqbdqsmaguxdnaftxbq`). They sit here rather than in
`supabase/migrations/` so a `supabase db push` cannot apply them at a moment of
its own choosing, and so the migrations directory reflects what the database
actually contains.

**To apply them, paste `supabase/APPLY_THIS_4.sql` into the Supabase SQL Editor.**
That file is these three migrations concatenated in order inside one transaction.
Then move these files into `supabase/migrations/` and delete this README.

## History: why they were parked

The app code that called them shipped before the SQL did. `is_current_user_blocked`
did not exist in the database, so every
`POST /rest/v1/rpc/is_current_user_blocked` returned **404**, and the login path
treated that error as fatal:

```
Could not verify account status.
```

The check failed closed, so **no account could sign in** — not just blocked ones.

## Current state: the app works either way

The block checks are back in `src/routes/auth.tsx`,
`src/routes/_authenticated/route.tsx` and
`src/integrations/supabase/auth-middleware.ts`, but they now tolerate exactly one
error: PostgREST code **`PGRST202`** ("function not found in schema cache"). When
the SQL is unapplied, `user_blocks` does not exist, so nobody can be blocked and
"not blocked" is the correct answer. Every other error still fails closed. See
`isCurrentUserBlocked()` in `src/integrations/supabase/saas.ts`.

The platform Users list renders a **Block** button that stays disabled while
`u.blocked === undefined` — precisely the unapplied case, because the live
`platform_list_users()` does not return that column. Applying the SQL makes the
button enable itself; no code change required.

So: blocking is inert until the SQL runs, and nothing is broken in the meantime.

## What applying the SQL changes

- New table `public.user_blocks` (service-role only, RLS enabled).
- `has_role()`, `current_tenant_ids()` and `is_tenant_member()` are **rewritten**
  to deny a blocked user. A blocked account's existing access token stops reading
  and writing rows immediately, not only at next sign-in.
- `platform_set_user_blocked()` — only `ashraf@admin.com` (via
  `is_suspend_override()`, matched case- and whitespace-insensitively on the auth
  email) may block another platform administrator. Nobody can block themselves.
  The rule lives in SECURITY DEFINER SQL, so the browser cannot bypass it.
- `platform_list_users()` / `platform_list_tenants()` gain the `blocked`,
  `can_block_platform_admins` and `can_suspend_platform_admins` columns the UI
  reads.
- Two indexes for the project-image and project-list queries.
