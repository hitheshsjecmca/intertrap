# InterTrap — Build Yourself

InterTrap is an interview performance workspace for students and job seekers, built with React, Vite and Supabase. It supports registration, login, logout and session restoration. Its protected workspace includes navigation, an account profile and a four-step interview preview.

## Run locally

```powershell
npm.cmd ci
npm.cmd run dev
```

Use the existing Supabase configuration with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the ignored `.env.local` file.

## Database and workspace modules

| Module | Repository implementation | Documentation |
| --- | --- | --- |
| 4 | PostgreSQL schema, profile backfill, round categories and topics | [Setup](docs/MODULE_4_SETUP.md) · [Design](docs/DATABASE_DESIGN.md) · [ER diagram](docs/ER_DIAGRAM.md) · [Future queries](docs/DATABASE_QUERIES.md) |
| 5 | Grants and row-level security for owner-scoped access and read-only catalogs | [Setup](docs/MODULE_5_SETUP.md) · [Security](docs/RLS_SECURITY.md) |
| 6 | Responsive protected layout, dashboard, feature pages and account details | [Frontend](docs/MODULE_6_FRONTEND.md) |
| 7 | Dynamic rounds, weakness selections, progression and a validated in-memory preview | [Interview form](docs/MODULE_7_INTERVIEW_FORM.md) |

Apply migrations 001–004 and the seed if Module 4 is pending, then apply migration 005. The setup guides include preflight checks, a rollback-based SQL suite and two-session API verification. The form requires a signed-in session and the seeded Supabase catalog. Interview previews are kept in memory for the current page. Persistence, transactional progression, analytics, charts and AI insights are planned for later modules.

## Checks

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```
