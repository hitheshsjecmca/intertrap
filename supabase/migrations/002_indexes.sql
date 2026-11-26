BEGIN;

CREATE INDEX interviews_user_date_idx ON public.interviews (user_id, interview_date DESC);
CREATE INDEX interviews_user_status_idx ON public.interviews (user_id, overall_status);
CREATE INDEX interview_rounds_type_idx ON public.interview_rounds (round_type_id);
CREATE INDEX round_weaknesses_topic_idx ON public.round_weaknesses (topic_id);
CREATE INDEX ai_analysis_interview_created_idx ON public.ai_analysis (interview_id, created_at DESC);

-- Migration 003 collapses whitespace before this expression checks uniqueness.
CREATE UNIQUE INDEX round_weaknesses_custom_topic_idx
    ON public.round_weaknesses (round_id, lower(trim(custom_topic)))
    WHERE custom_topic IS NOT NULL;

COMMIT;
