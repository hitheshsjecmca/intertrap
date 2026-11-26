-- Substitute two existing dedicated account IDs before running.
BEGIN;
SELECT set_config('intertrap.a', '00000000-0000-0000-0000-000000000000', true);
SELECT set_config('intertrap.b', '00000000-0000-0000-0000-000000000000', true);

DO $$
BEGIN
    IF (SELECT count(*) FROM public.profiles
        WHERE id IN (current_setting('intertrap.a')::uuid,current_setting('intertrap.b')::uuid)) <> 2 THEN
        RAISE EXCEPTION 'Supply two distinct test accounts with profiles';
    END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.a'), true);

DO $$
DECLARE
    coding bigint;
    coding_topic bigint;
    hr_topic bigint;
    weakness jsonb;
    first_round jsonb;
    second_round jsonb;
    payload jsonb;
    replacement jsonb;
    result jsonb;
    req uuid := gen_random_uuid();
    target uuid;
    first_id uuid;
    second_id uuid;
    weakness_id uuid;
    before_count bigint;
BEGIN
    SELECT id INTO STRICT coding FROM public.round_types WHERE slug = 'coding';
    SELECT id INTO STRICT coding_topic FROM public.topics WHERE round_type_id = coding AND name = 'Arrays';
    SELECT t.id INTO STRICT hr_topic FROM public.topics t JOIN public.round_types c ON c.id = t.round_type_id
        WHERE c.slug = 'hr' AND t.name = 'Confidence';
    weakness := jsonb_build_object('topic_id',coding_topic,'severity',3);
    first_round := jsonb_build_object('round_number',1,'round_type_id',coding,'status','cleared',
        'weaknesses',jsonb_build_array(weakness));
    second_round := jsonb_build_object('round_number',2,'round_type_id',coding,'status','cleared',
        'weaknesses',jsonb_build_array(jsonb_build_object('custom_topic','  Unit   tests ','severity',2)));
    payload := jsonb_build_object('company_name','Transaction fixture','interview_date','2097-07-15',
        'overall_status','pending','rounds',jsonb_build_array(first_round,second_round));

    result := public.create_interview(payload, req);
    target := (result ->> 'id')::uuid;
    IF result IS DISTINCT FROM public.create_interview(payload, req) THEN RAISE EXCEPTION 'Idempotent replay failed'; END IF;
    BEGIN
        PERFORM public.create_interview(payload || '{"notes":"changed"}', req);
        RAISE EXCEPTION 'Reused request key accepted different content';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
    SELECT id INTO STRICT first_id FROM public.interview_rounds WHERE interview_id = target AND round_number = 1;
    SELECT id INTO STRICT second_id FROM public.interview_rounds WHERE interview_id = target AND round_number = 2;
    SELECT id INTO STRICT weakness_id FROM public.round_weaknesses WHERE round_id = first_id AND topic_id = coding_topic;
    IF NOT EXISTS (SELECT 1 FROM public.round_weaknesses WHERE round_id = second_id AND custom_topic = 'Unit tests') THEN
        RAISE EXCEPTION 'Custom topic normalization failed';
    END IF;

    SELECT count(*) INTO before_count FROM public.interviews;
    BEGIN
        PERFORM public.create_interview(jsonb_set(payload,'{rounds,0,round_type_id}','0'), gen_random_uuid());
        RAISE EXCEPTION 'Accepted invalid category';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.create_interview(jsonb_set(payload,'{rounds,0,weaknesses,0,topic_id}',to_jsonb(hr_topic)), gen_random_uuid());
        RAISE EXCEPTION 'Accepted wrong topic category';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.create_interview(jsonb_set(payload,'{rounds,0,weaknesses,0,severity}','6'), gen_random_uuid());
        RAISE EXCEPTION 'Accepted invalid severity';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.create_interview(jsonb_set(payload,'{rounds,0,weaknesses}',jsonb_build_array(weakness, weakness)), gen_random_uuid());
        RAISE EXCEPTION 'Accepted duplicate weakness';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.create_interview(jsonb_set(jsonb_set(payload,'{rounds,0,status}','"pending"'),'{rounds,0,weaknesses}','[]'), gen_random_uuid());
        RAISE EXCEPTION 'Accepted pending before completed';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.create_interview(jsonb_set(jsonb_set(jsonb_set(payload,'{rounds,1,status}','"pending"'),'{rounds,1,weaknesses}','[]'),'{overall_status}','"selected"'), gen_random_uuid());
        RAISE EXCEPTION 'Accepted selected with pending';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.create_interview(jsonb_set(payload,'{rounds,1,id}',to_jsonb(gen_random_uuid()),true), gen_random_uuid());
        RAISE EXCEPTION 'Accepted lost child reference';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    BEGIN
        PERFORM public.create_interview(payload || jsonb_build_object('user_id',current_setting('intertrap.b')), gen_random_uuid());
        RAISE EXCEPTION 'Accepted supplied owner';
    EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
    IF (SELECT count(*) FROM public.interviews) <> before_count THEN RAISE EXCEPTION 'Atomic rollback failed'; END IF;

    replacement := payload || jsonb_build_object('rounds', jsonb_build_array(
        second_round || jsonb_build_object('id',second_id,'round_number',1),
        first_round || jsonb_build_object('id',first_id,'round_number',2,'weaknesses',
            jsonb_build_array(weakness || jsonb_build_object('id',weakness_id,'severity',5)))));
    result := public.update_interview(target,replacement,1);
    IF (result ->> 'version')::int IS DISTINCT FROM 2
        OR NOT EXISTS (SELECT 1 FROM public.interview_rounds WHERE id = first_id AND round_number = 2)
        OR NOT EXISTS (SELECT 1 FROM public.round_weaknesses WHERE id = weakness_id AND severity = 5) THEN
        RAISE EXCEPTION 'ID-preserving reorder failed';
    END IF;
    BEGIN
        PERFORM public.update_interview(target,replacement,1);
        RAISE EXCEPTION 'Stale update accepted';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

    PERFORM public.create_interview(payload || '{"overall_status":"rejected"}',gen_random_uuid());
    PERFORM public.create_interview(payload || '{"overall_status":"withdrawn"}',gen_random_uuid());
    PERFORM public.create_interview(jsonb_set(payload || '{"overall_status":"rejected"}','{rounds}',
        jsonb_build_array(first_round || '{"status":"rejected"}',second_round || '{"status":"not_reached","weaknesses":[]}')),gen_random_uuid());
    PERFORM public.create_interview(jsonb_set(payload || '{"overall_status":"rejected"}','{rounds}',
        jsonb_build_array(first_round,second_round || '{"status":"rejected"}')),gen_random_uuid());

    BEGIN
        UPDATE public.interview_rounds SET status = 'rejected' WHERE id = first_id;
        RAISE EXCEPTION 'Direct round update allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        INSERT INTO public.interviews (company_name) VALUES ('Direct fixture');
        RAISE EXCEPTION 'Direct interview insert allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN
        DELETE FROM public.round_weaknesses WHERE id = weakness_id;
        RAISE EXCEPTION 'Direct weakness delete allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;

    PERFORM set_config('intertrap.target', target::text, true);
    PERFORM set_config('intertrap.payload', replacement::text, true);
    PERFORM set_config('intertrap.request', req::text, true);
    PERFORM set_config('intertrap.original', payload::text, true);
    PERFORM set_config('intertrap.weakness_id', weakness_id::text, true);
END;
$$;

RESET ROLE;
INSERT INTO public.ai_analysis (interview_id, model_name, summary, interview_version)
VALUES (current_setting('intertrap.target')::uuid, 'fixture', 'Rollback fixture', 1);
SET LOCAL ROLE authenticated;

SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.b'), true);
DO $$
DECLARE
    target uuid := current_setting('intertrap.target')::uuid;
    owned uuid;
BEGIN
    IF EXISTS (SELECT 1 FROM public.interviews WHERE id = target) THEN RAISE EXCEPTION 'Cross-user interview read'; END IF;
    BEGIN
        PERFORM public.update_interview(target,current_setting('intertrap.payload')::jsonb,2);
        RAISE EXCEPTION 'Cross-user update allowed';
    EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
    BEGIN
        PERFORM public.delete_interview(target);
        RAISE EXCEPTION 'Cross-user delete allowed';
    EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
    owned := (public.create_interview(current_setting('intertrap.original')::jsonb,
        current_setting('intertrap.request')::uuid) ->> 'id')::uuid;
    IF owned = target OR NOT EXISTS (SELECT 1 FROM public.interviews WHERE id = owned) THEN
        RAISE EXCEPTION 'Request identifier was not scoped to its owner';
    END IF;
END;
$$;

SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.a'), true);
DO $$
DECLARE target uuid := current_setting('intertrap.target')::uuid;
BEGIN
    PERFORM public.delete_interview(target);
    BEGIN
        PERFORM public.create_interview(current_setting('intertrap.original')::jsonb,
            current_setting('intertrap.request')::uuid);
        RAISE EXCEPTION 'Deleted interview was recreated using the old key';
    EXCEPTION WHEN SQLSTATE 'PT404' THEN NULL; END;
END;
$$;
RESET ROLE;
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM public.interview_rounds WHERE interview_id = current_setting('intertrap.target')::uuid)
       OR EXISTS (SELECT 1 FROM public.round_weaknesses WHERE id = current_setting('intertrap.weakness_id')::uuid)
       OR EXISTS (SELECT 1 FROM public.ai_analysis WHERE interview_id = current_setting('intertrap.target')::uuid) THEN
        RAISE EXCEPTION 'Cascade failed';
    END IF;
END;
$$;

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
    BEGIN
        PERFORM public.create_interview('{}',gen_random_uuid());
        RAISE EXCEPTION 'Anonymous create allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
ROLLBACK;
