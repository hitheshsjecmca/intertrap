# Module 4 setup

## Open the existing project

1. Sign in to the Supabase Dashboard and select your existing **intertrap** project. Confirm the project is the one currently used for InterTrap authentication.
2. In the left sidebar, select **SQL Editor**, then **New query**. Use an administrator session for these scripts. Open a fresh query tab for each file.

## Check the existing schema and authentication triggers

Run this read-only preflight query before applying migrations:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('profiles', 'interviews', 'round_types', 'interview_rounds',
                     'topics', 'round_weaknesses', 'ai_analysis');

SELECT tgname, tgenabled, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal
ORDER BY tgname;

SELECT to_regprocedure('public.handle_new_user()') AS existing_profile_function;
```

On a fresh Module 3 database the first result is empty. Review existing auth triggers and their functions before installing the profile trigger. If a table or function already exists or an existing trigger also writes profiles, inspect the deployed definitions and reconcile the conflict before proceeding. Preserve unrelated triggers.

## Apply the files in this order

For each file, open it in the repository, copy its entire contents to the SQL Editor and click **Run**. Confirm the current file completed before opening the next one.

1. [001_initial_schema.sql](../supabase/migrations/001_initial_schema.sql)
2. [002_indexes.sql](../supabase/migrations/002_indexes.sql)
3. [003_database_triggers.sql](../supabase/migrations/003_database_triggers.sql)
4. [004_user_profiles.sql](../supabase/migrations/004_user_profiles.sql)
5. [seed.sql](../supabase/seed.sql)

Each file has its own transaction. Run each migration once. The seed can be rerun.

## Verify the database and backfill

Open **Table Editor**, select the **public** schema and confirm the seven application tables are listed. Check the RLS state of each table in the dashboard or with the catalog query below.

Run these queries in SQL Editor:

```sql
SELECT rt.slug, rt.name, count(t.id) AS topic_count
FROM public.round_types AS rt
LEFT JOIN public.topics AS t ON t.round_type_id = rt.id
GROUP BY rt.slug, rt.name
ORDER BY rt.slug;

SELECT (SELECT count(*) FROM public.round_types) AS round_types,
       (SELECT count(*) FROM public.topics) AS topics;

SELECT count(*) AS users_missing_profiles
FROM auth.users AS u
LEFT JOIN public.profiles AS p ON p.id = u.id
WHERE p.id IS NULL;

SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'interviews', 'round_types', 'interview_rounds',
                    'topics', 'round_weaknesses', 'ai_analysis')
ORDER BY tablename;
```

A fresh install has 9 round types, 83 topics, zero users missing profiles and seven `rowsecurity = true` rows.

## Test a new registration

A failing `auth.users` trigger can roll back sign-up. Use a dedicated registration you are authorized to create, preferably in an existing test environment. Launch InterTrap with `npm.cmd run dev`, open Register, enter a recognizable test name and sign up. Complete email verification if the project requires it. In the dashboard, open **Authentication**, then **Users**, and copy the test account UUID. In SQL Editor run the following after replacing the placeholder UUID:

```sql
SELECT p.id, p.full_name,
       u.raw_user_meta_data ->> 'full_name' AS signup_name
FROM auth.users AS u
JOIN public.profiles AS p ON p.id = u.id
WHERE u.id = '00000000-0000-0000-0000-000000000000'::uuid;
```

Expect one row with the same name in both fields. Then verify login, opening the protected dashboard and logout through the app.

## Run the rollback-based tests

Run the Module 4 validation before migration 005. After 005, use the [Module 5 RLS suite](MODULE_5_SETUP.md) to verify the client grants and policies.

Copy [database_validation.sql](../supabase/tests/database_validation.sql) into SQL Editor. Leave the test-user setting blank for schema, grants, seed, timestamp-function and profile coverage checks. For the full fixture suite, paste an existing dedicated test user UUID between the empty quotes in `set_config('intertrap.test_user_id', '', true)`. Run the whole script, including `ROLLBACK`. The script creates temporary fixtures and never writes to `auth.users` or modifies an existing profile. An identity sequence may still advance when a fixture is inserted. A blank setting skips the interview fixture tests. Manual registration above verifies the signup trigger separately.

## Troubleshooting

- **Already exists or duplicate key during migration.** Look at the first error and its file and line. Use the preflight queries and Table Editor to compare what is deployed with the repository. A successful earlier migration remains committed. Preserve tables and data while resolving any mismatch.
- **Current transaction is aborted.** Run `ROLLBACK;` if the editor session still has an open failed transaction. Fix the first error before rerunning the failed file.
- **Permission denied.** Verify that you are running the script as the SQL Editor administrator and that you selected the intended project. Client roles have no access in Module 4.
- **Registration returns a database error.** Check the project's Auth and Postgres logs for the underlying error. Inspect the new trigger and any existing signup automation. In a confirmed incident, an administrator can temporarily disable just `intertrap_create_user_profile` on `auth.users`, repair and re-enable it, then rerun the backfill INSERT in migration 004 and repeat the test.
- **Missing categories or topics.** Verify migration 001 committed, then check the seed run for an error, including existing names that conflict with a different slug. Compare the catalog with the expected values in the seed file before rerunning.

[Supabase user management and signup triggers](https://supabase.com/docs/guides/auth/managing-user-data)
