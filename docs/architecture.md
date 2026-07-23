# Dubai Skyview - Project Structure & Data Tree

## File Structure

```
dubai-skyview/
├── 📄 Configuration Files
│   ├── package.json              # Project dependencies & scripts
│   ├── vite.config.ts            # Vite bundler configuration
│   ├── tsconfig.json             # TypeScript configuration
│   ├── eslint.config.js          # Linting rules
│   ├── components.json           # shadcn/ui component registry
│   ├── bunfig.toml               # Bun runtime config
│   ├── vercel.json               # Vercel deployment config
│   └── SUPABASE_SETUP.md         # Database setup guide
│
├── 📂 public/
│   └── models/                   # 3D models & assets for map
│       └── README.md
│
├── 📂 src/
│   ├── 🎯 Core App Files
│   │   ├── router.tsx            # TanStack Router configuration
│   │   ├── routeTree.gen.ts      # Auto-generated route tree
│   │   ├── server.ts             # Server-side rendering setup
│   │   ├── start.ts              # App entry point
│   │   ├── styles.css            # Global styles
│   │   └── store/
│   │       └── filters.ts        # Global filter state management
│   │
│   ├── 📚 Routes (TanStack Router)
│   │   ├── __root.tsx            # Root layout
│   │   ├── index.tsx             # Home page
│   │   ├── auth.tsx              # Authentication page
│   │   ├── communities.index.tsx # Communities listing
│   │   ├── developers.index.tsx  # Developers listing
│   │   ├── projects.$slug.tsx    # Project detail page (dynamic)
│   │   └── _authenticated/       # Protected routes
│   │
│   ├── 🗺️ Components
│   │   ├── layout/
│   │   │   ├── AppNavbar.tsx     # Top navigation bar
│   │   │   └── AppSidebar.tsx    # Sidebar navigation
│   │   │
│   │   ├── map/
│   │   │   ├── MapContainer.tsx  # Main map wrapper
│   │   │   ├── MapboxView.tsx    # Mapbox integration
│   │   │   ├── CloudLayer.ts     # Cloud overlay layer
│   │   │   ├── WaterLayer.ts     # Water/lake layer
│   │   │   ├── AdminLocationPicker.tsx # Admin tools
│   │   │   └── ProjectPopup.tsx  # Project info popup
│   │   │
│   │   └── ui/                   # shadcn/ui components
│   │       ├── accordion.tsx
│   │       ├── alert.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── dialog.tsx
│   │       ├── dropdown-menu.tsx
│   │       ├── input.tsx
│   │       ├── navigation-menu.tsx
│   │       ├── select.tsx
│   │       ├── sidebar.tsx
│   │       ├── table.tsx
│   │       ├── tabs.tsx
│   │       └── ...more UI components
│   │
│   ├── 🔧 Hooks
│   │   ├── use-auth.ts           # Authentication state
│   │   ├── use-map-config.ts     # Map configuration
│   │   ├── use-mobile.tsx        # Responsive detection
│   │   └── use-projects.ts       # Projects data fetching
│   │
│   ├── 🔗 Integrations
│   │   └── supabase/             # Database integration
│   │       └── types.ts
│   │
│   └── 📖 Lib (Utilities & Configs)
│       ├── types.ts              # TypeScript type definitions
│       ├── config.functions.ts   # Configuration helpers
│       ├── utils.ts              # Utility functions
│       ├── error-capture.ts      # Error handling
│       ├── error-page.ts         # Error UI
│       ├── lovable-error-reporting.ts
│       ├── dubai.ts              # Dubai data/constants
│       ├── water.ts              # Water features data
│       ├── metro.ts              # Metro network data
│       ├── metroAccurate.ts      # Accurate metro data
│       ├── metroNetwork.generated.ts # Generated metro network
│       └── mapbox/               # Mapbox utilities
│
├── 📂 supabase/
│   ├── config.toml               # Supabase configuration
│   └── migrations/               # Database migrations
│       ├── 20260707195923_*.sql  # Initial setup
│       ├── 20260707195936_*.sql  # Schema updates
│       └── 20260707200009_*.sql  # More updates
│
└── docs/                        # Documentation
    ├── architecture.md          # This file
    ├── map-performance.md       # Map load/perf notes
    ├── water-layer.md           # Water styling & geometry
    └── geodata.md               # Regenerating metro/road/water data
```

---

## 📊 Data Structure & Type Hierarchy

### Core Data Models

```
Database (Supabase)
├── 📋 Tables
│   ├── projects
│   │   ├── id (UUID)
│   │   ├── name
│   │   ├── slug
│   │   ├── description
│   │   ├── location
│   │   ├── coordinates (lat, lng)
│   │   ├── price_range
│   │   ├── bedrooms
│   │   ├── category
│   │   ├── status
│   │   ├── developer_id (FK)
│   │   ├── community_id (FK)
│   │   ├── created_at
│   │   └── updated_at
│   │
│   ├── developers
│   │   ├── id (UUID)
│   │   ├── name
│   │   ├── slug
│   │   ├── description
│   │   ├── logo_url
│   │   └── contact_info
│   │
│   ├── communities
│   │   ├── id (UUID)
│   │   ├── name
│   │   ├── slug
│   │   ├── description
│   │   ├── coordinates (center)
│   │   └── properties
│   │
│   ├── project_images
│   │   ├── id (UUID)
│   │   ├── project_id (FK)
│   │   ├── image_url
│   │   ├── alt_text
│   │   └── order
│   │
│   └── project_amenities
│       ├── id (UUID)
│       ├── project_id (FK)
│       ├── amenity_name
│       └── amenity_category
```

### TypeScript Type Definitions

```typescript
// Core Types (from lib/types.ts)
├── ProjectRow
│   └── Supabase table row for projects
│
├── DeveloperRow
│   └── Supabase table row for developers
│
├── CommunityRow
│   └── Supabase table row for communities
│
├── ProjectImageRow
│   └── Supabase table row for project images
│
├── ProjectAmenityRow
│   └── Supabase table row for project amenities
│
├── ProjectWithRelations (Enriched Type)
│   ├── ...ProjectRow properties
│   ├── developer: { id, name, slug } | null
│   ├── community: { id, name, slug } | null
│   ├── images: ProjectImageRow[]
│   └── amenities: ProjectAmenityRow[]
│
└── ProjectFilters (State Type)
    ├── search: string
    ├── categories: string[]
    ├── statuses: string[]
    ├── communities: string[]
    ├── tags: string[]
    ├── minPrice: number | null
    ├── maxPrice: number | null
    └── bedrooms: number | null
```

---

## 🔄 Data Flow Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         UI Layer (React)                         │
├─────────────────────────────────────────────────────────────────┤
│  Routes: index.tsx, projects.$slug.tsx, communities.index.tsx   │
│  Components: MapContainer, ProjectPopup, AppNavbar              │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    State Management Layer                        │
├─────────────────────────────────────────────────────────────────┤
│  • TanStack Router - Route state & navigation                   │
│  • TanStack Query - Server state caching                        │
│  • store/filters.ts - Global filter state                       │
│  • Hooks: use-projects, use-auth, use-map-config               │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    Data Access Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  • @supabase/supabase-js - Database client                      │
│  • integrations/supabase/ - Supabase integration                │
│  • Authentication via @lovable.dev/cloud-auth-js               │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                    Backend Layer                                 │
├─────────────────────────────────────────────────────────────────┤
│  Supabase Cloud:                                                │
│  • PostgreSQL Database (projects, developers, communities)      │
│  • Authentication (JWT tokens)                                  │
│  • Real-time subscriptions                                      │
│  • Row-level security (RLS)                                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🗺️ Map Data Sources

```
Map Layer Structure
├── 📍 Base Map
│   └── Mapbox tile layer
│
├── ☁️ Cloud Layer (CloudLayer.ts)
│   └── Weather/satellite imagery overlay
│
├── 💧 Water Layer (WaterLayer.ts)
│   └── Lakes, water features in Dubai
│
├── 🏗️ Projects Layer
│   ├── GeoJSON markers for each project
│   ├── Project metadata from Supabase
│   └── Interactive popups (ProjectPopup.tsx)
│
├── 🚇 Metro Network Layer
│   ├── metroNetwork.generated.ts - Auto-generated route data
│   ├── metro.ts - Basic metro data
│   └── metroAccurate.ts - Refined metro coordinates
│
└── 📍 Location Features
    ├── Communities zones
    ├── Developer service areas
    └── Custom landmarks
```

---

## 🔌 Key Dependencies

```
Frontend Framework:
├── React (UI library)
├── TanStack Router (routing)
├── TanStack Query (data fetching & caching)
└── TanStack Start (full-stack framework)

Styling & UI:
├── Tailwind CSS (utility-first CSS)
├── @tailwindcss/vite (Vite plugin)
├── shadcn/ui (component library)
└── class-variance-authority (component variants)

Mapping:
├── Mapbox GL JS (interactive maps)
└── GeoJSON utilities

Database & Auth:
├── @supabase/supabase-js (database client)
├── @lovable.dev/cloud-auth-js (authentication)
└── PostgreSQL (backend database)

Form & Validation:
├── react-hook-form (form state)
├── @hookform/resolvers (form validation)
├── zod (schema validation)
└── react-hook-form (field binding)

Utilities:
├── clsx (conditional className)
├── sonner (toast notifications)
└── date-fns (date utilities)
```

---

## Build & Development Pipeline

```
Development:
npm run dev → Vite Dev Server → Hot Module Replacement

Build:
npm run build → Vite Bundler → Optimized Production Build
                            → Deployed to Vercel

Production:
Vercel → Edge Functions → Supabase → Static Assets (CDN)
```

---

## 📝 Component Hierarchy Example

```
__root (AppLayout)
├── AppNavbar
│   └── Navigation menu
└── Routes
    ├── index (HomePage)
    │   └── MapContainer
    │       ├── MapboxView
    │       ├── CloudLayer
    │       ├── WaterLayer
    │       ├── Projects Layer
    │       └── ProjectPopup
    │
    ├── projects.$slug (ProjectDetailPage)
    │   ├── ProjectInfo Card
    │   ├── Image Gallery
    │   ├── Amenities List
    │   └── Map (focused location)
    │
    ├── communities.index (CommunitiesPage)
    │   └── Communities Grid/Table
    │
    └── developers.index (DevelopersPage)
        └── Developers Grid/Table
```

---

## 🔐 Authentication Flow

```
1. User visits app
2. @lovable.dev/cloud-auth-js checks session
3. If no session → auth.tsx route
4. User authenticates via Supabase Auth
5. JWT token stored in session
6. use-auth hook provides auth state
7. Protected routes via _authenticated/ folder
8. Supabase RLS enforces data access
```

---

## 📱 Responsive Design

```
Breakpoints (Tailwind):
├── Mobile (default) - xs to md
├── Tablet (md: 768px) - md to lg
├── Desktop (lg: 1024px) - lg to xl
└── Large Desktop (xl: 1280px+) - xl+

Hook: use-mobile() → Returns boolean for mobile view
      Used for layout switching (AppSidebar vs dropdown)
```

---

## 🗄️ Database Schema Overview

```sql
-- Projects
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  name TEXT,
  slug TEXT UNIQUE,
  description TEXT,
  location JSONB,  -- { lat, lng }
  category TEXT,
  status TEXT,
  price_range JSONB,  -- { min, max }
  bedrooms INTEGER,
  developer_id UUID REFERENCES developers,
  community_id UUID REFERENCES communities,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

-- Developers
CREATE TABLE developers (
  id UUID PRIMARY KEY,
  name TEXT,
  slug TEXT UNIQUE,
  description TEXT,
  logo_url TEXT,
  created_at TIMESTAMP
);

-- Communities
CREATE TABLE communities (
  id UUID PRIMARY KEY,
  name TEXT,
  slug TEXT UNIQUE,
  description TEXT,
  center JSONB,  -- { lat, lng }
  created_at TIMESTAMP
);

-- Project Images (1:many with Projects)
CREATE TABLE project_images (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects,
  image_url TEXT,
  alt_text TEXT,
  order INTEGER
);

-- Project Amenities (1:many with Projects)
CREATE TABLE project_amenities (
  id UUID PRIMARY KEY,
  project_id UUID REFERENCES projects,
  amenity_name TEXT,
  amenity_category TEXT
);
```

---

## Key Features

| Feature | Location | Technology |
|---------|----------|------------|
| Interactive Map | `MapContainer.tsx` | Mapbox GL JS |
| Project Filtering | `store/filters.ts` | TanStack Query + React State |
| Weather Layer | `CloudLayer.ts` | Custom map layer |
| Water Features | `WaterLayer.ts` | GeoJSON + Mapbox |
| Metro Network | `metroNetwork.generated.ts` | Generated data |
| Authentication | `use-auth.ts` | Supabase Auth |
| Project Details | `projects.$slug.tsx` | Dynamic routing |
| Communities View | `communities.index.tsx` | Table/Grid component |
| Developers View | `developers.index.tsx` | Table/Grid component |
| Admin Tools | `AdminLocationPicker.tsx` | Geo location selection |
| Responsive UI | `use-mobile.tsx` | Tailwind + Hook |
| Form Handling | `react-hook-form` | Type-safe forms |

---

*Last updated: 2026-07-10*
