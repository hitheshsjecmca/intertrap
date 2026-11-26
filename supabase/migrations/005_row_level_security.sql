BEGIN;

-- Existing permissive policies could widen the intended row access.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_catalog.pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('profiles', 'interviews', 'interview_rounds', 'round_weaknesses', 'round_types', 'topics', 'ai_analysis')
    ) THEN
        RAISE EXCEPTION 'Review existing InterTrap policies before applying migration 005';
    END IF;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_weaknesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.profiles,
    public.interviews,
    public.interview_rounds,
    public.round_weaknesses,
    public.round_types,
    public.topics,
    public.ai_analysis
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.round_types_id_seq, public.topics_id_seq
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT ON TABLE public.profiles,
    public.interviews,
    public.interview_rounds,
    public.round_weaknesses,
    public.round_types,
    public.topics,
    public.ai_analysis
TO authenticated;

GRANT UPDATE (full_name, target_role, target_salary_lpa) ON public.profiles TO authenticated;

GRANT INSERT (company_name, job_role, interview_date, overall_status, interview_mode, notes),
      UPDATE (company_name, job_role, interview_date, overall_status, interview_mode, notes),
      DELETE ON public.interviews TO authenticated;

GRANT INSERT (interview_id, round_type_id, round_number, custom_name, status, round_date, notes),
      UPDATE (round_type_id, round_number, custom_name, status, round_date, notes),
      DELETE ON public.interview_rounds TO authenticated;

-- The Module 4 trigger derives round_type_id from the parent round.
GRANT INSERT (round_id, topic_id, custom_topic, severity, notes),
      UPDATE (topic_id, custom_topic, severity, notes),
      DELETE ON public.round_weaknesses TO authenticated;

CREATE POLICY profiles_select ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()));

CREATE POLICY profiles_update ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()))
WITH CHECK (id = (SELECT auth.uid()));

CREATE POLICY interviews_select ON public.interviews
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY interviews_insert ON public.interviews
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY interviews_update ON public.interviews
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY interviews_delete ON public.interviews
FOR DELETE TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY interview_rounds_select ON public.interview_rounds
FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.interviews AS i
    WHERE i.id = interview_rounds.interview_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY interview_rounds_insert ON public.interview_rounds
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
    SELECT 1 FROM public.interviews AS i
    WHERE i.id = interview_rounds.interview_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY interview_rounds_update ON public.interview_rounds
FOR UPDATE TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.interviews AS i
    WHERE i.id = interview_rounds.interview_id AND i.user_id = (SELECT auth.uid())
))
WITH CHECK (EXISTS (
    SELECT 1 FROM public.interviews AS i
    WHERE i.id = interview_rounds.interview_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY interview_rounds_delete ON public.interview_rounds
FOR DELETE TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.interviews AS i
    WHERE i.id = interview_rounds.interview_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY round_weaknesses_select ON public.round_weaknesses
FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1
    FROM public.interview_rounds AS r
    JOIN public.interviews AS i ON i.id = r.interview_id
    WHERE r.id = round_weaknesses.round_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY round_weaknesses_insert ON public.round_weaknesses
FOR INSERT TO authenticated
WITH CHECK (EXISTS (
    SELECT 1
    FROM public.interview_rounds AS r
    JOIN public.interviews AS i ON i.id = r.interview_id
    WHERE r.id = round_weaknesses.round_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY round_weaknesses_update ON public.round_weaknesses
FOR UPDATE TO authenticated
USING (EXISTS (
    SELECT 1
    FROM public.interview_rounds AS r
    JOIN public.interviews AS i ON i.id = r.interview_id
    WHERE r.id = round_weaknesses.round_id AND i.user_id = (SELECT auth.uid())
))
WITH CHECK (EXISTS (
    SELECT 1
    FROM public.interview_rounds AS r
    JOIN public.interviews AS i ON i.id = r.interview_id
    WHERE r.id = round_weaknesses.round_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY round_weaknesses_delete ON public.round_weaknesses
FOR DELETE TO authenticated
USING (EXISTS (
    SELECT 1
    FROM public.interview_rounds AS r
    JOIN public.interviews AS i ON i.id = r.interview_id
    WHERE r.id = round_weaknesses.round_id AND i.user_id = (SELECT auth.uid())
));

CREATE POLICY round_types_select ON public.round_types
FOR SELECT TO authenticated
USING (true);

CREATE POLICY topics_select ON public.topics
FOR SELECT TO authenticated
USING (true);

CREATE POLICY ai_analysis_select ON public.ai_analysis
FOR SELECT TO authenticated
USING (EXISTS (
    SELECT 1 FROM public.interviews AS i
    WHERE i.id = ai_analysis.interview_id AND i.user_id = (SELECT auth.uid())
));

COMMIT;
