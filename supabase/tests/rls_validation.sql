-- Replace both UUIDs with distinct existing dedicated test accounts.
-- Works before and after migration 006. The transaction suite tests RPC writes.
BEGIN;
SELECT set_config('intertrap.a', '00000000-0000-0000-0000-000000000000', true);
SELECT set_config('intertrap.b', '00000000-0000-0000-0000-000000000000', true);

DO $$
DECLARE
    a uuid := current_setting('intertrap.a')::uuid;
    b uuid := current_setting('intertrap.b')::uuid;
    category bigint;
    interview uuid;
    round uuid;
BEGIN
    IF a = b OR (SELECT count(*) FROM public.profiles WHERE id IN (a, b)) <> 2 THEN
        RAISE EXCEPTION 'Supply two distinct existing dedicated users with profiles';
    END IF;
    SELECT id INTO STRICT category FROM public.round_types WHERE slug = 'coding';
    INSERT INTO public.interviews (user_id, company_name)
    VALUES (b, 'Module 5 rollback fixture') RETURNING id INTO interview;
    INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number)
    VALUES (interview, category, 1) RETURNING id INTO round;
    INSERT INTO public.round_weaknesses (round_id, custom_topic) VALUES (round, 'Fixture');
    INSERT INTO public.ai_analysis (interview_id, model_name, summary) VALUES (interview, 'fixture', 'fixture');
    PERFORM set_config('intertrap.foreign_interview', interview::text, true);
    PERFORM set_config('intertrap.foreign_round', round::text, true);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object(
    'sub', current_setting('intertrap.a'), 'role', 'authenticated'
)::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.a'), true);

DO $$
DECLARE
    a uuid := current_setting('intertrap.a')::uuid;
    b uuid := current_setting('intertrap.b')::uuid;
    foreign_interview uuid := current_setting('intertrap.foreign_interview')::uuid;
    foreign_round uuid := current_setting('intertrap.foreign_round')::uuid;
    own_interview uuid;
    own_round uuid;
    category bigint;
    topic bigint;
    rpc_only boolean := to_regprocedure('public.create_interview(jsonb,uuid)') IS NOT NULL;
    fixture_payload jsonb;
BEGIN
    IF current_user <> 'authenticated' OR auth.uid() IS DISTINCT FROM a THEN
        RAISE EXCEPTION 'Incorrect authenticated test context';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = a)
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = b)
        OR EXISTS (SELECT 1 FROM public.interviews WHERE id = foreign_interview)
        OR EXISTS (SELECT 1 FROM public.interview_rounds WHERE id = foreign_round)
        OR EXISTS (SELECT 1 FROM public.round_weaknesses WHERE round_id = foreign_round)
        OR EXISTS (SELECT 1 FROM public.ai_analysis WHERE interview_id = foreign_interview) THEN
        RAISE EXCEPTION 'Incorrect owner visibility';
    END IF;

    SELECT id INTO STRICT category FROM public.round_types WHERE slug = 'coding';
    SELECT id INTO STRICT topic FROM public.topics WHERE round_type_id = category AND name = 'Arrays';
    IF rpc_only THEN
        fixture_payload := jsonb_build_object('company_name','Owned fixture','interview_date',CURRENT_DATE,
            'overall_status','pending','rounds',jsonb_build_array(jsonb_build_object(
                'round_number',1,'round_type_id',category,'status','cleared',
                'weaknesses',jsonb_build_array(jsonb_build_object('topic_id',topic,'severity',3)))));
        own_interview := (public.create_interview(fixture_payload,gen_random_uuid()) ->> 'id')::uuid;
        SELECT id INTO STRICT own_round FROM public.interview_rounds WHERE interview_id = own_interview;
        BEGIN
            UPDATE public.interviews SET notes = 'Denied' WHERE id = foreign_interview;
            RAISE EXCEPTION 'Direct update was authorized';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
        BEGIN
            DELETE FROM public.interviews WHERE id = foreign_interview;
            RAISE EXCEPTION 'Direct delete was authorized';
        EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    ELSE
        UPDATE public.interviews SET notes = 'Denied' WHERE id = foreign_interview;
        IF FOUND THEN RAISE EXCEPTION 'Cross-user update succeeded'; END IF;
        DELETE FROM public.interviews WHERE id = foreign_interview;
        IF FOUND THEN RAISE EXCEPTION 'Cross-user delete succeeded'; END IF;
        INSERT INTO public.interviews (company_name) VALUES ('Owned fixture') RETURNING id INTO own_interview;
        INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number)
        VALUES (own_interview, category, 1) RETURNING id INTO own_round;
        INSERT INTO public.round_weaknesses (round_id, topic_id) VALUES (own_round, topic);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.interviews WHERE id = own_interview AND user_id = a) THEN
        RAISE EXCEPTION 'Owner default or read policy failed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.round_weaknesses WHERE round_id = own_round AND round_type_id = category) THEN
        RAISE EXCEPTION 'Owned weakness or category trigger failed';
    END IF;

    BEGIN
        INSERT INTO public.interviews (user_id, company_name) VALUES (b, 'Fixture');
        RAISE EXCEPTION 'Unexpected access: foreign owner';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interviews SET user_id = b WHERE id = own_interview;
        RAISE EXCEPTION 'Unexpected access: ownership update';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.profiles SET id = b WHERE id = a;
        RAISE EXCEPTION 'Unexpected access: profile ID update';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number) VALUES (foreign_interview, category, 2);
        RAISE EXCEPTION 'Unexpected access: foreign round insert';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interview_rounds SET interview_id = foreign_interview WHERE id = own_round;
        RAISE EXCEPTION 'Unexpected access: round reparenting';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.round_weaknesses (round_id, custom_topic) VALUES (foreign_round, 'Fixture');
        RAISE EXCEPTION 'Unexpected access: foreign weakness insert';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        UPDATE public.round_types SET name = 'Fixture' WHERE id = category;
        RAISE EXCEPTION 'Unexpected access: category write';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.topics (round_type_id, name) VALUES (category, 'Fixture');
        RAISE EXCEPTION 'Unexpected access: topic write';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.ai_analysis (interview_id, model_name, summary) VALUES (own_interview, 'fixture', 'fixture');
        RAISE EXCEPTION 'Unexpected access: untrusted analysis';
    EXCEPTION WHEN insufficient_privilege THEN
        NULL;
    END;

    IF rpc_only THEN
        PERFORM public.delete_interview(own_interview);
    ELSE
        UPDATE public.interviews SET notes = 'Owned update' WHERE id = own_interview;
        IF NOT FOUND THEN RAISE EXCEPTION 'Owned interview update failed'; END IF;
        DELETE FROM public.interviews WHERE id = own_interview;
        IF NOT FOUND THEN RAISE EXCEPTION 'Owned interview delete failed'; END IF;
    END IF;
END;
$$;

SELECT set_config('request.jwt.claims', json_build_object(
    'sub', current_setting('intertrap.b'), 'role', 'authenticated'
)::text, true);
SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.b'), true);
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.ai_analysis
        WHERE interview_id = current_setting('intertrap.foreign_interview')::uuid
    ) OR NOT EXISTS (
        SELECT 1 FROM public.round_weaknesses
        WHERE round_id = current_setting('intertrap.foreign_round')::uuid
    ) THEN
        RAISE EXCEPTION 'User B could not read their own analysis or weakness';
    END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
DECLARE
    relation text;
BEGIN
    IF current_user <> 'anon' OR auth.uid() IS NOT NULL THEN
        RAISE EXCEPTION 'Incorrect anonymous test context';
    END IF;
    FOREACH relation IN ARRAY ARRAY['profiles', 'interviews', 'interview_rounds',
        'round_weaknesses', 'ai_analysis', 'round_types', 'topics'] LOOP
        BEGIN
            EXECUTE format('SELECT 1 FROM public.%I LIMIT 1', relation);
            RAISE EXCEPTION 'Anonymous read unexpectedly succeeded for %', relation;
        EXCEPTION WHEN insufficient_privilege THEN
            NULL;
        END;
    END LOOP;
END;
$$;

RESET ROLE;
ROLLBACK;
