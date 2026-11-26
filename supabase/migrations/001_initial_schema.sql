BEGIN;

CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name text,
    target_role text,
    target_salary_lpa numeric(8,2) CHECK (target_salary_lpa >= 0 AND target_salary_lpa <> 'NaN'::numeric),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.interviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    company_name text NOT NULL CHECK (company_name ~ '[^[:space:]]'),
    job_role text,
    interview_date date NOT NULL DEFAULT CURRENT_DATE,
    overall_status text NOT NULL DEFAULT 'pending'
        CHECK (overall_status IN ('pending', 'selected', 'rejected', 'withdrawn')),
    interview_mode text CHECK (interview_mode IN ('online', 'offline', 'hybrid')),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.round_types (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE,
    slug text NOT NULL UNIQUE
);

CREATE TABLE public.interview_rounds (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
    round_type_id bigint NOT NULL REFERENCES public.round_types(id) ON DELETE RESTRICT,
    round_number integer NOT NULL CHECK (round_number > 0),
    custom_name text,
    status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'cleared', 'rejected', 'not_reached')),
    round_date date,
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (interview_id, round_number),
    UNIQUE (id, round_type_id)
);

CREATE TABLE public.topics (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    round_type_id bigint NOT NULL REFERENCES public.round_types(id) ON DELETE RESTRICT,
    name text NOT NULL CHECK (name ~ '[^[:space:]]'),
    UNIQUE (round_type_id, name),
    UNIQUE (id, round_type_id)
);

CREATE TABLE public.round_weaknesses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    round_id uuid NOT NULL REFERENCES public.interview_rounds(id) ON DELETE CASCADE,
    topic_id bigint,
    custom_topic text,
    round_type_id bigint,
    severity integer NOT NULL DEFAULT 3 CHECK (severity BETWEEN 1 AND 5),
    notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT weakness_topic_choice CHECK (
        (topic_id IS NOT NULL AND round_type_id IS NOT NULL AND custom_topic IS NULL)
        OR (topic_id IS NULL AND round_type_id IS NULL AND custom_topic IS NOT NULL
            AND custom_topic <> ''
            AND custom_topic = trim(regexp_replace(custom_topic, '[[:space:]]+', ' ', 'g')))
    ),
    UNIQUE (round_id, topic_id),
    FOREIGN KEY (round_id, round_type_id)
        REFERENCES public.interview_rounds(id, round_type_id)
        ON DELETE CASCADE ON UPDATE RESTRICT,
    FOREIGN KEY (topic_id, round_type_id)
        REFERENCES public.topics(id, round_type_id)
        ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE TABLE public.ai_analysis (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    interview_id uuid NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
    model_name text NOT NULL,
    prompt_version text NOT NULL DEFAULT 'v1',
    summary text NOT NULL,
    strengths jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(strengths) = 'array'),
    weaknesses jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(weaknesses) = 'array'),
    recommendations jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommendations) = 'array'),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interview_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.round_weaknesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_analysis ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
    public.profiles,
    public.interviews,
    public.round_types,
    public.interview_rounds,
    public.topics,
    public.round_weaknesses,
    public.ai_analysis
FROM PUBLIC, anon, authenticated;

REVOKE ALL ON SEQUENCE public.round_types_id_seq, public.topics_id_seq
FROM PUBLIC, anon, authenticated;

COMMIT;
