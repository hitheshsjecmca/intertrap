# Module 12 · I.R.I.S. and Gemini

The React AI Insights page sends an explicitly consented question to `iris-chat`. The interview details page loads recent saved reports and calls `analyze-interview` only on an explicit generation request. Both handlers run TypeScript on Supabase's Deno-based Edge Runtime. They share a Fetch HTTP adapter, request and response validation, and Gemini's REST `generateContent` structured JSON format. No AI SDK or frontend provider credential is required. [Gemini structured output](https://ai.google.dev/gemini-api/docs/structured-output)

| Operation | Context | Result |
| --- | --- | --- |
| Analyse interview | Requested interview version, up to 16 rounds, up to 6 weakness observations per attempted round, plus bounded account performance evidence | Saved summary, strengths, weaknesses, priorities, seven-day roadmap, technical and coding practice, communication guidance and feedback |
| Chat | Current question, optional previous question, intent-relevant deterministic evidence from up to 180 days, and up to 8 recent interview outcomes when relevant | Validated response and next steps. The transcript stays in the current browser view. |
| Read saved analysis | Owner-scoped PostgreSQL read | Up to 20 recent reports with an explicit stale state for older or unknown source versions |

The provider reply is parsed only after a successful, complete candidate with text parts. The server then validates exact keys, types, field lengths, list sizes and seven correctly ordered roadmap days before persistence or display. Missing evidence yields suggestions or an explicit insufficient-data message. Chat with no recorded interviews in the 180-day window returns a deterministic workspace response and skips Gemini.

Existing reports and RLS policies are retained. New reports reuse the original summary and array columns and add roadmap and guidance JSONB. An interview version and prompt version identify one cached report. Changing only the configured provider model does not regenerate reports for the same interview version. A later prompt-contract change should update the prompt version consistently in the migration and app. Stale reports remain readable. I.R.I.S. uses the original animated core and optional browser speech. Chat voice must be enabled explicitly and playback is user-initiated.

## Technical interview questions and answers

### 1. Why use an Edge Function for AI?

It keeps provider credentials server-side and centralizes authentication, context selection, validation and rate limits.

### 2. How does an Edge Function verify a JWT?

The endpoint accepts a bearer JWT and calls Supabase Auth's user endpoint to verify the session and identity.

### 3. Is decoding a JWT enough?

No. Decoding reads claims. A trusted verifier must confirm the signature and expiry before using them.

### 4. Why keep the gateway JWT check enabled?

It rejects unauthenticated calls before invocation. The handler also verifies the user and checks for an authenticated account.

### 5. How does PostgREST apply RLS?

Database reads carry the user's bearer token, so the database applies that user's role and ownership policies.

### 6. Why check ownership twice?

RLS protects the context read. Reservation and finalization separately verify ownership before creating a lease or saving a report.

### 7. What is a service-role key?

It is a privileged Supabase credential. This module confines its client to server-only reservation, release and finalization calls.

### 8. Can a React client use the service-only RPCs?

Ordinary roles have no execution grant. Their AI table access is limited to RLS-scoped reads.

### 9. Why keep usage tables private?

Usage and leases are implementation state. Users consume them through endpoints, with no direct mutation access.

### 10. Where is Gemini configured?

Through the GEMINI_API_KEY and GEMINI_MODEL runtime secrets. The frontend never receives them.

### 11. What is a structured model response?

The provider is asked for JSON matching a schema with named fields, arrays and types.

### 12. Why validate after requesting a schema?

The provider can produce malformed, blocked or truncated output. A separate validator enforces the app's exact shape and size limits.

### 13. What is prompt injection?

It is untrusted text that attempts to change how the model interprets its instructions.

### 14. How are interview notes handled?

They are excluded from both model context projections, along with company names, roles, custom labels and identifiers.

### 15. Are structured outputs a prompt-injection solution?

They constrain shape. Data minimization, role separation and having no tools limit what an injected instruction can affect.

### 16. Why are chat questions redacted?

They may contain common credential patterns or email addresses. Users should still leave confidential details out of questions.

### 17. Can Gemini update an interview?

The model has no tools or database access. Only validated report data reaches a fixed server-only report persistence RPC.

### 18. How does the dashboard ground coaching?

It uses the existing deterministic performance statistics, including sample sizes and statuses, as evidence for prompts.

### 19. How are not-reached rounds handled?

The deterministic source excludes them from attempted outcomes. The prompt explicitly prohibits interpreting them as failures.

### 20. Is readiness a hiring probability?

No. InterTrap readiness estimates preparation evidence, and the model is instructed to avoid hiring predictions.

### 21. How is a quota enforced across Edge instances?

PostgreSQL serializes reservation decisions and atomically updates a per-user, per-endpoint UTC daily counter.

### 22. Which requests consume application quota?

A reserved provider attempt counts, including failures after reservation. Cache hits, blocked duplicates and no-evidence chat answers skip the counter.

### 23. What is the analysis lease for?

It keeps two instances from generating the same interview version simultaneously and expires after a worker crash.

### 24. Why require a lease token to finish?

A worker with an expired or replaced reservation cannot save a result using another worker's lease.

### 25. What happens when an interview changes during generation?

Finalization checks the version under a lock and refuses the stale write.

### 26. Why store historical versions?

Users can revisit older guidance while comparing its source version with the currently saved interview.

### 27. Does opening a saved report use Gemini quota?

The report is read directly through RLS and does not invoke the generation endpoint.

### 28. Why use a capped response-body reader?

It bounds buffered input and output even when the peer omits a Content-Length header.

### 29. How are provider failures displayed?

The app translates them into safe error states and keeps raw upstream errors out of the client and logs.

### 30. How does I.R.I.S. voice playback work?

The browser reads the selected response using SpeechSynthesis after an explicit user action. Voice starts disabled.

### 31. Is chat history persisted?

The transcript is held in browser component state. A follow-up sends the current question and at most one earlier user question.

### 32. How can these paths be tested without using AI quota?

Tests inject a fetch fixture for Gemini and exercise database roles, leases and report history in disposable PostgreSQL.
