-- Run as the SQL Editor administrator after migrations and seed.
-- Replace the empty string with an existing dedicated test user's UUID.
-- A blank value runs the schema and seed checks and skips user-owned fixtures.
BEGIN;

SELECT set_config('intertrap.test_user_id', '', true);

CREATE TEMP TABLE expected_round_types (slug text PRIMARY KEY, name text NOT NULL) ON COMMIT DROP;
INSERT INTO expected_round_types VALUES
    ('aptitude', 'Aptitude'),
    ('mcq', 'MCQ Assessment'),
    ('coding', 'Coding'),
    ('gd', 'Group Discussion'),
    ('technical', 'Technical Interview'),
    ('hr', 'HR Interview'),
    ('managerial', 'Managerial Interview'),
    ('communication', 'Communication Assessment'),
    ('other', 'Other');

CREATE TEMP TABLE expected_topics (slug text, name text, PRIMARY KEY (slug, name)) ON COMMIT DROP;
INSERT INTO expected_topics VALUES
    ('aptitude', 'Percentages'),
    ('aptitude', 'Profit and Loss'),
    ('aptitude', 'Ratio and Proportion'),
    ('aptitude', 'Averages'),
    ('aptitude', 'Time and Work'),
    ('aptitude', 'Time Speed and Distance'),
    ('aptitude', 'Probability'),
    ('aptitude', 'Permutation and Combination'),
    ('aptitude', 'Number System'),
    ('aptitude', 'Data Interpretation'),
    ('aptitude', 'Logical Reasoning'),
    ('aptitude', 'Mixtures and Alligation'),
    ('aptitude', 'Simple and Compound Interest'),
    ('aptitude', 'Pipes and Cisterns'),
    ('aptitude', 'Seating Arrangement'),
    ('aptitude', 'Ranking Problems'),
    ('mcq', 'Programming Output'),
    ('mcq', 'OOP'),
    ('mcq', 'DBMS'),
    ('mcq', 'Operating Systems'),
    ('mcq', 'Computer Networks'),
    ('mcq', 'Logical Reasoning'),
    ('mcq', 'Programming Fundamentals'),
    ('coding', 'Arrays'),
    ('coding', 'Strings'),
    ('coding', 'Hashing'),
    ('coding', 'Linked Lists'),
    ('coding', 'Stacks and Queues'),
    ('coding', 'Binary Search'),
    ('coding', 'Recursion'),
    ('coding', 'Trees'),
    ('coding', 'Graphs'),
    ('coding', 'Dynamic Programming'),
    ('coding', 'Greedy'),
    ('coding', 'Sliding Window'),
    ('coding', 'Two Pointers'),
    ('coding', 'Time Complexity'),
    ('coding', 'Space Complexity'),
    ('coding', 'Edge Cases'),
    ('coding', 'Debugging'),
    ('coding', 'Problem Solving'),
    ('gd', 'Communication'),
    ('gd', 'Confidence'),
    ('gd', 'Fluency'),
    ('gd', 'Leadership'),
    ('gd', 'Listening'),
    ('gd', 'Content Knowledge'),
    ('gd', 'Teamwork'),
    ('gd', 'Clarity of Thought'),
    ('technical', 'OOP'),
    ('technical', 'DBMS'),
    ('technical', 'SQL'),
    ('technical', 'Operating Systems'),
    ('technical', 'Computer Networks'),
    ('technical', 'Projects'),
    ('technical', 'REST API'),
    ('technical', 'Authentication'),
    ('technical', 'System Design'),
    ('technical', 'Git'),
    ('technical', 'Programming Fundamentals'),
    ('technical', 'Cloud Computing'),
    ('technical', 'Data Structures'),
    ('hr', 'Self Introduction'),
    ('hr', 'Confidence'),
    ('hr', 'Behavioral Questions'),
    ('hr', 'Salary Negotiation'),
    ('hr', 'Company Knowledge'),
    ('hr', 'Situational Questions'),
    ('hr', 'Career Goals'),
    ('hr', 'Strengths and Weaknesses'),
    ('managerial', 'Decision Making'),
    ('managerial', 'Leadership'),
    ('managerial', 'Conflict Resolution'),
    ('managerial', 'Team Management'),
    ('managerial', 'Problem Solving'),
    ('communication', 'Grammar'),
    ('communication', 'Vocabulary'),
    ('communication', 'Fluency'),
    ('communication', 'Pronunciation'),
    ('communication', 'Listening'),
    ('other', 'Time Management'),
    ('other', 'Confidence'),
    ('other', 'Preparation');

DO $$
DECLARE
    table_name text;
    table_id oid;
    client_role text;
    privilege_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['profiles', 'interviews', 'round_types', 'interview_rounds', 'topics', 'round_weaknesses', 'ai_analysis'] LOOP
        SELECT c.oid INTO table_id
        FROM pg_class AS c
        JOIN pg_namespace AS n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = table_name
          AND c.relkind = 'r' AND c.relrowsecurity;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Missing table or disabled RLS for %', table_name;
        END IF;
        FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            FOREACH privilege_name IN ARRAY ARRAY[
                'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
            ] LOOP
                IF has_table_privilege(client_role, table_id, privilege_name) THEN
                    RAISE EXCEPTION '% has % on %', client_role, privilege_name, table_name;
                END IF;
            END LOOP;
        END LOOP;
    END LOOP;

    IF (SELECT count(*) FROM expected_round_types) <> 9 OR EXISTS (
        SELECT slug, name FROM expected_round_types
        EXCEPT SELECT slug, name FROM public.round_types
    ) THEN
        RAISE EXCEPTION 'Expected nine seeded round categories';
    END IF;

    IF (SELECT count(*) FROM expected_topics) <> 83 OR EXISTS (
        SELECT slug, name FROM expected_topics
        EXCEPT
        SELECT rt.slug, t.name FROM public.topics AS t
        JOIN public.round_types AS rt ON rt.id = t.round_type_id
    ) THEN
        RAISE EXCEPTION 'Expected 83 seeded topics';
    END IF;

    IF EXISTS (
        SELECT 1 FROM auth.users AS u
        LEFT JOIN public.profiles AS p ON p.id = u.id
        WHERE p.id IS NULL
    ) THEN
        RAISE EXCEPTION 'One or more auth users are missing a profile';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'auth.users'::regclass
          AND tgname = 'intertrap_create_user_profile' AND tgenabled IN ('O', 'A')
          AND tgfoid = 'public.handle_new_user()'::regprocedure
    ) THEN
        RAISE EXCEPTION 'Signup profile trigger is missing or disabled';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.profiles'::regclass
          AND tgname = 'intertrap_set_updated_at' AND tgenabled IN ('O', 'A')
          AND tgfoid = 'public.set_updated_at()'::regprocedure
    ) THEN
        RAISE EXCEPTION 'Profile timestamp trigger is missing or disabled';
    END IF;

    RAISE NOTICE 'Schema, permissions, seed and profile coverage checks passed';
END;
$$;

-- Exercise the same function used by profiles without updating any real profile.
CREATE TEMP TABLE timestamp_fixture (updated_at timestamptz) ON COMMIT DROP;
CREATE TRIGGER timestamp_fixture_update BEFORE UPDATE ON timestamp_fixture
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO timestamp_fixture VALUES ('2000-01-01 00:00:00+00');
UPDATE timestamp_fixture SET updated_at = '2000-01-01 00:00:00+00';

DO $$
DECLARE
    test_user uuid := nullif(current_setting('intertrap.test_user_id'), '')::uuid;
    test_interview uuid;
    coding_round uuid;
    hr_round uuid;
    coding_type bigint;
    hr_type bigint;
    coding_topic bigint;
    fixture_topic bigint;
    old_stamp timestamptz := '2000-01-01 00:00:00+00';
BEGIN
    IF EXISTS (SELECT 1 FROM timestamp_fixture WHERE updated_at <= old_stamp) THEN
        RAISE EXCEPTION 'Timestamp trigger did not update the fixture';
    END IF;

    IF test_user IS NULL THEN
        RAISE NOTICE 'Skipped user-owned fixture checks. Supply a dedicated test user UUID to run them.';
        RETURN;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = test_user) THEN
        RAISE EXCEPTION 'The supplied test user does not exist';
    END IF;

    SELECT id INTO STRICT coding_type FROM public.round_types WHERE slug = 'coding';
    SELECT id INTO STRICT hr_type FROM public.round_types WHERE slug = 'hr';
    SELECT id INTO STRICT coding_topic FROM public.topics WHERE round_type_id = coding_type AND name = 'Arrays';
    INSERT INTO public.topics (round_type_id, name)
    VALUES (coding_type, 'Validation ' || gen_random_uuid()) RETURNING id INTO fixture_topic;

    INSERT INTO public.interviews (user_id, company_name, updated_at)
    VALUES (test_user, 'Module 4 validation fixture', old_stamp) RETURNING id INTO test_interview;
    INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number, updated_at)
    VALUES (test_interview, coding_type, 1, old_stamp) RETURNING id INTO coding_round;
    INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number)
    VALUES (test_interview, hr_type, 2) RETURNING id INTO hr_round;
    INSERT INTO public.round_weaknesses (round_id, topic_id)
    VALUES (coding_round, coding_topic), (coding_round, fixture_topic);
    INSERT INTO public.round_weaknesses (round_id, custom_topic) VALUES (coding_round, 'Edge Case');
    INSERT INTO public.ai_analysis (interview_id, model_name, summary) VALUES (test_interview, 'fixture', 'fixture');

    BEGIN
        INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number) VALUES (test_interview, coding_type, 1);
        RAISE EXCEPTION 'Expected failure for duplicate round number';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interview_rounds SET round_number = 0 WHERE id = coding_round;
        RAISE EXCEPTION 'Expected failure for nonpositive round number';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interview_rounds SET status = 'invalid' WHERE id = coding_round;
        RAISE EXCEPTION 'Expected failure for invalid round status';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interviews SET overall_status = 'invalid' WHERE id = test_interview;
        RAISE EXCEPTION 'Expected failure for invalid interview status';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interviews SET interview_mode = 'invalid' WHERE id = test_interview;
        RAISE EXCEPTION 'Expected failure for invalid interview mode';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.round_weaknesses SET severity = 6 WHERE round_id = coding_round;
        RAISE EXCEPTION 'Expected failure for invalid severity';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number) VALUES (gen_random_uuid(), coding_type, 1);
        RAISE EXCEPTION 'Expected failure for invalid foreign key';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interviews SET company_name = E' \t\n' WHERE id = test_interview;
        RAISE EXCEPTION 'Expected failure for blank company';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.round_weaknesses (round_id, topic_id) VALUES (coding_round, coding_topic);
        RAISE EXCEPTION 'Expected failure for duplicate predefined topic';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.round_weaknesses (round_id, custom_topic) VALUES (coding_round, E' \tEDGE   CASE\n');
        RAISE EXCEPTION 'Expected failure for duplicate normalized custom topic';
    EXCEPTION WHEN unique_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.round_weaknesses (round_id, topic_id) VALUES (hr_round, coding_topic);
        RAISE EXCEPTION 'Expected failure for wrong round category';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.interview_rounds SET round_type_id = hr_type WHERE id = coding_round;
        RAISE EXCEPTION 'Expected failure for incompatible round category change';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.topics SET round_type_id = hr_type WHERE id = fixture_topic;
        RAISE EXCEPTION 'Expected failure for incompatible topic category change';
    EXCEPTION WHEN foreign_key_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.round_weaknesses (round_id, topic_id, custom_topic) VALUES (coding_round, coding_topic, 'Both');
        RAISE EXCEPTION 'Expected failure for both topic variants';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.round_weaknesses (round_id) VALUES (coding_round);
        RAISE EXCEPTION 'Expected failure for neither topic variant';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        INSERT INTO public.round_weaknesses (round_id, custom_topic) VALUES (coding_round, E' \t\n');
        RAISE EXCEPTION 'Expected failure for blank custom topic';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    BEGIN
        UPDATE public.ai_analysis SET strengths = '{}'::jsonb WHERE interview_id = test_interview;
        RAISE EXCEPTION 'Expected failure for invalid analysis JSON';
    EXCEPTION WHEN check_violation THEN
        NULL;
    END;

    UPDATE public.interviews SET notes = 'updated' WHERE id = test_interview;
    UPDATE public.interview_rounds SET notes = 'updated' WHERE id = coding_round;
    IF (SELECT updated_at FROM public.interviews WHERE id = test_interview) <= old_stamp
        OR (SELECT updated_at FROM public.interview_rounds WHERE id = coding_round) <= old_stamp THEN
        RAISE EXCEPTION 'Interview or round timestamp did not update';
    END IF;

    DELETE FROM public.interviews WHERE id = test_interview;
    IF EXISTS (SELECT 1 FROM public.interview_rounds WHERE interview_id = test_interview)
        OR EXISTS (SELECT 1 FROM public.round_weaknesses WHERE round_id IN (coding_round, hr_round))
        OR EXISTS (SELECT 1 FROM public.ai_analysis WHERE interview_id = test_interview) THEN
        RAISE EXCEPTION 'Interview cascade failed';
    END IF;

    RAISE NOTICE 'User-owned fixture checks passed';
END;
$$;

ROLLBACK;

-- Manual signup and profile verification are in docs/MODULE_4_SETUP.md.
