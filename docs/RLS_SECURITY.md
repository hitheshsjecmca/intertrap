# InterTrap row-level security

Supabase Auth verifies the user's identity and issues a signed JSON Web Token. Supabase's Data API verifies the token and runs the request with a PostgreSQL role, usually `authenticated` for a signed-in user and `anon` for a request without a user session. `auth.uid()` reads the request's user ID. PostgreSQL grants allow an operation on a table or specific columns. RLS then applies per-row rules to granted operations. `PUBLIC` includes all roles.

| Table | Authenticated access | Ownership and immutability |
| --- | --- | --- |
| profiles | Read and update name, target role and salary | `id = auth.uid()`. The signup trigger creates rows. The profile ID and creation timestamp are immutable to clients. |
| interviews | Read, insert, update and delete | `user_id = auth.uid()`. PostgreSQL assigns the owner and ID. Only interview fields can be inserted or updated. |
| interview_rounds | Read, insert, update and delete | Owner comes from the parent interview. A client can set the parent on insert. The ID and parent are immutable on update. |
| round_weaknesses | Read, insert, update and delete | Owner comes through the round and interview. The parent is insert-only. The trigger derives the category and composite foreign keys validate it. |
| round_types | Read | Shared master catalog. Writes remain privileged. |
| topics | Read | Shared master catalog. Custom topics live in weaknesses. |
| ai_analysis | Read | Owner comes from the parent interview. A future trusted workflow will write analysis. |

Anonymous clients have no table grants. The catalog sequence privileges stay revoked because clients only read lookup rows. Column grants protect IDs, ownership, parent links and audit fields. Those permissions apply independently of the RLS predicate. Module 5 adds no privileged functions. The existing security-definer signup function retains its restricted execution privileges.

`USING` controls access to existing rows for reads, updates and deletes. `WITH CHECK` evaluates new rows for inserts and proposed versions of updated rows. Child policies use `EXISTS` with qualified parent tables. Primary and foreign-key indexes support the joins. Wrapping `auth.uid()` in a scalar `SELECT` allows PostgreSQL to evaluate the request identity once when planning permits. Measure actual plans against representative data.

React's protected layout improves navigation and session handling. An authenticated client can also send requests directly to the Data API. A missing ownership check would allow horizontal privilege escalation, where users at the same access level reach each other's records. That risk includes insecure direct object references (IDOR). UUIDs identify records and can be copied from a client or elsewhere. Keep service-role secrets server-side because that role can bypass RLS.

Database constraints enforce data shape and category integrity. Direct CRUD permissions still allow different rows to be updated separately. Modules 8 and 9 will add persistence and atomic progression operations. The [Module 5 setup](MODULE_5_SETUP.md) covers role simulation and a separate two-session API check.

## Technical interview questions and answers


### 1. What is authentication?

It verifies who made the request. Supabase Auth issues a signed token after successful sign-in.

### 2. What is authorization?

It decides which operations the verified identity can perform. InterTrap evaluates grants and ownership policies.

### 3. What is a PostgreSQL role?

A role is a database identity or group of privileges. Multiple signed-in users share the authenticated role while their JWT subjects distinguish them.

### 4. What does PUBLIC mean in GRANT?

It names every database role. A grant to PUBLIC also reaches clients through their current role.

### 5. What is RLS?

It applies expressions to individual rows. Two clients with the same SELECT grant can see different interview records.

### 6. What happens without a matching policy?

With RLS enabled, ordinary roles have default-deny row access for that operation.

### 7. How are grants and RLS different?

A grant permits attempting an operation. RLS decides which existing or proposed rows qualify.

### 8. What is a JWT?

It is a signed claim container. The API verifies the signature and applicable expiration before relying on the claims.

### 9. What is auth.uid()?

It extracts the user UUID from the request context. Requests without a user subject yield NULL.

### 10. What does USING do?

It filters existing rows for reads, updates and deletes. A foreign interview update may affect zero rows.

### 11. What does WITH CHECK do?

It validates the new row on insert or after an update. A round tied to a foreign interview fails the policy.

### 12. Why must UPDATE check both row versions?

The caller must be authorized to edit the existing row, and the new row must remain authorized after the edit.

### 13. What is parent ownership?

A round inherits ownership from its interview. A weakness looks up the interview through its round.

### 14. What is horizontal privilege escalation?

It occurs when one user reaches another user's data while both have the same application role.

### 15. What is IDOR?

It occurs when a request accepts a record identifier without checking access to the identified object.

### 16. Can an unguessable ID replace a policy?

A UUID may leak through a link, log or client response. Every request still needs an authorization check.

### 17. Why is a protected React route insufficient?

It governs browser navigation. A client can call the Data API directly, so the database must enforce ownership.

### 18. What can leak if a service-role key reaches React?

A browser user can extract that secret and make requests with powerful privileges that can bypass RLS.

### 19. How are immutable fields protected?

Column grants omit the owner, primary key, audit fields and existing parent links from permitted updates.

### 20. Why use SELECT policies for lookups?

Signed-in users share consistent category and topic lists. Master data changes remain administrator operations.

### 21. How is AI output protected?

Clients can read analysis for their own interview. Trusted server-side logic will handle inserts and verify ownership.

### 22. How can RLS affect query performance?

The database may evaluate ownership joins across many rows. Index ownership and join keys and inspect realistic query plans.

### 23. Why simulate roles in SQL tests?

An administrative session may bypass RLS. SET LOCAL ROLE and test claims exercise the actual lower-privilege predicates.

### 24. Why also verify two API sessions?

That confirms the link from token issuance through API role mapping and the database policies.

### 25. What do these policies leave for later modules?

They scope access to owner rows. A transactional operation will combine valid per-row writes into a consistent interview progression.
