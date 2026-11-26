# Module 9 · Transactional persistence

| RPC | Result |
| --- | --- |
| `create_interview(payload jsonb, client_request_id uuid)` | JSON object with `id` and `version` |
| `update_interview(interview_id uuid, payload jsonb, expected_version int)` | Same ID and next version |
| `delete_interview(interview_id uuid)` | JSON object with deleted `id` |

The JSON payload contains the interview fields, ordered rounds and weakness arrays. Clients omit owners and generated IDs for new records. On update, retained round and weakness IDs are checked against their stored parent. A new topic replaces the previous weakness association. No SQL inside the function commits independently. Any unhandled error rolls back parent and child writes, including the create-request row.

The three public write functions are `SECURITY DEFINER` and owned by a `NOLOGIN NOBYPASSRLS` writer role. It has the minimum domain table privileges for these operations, with separate owner-scoped policies. A private identity helper calls `auth.uid()` under the migration administrator because hosted Supabase restricts grants on its Auth schema. Private helper access is limited to the writer. Both explicit checks and writer RLS verify ownership. The role has no application grant for writing AI analysis or catalogs. Frontend direct insert, update and delete grants on the interview graph are revoked. Read operations still use the ordinary user policies. [Supabase guidance on Auth schema access](https://supabase.com/kb/troubleshooting/permission-errors-when-granting-custom-roles-access-to-the-auth-schema-9e32e7)

Create uses a private unique `(user_id, request_id)` ledger and canonical JSONB digest. The same key and content return the saved ID. Conflicting content returns HTTP 409, and a retry after deletion returns unavailable. Updating locks the owned parent row and checks the version before writes. Round position uniqueness is deferred only while reordering, then checked before return. The AI history column `interview_version` is nullable for legacy rows. Future analysis can be presented as current only if its known source version equals the interview version.

Rounds follow a contiguous order. Pending blocks later attempts. Rejection requires the rejected overall outcome and all later rounds not reached. Selected requires every configured round cleared. Zero-round interviews can record an explicit company decision. Pending final decisions and final rejections after cleared rounds are valid. Withdrawal does not add a failed round. Legacy rows remain readable. Editing them requires a consistent replacement draft.

A viable alternative is `SECURITY INVOKER` with direct table grants plus comprehensive database-wide enforcement, such as carefully deferred constraint triggers and a version protocol. That approach requires all allowed table changes to preserve aggregate invariants at commit.

## Technical interview questions and answers

### 1. What is ACID?

Atomicity, consistency, isolation and durability describe transaction guarantees.

### 2. Which statement rolls back a failed child insert?

The surrounding request transaction rolls back when the function error propagates.

### 3. Trap. Can a regular function issue COMMIT?

Ordinary PostgreSQL functions execute inside a transaction and cannot commit independently.

### 4. Why use JSONB?

It carries nested rounds and weaknesses in one argument and can be inspected with PostgreSQL operators.

### 5. Where does interview ownership come from?

From the authenticated request identity resolved through auth.uid().

### 6. Why revoke direct write grants?

Otherwise a REST table update could skip cross-row progression and version rules.

### 7. What is SECURITY INVOKER?

The function uses the effective privileges of its caller.

### 8. What is SECURITY DEFINER?

The function runs with the effective privileges of its owner.

### 9. Why use a NOLOGIN writer?

It limits the privileges used by the write RPCs and prevents direct logins as that role.

### 10. Does the writer bypass RLS?

Its role lacks BYPASSRLS and has its own ownership policies.

### 11. Why qualify schema names?

It binds operations to intended objects independently of the caller's search path.

### 12. How does an owner mismatch appear?

Update and delete return unavailable, also used for a nonexistent ID.

### 13. What is idempotency?

An identical replay of the same create request yields the original successful identifier.

### 14. What happens if the same key has changed content?

The request conflicts. A distinct interview starts with a new key.

### 15. What prevents lost updates?

The update checks the expected version while holding a parent-row lock.

### 16. Why can round positions swap?

A deferrable unique constraint permits temporary conflicts and verifies final positions.

### 17. When does a round become not reached?

A rejection changes the state of every subsequent configured round.

### 18. Can a pending round have weaknesses?

No. Weaknesses belong to rounds with a cleared or rejected outcome.

### 19. Can clear rounds end in final rejection?

Yes. A company's final decision can be rejected even when every recorded round was cleared.

### 20. How can a future module recognize stale AI output?

It compares the analysis source version with the current interview version.
