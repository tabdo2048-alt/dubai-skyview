# Repository Guidelines

## Project Structure & Module Organization

- `src/routes/` contains TanStack Router file-based pages; protected pages belong under `src/routes/_authenticated/`.
- `src/components/` contains reusable UI, layout, map, popup, and offer components. Radix/shadcn primitives live in `src/components/ui/`.
- `src/hooks/`, `src/lib/`, and `src/store/` hold data access, shared utilities/map data, and Zustand state respectively.
- `src/pdf/` contains the dynamic sales-offer PDF renderer and its styles.
- `public/` stores static assets and 3D models; `scripts/` generates or validates geographic data.
- `supabase/migrations/` contains ordered database migrations and `supabase/` also contains seed/configuration files. There is no dedicated automated test directory currently.

## Build, Test, and Development Commands

```bash
npm install                         # install dependencies
npm run dev                         # start Vite with HMR
npx vite dev --port 8080            # start on the project's fixed local port
npx tsc --noEmit                    # strict type-check
npm run lint                        # ESLint
npm run build                       # production client and SSR build
npm run format                      # format with Prettier
```

For map/geodata changes, also run the relevant `npm run validate:*` or `npm run verify:*` command. Apply database changes with `supabase db push` only after reviewing the migration and target project.

## Coding Style & Naming Conventions

Use TypeScript/TSX, two-space indentation, semicolons, double quotes, and a 100-character print width (`.prettierrc`). Components and routes use PascalCase or TanStack’s file-route naming; hooks use `use-kebab-name.ts`; utility functions use camelCase. Prefer existing shared helpers and UI primitives over duplicated logic. Keep heavy map/PDF code lazy-loaded where practical.

## Testing Guidelines

No test runner or coverage threshold is configured. Before submitting changes, run `npx tsc --noEmit`, `npm run lint`, and `npm run build`. Manually verify affected routes, Supabase data states, and both Satellite and 3D map modes; PDF changes should be checked in the browser and with missing/optional data.

## Commit & Pull Request Guidelines

Recent history uses short, informal imperative summaries and has no enforced conventional format. Prefer `type(scope): summary` (for example, `fix(pdf): preserve dynamic installments`). PRs should explain behavior changes, list database migrations/configuration steps, include screenshots for UI/PDF work, and mention validation commands run.

## Security & Configuration

Keep secrets in `.env`; never commit service-role, Stripe, Mapbox, or Supabase private keys. Preserve Supabase RLS and tenant ownership checks when adding tables or writes. Do not persist signed/expiring media URLs back to the database.
