# Module 7 interview preview

The Add Interview page has four steps. Company details collect the interview date, optional mode and context. Round cards support any number of entries, repeat categories and can be moved or removed. Attempted rounds expose category topics, custom labels, severity and notes. The final step shows the full interview, timeline and clearance statistics.

The parent form uses `useState` for the draft, stage, catalog and UI feedback. Its controlled inputs receive their current value and send changes back to the parent. Each accepted change replaces the draft or the affected arrays without mutating previous state. UUIDs give round cards and weakness rows stable keys. The displayed position is recalculated from array order. A reducer would become useful if edit actions grew or needed undo history.

## Progression and validation

The progression utility walks the ordered rounds once. It remembers whether it has seen a rejection and marks every following round `not_reached`. Previously blocked rounds reset to pending when the path opens again. A rejected round sets the overall outcome to rejected. Correcting or removing the rejection resets that forced result to pending. Clearing every round leaves final selection to the user. The pass is O(r) time and O(r) additional space for r rounds. The UI builds a UUID lookup in O(r) to check whether an edit would discard existing outcomes or selections before asking for confirmation.

Only cleared and rejected rounds are attempted. A category change discards selected predefined and custom weaknesses after confirmation, to keep each self-report tied to its original round context. If a status change makes a round unattempted, selected weaknesses are discarded after confirmation. Duplicate custom labels are compared after collapsing whitespace and folding case. A round may have zero weaknesses.

Per-step validation checks company details, dates, status values, actual catalog IDs, associated topics, duplicates, note limits and severity. The review action validates again. Counts come from the current draft, and clearance is cleared divided by cleared plus rejected. With no attempted rounds the rate is unavailable.

## Catalog and payload

The catalog service uses the existing Supabase client. It fetches round types and topics linked to their returned IDs, and the form filters the topic list by round category. The catalog is read-only in the app. Loading, empty data, permission and migration errors, and session issues are surfaced with retry where applicable. An abort signal cancels requests when the form leaves or retries.

The validated nested payload uses actual database column names and catalog IDs. The payload omits user ownership, generated IDs, UI keys and the weakness category field. The database trigger in migration 003 derives the weakness category from its stored parent. Future persistence must insert into the corresponding tables or call a transactional database operation, derive identity from the authenticated request and revalidate the draft. The form only keeps its preview in memory.

Previous and Next preserve accepted draft values. Leaving the route or cancelling prompts before discarding changes. On reload or tab close, the form requests a browser confirmation where the browser supports it. No local draft persistence is configured.

## Verification

Run `npm.cmd test` for Node's built-in tests. For a UI check, sign in, visit Add Interview, add repeated technical rounds, reorder them and mark an early round rejected. Confirm later rounds are blocked and become pending after correction. Select two predefined topics and a custom topic, check the duplicate warning, change a category and verify the discard prompt. Return to the review and check the timeline, metrics, responsive layout and cancel confirmation. Test a failed catalog request and retry. Use [Module 5 setup](MODULE_5_SETUP.md) for the actual Supabase authorization checks.

## Technical interview questions and answers


### 1. What is a controlled input?

React owns the value and updates it in response to input events. The draft remains the source of truth.

### 2. How do four steps share a draft?

The draft state lives above the rendered step. Moving between steps changes which controls mount while the accepted values remain in the parent.

### 3. Why use useState here?

The independent values are straightforward, and the complex transformations are testable pure functions. A reducer could help if transitions or undo grow more complex.

### 4. Why use UUID keys for rounds?

A key follows the round when its position changes. An index key can attach a control's state or focus to the wrong round after reordering.

### 5. What is an immutable array update?

Create a new array with the changed item or order. Preserve the original array so React can observe the update and tests can verify the prior state.

### 6. What is conditional rendering?

It selects what to render from state. The weakness step displays sections only for attempted rounds.

### 7. Why validate at each step and again at review?

Step validation gives timely feedback. End-to-end validation catches consistency problems before the preview payload is prepared.

### 8. What counts as an attempted round?

A round with a cleared or rejected decision. Pending and not-reached rounds are excluded.

### 9. How does an early rejection work?

The progression pass marks subsequent rows not reached and sets the overall outcome to rejected.

### 10. How does correcting a rejection work?

Previously blocked rounds become pending and can be reassessed. The forced overall rejection resets to pending when the last rejection is corrected.

### 11. Does clearing all rounds mark the interview selected?

Final selection is a separate hiring decision. A user can leave the overall result pending.

### 12. What is derived state?

It is computed from existing inputs. The current round order determines numbers and the current statuses determine counts.

### 13. How is clearance computed?

Divide cleared by cleared plus rejected. With no attempted rounds the rate has no meaningful denominator.

### 14. Why source categories from the database?

Identity values vary between environments. The returned IDs match the topics and foreign keys in the active project.

### 15. How are topics filtered?

Fetch topics for returned category IDs and display the rows linked to the selected round's category.

### 16. How are custom duplicates detected?

Normalize whitespace and compare case-insensitively within the same round. The database separately enforces its own normalization and uniqueness.

### 17. What happens on a category change?

The UI asks before discarding selected weaknesses. A confirmed edit clears the old selection so incompatible topics cannot remain.

### 18. How are catalog failures handled?

The UI distinguishes missing or inaccessible catalog data, session failures and general request errors, and offers a retry.

### 19. Why abort requests?

Unmounting or retrying should stop unnecessary work and prevent older responses from changing the new form state.

### 20. What does the payload include?

It contains validated interview fields, ordered rounds, actual catalog IDs and weakness details. Future persistence will map it into multiple tables.

### 21. Why omit user_id from the payload?

The backend must derive ownership from the verified identity. A user-provided owner would be untrusted.

### 22. Why omit the weakness category field?

The database derives it from the stored round and validates the pairing with composite foreign keys.

### 23. What is the complexity of progression?

The ordered pass is O(r) time and O(r) extra space for r rounds. Each round is visited once and produces a normalized round record.

### 24. How do draft guards work?

The router intercepts route changes. The browser beforeunload event can prompt on reload or closing the tab.

### 25. Why validate in PostgreSQL later if the form already validates?

Other clients can bypass the UI, and concurrent writes can conflict. Backend validation and a transaction are required for persistent progression.
