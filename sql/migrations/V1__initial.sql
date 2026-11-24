CREATE TABLE job_registry_v2 (
    job_id text COLLATE "C" PRIMARY KEY,
    source jsonb NOT NULL,
    created_ms bigint,
    updated_ms bigint,
    version bigint NOT NULL DEFAULT 1
);

CREATE INDEX job_registry_v2_order ON job_registry_v2 (created_ms DESC NULLS LAST, job_id ASC);
CREATE INDEX job_registry_v2_user_order ON job_registry_v2 ((source->>'user_id'), created_ms DESC NULLS LAST, job_id ASC);
CREATE INDEX job_registry_v2_backend_order ON job_registry_v2 ((source->>'backend_id'), created_ms DESC NULLS LAST, job_id ASC);
CREATE INDEX job_registry_v2_status_order ON job_registry_v2 ((source->>'status'), created_ms DESC NULLS LAST, job_id ASC);
CREATE INDEX job_registry_v2_updated ON job_registry_v2 (updated_ms);
