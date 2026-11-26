BEGIN;

CREATE FUNCTION public.interview_history(
    search_text text DEFAULT NULL, outcome text DEFAULT NULL, mode text DEFAULT NULL,
    from_date date DEFAULT NULL, to_date date DEFAULT NULL, sort_by text DEFAULT 'newest',
    page_number int DEFAULT 1, page_size int DEFAULT 12
)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
WITH filtered AS MATERIALIZED (
    SELECT i.id, i.company_name, i.job_role, i.interview_date, i.interview_mode, i.overall_status, i.updated_at
    FROM public.interviews AS i
    WHERE i.user_id = (SELECT auth.uid())
      AND (coalesce(search_text, '') = '' OR strpos(lower(i.company_name), lower(search_text)) > 0
           OR strpos(lower(coalesce(i.job_role, '')), lower(search_text)) > 0)
      AND (outcome IS NULL OR i.overall_status = outcome)
      AND (mode IS NULL OR i.interview_mode = mode)
      AND (from_date IS NULL OR i.interview_date >= from_date)
      AND (to_date IS NULL OR i.interview_date <= to_date)
), ordered AS (
    SELECT *, row_number() OVER (ORDER BY
        CASE WHEN sort_by = 'company' THEN lower(company_name) END,
        CASE WHEN sort_by = 'oldest' THEN interview_date END ASC,
        interview_date DESC, id DESC) AS position
    FROM filtered
), page AS (
    SELECT * FROM ordered ORDER BY position
    LIMIT greatest(1, least(page_size, 50))
    OFFSET (greatest(1, page_number)::bigint - 1) * greatest(1, least(page_size, 50))
), summary AS (
    SELECT p.*, counts.rounds, counts.cleared, counts.rejected, counts.weaknesses
    FROM page AS p
    CROSS JOIN LATERAL (
        SELECT count(*) AS rounds, count(*) FILTER (WHERE r.status = 'cleared') AS cleared,
            count(*) FILTER (WHERE r.status = 'rejected') AS rejected,
            count(*) FILTER (WHERE r.status IN ('cleared','rejected')) AS attempted,
            coalesce(sum(w.total), 0) AS weaknesses
        FROM public.interview_rounds AS r
        CROSS JOIN LATERAL (
            SELECT count(*) AS total FROM public.round_weaknesses AS w WHERE w.round_id = r.id
        ) AS w
        WHERE r.interview_id = p.id
    ) AS counts
)
SELECT jsonb_build_object('total', (SELECT count(*) FROM filtered),
    'rows', coalesce((SELECT jsonb_agg(to_jsonb(s) - 'position' ORDER BY position) FROM summary s), '[]'::jsonb));
$$;

CREATE FUNCTION public.performance_snapshot(from_date date DEFAULT NULL, to_date date DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
WITH owned AS MATERIALIZED (
    SELECT i.id, i.interview_date, i.overall_status,
        date_trunc('month', i.interview_date::timestamp)::date AS month
    FROM public.interviews AS i
    WHERE i.user_id = (SELECT auth.uid())
      AND (from_date IS NULL OR i.interview_date >= from_date)
      AND (to_date IS NULL OR i.interview_date <= to_date)
), rounds AS MATERIALIZED (
    SELECT r.id, r.interview_id, r.round_type_id, r.round_number, r.status, i.interview_date, i.month
    FROM owned i JOIN public.interview_rounds r ON r.interview_id = i.id
), reports AS MATERIALIZED (
    SELECT r.*, w.severity, w.topic_id,
        CASE WHEN w.topic_id IS NOT NULL THEN 'p:' || w.topic_id
             ELSE 'c:' || r.round_type_id || ':' || lower(trim(w.custom_topic)) END AS topic_key,
        coalesce(t.name, lower(trim(w.custom_topic))) AS topic
    FROM rounds r JOIN public.round_weaknesses w ON w.round_id = r.id
    LEFT JOIN public.topics t ON t.id = w.topic_id
    WHERE r.status IN ('cleared','rejected')
), interview_totals AS (
    SELECT count(*) total_interviews,
        count(*) FILTER (WHERE overall_status = 'selected') selected,
        count(*) FILTER (WHERE overall_status = 'rejected') rejected,
        count(*) FILTER (WHERE overall_status = 'pending') pending,
        count(*) FILTER (WHERE overall_status = 'withdrawn') withdrawn
    FROM owned
), round_totals AS (
    SELECT count(*) configured,
        count(*) FILTER (WHERE status IN ('cleared','rejected')) attempted,
        count(*) FILTER (WHERE status = 'cleared') cleared_rounds,
        count(*) FILTER (WHERE status = 'rejected') rejected_rounds,
        count(*) FILTER (WHERE status = 'pending') pending_rounds,
        count(*) FILTER (WHERE status = 'not_reached') not_reached,
        count(*) FILTER (WHERE round_number = 1 AND status IN ('cleared','rejected')) first_known,
        count(*) FILTER (WHERE round_number = 1 AND status = 'rejected') first_rejected
    FROM rounds
), categories AS (
    SELECT rt.id, rt.slug, rt.name,
        count(*) FILTER (WHERE r.status = 'cleared') cleared,
        count(*) FILTER (WHERE r.status = 'rejected') rejected,
        count(*) FILTER (WHERE r.status IN ('cleared','rejected')) attempted,
        count(*) FILTER (WHERE r.status = 'rejected' AND r.round_number = 1) first_rejected,
        100.0 * count(*) FILTER (WHERE r.status = 'cleared')
          / nullif(count(*) FILTER (WHERE r.status IN ('cleared','rejected')), 0) clearance_rate
    FROM public.round_types rt LEFT JOIN rounds r ON r.round_type_id = rt.id
    GROUP BY rt.id, rt.slug, rt.name
), weakness_totals AS (
    SELECT r.topic_key, r.topic, r.round_type_id, c.name category, r.topic_id,
        count(*) occurrences, count(DISTINCT interview_id) interviews,
        avg(severity) average_severity, max(severity) max_severity,
        max(interview_date) last_reported,
        count(*) FILTER (WHERE interview_date BETWEEN coalesce(to_date, (now() AT TIME ZONE 'UTC')::date) - 29
            AND coalesce(to_date, (now() AT TIME ZONE 'UTC')::date)) recent_occurrences,
        count(*) FILTER (WHERE status = 'rejected') rejected_occurrences,
        count(*) FILTER (WHERE status = 'cleared') cleared_occurrences,
        count(*) FILTER (WHERE round_number = 1 AND status = 'rejected') first_rejected_occurrences,
        c.attempted sample_size
    FROM reports r JOIN categories c ON c.id = r.round_type_id
    GROUP BY r.topic_key, r.topic, r.round_type_id, c.name, c.attempted, r.topic_id
), weaknesses AS (
    SELECT *, 100 * (0.60 * least(1, occurrences::numeric / nullif(sample_size, 0))
        + 0.40 * least(1, average_severity / 5)) priority
    FROM weakness_totals
), interview_months AS (
    SELECT month, count(*) interviews,
        count(*) FILTER (WHERE overall_status = 'selected') selected,
        count(*) FILTER (WHERE overall_status = 'rejected') rejected
    FROM owned GROUP BY month
), round_months AS (
    SELECT month, count(*) FILTER (WHERE status = 'cleared') cleared,
        count(*) FILTER (WHERE status IN ('cleared','rejected')) attempted
    FROM rounds GROUP BY month
), report_months AS (
    SELECT month, count(*) weaknesses, avg(severity) average_severity FROM reports GROUP BY month
), months AS (
    SELECT m.month::date AS month, coalesce(i.interviews,0) interviews,
        coalesce(i.selected,0) selected, coalesce(i.rejected,0) rejected, coalesce(r.attempted,0) attempted,
        100.0 * i.selected / nullif(i.selected + i.rejected, 0) selection_rate,
        100.0 * r.cleared / nullif(r.attempted, 0) clearance_rate,
        coalesce(w.weaknesses,0) weaknesses, w.average_severity
    FROM generate_series((SELECT min(month) FROM owned)::timestamp,
        (SELECT max(month) FROM owned)::timestamp, interval '1 month') AS m(month)
    LEFT JOIN interview_months i ON i.month = m.month::date
    LEFT JOIN round_months r ON r.month = m.month::date
    LEFT JOIN report_months w ON w.month = m.month::date
), category_months AS (
    SELECT r.month, r.round_type_id, count(*) FILTER (WHERE status IN ('cleared','rejected')) attempted,
        100.0 * count(*) FILTER (WHERE status = 'cleared')
            / nullif(count(*) FILTER (WHERE status IN ('cleared','rejected')), 0) clearance_rate
    FROM rounds r GROUP BY r.month, r.round_type_id
)
SELECT jsonb_build_object(
    'summary', (SELECT to_jsonb(i) || to_jsonb(r) || jsonb_build_object(
        'decisions', i.selected+i.rejected,
        'selection_rate', 100.0*i.selected/nullif(i.selected+i.rejected,0),
        'rejection_rate', 100.0*i.rejected/nullif(i.selected+i.rejected,0),
        'clearance_rate', 100.0*r.cleared_rounds/nullif(r.attempted,0),
        'first_rejection_rate', 100.0*r.first_rejected/nullif(r.first_known,0),
        'total_weaknesses', (SELECT count(*) FROM reports))
        FROM interview_totals i CROSS JOIN round_totals r),
    'categories', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY name) FROM categories c), '[]'::jsonb),
    'weaknesses', coalesce((SELECT jsonb_agg(to_jsonb(w) ORDER BY priority DESC, occurrences DESC, topic_key) FROM weaknesses w), '[]'::jsonb),
    'months', coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY month) FROM months m), '[]'::jsonb),
    'category_months', coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY month, round_type_id) FROM category_months c), '[]'::jsonb)
);
$$;

CREATE FUNCTION public.weakness_evidence(
    topic_key text, from_date date DEFAULT NULL, to_date date DEFAULT NULL, page_number int DEFAULT 1
)
RETURNS TABLE (report_id uuid, interview_id uuid, company_name text, interview_date date,
    round_number int, round_outcome text, severity int, notes text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
SELECT w.id, i.id, i.company_name, i.interview_date, r.round_number, r.status, w.severity, w.notes
FROM public.interviews i JOIN public.interview_rounds r ON r.interview_id = i.id
JOIN public.round_weaknesses w ON w.round_id = r.id
WHERE i.user_id = (SELECT auth.uid()) AND r.status IN ('cleared','rejected')
  AND (from_date IS NULL OR i.interview_date >= from_date)
  AND (to_date IS NULL OR i.interview_date <= to_date)
  AND CASE WHEN w.topic_id IS NOT NULL THEN 'p:' || w.topic_id
      ELSE 'c:' || r.round_type_id || ':' || lower(trim(w.custom_topic)) END = topic_key
ORDER BY i.interview_date DESC, i.id DESC, r.round_number, w.id
LIMIT 15 OFFSET (greatest(page_number, 1)::bigint - 1) * 15;
$$;

REVOKE ALL ON FUNCTION public.interview_history(text,text,text,date,date,text,int,int),
    public.performance_snapshot(date,date), public.weakness_evidence(text,date,date,int)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.interview_history(text,text,text,date,date,text,int,int),
    public.performance_snapshot(date,date), public.weakness_evidence(text,date,date,int)
TO authenticated;

COMMIT;
