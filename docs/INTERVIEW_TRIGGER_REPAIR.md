# Interview save error 42703

The checked-in migrations define `public.round_weaknesses.round_type_id` in 001 and attach `public.prepare_round_weakness()` only to that table in 003. It is a row-level BEFORE INSERT OR UPDATE trigger. Both create and update in 006 call `intertrap_private.write_interview_children`, which writes weaknesses without specifying the category column. The trigger derives it from the parent round for a predefined topic, sets it to NULL for a custom topic, and normalizes custom names. The composite foreign keys independently require predefined topics to match the round category. Migration 002 covers normalized custom uniqueness. Migrations 004 and 005 govern profile creation and client access. Migrations 007 and 008 read the stored relationship for analytics and AI context and do not install another weakness trigger.

PostgreSQL exposes the triggering relation's row through `NEW`. Error `42703` with `record "new" has no field "round_type_id"` establishes that the running trigger accessed a row shape lacking that column. Hosted schema drift is the leading explanation. The exact hosted catalog state needs the read-only checks below. A misplaced copy of the repository function on a table that also lacks `topic_id` would ordinarily fail on `topic_id` first, so the exact reported field makes a missing column on `round_weaknesses` especially plausible. A different hosted function body may change that order. [PostgreSQL trigger variables](https://www.postgresql.org/docs/current/plpgsql-trigger.html)

## Read-only hosted diagnosis

Run in the existing project's SQL Editor:

```sql
SELECT table_schema, table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('round_weaknesses', 'interview_rounds', 'topics')
  AND column_name IN ('id', 'round_id', 'topic_id', 'custom_topic', 'round_type_id')
ORDER BY table_name, ordinal_position;

SELECT ns.nspname AS table_schema, r.relname AS table_name, t.tgname,
       t.tgenabled, fn.oid::regprocedure AS trigger_function,
       pg_get_triggerdef(t.oid) AS trigger_definition,
       pg_get_functiondef(fn.oid) AS function_definition
FROM pg_trigger t
JOIN pg_class r ON r.oid = t.tgrelid
JOIN pg_namespace ns ON ns.oid = r.relnamespace
JOIN pg_proc fn ON fn.oid = t.tgfoid
WHERE NOT t.tgisinternal
  AND (r.oid IN (to_regclass('public.interviews'), to_regclass('public.interview_rounds'),
                 to_regclass('public.round_weaknesses'))
       OR fn.proname = 'prepare_round_weakness'
       OR fn.prosrc ~* 'new[[:space:]]*\.[[:space:]]*round_type_id')
ORDER BY ns.nspname, r.relname, t.tgname;

SELECT conrelid::regclass AS table_name, conname, convalidated, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (to_regclass('public.round_weaknesses'), to_regclass('public.interview_rounds'),
                   to_regclass('public.topics'))
ORDER BY table_name, conname;

SELECT p.oid::regprocedure AS signature, pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
WHERE p.oid IN (to_regprocedure('public.create_interview(jsonb,uuid)'),
                to_regprocedure('public.update_interview(uuid,jsonb,integer)'),
                to_regprocedure('intertrap_private.validate_interview(jsonb)'),
                to_regprocedure('intertrap_private.write_interview_children(uuid,jsonb)'));

-- Check for incompatible legacy rows even when round_type_id is missing from round_weaknesses.
SELECT count(*) AS incompatible_predefined_weaknesses
FROM public.round_weaknesses w
LEFT JOIN public.interview_rounds r ON r.id = w.round_id
LEFT JOIN public.topics t ON t.id = w.topic_id
WHERE w.topic_id IS NOT NULL AND
      (r.id IS NULL OR t.id IS NULL OR r.round_type_id IS DISTINCT FROM t.round_type_id);
```

Expected state after the fix is a nullable bigint category on weaknesses, one enabled preparation trigger on that table, and validated round and topic composite foreign keys. An unexpected function referencing `NEW.round_type_id`, a differently implemented write RPC, or incompatible persisted records needs review before applying the repair.

## Exact corrective SQL

Copy the **entire** [009_fix_interview_trigger.sql](../supabase/migrations/009_fix_interview_trigger.sql) into a fresh SQL Editor query and run it after reviewing the diagnostics. Apply this repair on its own. It adds the missing field if needed, fills it only for compatible predefined rows, verifies or adds the required foreign keys and restores the preparation trigger. It only removes trigger attachments that call the dedicated preparation function. It stops on incompatible records or an unrelated function using the expected trigger name. It preserves the RPCs, policies, users, interviews and AI reports. The transaction rolls back on error. If the lock times out, retry during a quieter period.

Rerun the read-only queries after it commits. Use [interview_trigger_regression.sql](../supabase/tests/interview_trigger_regression.sql) with a dedicated existing test account to check create, update and analysis reads in a rollback transaction. Then test a normal browser save and edit using an authorized test account. Verify both a predefined topic and a custom topic, and compare History and Analytics against the saved record.
