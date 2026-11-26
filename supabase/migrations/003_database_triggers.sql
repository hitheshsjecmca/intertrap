BEGIN;

CREATE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := statement_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER intertrap_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER intertrap_set_updated_at
BEFORE UPDATE ON public.interviews
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER intertrap_set_updated_at
BEFORE UPDATE ON public.interview_rounds
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE FUNCTION public.prepare_round_weakness()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.topic_id IS NULL THEN
        NEW.round_type_id := NULL;
    ELSE
        SELECT r.round_type_id INTO NEW.round_type_id
        FROM public.interview_rounds AS r
        WHERE r.id = NEW.round_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Interview round % does not exist or is inaccessible', NEW.round_id
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    NEW.custom_topic := trim(regexp_replace(NEW.custom_topic, '[[:space:]]+', ' ', 'g'));
    RETURN NEW;
END;
$$;

CREATE TRIGGER intertrap_prepare_round_weakness
BEFORE INSERT OR UPDATE ON public.round_weaknesses
FOR EACH ROW EXECUTE FUNCTION public.prepare_round_weakness();

REVOKE EXECUTE ON FUNCTION public.set_updated_at(), public.prepare_round_weakness()
FROM PUBLIC, anon, authenticated;

COMMIT;
