# Supabase Configuration Guide

## What is Supabase in This Project?

Supabase is the backend database and authentication service used for:
- **User authentication** (login/signup)
- **Project data storage** (real estate listings)
- **Filtering & search** (property queries)
- **Admin panel** (manage projects)

Current Supabase project: `tabdo2048-alt/dubai-skyview`

---

## Step 1: Create Your Own Supabase Project

1. Go to [supabase.com](https://supabase.com)
2. Sign up or login with GitHub
3. Click **"New Project"**
4. Fill in:
   - **Project name**: e.g., `dubai-map-alt`, `dubai-properties`
   - **Database password**: Generate a strong one (save it!)
   - **Region**: `Europe (Frankfurt)` or closest to your region
5. Click **"Create new project"** (takes ~1-2 minutes)

---

## Step 2: Get Your Supabase Credentials

After project creation, go to **Settings → API**:

You'll see:
- **Project URL**: `https://xxxx.supabase.co`
- **Anon Key**: `eyJhbGc...` (public key for frontend)
- **Service Role Key**: `eyJhbGc...` (secret key for backend)

---

## Step 3: Update Environment Variables

Edit `.env` in the project root:

```env
# Before (old project)
VITE_SUPABASE_URL=https://tabdo2048-alt.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...old-key...

# After (your new project)
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGc...your-new-key...
```

**Important**: 
- Never commit `.env` to Git (it contains secrets)
- Check `.env` is in `.gitignore` ✓ (already is)

---

## Step 4: Set Up Database Tables

Your new Supabase project is empty. You need to recreate the tables:

### Option A: SQL Script (Fastest)

Go to **SQL Editor** in Supabase dashboard and run:

```sql
-- Projects table
CREATE TABLE projects (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  location POINT NOT NULL,
  price BIGINT,
  image_url TEXT,
  category TEXT,
  status TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can view projects)
CREATE POLICY "Enable read access for all users" ON projects
  FOR SELECT USING (TRUE);

-- Only admins can insert/update/delete
CREATE POLICY "Enable insert for service role" ON projects
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Create index for location queries
CREATE INDEX idx_projects_location ON projects USING GIST (location);
```

### Option B: Migrate from Old Project

If you want to copy projects from the old Supabase:

```bash
# Export old data
supabase db dump --db-url "postgresql://postgres:password@old-db.supabase.co:5432/postgres" > old_data.sql

# Import to new project
psql postgresql://postgres:password@new-db.supabase.co:5432/postgres < old_data.sql
```

---

## Step 5: Add Authentication (Optional)

If you want user login/signup:

1. Go to **Auth → Users** in Supabase dashboard
2. Create a test user:
   - Email: `test@example.com`
   - Password: Generate strong password
3. In your `.env`, optionally add:
   ```env
   VITE_SUPABASE_AUTH_REDIRECT_URL=http://localhost:5173
   ```

---

## Step 6: Test the Connection

Start the dev server:

```bash
npm run dev
```

Open browser console (F12) and check:
- ✅ No auth errors
- ✅ Projects load from your new Supabase
- ✅ Filters/search work

---

## Supabase File Locations in Project

| File | Purpose |
|------|---------|
| `src/hooks/use-projects.ts` | Fetch projects from Supabase |
| `src/hooks/use-map-config.ts` | Get map settings |
| `src/store/supabase.ts` | Supabase client setup |
| `.env` | API keys (not in Git) |
| `supabase/migrations/` | SQL schema files (optional) |

---

## Common Tasks

### Add a New Project (Property)

```typescript
// src/hooks/use-projects.ts
const { data, error } = await supabase
  .from('projects')
  .insert({
    title: 'New Property',
    description: 'Luxury villa in Palm',
    location: '55.138, 25.1', // lng, lat
    price: 5000000,
    image_url: 'https://...',
    category: 'villa',
    status: 'ready'
  });
```

### Query Projects by Location (Radius)

```typescript
// Get projects within 5km of a point
const { data } = await supabase.rpc('nearby_projects', {
  lat: 25.1972,
  lng: 55.2744,
  radius_km: 5
});
```

### Update Project

```typescript
await supabase
  .from('projects')
  .update({ price: 6000000 })
  .eq('id', projectId);
```

---

## Backup Your Data

Go to **Settings → Backups** and:
1. Enable daily automatic backups
2. Or download manual backup anytime

---

## Troubleshooting

**Q: Projects not loading?**
- Check `.env` has correct `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- Check browser console for CORS errors
- Verify Row Level Security policies allow public read

**Q: Can't insert/update projects?**
- Check you're using `Service Role Key` for admin operations
- Verify RLS policies (should allow `service_role`)

**Q: Getting "401 Unauthorized"?**
- Anon key might be expired
- Regenerate it in **Settings → API → Regenerate**

**Q: How do I revert to old project?**
- Update `.env` back to old project credentials
- No code changes needed (Supabase API is the same)

---

## Next Steps

1. ✅ Create new Supabase project
2. ✅ Update `.env` with new credentials
3. ✅ Set up database tables (SQL script above)
4. ✅ Test locally (`npm run dev`)
5. ✅ Deploy (your hosting platform)

For more help: [Supabase Docs](https://supabase.com/docs)
