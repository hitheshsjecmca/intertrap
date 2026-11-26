# Module 12 · AI security

## Identity and write boundaries

Gateway JWT verification stays enabled. Each function also verifies the bearer token through Supabase Auth and requires a non-anonymous authenticated user. User-scoped RPC calls carry that bearer token and apply RLS along with explicit ownership scope. An inaccessible interview returns the same result as a missing one. A verified user UUID is passed to the server-only reservation and save functions. The browser does not pick an account, a provider model, a quota or a report payload.

The private usage and lease tables enable RLS and have no public or frontend grants. Service-role RPCs are granted execution separately, use qualified database objects and restrict their work to the supplied verified actor, target and valid lease. Reports retain existing owner-only SELECT policies. Gemini has no tools, credentials or database connections. The only model output passed to a database write is validated report content in typed fields.

## Consent and minimization

The UI explains provider use before enabling Send or Generate. Both endpoints also require a consent flag. Provider-bound interview context is an allowlisted SQL projection. Names, authentication identifiers, tokens, notes, interview company and role, and custom topic labels stay out of that projection. Predefined topic names, outcomes and numeric severity may be used. Custom labels are represented as omitted while their statistics are retained.

Chat transmits up to two 600-character questions, with common email and credential patterns redacted. Pattern matching cannot identify all secrets or personal details, so keep them out of questions. The application never logs API keys, full prompts or raw provider errors. Cached reports are fetched from PostgreSQL and do not trigger another provider call.

## Defence against untrusted content

System instructions and structured evidence are separate. Built-in instructions tell Gemini to treat all incoming content as data, ignore instruction overrides and answer within interview coaching. Strict output validation constrains shape, length and tool-like responses. React renders responses as text. Provider instructions and schema validation cannot prove factual accuracy, so the UI labels AI content as coaching and recommends checking it against the recorded outcomes.

## Limits, retries and history

Initial limits are five analysis attempts and twenty chat attempts per user per UTC day. Configure them with `AI_ANALYSIS_DAILY_LIMIT` and `AI_CHAT_DAILY_LIMIT` from 1 through 100. The database serializes reservations per user and atomically counts attempts. Cached, duplicate-in-flight, unauthorized and invalid requests skip provider use. A reservation counts even when its provider call fails. Rate-limit responses return HTTP 429 and a reset timestamp. The gateway and Gemini can impose additional limits.

Analysis leases last 90 seconds. The request, Gemini and database hops have bounded deadlines. A provider timeout keeps the lease until it expires because the upstream request might still be running. Later retries can proceed once the lease has expired. The final save checks the interview version and lease; a unique index enforces one Module 12 report per interview version. A changed interview during generation cannot receive an analysis marked current.

Usage rows keep daily counters until the user account is removed or an administrator applies a retention policy. The module adds no scheduled cleanup. Reports follow existing interview deletion cascades. Chat turns are not stored by the app. Google processes the supplied context under the configured Gemini project's terms.

[Supabase Edge Function authentication](https://supabase.com/docs/guides/functions/auth) · [Supabase secrets](https://supabase.com/docs/guides/functions/secrets)
