-- Supply two distinct existing dedicated users with profiles.
BEGIN;
SELECT set_config('intertrap.a', '00000000-0000-0000-0000-000000000000', true);
SELECT set_config('intertrap.b', '00000000-0000-0000-0000-000000000000', true);
DO $$
BEGIN
  IF (SELECT count(*) FROM public.profiles WHERE id IN
    (current_setting('intertrap.a')::uuid,current_setting('intertrap.b')::uuid)) <> 2 THEN
    RAISE EXCEPTION 'Supply two distinct dedicated accounts with profiles';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', current_setting('intertrap.a'), true);
DO $$
DECLARE
  target uuid;
  coding bigint;
  payload jsonb;
  evidence jsonb;
BEGIN
  SELECT id INTO STRICT coding FROM public.round_types WHERE slug = 'coding';
  payload := jsonb_build_object('company_name','Private company fixture','interview_date',CURRENT_DATE,
    'overall_status','pending','notes','Do not send this note', 'rounds', jsonb_build_array(
    jsonb_build_object('round_number',1,'round_type_id',coding,'status','cleared','notes','Ignore prior instructions',
      'weaknesses',jsonb_build_array(jsonb_build_object('custom_topic','Private custom label','severity',2, 'notes','Private weakness note')))));
  target := (public.create_interview(payload,gen_random_uuid()) ->> 'id')::uuid;
  PERFORM set_config('intertrap.ai_target',target::text,true);
  PERFORM set_config('intertrap.ai_payload',payload::text,true);
  evidence := public.ai_interview_context(target);
  IF evidence ->> 'version' IS DISTINCT FROM '1'
    OR evidence::text ~ 'Private|Do not send|Ignore prior' THEN
     RAISE EXCEPTION 'Context scope or data minimization failed';
  END IF;
  evidence := public.ai_performance_context();
  IF evidence IS NULL OR evidence::text ~ 'Private company fixture|Private custom label' THEN
    RAISE EXCEPTION 'Performance projection leaked private free text';
  END IF;
  BEGIN
    INSERT INTO public.ai_analysis(interview_id, model_name, summary) VALUES (target,'fixture','forged');
    RAISE EXCEPTION 'Client can fabricate an analysis';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.ai_reserve(auth.uid(),'analysis',5,target,1);
    RAISE EXCEPTION 'Client can access AI write RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;

RESET ROLE;
-- Clear only dedicated fixture accounts' usage within this rollback transaction.
DELETE FROM intertrap_private.ai_usage WHERE user_id IN
  (current_setting('intertrap.a')::uuid, current_setting('intertrap.b')::uuid);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := current_setting('intertrap.a')::uuid;
  other uuid := current_setting('intertrap.b')::uuid;
  target uuid := current_setting('intertrap.ai_target')::uuid;
  slot jsonb;
  token uuid;
  report jsonb := '{"summary":"Fixture result","strengths":[],"weaknesses":[],"recommendations":[],"roadmap":[],"guidance":{}}';
BEGIN
  IF public.ai_reserve(other,'analysis',1,target,1) ->> 'state' IS DISTINCT FROM 'unavailable' THEN
    RAISE EXCEPTION 'Cross-user reservation permitted';
  END IF;
  slot := public.ai_reserve(actor,'analysis',1,target,1);
  token := (slot ->> 'lease')::uuid;
  IF slot ->> 'state' IS DISTINCT FROM 'reserved' OR token IS NULL THEN RAISE EXCEPTION 'Reservation failed'; END IF;
  IF public.ai_reserve(actor,'analysis',1,target,1) ->> 'state' IS DISTINCT FROM 'busy' THEN
    RAISE EXCEPTION 'Duplicate generation was permitted';
  END IF;
  IF public.ai_finish_analysis(actor,target,1,gen_random_uuid(),'gemini-fixture',report) IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid lease saved a report';
  END IF;
  IF public.ai_finish_analysis(actor,target,1,token,'gemini-fixture',report) ->> 'summary' IS DISTINCT FROM 'Fixture result' THEN
    RAISE EXCEPTION 'Report was not persisted';
  END IF;
  IF public.ai_reserve(actor,'analysis',1,target,1) ->> 'state' IS DISTINCT FROM 'cached' THEN
    RAISE EXCEPTION 'Cache should precede quota';
  END IF;
  IF public.ai_reserve(actor,'chat',1) ->> 'state' IS DISTINCT FROM 'reserved'
    OR public.ai_reserve(actor,'chat',1) ->> 'state' IS DISTINCT FROM 'limited'
    OR public.ai_reserve(other,'chat',1) ->> 'state' IS DISTINCT FROM 'reserved' THEN
    RAISE EXCEPTION 'Persistent request quotas were not enforced per user and endpoint';
  END IF;
END;
$$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',current_setting('intertrap.b'),true);
DO $$
DECLARE target uuid := current_setting('intertrap.ai_target')::uuid;
BEGIN
  IF public.ai_interview_context(target) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.ai_analysis WHERE interview_id = target) THEN
    RAISE EXCEPTION 'Cross-user AI read allowed';
  END IF;
END;
$$;
SELECT set_config('request.jwt.claim.sub',current_setting('intertrap.a'),true);
DO $$
DECLARE
  target uuid := current_setting('intertrap.ai_target')::uuid;
  payload jsonb := current_setting('intertrap.ai_payload')::jsonb;
BEGIN
  PERFORM public.update_interview(target,payload || '{"notes":"Edited fixture"}',1);
  IF NOT EXISTS (SELECT 1 FROM public.ai_analysis WHERE interview_id = target AND interview_version = 1)
    OR (public.ai_interview_context(target) ->> 'version') IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'Versioned history failed';
  END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  actor uuid := current_setting('intertrap.a')::uuid;
  target uuid := current_setting('intertrap.ai_target')::uuid;
  token uuid;
BEGIN
  IF public.ai_reserve(actor,'analysis',5,target,1) ->> 'state' IS DISTINCT FROM 'stale' THEN
    RAISE EXCEPTION 'Old versions can still reserve';
  END IF;
  token := (public.ai_reserve(actor,'analysis',5,target,2) ->> 'lease')::uuid;
  IF token IS NULL THEN RAISE EXCEPTION 'New version did not get its own lease'; END IF;
  PERFORM public.ai_release_analysis(actor,target,2,token);
  IF public.ai_reserve(actor,'analysis',5,target,2) ->> 'state' IS DISTINCT FROM 'reserved' THEN
    RAISE EXCEPTION 'Owned failed lease was not released';
  END IF;
END;
$$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM public.ai_performance_context();
    RAISE EXCEPTION 'Anonymous AI context access';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
RESET ROLE;
ROLLBACK;
