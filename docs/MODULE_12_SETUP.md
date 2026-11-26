# Module 12 · Setup and deployment

Nothing in the repository automatically runs remote SQL, deploys Functions or calls Gemini. Perform the hosted steps only after approval for the project and provider quota.

## 1. Verify the database

In the existing Supabase project's **SQL Editor**, verify migrations 001–007 and the catalog seed are already applied. For any missing prerequisite, use the [Modules 8–11 guide](MODULE_8_11_SETUP.md). Run [008_ai_integration.sql](../supabase/migrations/008_ai_integration.sql) in a fresh query. Apply each migration once. If earlier migrations were applied manually, continue with SQL Editor unless you have reconciled CLI migration history. Keep `intertrap_private` outside the Data API's exposed schemas.

Optionally verify permissions using [ai_validation.sql](../supabase/tests/ai_validation.sql) with two existing dedicated authenticated account UUIDs that have profiles. The fixture rolls back and makes no external requests.

## 2. Configure and deploy from Windows PowerShell

Run from the repository root. The existing Supabase CLI npm dev dependency supplies `npx.cmd supabase`. Choose a Gemini model ID enabled for your project that supports structured JSON with `generateContent`. Enter the raw model ID, without a `models/` prefix.

```powershell
npm.cmd ci
npx.cmd supabase login
$projectRef = Read-Host 'Existing Supabase project reference'
$model = Read-Host 'Gemini model ID with structured JSON support'
if ($projectRef -notmatch '^[a-z0-9]+$' -or $model -notmatch '^gemini-[a-zA-Z0-9.-]+$') {
    throw 'Check the project reference and model ID.'
}
$secret = Read-Host 'Gemini API key' -AsSecureString
$key = [System.Net.NetworkCredential]::new('', $secret).Password
if ($key -notmatch '^[A-Za-z0-9_-]+$') { throw 'Check the Gemini API key format.' }
$secretsFile = [IO.Path]::GetTempFileName()
try {
    @(
        "GEMINI_API_KEY=$key"
        "GEMINI_MODEL=$model"
        'AI_ANALYSIS_DAILY_LIMIT=5'
        'AI_CHAT_DAILY_LIMIT=20'
    ) | Set-Content -LiteralPath $secretsFile -Encoding ascii
    npx.cmd supabase secrets set "--remote=$projectRef" --env-file $secretsFile
    if ($LASTEXITCODE) { throw 'Supabase secret configuration failed.' }
} finally {
    Remove-Item -LiteralPath $secretsFile
    Remove-Variable -Name key, secret
}

npx.cmd supabase functions deploy analyze-interview "--remote=$projectRef" --use-api
if ($LASTEXITCODE) { throw 'analyze-interview deployment failed.' }
npx.cmd supabase functions deploy iris-chat "--remote=$projectRef" --use-api
if ($LASTEXITCODE) { throw 'iris-chat deployment failed.' }
```

Keep JWT verification enabled. The commands use the repository's Supabase CLI 3.x syntax. Confirm that the CLI displays the intended project before approving secret configuration or deployment. The deploy commands read `supabase/config.jsonc` and bundle the shared TypeScript on the server. The Supabase runtime supplies the project's URL and API credentials. Keep the frontend's existing publishable Supabase configuration and store the Gemini key only as an Edge Function secret. [Supabase deployment](https://supabase.com/docs/guides/functions/deploy) · [Gemini models](https://ai.google.dev/gemini-api/docs/models)

## 3. Verify locally without quotas

Use Node.js 22.18 or later for native TypeScript stripping in the mocked Node tests.

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
git diff --check
```

With Deno 2 installed, type-check both entrypoints from the repository root:

```powershell
deno check supabase/functions/analyze-interview/index.ts supabase/functions/iris-chat/index.ts
```

## 4. Hosted smoke test after explicit quota approval

With a dedicated account, open a saved interview and verify that viewing saved reports consumes no Gemini quota. Confirm consent and generate one report, then revisit the page and verify it is reused. Edit the interview and confirm that the earlier report is labelled stale. In AI Insights, ask a question with consent and verify the response. Use a second account to confirm the first account's report and interview remain inaccessible.

If generation returns unavailable, check migration 008, function deployment, JWT settings and the model secret name. The app distinguishes exhausted application limits, a concurrent analysis, interview edits, invalid provider output and temporary failures.
