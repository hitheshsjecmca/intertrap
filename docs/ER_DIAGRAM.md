# InterTrap ER diagram

Only the identifier used by InterTrap is shown for the Supabase-managed auth table.

```mermaid
erDiagram
    "auth.users" {
        uuid id PK
    }
    profiles {
        uuid id PK,FK
        text full_name
        text target_role
        numeric target_salary_lpa
        timestamptz created_at
        timestamptz updated_at
    }
    interviews {
        uuid id PK
        uuid user_id FK
        text company_name
        text job_role
        date interview_date
        text overall_status
        text interview_mode
        text notes
        timestamptz created_at
        timestamptz updated_at
    }
    round_types {
        bigint id PK
        text name UK
        text slug UK
    }
    interview_rounds {
        uuid id PK
        uuid interview_id FK
        bigint round_type_id FK
        int round_number
        text custom_name
        text status
        date round_date
        text notes
        timestamptz created_at
        timestamptz updated_at
    }
    topics {
        bigint id PK
        bigint round_type_id FK
        text name
    }
    round_weaknesses {
        uuid id PK
        uuid round_id FK
        bigint topic_id FK
        text custom_topic
        bigint round_type_id FK
        int severity
        text notes
        timestamptz created_at
    }
    ai_analysis {
        uuid id PK
        uuid interview_id FK
        text model_name
        text prompt_version
        text summary
        jsonb strengths
        jsonb weaknesses
        jsonb recommendations
        timestamptz created_at
    }

    "auth.users" ||--o| profiles : has
    "auth.users" ||..o{ interviews : owns
    interviews ||..o{ interview_rounds : contains
    round_types ||..o{ interview_rounds : categorizes
    round_types ||..o{ topics : defines
    interview_rounds ||..o{ round_weaknesses : records
    topics o|..o{ round_weaknesses : classifies
    interviews ||..o{ ai_analysis : retains
```

The composite foreign keys on `round_weaknesses` pair `round_type_id` with `round_id` and `topic_id` respectively. A custom weakness leaves `topic_id` and `round_type_id` empty while retaining its required round link.
