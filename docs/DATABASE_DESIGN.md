# InterTrap database design

This document describes the Module 4 schema and its original access settings. Migration 005 adds the [current grants and policies](RLS_SECURITY.md).

InterTrap stores structured interview history in Supabase PostgreSQL. Supabase Auth owns the `auth.users` table. The application references its UUID primary key and never copies authentication credentials.

## Tables and columns

| Table | Column | Type and purpose |
| --- | --- | --- |
| profiles | id | UUID primary key and foreign key to auth.users. An account can have one profile. |
| profiles | full_name | Optional text initially copied from signup metadata. |
| profiles | target_role | Optional text for the user's career goal. |
| profiles | target_salary_lpa | Optional numeric(8,2) for lakhs per annum, with finite nonnegative values and two decimal places. |
| profiles | created_at, updated_at | Required timestamptz values for creation and last update, initially set to the transaction time. |
| interviews | id | UUID primary key generated on insert. |
| interviews | user_id | Required UUID owner referencing auth.users. Defaults to the authenticated request's user ID. |
| interviews | company_name | Required nonblank text. The same company can appear on separate interviews. |
| interviews | job_role | Optional text describing the role. |
| interviews | interview_date | Required calendar date, defaulting to the current date. |
| interviews | overall_status | Required text with pending, selected, rejected or withdrawn. Defaults to pending. |
| interviews | interview_mode | Optional text with online, offline or hybrid. |
| interviews | notes | Optional text for interview-level observations. |
| interviews | created_at, updated_at | Required timestamptz audit fields. |
| round_types | id | Generated bigint identity primary key for a shared category. |
| round_types | name | Required unique display name. |
| round_types | slug | Required unique stable text key used by seed scripts. |
| interview_rounds | id | Generated UUID primary key. |
| interview_rounds | interview_id | Required UUID foreign key to the interview. |
| interview_rounds | round_type_id | Required bigint foreign key to the shared category. |
| interview_rounds | round_number | Required positive integer, unique within an interview. |
| interview_rounds | custom_name | Optional text for an event-specific round title. |
| interview_rounds | status | Required text with pending, cleared, rejected or not_reached. Defaults to pending. |
| interview_rounds | round_date | Optional date for the individual round. |
| interview_rounds | notes | Optional text for round-level observations. |
| interview_rounds | created_at, updated_at | Required timestamptz audit fields. |
| topics | id | Generated bigint identity primary key for a predefined topic. |
| topics | round_type_id | Required bigint foreign key to its category. |
| topics | name | Required nonblank text, unique within its category. |
| round_weaknesses | id | Generated UUID primary key. |
| round_weaknesses | round_id | Required UUID foreign key to the interview round. |
| round_weaknesses | topic_id | Optional bigint. With round_type_id, it references the predefined topic and its category. |
| round_weaknesses | custom_topic | Optional text used as the alternative to a predefined topic. The trigger trims and collapses whitespace. |
| round_weaknesses | round_type_id | Optional bigint populated from the round for predefined topics. The paired foreign keys require the round and topic to share this category. |
| round_weaknesses | severity | Required integer from 1 through 5, defaulting to 3. |
| round_weaknesses | notes | Optional text describing the reported difficulty. |
| round_weaknesses | created_at | Required timestamptz set on insert. |
| ai_analysis | id | Generated UUID primary key. |
| ai_analysis | interview_id | Required UUID foreign key to the interview. |
| ai_analysis | model_name | Required text identifying the model that generated the result. |
| ai_analysis | prompt_version | Required text identifying the prompt revision, defaulting to v1. |
| ai_analysis | summary | Required text for the analysis summary. |
| ai_analysis | strengths, weaknesses, recommendations | Required jsonb fields, each defaulting to an empty array. The checks ensure array shape. |
| ai_analysis | created_at | Required timestamptz for analysis history. |

Severity is self-reported. **1** means minor difficulty, **2** some difficulty, **3** moderate difficulty, **4** major difficulty and **5** unable to answer.

## Relationships and integrity

The [ER diagram](ER_DIAGRAM.md) shows the eight entities. A user has zero or one profile and can own many interviews. Each interview can have many rounds and analysis runs. Each shared round type can classify many rounds and topics. A round can have many weakness records. Each predefined topic can occur in many rounds via the `round_weaknesses` junction table, which stores severity and notes for each occurrence. A custom weakness only needs its round.

A primary key identifies a row. A foreign key ensures a referenced parent exists, which prevents orphan rows. `ON DELETE CASCADE` removes dependent data with its owner. Deleting an interview removes its rounds, their weaknesses and its analysis history. Deleting an auth user removes the profile and interviews and follows their cascades. `ON DELETE RESTRICT` protects lookup values while referenced.

A composite unique constraint treats a group of columns as one key. The round number can repeat across interviews because the key pairs it with the interview ID. Topic names can repeat across categories for the same reason. The weakness key `(round_id, topic_id)` prevents repeated predefined topics. The custom-topic index compares the lowercase trimmed label after whitespace normalization. `CHECK` constraints enforce rules on a row such as legal statuses, positive round numbers, one topic variant per weakness and array-shaped AI fields.

### Category validation and concurrency

The weakness write trigger copies the round category into the weakness for predefined topics. Composite foreign keys match this value against both the round and the topic. The corresponding unique keys on the parent tables give PostgreSQL exact targets for those references. Category changes are restricted while a predefined weakness references either parent. Custom weaknesses leave the copied category NULL and use the direct round foreign key, so a custom weakness alone permits a category change.

PostgreSQL coordinates child inserts and parent key changes through foreign-key checks and row locks. If a category changes between the trigger's read and the constraint check, the old pair can fail the foreign key check. If a child establishes its reference first, a conflicting parent change is rejected. The foreign keys are the integrity guarantee. The trigger derives the value and normalizes custom text. See [PostgreSQL constraints](https://www.postgresql.org/docs/current/ddl-constraints.html).

## Indexes

| Index or key | Purpose |
| --- | --- |
| interviews (user_id, interview_date DESC) | User history, date ranges and monthly dashboard data. Also supports the ownership foreign key. |
| interviews (user_id, overall_status) | Status filtering and per-user outcome counts. |
| interview_rounds (round_type_id) | Round category queries and lookup foreign-key checks. |
| round_weaknesses (topic_id) | Predefined-topic lookups, reporting and parent-key checks. |
| ai_analysis (interview_id, created_at DESC) | Latest analysis and history for an interview. Also supports cascading interview deletes. |
| Partial unique index on round_weaknesses (round_id, lower(trim(custom_topic))) | Prevents duplicate normalized custom topics within a round and indexes only records with a custom label. |
| interview_rounds UNIQUE (interview_id, round_number) | Round order, first-round lookups and interview cascades. |
| topics UNIQUE (round_type_id, name) | Category topic lists and lookup foreign-key checks. |
| round_weaknesses UNIQUE (round_id, topic_id) | Predefined-topic uniqueness and lookup of all weaknesses for a round, including custom entries. |
| Parent UNIQUE (id, round_type_id) on rounds and topics | Reference targets for the paired foreign keys. |

Primary and unique keys already create indexes. The leading columns cover the relevant foreign-key lookups, so separate indexes on rounds' interview ID, topics' category ID and weaknesses' round ID would duplicate access paths. Indexes trade storage and extra write work for faster reads and integrity checks.

## Triggers and time

A PostgreSQL trigger runs a function on an event. Before each update to a profile, interview or round, `set_updated_at()` sets the audit field to the statement time. Insert defaults use `now()`, which is stable within a transaction. A `date` describes a calendar day. A `timestamp` without a time zone describes a wall-clock value. A `timestamptz` represents an instant that PostgreSQL displays in the session time zone.

After a signup insert, `handle_new_user()` copies the ID and optional full name into the profile. Its `SECURITY DEFINER` context lets the auth trigger insert into the protected table using the function owner's privileges. It uses an empty search path, a qualified table and revoked client execute privileges. The backfill uses the same data and preserves existing profiles with `ON CONFLICT (id) DO NOTHING`. The registration workflow already supplies `full_name`.

## Authorization

Authentication establishes identity through Supabase Auth. Authorization determines which actions that identity may perform. A React protected route controls dashboard navigation. PostgreSQL grants determine which operations a database role can attempt. RLS applies per-row conditions to those operations after the appropriate grants are available. Module 4 enables RLS on all seven application tables, revokes client table and identity sequence privileges and defines no client policies. Privileged administrators can perform migrations and verification through SQL Editor.

| Table | Future policy requirements |
| --- | --- |
| profiles | Owners access only the row where id equals auth.uid(). Profile inserts come from signup automation. |
| interviews | Owner-scoped operations where user_id equals auth.uid(). Check new ownership on inserts and updates. |
| round_types | Authenticated read access when required. Master writes remain privileged. |
| interview_rounds | Require ownership of the parent interview for existing and proposed rows. |
| topics | Authenticated read access when required. Master writes remain privileged. |
| round_weaknesses | Require ownership through round and interview for existing and proposed rows. |
| ai_analysis | Allow owner reads through the parent interview. Scope writes to the future trusted analysis workflow. |

Use operation-specific grants and policies, including `WITH CHECK` for inserts or updates where needed. Test cross-user reads, writes and attempts to change parent links. Keep service-role credentials outside React.

## Progression rules

The schema supports arbitrary rounds, repeated categories, positive unique positions and first-round rejection. It enforces the list of valid interview and round statuses and the integrity of weakness links.

Future progression writes must mark later rounds `not_reached` after a rejection, permit weaknesses only for attempted rounds and exclude pending and not-reached rounds from failure counts. Clearing all rounds still requires a separate decision to confirm selection. A user correction may require revising the later rounds and overall outcome together. Implement these state changes and corrections in a single transaction, with appropriate concurrency control when two writes target the same interview. The [analytics queries](DATABASE_QUERIES.md) already use the intended denominators.

## Normalization, storage and scalability

1. **First normal form** stores each round as a row with individual fields, so a query can filter by category or status.
2. **Second normal form** keeps data about the full relationship together. In a weakness identified by round and predefined topic, severity describes that specific report. The topic name belongs in the topic catalog.
3. **Third normal form** keeps category names in `round_types` and company or owner data in their parent records. The copied category on a predefined weakness is a deliberate, constraint-backed exception to support declarative cross-table validation. AI output is a document-shaped payload within the relational model.

PostgreSQL `json` stores the original JSON text, while `jsonb` stores a processed representation with operator and index support. AI arrays suit `jsonb` because item structure may evolve. Module 4 validates that the fields are arrays. Future modules can validate item shape when they establish a stable format.

ACID stands for atomicity, consistency, isolation and durability. Atomicity commits the entire change or rolls it back. Consistency maintains database rules. Isolation governs how simultaneous transactions see each other's work. Durability preserves committed changes. A single transaction can record rejection, mark later rounds and update the interview together. Separate Supabase API calls normally run in separate transactions. A later database function can perform the whole write in one call.

PostgreSQL fits the relationships, composite uniqueness, joins and grouped metrics in InterTrap. MongoDB can store a single embedded interview document and supports transactions, but this model benefits from foreign keys across shared lookups and routinely queried entities. Supabase offers managed PostgreSQL, authentication and a JS SDK integrated with PostgreSQL RLS.

Current limits include the lack of client access policies, transactional progression logic, analytics screens and live AI generation. Status values store the current result. Historical changes would require an event log. As data grows, inspect query plans with `EXPLAIN` before adding indexes, paginate interview and analysis history, and measure dashboard aggregation cost before building cached summaries. Analysis retention and backups should be planned for production.

## Technical interview questions and answers


### 1. Why PostgreSQL instead of MongoDB?

InterTrap frequently joins interviews, rounds, shared topics and weaknesses and needs foreign-key integrity across them. MongoDB can embed rounds in each interview document, but shared topic integrity and category reporting would require additional application logic.

### 2. Why use Supabase?

It provides managed PostgreSQL and authentication and passes an authenticated user's context into database requests. The existing React SDK integrates both services, while migrations remain plain PostgreSQL SQL.

### 3. Why use UUIDs?

UUIDs give private entities stable identifiers that can be generated without coordinating a shared counter. They use more storage than bigint keys. The shared catalog uses compact bigint identities while the profile reuses the auth UUID.

### 4. Why create a profiles table?

Career goals and salary targets are application data. A table keyed by the auth user ID supports profile-specific constraints and authorization while Supabase manages credentials separately.

### 5. Why create a separate interview_rounds table?

Each round has its own category, number, date, status and weaknesses. Separate rows give each round an identity that weaknesses can reference and let SQL filter and aggregate round results.

### 6. How do dynamic interview rounds work?

Insert one row per round under the same interview UUID. Round numbers must be unique within that interview, and the category can repeat, so multiple technical rounds fit without a schema change.

### 7. Why avoid storing rounds as a JSON array?

Rows support foreign keys, category joins and a composite unique constraint on round positions. With a JSON array, validating and indexing equivalent rules across individual rounds takes more work.

### 8. What is a junction table?

It represents a relationship as rows that reference both endpoints. Each predefined weakness joins a round to a topic and stores severity and notes for that occurrence.

### 9. Why normalize interview data?

Normalization keeps shared facts in one place. If a round category's display name changes, updating its lookup row changes the label seen across reports without editing historical rounds.

### 10. How do you prevent duplicate rounds?

A unique constraint on interview ID and round number rejects a second row at the same position under that interview, including when inserts run concurrently.

### 11. How do you prevent duplicate weaknesses?

A composite unique key covers predefined topics. For custom labels the trigger collapses whitespace and the partial unique index folds case, so labels such as Edge Case and EDGE   CASE compare equally for the same round.

### 12. What happens when an interview is deleted?

Its rounds and analysis records cascade from the interview foreign key. Each deleted round cascades to its weaknesses. Master categories and topics remain shared.

### 13. What is referential integrity?

Each foreign key must resolve to an existing parent, unless its declared null rules allow it to be absent. Here every round has an interview and each predefined weakness must match its round's category.

### 14. What is an orphan record?

It is a dependent record with no valid parent, such as a round whose interview was deleted. The required foreign key rejects orphan inserts and the cascade removes children when the parent is deleted.

### 15. Why use indexes?

Indexes can reduce the rows PostgreSQL must scan and provide useful sort order. The user/date index supports ordered interview history and date ranges scoped to one user.

### 16. What are the costs of indexes?

Indexes consume disk and cache and add bookkeeping to writes. Review query plans and field order before adding indexes, because a unique constraint may already provide the required access path.

### 17. What is a composite index?

It indexes more than one column. An index starting with user_id and followed by interview_date supports filtering by owner and then finding that owner's newest interviews.

### 18. What is a partial index?

It indexes the rows matching a predicate. The custom-label unique index applies only when custom_topic is present, while predefined topics use their own uniqueness rule.

### 19. What is a trigger?

A trigger runs a function on a database event. A before-update trigger sets timestamps for all write paths, and an after-insert trigger creates a profile during signup.

### 20. What is SECURITY DEFINER?

It executes a function using the function owner's privileges. Signup needs this to insert into profiles from the auth context. The function uses a qualified table, an empty search path and restricted execution privileges.

### 21. What is JSONB?

It is PostgreSQL's processed JSON representation with operators and index support. InterTrap uses it to store AI output arrays whose item structure may evolve.

### 22. What is ACID?

Atomicity is all-or-nothing execution, consistency preserves enforced rules, isolation coordinates simultaneous work and durability preserves committed changes. These properties matter when updating an interview and its rounds together.

### 23. How do transactions work?

BEGIN starts a transaction, COMMIT makes its changes permanent and ROLLBACK discards its changes. A validation error can roll back a whole progression change, including updates already made to other rounds.

### 24. Are separate Supabase API requests one transaction?

Each normal API request has its own transaction. If interview and round changes must commit together, a later RPC can execute them in one database request.

### 25. What happens when users write simultaneously?

PostgreSQL isolates transactions and coordinates unique-key and foreign-key changes with locks. Independent interviews can be written concurrently. Future progression logic should coordinate concurrent edits to the same interview and handle retryable errors.

### 26. How will InterTrap protect one user's records from another?

Module 4 blocks client access to these tables. Module 5 needs explicit grants and owner-based RLS conditions for each operation, including checking the ownership of proposed parent links on child writes.

### 27. Is a UUID sufficient for security?

UUIDs identify rows and may be shared through API data or logs. Access must be checked through grants and RLS even when the caller already knows a row's UUID.

### 28. Does the public schema give everyone access?

A schema is a namespace. Client access depends on schema and table privileges and, for protected rows, RLS policies. Module 4 revokes table privileges for public and frontend roles.

### 29. Why store overall status separately from round status?

Round status records a stage outcome. The overall status records the hiring decision, which may arrive after all stages are cleared or may change when a candidate withdraws.

### 30. How do you find first-round rejections?

Join rounds to the user's interviews and count rows where the round number is 1 and the status is rejected. The unique round number constraint limits each interview to one match.

### 31. How will the schema support future AI recommendations?

A future trusted workflow can gather interview outcomes and weaknesses and append one analysis row per run. The model name and prompt version explain where an output came from, and earlier runs remain available.

### 32. Is Module 4 production-ready?

It provides a protected schema foundation. Production use still requires deployed database verification, RLS policies and isolation tests, transactional write paths and operational controls for backups and retention.

[Supabase user management](https://supabase.com/docs/guides/auth/managing-user-data)
