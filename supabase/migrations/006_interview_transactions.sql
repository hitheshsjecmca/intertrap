BEGIN;

CREATE SCHEMA intertrap_private;
REVOKE ALL ON SCHEMA intertrap_private FROM PUBLIC, anon, authenticated;
CREATE ROLE intertrap_writer NOLOGIN NOBYPASSRLS;
GRANT intertrap_writer TO CURRENT_USER;
GRANT USAGE ON SCHEMA public, intertrap_private TO intertrap_writer;

-- Hosted Supabase restricts grants on the managed auth schema.
CREATE FUNCTION intertrap_private.current_actor()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
    SELECT auth.uid()
$$;

ALTER TABLE public.interviews ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);
ALTER TABLE public.ai_analysis ADD COLUMN interview_version integer CHECK (interview_version > 0);
-- NULL identifies historical analyses whose source version is unknown.

CREATE TABLE intertrap_private.interview_requests (
    user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
    request_id uuid,
    interview_id uuid NOT NULL,
    payload_hash bytea NOT NULL,
    PRIMARY KEY (user_id, request_id)
);
REVOKE ALL ON intertrap_private.interview_requests FROM PUBLIC, anon, authenticated;
ALTER TABLE intertrap_private.interview_requests ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT ON intertrap_private.interview_requests TO intertrap_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interviews, public.interview_rounds, public.round_weaknesses TO intertrap_writer;
GRANT SELECT ON public.round_types, public.topics TO intertrap_writer;

CREATE POLICY interview_requests_writer ON intertrap_private.interview_requests TO intertrap_writer
    USING (user_id = (SELECT intertrap_private.current_actor()))
    WITH CHECK (user_id = (SELECT intertrap_private.current_actor()));
CREATE POLICY interviews_rpc_writer ON public.interviews TO intertrap_writer
    USING (user_id = (SELECT intertrap_private.current_actor()))
    WITH CHECK (user_id = (SELECT intertrap_private.current_actor()));
CREATE POLICY interview_rounds_rpc_writer ON public.interview_rounds TO intertrap_writer
    USING (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_rounds.interview_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_rounds.interview_id));
CREATE POLICY round_weaknesses_rpc_writer ON public.round_weaknesses TO intertrap_writer
    USING (EXISTS (SELECT 1 FROM public.interview_rounds r WHERE r.id = round_weaknesses.round_id))
    WITH CHECK (EXISTS (SELECT 1 FROM public.interview_rounds r WHERE r.id = round_weaknesses.round_id));
CREATE POLICY round_types_rpc_writer ON public.round_types FOR SELECT TO intertrap_writer USING (true);
CREATE POLICY topics_rpc_writer ON public.topics FOR SELECT TO intertrap_writer USING (true);

-- Preserve uniqueness while allowing an atomic permutation of round positions.
ALTER TABLE public.interview_rounds
    DROP CONSTRAINT interview_rounds_interview_id_round_number_key,
    ADD CONSTRAINT interview_rounds_position_key UNIQUE (interview_id, round_number)
        DEFERRABLE INITIALLY IMMEDIATE;

REVOKE DELETE ON public.interviews, public.interview_rounds, public.round_weaknesses
FROM PUBLIC, anon, authenticated;
REVOKE INSERT (company_name, job_role, interview_date, overall_status, interview_mode, notes),
       UPDATE (company_name, job_role, interview_date, overall_status, interview_mode, notes)
ON public.interviews FROM PUBLIC, anon, authenticated;
REVOKE INSERT (interview_id, round_type_id, round_number, custom_name, status, round_date, notes),
       UPDATE (round_type_id, round_number, custom_name, status, round_date, notes)
ON public.interview_rounds FROM PUBLIC, anon, authenticated;
REVOKE INSERT (round_id, topic_id, custom_topic, severity, notes),
       UPDATE (topic_id, custom_topic, severity, notes)
ON public.round_weaknesses FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.interviews, public.interview_rounds, public.round_weaknesses
FROM PUBLIC, anon, authenticated;

CREATE FUNCTION intertrap_private.validate_text(item jsonb, keys text[], limits int[])
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE position int;
BEGIN
    FOR position IN 1..cardinality(keys) LOOP
        IF coalesce(jsonb_typeof(item -> keys[position]), 'null') NOT IN ('string', 'null')
            OR length(item ->> keys[position]) > limits[position] THEN
            RAISE EXCEPTION 'Invalid text field: %', keys[position] USING ERRCODE = '22023';
        END IF;
    END LOOP;
END;
$$;

CREATE FUNCTION intertrap_private.validate_interview(payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    item jsonb;
    weakness jsonb;
    topic bigint;
    category bigint;
    custom_name text;
    seen_topics bigint[];
    seen_custom text[];
    ordinal bigint;
    phase text := 'cleared';
    outcome text := payload ->> 'overall_status';
    status text;
    round_ids uuid[] := ARRAY[]::uuid[];
    weakness_ids uuid[] := ARRAY[]::uuid[];
    existing_id uuid;
BEGIN
    IF jsonb_typeof(payload) IS DISTINCT FROM 'object'
        OR jsonb_typeof(payload -> 'rounds') IS DISTINCT FROM 'array'
        OR payload ? 'user_id' THEN
        RAISE EXCEPTION 'Invalid interview object' USING ERRCODE = '22023';
    END IF;
    PERFORM intertrap_private.validate_text(payload, ARRAY['company_name','job_role','notes','interview_date','interview_mode','overall_status'], ARRAY[120,120,2000,10,10,12]);
    IF coalesce(payload ->> 'company_name', '') !~ '[^[:space:]]'
        OR coalesce(payload ->> 'interview_date', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        OR coalesce(outcome, '') NOT IN ('pending','selected','rejected','withdrawn')
        OR coalesce(payload ->> 'interview_mode', 'online') NOT IN ('online','offline','hybrid') THEN
        RAISE EXCEPTION 'Invalid company details or interview outcome' USING ERRCODE = '22023';
    END IF;
    PERFORM (payload ->> 'interview_date')::date;

    FOR item, ordinal IN SELECT value, ordinality FROM jsonb_array_elements(payload -> 'rounds') WITH ORDINALITY LOOP
        status := coalesce(item ->> 'status', '');
        IF jsonb_typeof(item) IS DISTINCT FROM 'object'
            OR jsonb_typeof(item -> 'weaknesses') IS DISTINCT FROM 'array'
            OR item ->> 'round_number' IS DISTINCT FROM ordinal::text
            OR coalesce(item ->> 'round_type_id', '') !~ '^[1-9][0-9]*$'
            OR status NOT IN ('pending','cleared','rejected','not_reached') THEN
            RAISE EXCEPTION 'Invalid round configuration' USING ERRCODE = '22023';
        END IF;
        PERFORM intertrap_private.validate_text(item, ARRAY['custom_name','notes','round_date','status'], ARRAY[120,2000,10,12]);
        IF item ->> 'round_date' IS NOT NULL THEN
            IF item ->> 'round_date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
                RAISE EXCEPTION 'Invalid round date' USING ERRCODE = '22023';
            END IF;
            PERFORM (item ->> 'round_date')::date;
        END IF;

        IF (phase = 'rejected' AND status <> 'not_reached')
            OR (phase <> 'rejected' AND status = 'not_reached')
            OR (phase = 'pending' AND status <> 'pending')
            OR (status = 'rejected' AND outcome <> 'rejected')
            OR (outcome = 'selected' AND status <> 'cleared')
            OR (status IN ('pending','not_reached') AND jsonb_array_length(item -> 'weaknesses') > 0) THEN
            RAISE EXCEPTION 'Round progression or overall outcome is inconsistent' USING ERRCODE = '22023';
        END IF;
        IF status IN ('pending','rejected') THEN phase := status; END IF;
        category := (item ->> 'round_type_id')::bigint;
        IF NOT EXISTS (SELECT 1 FROM public.round_types WHERE id = category) THEN
            RAISE EXCEPTION 'Unknown round category' USING ERRCODE = '22023';
        END IF;

        existing_id := (item ->> 'id')::uuid;
        IF existing_id = ANY(round_ids) THEN
            RAISE EXCEPTION 'Duplicate round identifier' USING ERRCODE = '22023';
        END IF;
        IF existing_id IS NOT NULL THEN round_ids := array_append(round_ids, existing_id); END IF;
        seen_topics := ARRAY[]::bigint[];
        seen_custom := ARRAY[]::text[];

        FOR weakness IN SELECT value FROM jsonb_array_elements(item -> 'weaknesses') LOOP
            IF jsonb_typeof(weakness) IS DISTINCT FROM 'object'
                OR jsonb_typeof(weakness -> 'severity') IS DISTINCT FROM 'number'
                OR coalesce(weakness ->> 'severity', '') !~ '^[1-5]$'
                OR (weakness ->> 'topic_id' IS NOT NULL AND weakness ->> 'topic_id' !~ '^[1-9][0-9]*$') THEN
                RAISE EXCEPTION 'Invalid weakness configuration' USING ERRCODE = '22023';
            END IF;
            PERFORM intertrap_private.validate_text(weakness, ARRAY['custom_topic','notes'], ARRAY[120,2000]);
            topic := (weakness ->> 'topic_id')::bigint;
            custom_name := lower(trim(regexp_replace(weakness ->> 'custom_topic', '[[:space:]]+', ' ', 'g')));
            IF topic IS NOT NULL THEN
                IF custom_name IS NOT NULL OR topic = ANY(seen_topics)
                    OR NOT EXISTS (SELECT 1 FROM public.topics WHERE id = topic AND round_type_id = category) THEN
                    RAISE EXCEPTION 'Invalid or duplicate predefined topic' USING ERRCODE = '22023';
                END IF;
                seen_topics := array_append(seen_topics, topic);
            ELSE
                IF coalesce(custom_name, '') = '' OR custom_name = ANY(seen_custom) THEN
                    RAISE EXCEPTION 'Blank or duplicate custom topic' USING ERRCODE = '22023';
                END IF;
                seen_custom := array_append(seen_custom, custom_name);
            END IF;
            existing_id := (weakness ->> 'id')::uuid;
            IF existing_id = ANY(weakness_ids) THEN
                RAISE EXCEPTION 'Duplicate weakness identifier' USING ERRCODE = '22023';
            END IF;
            IF existing_id IS NOT NULL THEN weakness_ids := array_append(weakness_ids, existing_id); END IF;
        END LOOP;
    END LOOP;
END;
$$;

CREATE FUNCTION intertrap_private.write_interview_children(target uuid, payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
    item jsonb;
    weakness jsonb;
    stored_round uuid;
    stored_weakness uuid;
BEGIN
    SET CONSTRAINTS public.interview_rounds_position_key DEFERRED;
    DELETE FROM public.interview_rounds AS r WHERE r.interview_id = target AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(payload -> 'rounds') AS j WHERE (j ->> 'id')::uuid = r.id
    );

    FOR item IN SELECT value FROM jsonb_array_elements(payload -> 'rounds') LOOP
        stored_round := (item ->> 'id')::uuid;
        IF stored_round IS NULL THEN
            INSERT INTO public.interview_rounds (interview_id, round_type_id, round_number, custom_name, round_date, status, notes)
            VALUES (target, (item ->> 'round_type_id')::bigint, (item ->> 'round_number')::int,
                item ->> 'custom_name', (item ->> 'round_date')::date, item ->> 'status', item ->> 'notes')
            RETURNING id INTO stored_round;
        ELSE
            IF NOT EXISTS (SELECT 1 FROM public.interview_rounds WHERE id = stored_round AND interview_id = target) THEN
                RAISE EXCEPTION 'Invalid round reference' USING ERRCODE = '22023';
            END IF;
            DELETE FROM public.round_weaknesses AS w WHERE w.round_id = stored_round AND NOT EXISTS (
                SELECT 1 FROM jsonb_array_elements(item -> 'weaknesses') AS j WHERE (j ->> 'id')::uuid = w.id
            );
            UPDATE public.interview_rounds SET round_type_id = (item ->> 'round_type_id')::bigint,
                round_number = (item ->> 'round_number')::int, custom_name = item ->> 'custom_name',
                round_date = (item ->> 'round_date')::date, status = item ->> 'status', notes = item ->> 'notes'
            WHERE id = stored_round;
        END IF;
        FOR weakness IN SELECT value FROM jsonb_array_elements(item -> 'weaknesses') LOOP
            stored_weakness := (weakness ->> 'id')::uuid;
            IF stored_weakness IS NULL THEN
                INSERT INTO public.round_weaknesses (round_id, topic_id, custom_topic, severity, notes)
                VALUES (stored_round, (weakness ->> 'topic_id')::bigint, weakness ->> 'custom_topic',
                    (weakness ->> 'severity')::int, weakness ->> 'notes');
            ELSE
                -- Topic changes are modeled as removal and addition, preserving stable links for edits.
                UPDATE public.round_weaknesses
                SET severity = (weakness ->> 'severity')::int, notes = weakness ->> 'notes'
                WHERE id = stored_weakness AND round_id = stored_round
                  AND topic_id IS NOT DISTINCT FROM (weakness ->> 'topic_id')::bigint
                  AND custom_topic IS NOT DISTINCT FROM trim(regexp_replace(weakness ->> 'custom_topic', '[[:space:]]+', ' ', 'g'));
                IF NOT FOUND THEN
                    RAISE EXCEPTION 'Invalid weakness reference' USING ERRCODE = '22023';
                END IF;
            END IF;
        END LOOP;
    END LOOP;
    SET CONSTRAINTS public.interview_rounds_position_key IMMEDIATE;
END;
$$;

CREATE FUNCTION public.create_interview(payload jsonb, client_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    actor uuid := intertrap_private.current_actor();
    target uuid := gen_random_uuid();
    digest bytea;
    previous intertrap_private.interview_requests%ROWTYPE;
    current_version int;
BEGIN
    IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
    IF client_request_id IS NULL OR payload IS NULL THEN
        RAISE EXCEPTION 'Interview and request identifier are required' USING ERRCODE = '22023';
    END IF;
    digest := sha256(convert_to(payload::text, 'UTF8'));
    INSERT INTO intertrap_private.interview_requests VALUES (actor, client_request_id, target, digest)
    ON CONFLICT (user_id, request_id) DO NOTHING;
    IF NOT FOUND THEN
        SELECT * INTO STRICT previous FROM intertrap_private.interview_requests
        WHERE user_id = actor AND request_id = client_request_id;
        IF previous.payload_hash <> digest THEN
            RAISE EXCEPTION 'Request identifier already used for different content' USING ERRCODE = 'PT409';
        END IF;
        SELECT version INTO current_version FROM public.interviews WHERE id = previous.interview_id AND user_id = actor;
        IF NOT FOUND THEN RAISE EXCEPTION 'Interview unavailable' USING ERRCODE = 'PT404'; END IF;
        RETURN jsonb_build_object('id', previous.interview_id, 'version', current_version);
    END IF;

    PERFORM intertrap_private.validate_interview(payload);
    INSERT INTO public.interviews (id, user_id, company_name, job_role, interview_date, interview_mode, overall_status, notes)
    VALUES (target, actor, trim(payload ->> 'company_name'), payload ->> 'job_role', (payload ->> 'interview_date')::date,
        payload ->> 'interview_mode', payload ->> 'overall_status', payload ->> 'notes');
    PERFORM intertrap_private.write_interview_children(target, payload);
    RETURN jsonb_build_object('id', target, 'version', 1);
END;
$$;

CREATE FUNCTION public.update_interview(interview_id uuid, payload jsonb, expected_version int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
    actor uuid := intertrap_private.current_actor();
    target uuid := interview_id;
    current_version int;
BEGIN
    IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
    SELECT version INTO current_version FROM public.interviews WHERE id = target AND user_id = actor FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Interview unavailable' USING ERRCODE = 'PT404'; END IF;
    IF current_version IS DISTINCT FROM expected_version THEN
        RAISE EXCEPTION 'Interview version has changed' USING ERRCODE = 'PT409';
    END IF;

    PERFORM intertrap_private.validate_interview(payload);
    UPDATE public.interviews SET company_name = trim(payload ->> 'company_name'), job_role = payload ->> 'job_role',
        interview_date = (payload ->> 'interview_date')::date, interview_mode = payload ->> 'interview_mode',
        overall_status = payload ->> 'overall_status', notes = payload ->> 'notes', version = current_version + 1
    WHERE id = target AND user_id = actor;
    PERFORM intertrap_private.write_interview_children(target, payload);
    RETURN jsonb_build_object('id', target, 'version', current_version + 1);
END;
$$;

CREATE FUNCTION public.delete_interview(interview_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := intertrap_private.current_actor();
BEGIN
    IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501'; END IF;
    DELETE FROM public.interviews WHERE id = interview_id AND user_id = actor;
    IF NOT FOUND THEN RAISE EXCEPTION 'Interview unavailable' USING ERRCODE = 'PT404'; END IF;
    RETURN jsonb_build_object('id', interview_id);
END;
$$;

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA intertrap_private FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA intertrap_private TO intertrap_writer;
REVOKE ALL ON FUNCTION public.create_interview(jsonb, uuid), public.update_interview(uuid, jsonb, int),
    public.delete_interview(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_interview(jsonb, uuid), public.update_interview(uuid, jsonb, int),
    public.delete_interview(uuid) TO authenticated;

GRANT CREATE ON SCHEMA public TO intertrap_writer;
ALTER FUNCTION public.create_interview(jsonb, uuid) OWNER TO intertrap_writer;
ALTER FUNCTION public.update_interview(uuid, jsonb, int) OWNER TO intertrap_writer;
ALTER FUNCTION public.delete_interview(uuid) OWNER TO intertrap_writer;
REVOKE CREATE ON SCHEMA public FROM intertrap_writer;

COMMIT;
