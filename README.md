# InterTrap — Build Yourself

InterTrap is a private interview performance workspace for students and job seekers, built with React, Vite and Supabase. Record interviews and dynamic rounds, identify practice topics, revisit past outcomes and inspect performance over time. I.R.I.S. provides scripted guidance and optional browser speech.

## Run locally

```powershell
npm.cmd ci
npm.cmd run dev
```

Use the existing Supabase project configuration with `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in the ignored `.env.local` file. Follow the [Modules 8–11 setup](docs/MODULE_8_11_SETUP.md) before running the updated frontend against Supabase.

## Architecture and features

| Module | Implementation | Documentation |
| --- | --- | --- |
| 4 | PostgreSQL schema, profiles and shared catalogs | [Setup](docs/MODULE_4_SETUP.md) · [Design](docs/DATABASE_DESIGN.md) |
| 5 | Owner-scoped row-level security | [Setup](docs/MODULE_5_SETUP.md) · [Security](docs/RLS_SECURITY.md) |
| 6–7 | Protected workspace and dynamic interview form | [Frontend](docs/MODULE_6_FRONTEND.md) · [Form foundation](docs/MODULE_7_INTERVIEW_FORM.md) |
| 8 | Atomic save, details, edit and delete, paginated history | [Interview CRUD](docs/MODULE_8_INTERVIEW_CRUD.md) |
| 9 | RPC-only mutations, idempotency, progression and version checks | [Transactions](docs/MODULE_9_TRANSACTIONS.md) |
| 10 | Owned aggregate analytics, readiness and topic evidence | [Formulas and analytics](docs/MODULE_10_ANALYTICS.md) |
| 11 | HUD, interactive charts and deterministic I.R.I.S. | [HUD design](docs/MODULE_11_HUD_DESIGN.md) |

Apply any pending migrations 001–004, seed the catalogs, then apply 005, 006 and 007. Each user sees only their own private records. PostgreSQL is authoritative for progression and ownership. Charts use server aggregates, and readiness depends on observed outcomes and coverage. Drafts are in memory until a confirmed save. A stale edit must be reconciled against the latest record. Gemini integration is planned for Module 12.

## Verification

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

The setup guide describes rollback SQL fixtures and two-session hosted API checks. Keep the existing Vercel rewrite for protected React Router deep links.
