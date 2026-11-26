BEGIN;

ALTER TABLE public.ai_analysis
  ADD COLUMN roadmap jsonb CHECK (roadmap IS NULL OR jsonb_typeof(roadmap) = 'array'),
  ADD COLUMN guidance jsonb CHECK (guidance IS NULL OR jsonb_typeof(guidance) = 'object');

CREATE UNIQUE INDEX ai_analysis_iris_version_idx
  ON public.ai_analysis (interview_id, interview_version, prompt_version)
  WHERE prompt_version = 'iris-v1' AND interview_version IS NOT NULL;

CREATE TABLE intertrap_private.ai_usage (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  usage_day date,
  kind text CHECK (kind IN ('analysis', 'chat')),
  attempts integer NOT NULL CHECK (attempts > 0),
  PRIMARY KEY (user_id, usage_day, kind)
);
CREATE TABLE intertrap_private.ai_analysis_leases (
  interview_id uuid REFERENCES public.interviews(id) ON DELETE CASCADE,
  interview_version integer,
  lease_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (interview_id, interview_version)
);
ALTER TABLE intertrap_private.ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE intertrap_private.ai_analysis_leases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON intertrap_private.ai_usage, intertrap_private.ai_analysis_leases FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_analysis FROM PUBLIC, anon, authenticated;

-- Read a bounded, version-consistent projection. Free-text interview fields stay in InterTrap.
CREATE FUNCTION public.ai_interview_context(target_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('version', i.version, 'outcome', i.overall_status,
    'round_count', (SELECT count(*) FROM public.interview_rounds r WHERE r.interview_id = i.id),
    'rounds', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'number', r.round_number, 'category', c.name, 'outcome', r.status,
        'weaknesses', CASE WHEN r.status IN ('cleared','rejected') THEN coalesce((
          SELECT jsonb_agg(jsonb_build_object('topic', w.topic, 'severity', w.severity))
          FROM (
            SELECT coalesce(t.name, 'Custom topic (label omitted)') AS topic, w.severity
            FROM public.round_weaknesses w LEFT JOIN public.topics t ON t.id = w.topic_id
            WHERE w.round_id = r.id ORDER BY w.severity DESC, w.id LIMIT 6
          ) w
        ), '[]'::jsonb) ELSE '[]'::jsonb END
      ) ORDER BY r.round_number)
      FROM (
        SELECT id, round_type_id, round_number, status FROM public.interview_rounds
        WHERE interview_id = i.id ORDER BY round_number LIMIT 16
      ) r
      JOIN public.round_types c ON c.id = r.round_type_id
    ), '[]'::jsonb))
  FROM public.interviews i WHERE i.id = target_id AND i.user_id = (SELECT auth.uid());
$$;

CREATE FUNCTION public.ai_performance_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH snapshot AS MATERIALIZED (
    SELECT public.performance_snapshot((now() AT TIME ZONE 'UTC')::date - 179,
      (now() AT TIME ZONE 'UTC')::date) AS data
  )
  SELECT jsonb_build_object(
    'window_days', 180,
    'summary', data -> 'summary',
    'categories', coalesce((
      SELECT jsonb_agg(item - 'id' - 'slug')
      FROM jsonb_array_elements(data -> 'categories') item WHERE (item ->> 'attempted')::int > 0
    ), '[]'::jsonb),
    'monthly', data -> 'months',
    'weaknesses', coalesce((
      SELECT jsonb_agg((item - 'topic_key' - 'topic_id' - 'round_type_id' - 'topic')
        || jsonb_build_object('topic', CASE WHEN item ->> 'topic_id' IS NULL
          THEN 'Custom topic (label omitted)' ELSE item ->> 'topic' END) ORDER BY position)
      FROM jsonb_array_elements(data -> 'weaknesses') WITH ORDINALITY AS w(item, position)
      WHERE position <= 8
    ), '[]'::jsonb),
    'recent_outcomes', coalesce((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.interview_date DESC, r.overall_status)
      FROM (
        SELECT interview_date, overall_status FROM public.interviews
        WHERE user_id = (SELECT auth.uid())
          AND interview_date BETWEEN (now() AT TIME ZONE 'UTC')::date - 179 AND (now() AT TIME ZONE 'UTC')::date
        ORDER BY interview_date DESC, id DESC LIMIT 8
      ) r
    ), '[]'::jsonb)
  ) FROM snapshot;
$$;

CREATE FUNCTION public.ai_reserve(
  actor uuid, kind text, daily_limit integer, target_id uuid DEFAULT NULL, target_version integer DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  today date := (now() AT TIME ZONE 'UTC')::date;
  used integer;
  token uuid;
  cached jsonb;
BEGIN
  IF actor IS NULL OR kind IS NULL OR kind NOT IN ('analysis', 'chat')
    OR daily_limit IS NULL OR daily_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid AI reservation' USING ERRCODE = '22023';
  END IF;

  -- Serialize reservation decisions for this actor across Edge instances.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text, 80712));
  IF kind = 'analysis' THEN
    PERFORM 1 FROM public.interviews i WHERE i.id = target_id AND i.user_id = actor FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('state', 'unavailable'); END IF;
    IF NOT EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = target_id AND i.version = target_version) THEN
      RETURN jsonb_build_object('state', 'stale');
    END IF;
    SELECT to_jsonb(a) INTO cached FROM public.ai_analysis a
      WHERE a.interview_id = target_id AND a.interview_version = target_version AND a.prompt_version = 'iris-v1';
    IF FOUND THEN RETURN jsonb_build_object('state', 'cached', 'analysis', cached); END IF;
    IF EXISTS (SELECT 1 FROM intertrap_private.ai_analysis_leases l WHERE l.interview_id = target_id
      AND l.interview_version = target_version AND l.expires_at > clock_timestamp()) THEN
      RETURN jsonb_build_object('state', 'busy');
    END IF;
  END IF;

  INSERT INTO intertrap_private.ai_usage AS u (user_id, usage_day, kind, attempts)
    VALUES (actor, today, kind, 1)
    ON CONFLICT ON CONSTRAINT ai_usage_pkey DO UPDATE SET attempts = u.attempts + 1 WHERE u.attempts < daily_limit
    RETURNING attempts INTO used;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('state','limited','reset_at',(today + 1)::timestamp AT TIME ZONE 'UTC');
  END IF;

  IF kind = 'analysis' THEN
    token := gen_random_uuid();
    INSERT INTO intertrap_private.ai_analysis_leases (interview_id, interview_version, lease_id, expires_at)
      VALUES (target_id, target_version, token, clock_timestamp() + interval '90 seconds')
      ON CONFLICT (interview_id, interview_version) DO UPDATE
        SET lease_id = excluded.lease_id, expires_at = excluded.expires_at;
  END IF;
  RETURN jsonb_build_object('state', 'reserved', 'lease', token, 'remaining', daily_limit - used);
END;
$$;

CREATE FUNCTION public.ai_finish_analysis(
  actor uuid, target_id uuid, target_version integer, token uuid, model text, report jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved public.ai_analysis%ROWTYPE;
BEGIN
  -- Uses the same parent lock ordering as interview edits and reservation.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text, 80712));
  PERFORM 1 FROM public.interviews i WHERE i.id = target_id AND i.user_id = actor AND i.version = target_version FOR SHARE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  DELETE FROM intertrap_private.ai_analysis_leases l WHERE l.interview_id = target_id
    AND l.interview_version = target_version AND l.lease_id = token AND l.expires_at > clock_timestamp();
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO public.ai_analysis (interview_id, interview_version, model_name, prompt_version,
    summary, strengths, weaknesses, recommendations, roadmap, guidance)
  VALUES (target_id, target_version, model, 'iris-v1', report ->> 'summary', report -> 'strengths',
    report -> 'weaknesses', report -> 'recommendations', report -> 'roadmap', report -> 'guidance')
  RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END;
$$;

CREATE FUNCTION public.ai_release_analysis(actor uuid, target_id uuid, target_version integer, token uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  DELETE FROM intertrap_private.ai_analysis_leases l USING public.interviews i
  WHERE l.interview_id = i.id AND i.id = target_id AND i.user_id = actor
    AND l.interview_version = target_version AND l.lease_id = token;
$$;

REVOKE ALL ON FUNCTION public.ai_interview_context(uuid), public.ai_performance_context() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_interview_context(uuid), public.ai_performance_context() TO authenticated;
REVOKE ALL ON FUNCTION public.ai_reserve(uuid,text,integer,uuid,integer),
  public.ai_finish_analysis(uuid,uuid,integer,uuid,text,jsonb), public.ai_release_analysis(uuid,uuid,integer,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reserve(uuid,text,integer,uuid,integer),
  public.ai_finish_analysis(uuid,uuid,integer,uuid,text,jsonb), public.ai_release_analysis(uuid,uuid,integer,uuid)
  TO service_role;

COMMIT;
