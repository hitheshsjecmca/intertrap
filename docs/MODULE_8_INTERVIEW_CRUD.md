# Module 8 · Interview CRUD

Add Interview and Edit Interview share the four-step form. The client validates the nested draft, then submits one RPC. It disables repeated submissions and preserves the in-memory draft on failure. A confirmed save navigates to the record, with the operation result announced in a status message. The same request UUID is reused for retries until creation is confirmed. After an ambiguous failure, retry the same content or check History before starting a different draft.

History uses `interview_history` for case-insensitive company/role search, status/mode/date filters, stable sorting, count and bounded pagination. A lateral aggregate summarizes each row in the selected page within one database request. Details use one nested RLS-scoped read. Edit initializes the form with the record version and IDs of the rounds and weaknesses. A version conflict preserves the draft so the user can compare with the latest record before reapplying changes. Deletion requires an explicit native dialog confirmation and uses cascades. Each route makes fresh reads, aborts obsolete calls and remounts when the authenticated user changes.

An alternative is a resource endpoint that calls the same database functions. Offset pagination supports numbered pages and may shift under concurrent inserts. Keyset pagination would improve deep-page navigation as record counts grow.

## Technical interview questions and answers

### 1. Why use one save request?

A single RPC commits the parent, rounds and weaknesses together.

### 2. How does a user edit an outcome?

The edit route loads a versioned record and allows the final status and round statuses to be corrected.

### 3. Can two interviews have the same company?

Yes. The interview UUID identifies the individual interview.

### 4. How does search work?

The server lowercases the input and searches literal substrings in company and role.

### 5. Why search on the server?

The result count, filter and page are computed consistently without downloading every record.

### 6. How is sort order stable?

An interview UUID breaks ties after the chosen sort fields.

### 7. What does offset pagination cost?

Deep pages may scan skipped rows. Concurrent writes can shift which records belong to a page.

### 8. What is keyset pagination?

It uses the last row's sort keys as a cursor for the next page.

### 9. Why aggregate page counts with a lateral join?

It calculates each visible record's round and weakness counts inside one SQL request.

### 10. Trap. Is a missing detail record proof it was deleted?

No. RLS hides records from other users, which gives the same unavailable result.

### 11. Where are actions reported to the user?

Live status text announces confirmed success. Errors appear next to the retained draft or inside the delete dialog.

### 12. Can a double click create duplicate interviews?

A synchronous client guard blocks repeated handler calls, and the database request key covers retries.

### 13. Can the browser restore a draft after reload?

The draft is in memory. A browser exit warning may prompt before navigation.

### 14. Why preserve round and weakness IDs?

Unchanged records keep their identity, and edits avoid deleting and recreating unrelated rows.

### 15. What does an aborted read do?

It cancels obsolete client work when filters change or a page unmounts.

### 16. Does closing the browser cancel a committed write?

No. A lost response can happen after the database commits, so create retries use an idempotency key.

### 17. Who can delete an interview?

Only the authenticated owner can delete it through the RPC.

### 18. What does interview deletion cascade to?

Rounds, round weaknesses and any associated historical AI analyses.

### 19. How does analytics refresh after a write?

Analytics and history load fresh scoped snapshots when mounted.

### 20. How is account switching handled?

The protected content is keyed by user ID, so the old account's requests and draft state are discarded.
