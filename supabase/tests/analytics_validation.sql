-- Substitute two existing dedicated account IDs before running.
BEGIN;
SELECT set_config('intertrap.a', '00000000-0000-0000-0000-000000000000', true);
SELECT set_config('intertrap.b', '00000000-0000-0000-0000-000000000000', true);

DO $$
BEGIN
    IF (SELECT count(*) FROM public.profiles WHERE id IN
        (current_setting('intertrap.a')::uuid,current_setting('intertrap.b')::uuid)) <> 2 THEN
        RAISE EXCEPTION 'Supply two distinct test accounts with profiles';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.a'), true);

DO $$
DECLARE
    category bigint;
    base jsonb := '{"company_name":"Analytics fixture","job_role":"Data Analyst","interview_date":"2097-02-07","interview_mode":"online","overall_status":"pending","rounds":[]}';
    cleared jsonb;
    rejected jsonb;
    blocked jsonb;
    snapshot jsonb;
    summary jsonb;
    history jsonb;
    topic jsonb;
BEGIN
    SELECT id INTO STRICT category FROM public.round_types WHERE slug = 'coding';
    cleared := jsonb_build_object('round_number',1,'round_type_id',category,'status','cleared',
        'weaknesses','[{"custom_topic":"  SQL   Joins ","severity":3}]'::jsonb);
    rejected := cleared || '{"status":"rejected","weaknesses":[{"custom_topic":"sql joins","severity":5}]}';
    blocked := cleared || '{"round_number":2,"status":"not_reached","weaknesses":[]}';

    snapshot := public.performance_snapshot('2097-02-01','2097-04-30');
    IF (snapshot -> 'summary' ->> 'total_interviews')::int <> 0 THEN
        RAISE EXCEPTION 'Test accounts must have no records in the fixture dates';
    END IF;
    PERFORM public.create_interview(base,gen_random_uuid());
    IF public.performance_snapshot('2097-02-01','2097-02-28') -> 'summary' ->> 'selection_rate' IS NOT NULL THEN
        RAISE EXCEPTION 'Pending interview contributed a decision';
    END IF;
    PERFORM public.create_interview(base || '{"overall_status":"withdrawn"}',gen_random_uuid());
    IF public.performance_snapshot('2097-02-01','2097-02-28') -> 'summary' ->> 'rejection_rate' IS NOT NULL THEN
        RAISE EXCEPTION 'Withdrawn interview contributed a decision';
    END IF;
    PERFORM public.create_interview(base || '{"overall_status":"selected"}'
        || jsonb_build_object('rounds',jsonb_build_array(cleared)),gen_random_uuid());
    IF (public.performance_snapshot('2097-02-01','2097-02-28') -> 'summary' ->> 'selection_rate')::numeric IS DISTINCT FROM 100::numeric THEN
        RAISE EXCEPTION 'Selection-only rate failed';
    END IF;
    PERFORM public.create_interview(base || '{"interview_date":"2097-04-07","overall_status":"rejected"}'
        || jsonb_build_object('rounds',jsonb_build_array(rejected, blocked)),gen_random_uuid());

    snapshot := public.performance_snapshot('2097-02-01','2097-04-30');
    summary := snapshot -> 'summary';
    IF (summary ->> 'total_interviews')::int <> 4 OR (summary ->> 'decisions')::int <> 2
        OR (summary ->> 'selection_rate')::numeric IS DISTINCT FROM 50::numeric
        OR (summary ->> 'first_rejection_rate')::numeric IS DISTINCT FROM 50::numeric
        OR (summary ->> 'clearance_rate')::numeric IS DISTINCT FROM 50::numeric
        OR (summary ->> 'configured')::int <> 3 OR (summary ->> 'attempted')::int <> 2
        OR (summary ->> 'not_reached')::int <> 1 THEN
        RAISE EXCEPTION 'Wrong analytics totals';
    END IF;
    topic := snapshot -> 'weaknesses' -> 0;
    IF jsonb_array_length(snapshot -> 'weaknesses') <> 1 OR (topic ->> 'occurrences')::int <> 2
        OR (topic ->> 'interviews')::int <> 2 OR (topic ->> 'average_severity')::numeric <> 4
        OR (topic ->> 'priority')::numeric <> 92
        OR (SELECT count(*) FROM public.weakness_evidence(topic ->> 'topic_key','2097-02-01','2097-04-30')) <> 2 THEN
        RAISE EXCEPTION 'Wrong normalized weakness aggregation';
    END IF;
    IF (snapshot -> 'months' -> 1 ->> 'interviews')::int <> 0
        OR snapshot -> 'months' -> 1 ->> 'selection_rate' IS NOT NULL THEN
        RAISE EXCEPTION 'Missing month was filled with a performance rate';
    END IF;

    history := public.interview_history('analyst', NULL, 'online', '2097-02-01', '2097-04-30', 'newest', 2, 2);
    IF (history ->> 'total')::int <> 4 OR jsonb_array_length(history -> 'rows') <> 2 THEN
        RAISE EXCEPTION 'History filter or pagination failed';
    END IF;
    IF (public.performance_snapshot('2097-04-01','2097-04-30') -> 'summary' ->> 'rejection_rate')::numeric IS DISTINCT FROM 100::numeric THEN
        RAISE EXCEPTION 'Date range or rejected-only rate failed';
    END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.b'), true);
DO $$
BEGIN
    IF (public.performance_snapshot('2097-02-01','2097-04-30') -> 'summary' ->> 'total_interviews')::int <> 0
        OR (public.interview_history('Analytics fixture') ->> 'total')::int <> 0 THEN
        RAISE EXCEPTION 'Cross-user analytics result';
    END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
    BEGIN
        PERFORM public.performance_snapshot();
        RAISE EXCEPTION 'Anonymous analytics access';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
ROLLBACK;
