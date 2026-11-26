# Modules 8–11 setup

Use the existing InterTrap project in the Supabase Dashboard. Open **SQL Editor** as the project database administrator. Take a backup or apply this sequence to an authorized test project first. Apply each migration file once and wait for it to commit before starting the next.

1. If the foundation is pending, apply migrations 001, 002, 003 and 004 in order. Run `supabase/seed.sql` and verify the nine categories, 83 topics and profile backfill. Run the Module 4 test before 005 if testing the original grant state. [Module 4 setup](MODULE_4_SETUP.md)
2. If RLS is pending, apply `005_row_level_security.sql`. [Module 5 setup](MODULE_5_SETUP.md)
3. Verify that the database administrator can create roles and that the schema matches the repository migrations. Apply [006_interview_transactions.sql](../supabase/migrations/006_interview_transactions.sql). It adds the scoped writer role, interview versions, an idempotency ledger in a private schema and RPC-only interview writes. Keep `intertrap_private` out of the API's exposed schemas.
4. Apply [007_performance_analytics.sql](../supabase/migrations/007_performance_analytics.sql). It adds authenticated history, performance and weakness-evidence read RPCs.
5. Use two existing dedicated test accounts with profiles. Replace the placeholder UUIDs in [rls_validation.sql](../supabase/tests/rls_validation.sql), [interview_transactions.sql](../supabase/tests/interview_transactions.sql) and [analytics_validation.sql](../supabase/tests/analytics_validation.sql). Run each complete file in its own query. They use fixture data and roll back. The analytics test expects no other records for the dedicated test accounts in February through April 2097.

## Verify the hosted API before deploying

Open two independent signed-in browser sessions with the test accounts. In session A, create, edit and view a disposable interview. In session B, open the same detail URL and expect Interview unavailable. Verify that B's history and analytics exclude A's record. From A, retry an identical create request with the same request ID in a test client and check that the response returns the same interview ID. Verify that a direct table update of A's own interview returns a permission error. Delete only the disposable record through the application when verification is complete.

If a migration fails, read the first error and roll back the session if required. Verify the files already applied and correct the cause before retrying the failed migration. If the hosted API reports a missing RPC immediately after a successful migration, check its schema cache and refresh it if needed.

## Frontend

Use the existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` configuration. Run `npm.cmd ci`, then `npm.cmd run dev` locally. For deployment, run `npm.cmd run build` and use the existing Vercel Vite configuration and SPA rewrite. Verify a direct visit to `/interviews/:id/edit` and the existing sign-in redirect. Deploy the frontend after migration 007 and hosted smoke tests. No Gemini API key is required.

Use `npm.cmd test`, `npm.cmd run lint`, `npm.cmd run build` and `git diff --check` for repository checks. The SQL suites also run in disposable PostgreSQL with separately provisioned test accounts and an Auth fixture.
