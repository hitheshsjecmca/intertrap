BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL search_path = pg_catalog, pg_temp;

LOCK TABLE public.interviews, public.interview_rounds, public.topics, public.round_weaknesses
    IN SHARE ROW EXCLUSIVE MODE;

-- The preparation function has exactly one intended attachment. Leave other functions alone.
DO $$
DECLARE attachment record;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_trigger
        WHERE tgrelid = 'public.round_weaknesses'::regclass
          AND tgname = 'intertrap_prepare_round_weakness'
          AND tgfoid IS DISTINCT FROM to_regprocedure('public.prepare_round_weakness()')
    ) THEN
        RAISE EXCEPTION 'Review the existing intertrap_prepare_round_weakness trigger before repair';
    END IF;
    FOR attachment IN
        SELECT t.tgname, n.nspname, r.relname
        FROM pg_trigger t
        JOIN pg_class r ON r.oid = t.tgrelid
        JOIN pg_namespace n ON n.oid = r.relnamespace
        WHERE NOT t.tgisinternal AND t.tgfoid = to_regprocedure('public.prepare_round_weakness()')
    LOOP
        EXECUTE format('DROP TRIGGER %I ON %I.%I', attachment.tgname, attachment.nspname, attachment.relname);
    END LOOP;
END;
$$;

ALTER TABLE public.round_weaknesses ADD COLUMN IF NOT EXISTS round_type_id bigint;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.round_weaknesses'::regclass AND attname = 'round_type_id'
          AND atttypid = 'bigint'::regtype AND NOT attnotnull AND NOT attisdropped
    ) THEN
        RAISE EXCEPTION 'Expected round_weaknesses.round_type_id to be nullable bigint';
    END IF;
END;
$$;

-- Only fill missing categories for already compatible predefined topics.
UPDATE public.round_weaknesses w
SET round_type_id = r.round_type_id
FROM public.interview_rounds r, public.topics t
WHERE w.round_id = r.id AND w.topic_id = t.id AND t.round_type_id = r.round_type_id
  AND w.round_type_id IS NULL AND w.custom_topic IS NULL;

DO $$
DECLARE
    parent regclass;
    required record;
    existing_name name;
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.round_weaknesses w
        LEFT JOIN public.interview_rounds r ON r.id = w.round_id
        LEFT JOIN public.topics t ON t.id = w.topic_id
        WHERE r.id IS NULL
           OR (w.topic_id IS NOT NULL AND (
               w.custom_topic IS NOT NULL OR w.round_type_id IS NULL OR t.id IS NULL
               OR w.round_type_id IS DISTINCT FROM r.round_type_id
               OR w.round_type_id IS DISTINCT FROM t.round_type_id))
           OR (w.topic_id IS NULL AND (w.round_type_id IS NOT NULL
               OR w.custom_topic IS NULL OR w.custom_topic !~ '[^[:space:]]'))
    ) THEN
        RAISE EXCEPTION 'Existing weakness rows violate round/topic integrity. No repair was committed';
    END IF;

    FOREACH parent IN ARRAY ARRAY['public.interview_rounds'::regclass, 'public.topics'::regclass] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conrelid = parent AND contype = 'u'
              AND NOT condeferrable AND pg_get_constraintdef(oid) = 'UNIQUE (id, round_type_id)'
        ) THEN
            EXECUTE format('ALTER TABLE %s ADD UNIQUE (id, round_type_id)', parent);
        END IF;
    END LOOP;

    FOR required IN SELECT * FROM (VALUES
        ('round_weaknesses_round_id_fkey',
         'FOREIGN KEY (round_id) REFERENCES public.interview_rounds(id) ON DELETE CASCADE'),
        ('round_weaknesses_round_id_round_type_id_fkey',
         'FOREIGN KEY (round_id, round_type_id) REFERENCES public.interview_rounds(id, round_type_id) ON UPDATE RESTRICT ON DELETE CASCADE'),
        ('round_weaknesses_topic_id_round_type_id_fkey',
         'FOREIGN KEY (topic_id, round_type_id) REFERENCES public.topics(id, round_type_id) ON UPDATE RESTRICT ON DELETE RESTRICT')
    ) AS f(name, definition) LOOP
        SELECT conname INTO existing_name FROM pg_constraint
        WHERE conrelid = 'public.round_weaknesses'::regclass AND contype = 'f'
          AND regexp_replace(pg_get_constraintdef(oid), ' NOT VALID$', '') = required.definition
        ORDER BY convalidated DESC LIMIT 1;
        IF NOT FOUND THEN
            EXECUTE format('ALTER TABLE public.round_weaknesses ADD CONSTRAINT %I %s',
                required.name, required.definition);
        ELSE
            EXECUTE format('ALTER TABLE public.round_weaknesses VALIDATE CONSTRAINT %I', existing_name);
        END IF;
    END LOOP;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid
        WHERE c.conrelid = 'public.round_weaknesses'::regclass AND c.contype = 'c'
          AND c.conname IN ('weakness_topic_choice', 'intertrap_weakness_category_choice')
          AND a.attname = 'round_type_id' AND a.attnum = ANY(c.conkey) AND c.convalidated
    ) THEN
        ALTER TABLE public.round_weaknesses ADD CONSTRAINT intertrap_weakness_category_choice CHECK (
            (topic_id IS NOT NULL AND round_type_id IS NOT NULL AND custom_topic IS NULL)
            OR (topic_id IS NULL AND round_type_id IS NULL AND custom_topic ~ '[^[:space:]]'
                AND custom_topic IS NOT NULL)
        );
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_round_weakness()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE category_id bigint;
BEGIN
    IF TG_RELID <> 'public.round_weaknesses'::regclass
        OR TG_WHEN <> 'BEFORE' OR TG_LEVEL <> 'ROW' OR TG_OP NOT IN ('INSERT', 'UPDATE') THEN
        RAISE EXCEPTION 'prepare_round_weakness requires a BEFORE INSERT OR UPDATE row trigger on public.round_weaknesses'
            USING ERRCODE = '55000';
    END IF;

    IF NEW.topic_id IS NOT NULL THEN
        SELECT r.round_type_id INTO category_id
        FROM public.interview_rounds r WHERE r.id = NEW.round_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Interview round does not exist or is inaccessible'
                USING ERRCODE = 'foreign_key_violation';
        END IF;
    END IF;

    NEW.round_type_id := category_id;
    NEW.custom_topic := trim(regexp_replace(NEW.custom_topic, '[[:space:]]+', ' ', 'g'));
    RETURN NEW;
END;
$$;

CREATE TRIGGER intertrap_prepare_round_weakness
BEFORE INSERT OR UPDATE ON public.round_weaknesses
FOR EACH ROW EXECUTE FUNCTION public.prepare_round_weakness();

REVOKE EXECUTE ON FUNCTION public.prepare_round_weakness() FROM PUBLIC, anon, authenticated;

COMMIT;
