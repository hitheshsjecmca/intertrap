# InterTrap analytics SQL

These queries are intended for authorized requests after Module 5 grants and RLS policies are in place. In the SQL Editor, `auth.uid()` may return NULL because there is no signed-in request JWT. For administrator verification, substitute an explicit authorized test-user UUID for `auth.uid()`. The SQL Editor's administrator role can access rows across accounts. Keep owner filters in place.

## Interview totals, status counts and selection rate

This returns all five counts in one row. Only selected and rejected decisions contribute to the selection rate. An empty denominator yields NULL.

```sql
SELECT count(*) AS total_interviews,
       count(*) FILTER (WHERE overall_status = 'selected') AS selected,
       count(*) FILTER (WHERE overall_status = 'rejected') AS rejected,
       count(*) FILTER (WHERE overall_status = 'pending') AS pending,
       count(*) FILTER (WHERE overall_status = 'withdrawn') AS withdrawn,
       round(100.0 * count(*) FILTER (WHERE overall_status = 'selected')
           / nullif(count(*) FILTER (WHERE overall_status IN ('selected', 'rejected')), 0), 2)
           AS selection_rate_pct
FROM public.interviews
WHERE user_id = auth.uid();
```

## First-round rejections

```sql
SELECT count(*) AS first_round_rejections
FROM public.interviews AS i
INNER JOIN public.interview_rounds AS r ON r.interview_id = i.id
WHERE i.user_id = auth.uid()
  AND r.round_number = 1
  AND r.status = 'rejected';
```

## Interview history

```sql
SELECT id, company_name, job_role, interview_date, overall_status, interview_mode
FROM public.interviews
WHERE user_id = auth.uid()
ORDER BY interview_date DESC, id DESC;
```

## Clearance rates by round category

Pending and not-reached rounds are excluded from the denominator. Categories with no decided rounds have NULL rates.

```sql
WITH owned_rounds AS (
    SELECT r.round_type_id, r.status
    FROM public.interview_rounds AS r
    INNER JOIN public.interviews AS i ON i.id = r.interview_id
    WHERE i.user_id = auth.uid()
)
SELECT rt.slug, rt.name,
       count(*) FILTER (WHERE r.status = 'cleared') AS cleared,
       count(*) FILTER (WHERE r.status = 'rejected') AS rejected,
       round(100.0 * count(*) FILTER (WHERE r.status = 'cleared')
           / nullif(count(*) FILTER (WHERE r.status IN ('cleared', 'rejected')), 0), 2)
           AS clearance_rate_pct
FROM public.round_types AS rt
LEFT JOIN owned_rounds AS r ON r.round_type_id = rt.id
GROUP BY rt.slug, rt.name
ORDER BY rt.name;
```

## Most reported weaknesses and average severity by topic

Predefined topics group by category and name. Custom topics group case-insensitively within each category.

```sql
WITH reported AS (
    SELECT rt.slug,
           CASE WHEN w.topic_id IS NULL THEN 'custom' ELSE 'predefined' END AS topic_kind,
           coalesce(t.name, lower(w.custom_topic)) AS topic_name,
           w.severity
    FROM public.round_weaknesses AS w
    INNER JOIN public.interview_rounds AS r ON r.id = w.round_id
    INNER JOIN public.interviews AS i ON i.id = r.interview_id
    INNER JOIN public.round_types AS rt ON rt.id = r.round_type_id
    LEFT JOIN public.topics AS t ON t.id = w.topic_id
    WHERE i.user_id = auth.uid()
)
SELECT slug, topic_kind, topic_name,
       count(*) AS reports, round(avg(severity), 2) AS average_severity
FROM reported
GROUP BY slug, topic_kind, topic_name
ORDER BY reports DESC, slug, topic_kind, topic_name;
```

For the overall average, which is NULL when there are no reports, use:

```sql
SELECT round(avg(w.severity), 2) AS average_severity
FROM public.round_weaknesses AS w
INNER JOIN public.interview_rounds AS r ON r.id = w.round_id
INNER JOIN public.interviews AS i ON i.id = r.interview_id
WHERE i.user_id = auth.uid();
```

## Monthly interview counts and selection/rejection trends

Months are based on interview dates. These are totals by interview month and current outcome.

```sql
SELECT date_trunc('month', interview_date::timestamp)::date AS interview_month,
       count(*) AS total_interviews,
       count(*) FILTER (WHERE overall_status = 'selected') AS selected,
       count(*) FILTER (WHERE overall_status = 'rejected') AS rejected
FROM public.interviews
WHERE user_id = auth.uid()
GROUP BY interview_month
ORDER BY interview_month;
```

## Latest AI analysis for an interview

Bind `$1` to the requested interview UUID in a parameterized request. In SQL Editor, replace `$1::uuid` with an explicit test interview UUID literal cast to UUID.

```sql
SELECT a.id, a.model_name, a.prompt_version, a.summary,
       a.strengths, a.weaknesses, a.recommendations, a.created_at
FROM public.ai_analysis AS a
INNER JOIN public.interviews AS i ON i.id = a.interview_id
WHERE i.user_id = auth.uid() AND i.id = $1::uuid
ORDER BY a.created_at DESC, a.id DESC
LIMIT 1;
```
