# Module 5 setup

This guide describes migration 005. Migration 006 moves direct interview writes to RPCs. Use the [Modules 8–11 setup](MODULE_8_11_SETUP.md) for the current hosted API smoke test.

Open the existing **intertrap** project in the Supabase Dashboard and choose **SQL Editor → New query**. Use the project administrator session to apply SQL.

1. If Module 4 is pending, follow the [Module 4 preflight](MODULE_4_SETUP.md). Run migrations `001_initial_schema.sql`, `002_indexes.sql`, `003_database_triggers.sql` and `004_user_profiles.sql`, then `supabase/seed.sql`. Run the Module 4 validation before 005 because it checks that frontend grants are absent.
2. If Module 4 is already installed, confirm the seven tables, profile backfill, nine categories and 83 topics. The seed can be rerun. Apply completed migration files only once.
3. Inspect existing policies before adding new ones:

   ```sql
   SELECT tablename, policyname, cmd, roles
   FROM pg_catalog.pg_policies
   WHERE schemaname = 'public'
     AND tablename IN ('profiles', 'interviews', 'round_types', 'interview_rounds',
                       'topics', 'round_weaknesses', 'ai_analysis')
   ORDER BY tablename, policyname;
   ```

4. Copy [005_row_level_security.sql](../supabase/migrations/005_row_level_security.sql) into a fresh query and run it. The migration is transactional and stops if a policy already exists on a target table. Inspect unexpected policies or grants before retrying. Preserve data and any authorized custom policy decisions.
5. In Table Editor, confirm RLS is enabled on each application table. Run the policy query again and review the 17 operation-specific policies.
6. Copy [rls_validation.sql](../supabase/tests/rls_validation.sql) into a fresh query. Replace the two placeholder UUIDs with distinct existing dedicated users that already have profiles, then run the whole file. The script makes rollback-only interview fixtures, switches database roles and supplies simulated JWT claims. It never inserts or updates Auth accounts.

If an error leaves the transaction open, run `ROLLBACK;` and inspect the first error. A missing catalog fixture generally means the seed is pending. A missing profile means the Module 4 profile backfill or signup trigger needs checking.

## Verify real Supabase API sessions

Use the following direct CRUD checks only when testing migration 005 before 006.

Use an authorized test project or dedicated test accounts. Sign in as User A and User B in separate browser profiles, or use separate Supabase SDK clients with separate session storage. Use the public publishable client configuration.

1. In User B's session, create a disposable interview through `supabase.from('interviews').insert({ company_name: 'RLS test fixture' }).select('id').single()`. Save its returned ID.
2. In User A's session, query `supabase.from('interviews').select('id').eq('id', fixtureId)`. Expect an empty result. Apply the same filter to update and delete requests with a trailing `.select('id')`. Expect no affected row.
3. Try inserting a round with that interview ID using an actual category ID from the shared catalog. Expect a permission error. Check that A can read A's own profile and the shared catalog, and that a fresh unsigned client cannot read private data.
4. Verify B can still read B's fixture, then delete only that disposable fixture while signed in as B. For additional database-level cases, use the rollback suite above.

SQL role simulation exercises grants and row filters. The two-session API check also exercises GoTrue token issuance and PostgREST's client role mapping. Keep access tokens and project credentials out of console output and screenshots.

[Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)
