-- Replace the UUID with an existing dedicated account's UUID. All fixtures roll back.
BEGIN;

CREATE TEMP TABLE weakness_without_category (topic_id bigint);

-- Isolate the relevant legacy branch without breaking public tables.
CREATE FUNCTION pg_temp.legacy_weakness_trigger() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.topic_id IS NULL THEN
        NEW.round_type_id := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER legacy_weakness BEFORE INSERT ON weakness_without_category
FOR EACH ROW EXECUTE FUNCTION pg_temp.legacy_weakness_trigger();

DO $$
BEGIN
    BEGIN
        INSERT INTO weakness_without_category VALUES (NULL);
        RAISE EXCEPTION 'Expected SQLSTATE 42703';
    EXCEPTION WHEN undefined_column THEN
        IF SQLERRM <> 'record "new" has no field "round_type_id"' THEN RAISE; END IF;
    END;
END;
$$;

DROP TRIGGER legacy_weakness ON weakness_without_category;
CREATE TRIGGER misplaced_weakness BEFORE INSERT ON weakness_without_category
FOR EACH ROW EXECUTE FUNCTION public.prepare_round_weakness();

DO $$
BEGIN
    BEGIN
        INSERT INTO weakness_without_category VALUES (NULL);
        RAISE EXCEPTION 'Expected a misplaced trigger to be rejected';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
        IF SQLERRM NOT LIKE 'prepare_round_weakness requires%' THEN RAISE; END IF;
    END;
    IF (SELECT count(*) FROM pg_trigger
        WHERE NOT tgisinternal AND tgfoid = 'public.prepare_round_weakness()'::regprocedure
          AND tgrelid <> 'pg_temp.weakness_without_category'::regclass) <> 1
        OR NOT EXISTS (
            SELECT 1 FROM pg_trigger WHERE tgfoid = 'public.prepare_round_weakness()'::regprocedure
              AND tgrelid = 'public.round_weaknesses'::regclass AND tgenabled IN ('O','A')
              AND tgtype = 23
        ) THEN
        RAISE EXCEPTION 'Expected one enabled public weakness trigger on INSERT and UPDATE';
    END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000000', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
    category bigint;
    topic bigint;
    alternate_topic bigint;
    interview uuid;
    interview_round uuid;
    predefined uuid;
    custom uuid;
    details jsonb;
    payload jsonb;
    updated jsonb;
BEGIN
    SELECT id INTO STRICT category FROM public.round_types WHERE slug = 'coding';
    SELECT id INTO STRICT topic FROM public.topics WHERE round_type_id = category AND name = 'Arrays';
    SELECT t.id INTO STRICT alternate_topic FROM public.topics t
    JOIN public.round_types r ON r.id = t.round_type_id WHERE r.slug = 'hr' AND t.name = 'Confidence';

    details := jsonb_build_object('round_number', 1, 'round_type_id', category, 'status', 'cleared',
        'weaknesses', jsonb_build_array(jsonb_build_object('topic_id', topic, 'severity', 3),
            jsonb_build_object('custom_topic', '  Test    cases ', 'severity', 2)));
    payload := jsonb_build_object('company_name', 'Trigger regression fixture', 'interview_date', '2098-05-01',
        'overall_status', 'pending', 'rounds', jsonb_build_array(details));

    interview := (public.create_interview(payload, gen_random_uuid()) ->> 'id')::uuid;
    SELECT id INTO STRICT interview_round FROM public.interview_rounds WHERE interview_id = interview;
    SELECT id INTO STRICT predefined FROM public.round_weaknesses
    WHERE round_id = interview_round AND topic_id = topic AND round_type_id = category;
    SELECT id INTO STRICT custom FROM public.round_weaknesses
    WHERE round_id = interview_round AND round_type_id IS NULL AND custom_topic = 'Test cases';

    BEGIN
        PERFORM public.create_interview(jsonb_set(payload, '{rounds,0,weaknesses,0,topic_id}',
            to_jsonb(alternate_topic)), gen_random_uuid());
        RAISE EXCEPTION 'Cross-category topic was accepted';
    EXCEPTION WHEN invalid_parameter_value THEN NULL;
    END;

    payload := jsonb_set(payload, '{rounds,0}', details || jsonb_build_object(
        'id', interview_round, 'weaknesses', jsonb_build_array(
            jsonb_build_object('id', predefined, 'topic_id', topic, 'severity', 5),
            jsonb_build_object('id', custom, 'custom_topic', 'Test cases', 'severity', 4))));
    updated := public.update_interview(interview, payload, 1);
    IF updated ->> 'version' IS DISTINCT FROM '2'
       OR NOT EXISTS (SELECT 1 FROM public.round_weaknesses WHERE id = predefined AND severity = 5)
       OR NOT EXISTS (SELECT 1 FROM public.round_weaknesses WHERE id = custom AND severity = 4) THEN
        RAISE EXCEPTION 'Weakness edit failed or replaced an existing ID';
    END IF;
    IF (public.performance_snapshot('2098-05-01', '2098-05-01') -> 'summary' ->> 'total_weaknesses')::int < 2 THEN
        RAISE EXCEPTION 'Analytics did not include the saved weaknesses';
    END IF;
    PERFORM set_config('intertrap.trigger_fixture_round', interview_round::text, true);
    PERFORM set_config('intertrap.trigger_fixture_other_topic', alternate_topic::text, true);
END;
$$;

RESET ROLE;

-- Exercise the database constraints independently of the RPC validator.
DO $$
DECLARE
    fixture_round uuid := current_setting('intertrap.trigger_fixture_round')::uuid;
    other_topic bigint := current_setting('intertrap.trigger_fixture_other_topic')::bigint;
BEGIN
    BEGIN
        INSERT INTO public.round_weaknesses (round_id, topic_id) VALUES (fixture_round, other_topic);
        RAISE EXCEPTION 'The topic-category foreign key accepted an incompatible topic';
    EXCEPTION WHEN foreign_key_violation THEN NULL;
    END;
    BEGIN
        UPDATE public.interview_rounds SET round_type_id = (
            SELECT round_type_id FROM public.topics WHERE id = other_topic
        ) WHERE id = fixture_round;
        RAISE EXCEPTION 'A round with a predefined weakness could change to an incompatible category';
    EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN NULL;
    END;
END;
$$;

ROLLBACK;
