CREATE TABLE job_registry_v2 (
    job_id text COLLATE "C" PRIMARY KEY,
    backend_id text NOT NULL,
    user_id text NOT NULL,
    parent_id text,
    process jsonb,
    job_options jsonb,
    status text,
    title text,
    description text,
    api_version text,
    application_id text,
    proxy_user text,
    infra_id text,
    oidc_issuer text,
    created timestamptz,
    updated timestamptz,
    started timestamptz,
    finished timestamptz,
    dependencies jsonb,
    dependency_status text,
    dependency_usage text,
    usage jsonb,
    costs double precision,
    input_pixel double precision,
    cpu_time_seconds double precision,
    memory_time_megabyte_seconds double precision,
    results_metadata jsonb,
    results_metadata_uri text,
    links jsonb,
    assets jsonb,
    unique_process_ids jsonb,
    deleted boolean NOT NULL DEFAULT false,
    present_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
    registry_etag text,
    creation_fingerprint text,
    version bigint NOT NULL DEFAULT 1,
    CONSTRAINT job_registry_v2_status_check
        CHECK (status IS NULL OR status IN ('created', 'queued', 'running', 'finished', 'error', 'canceled'))
);

CREATE INDEX job_registry_v2_order
    ON job_registry_v2 (created DESC NULLS LAST, job_id ASC)
    WHERE deleted = false;
CREATE INDEX job_registry_v2_user_order
    ON job_registry_v2 (user_id, created DESC NULLS LAST, job_id ASC)
    WHERE deleted = false;
CREATE INDEX job_registry_v2_backend_order
    ON job_registry_v2 (backend_id, created DESC NULLS LAST, job_id ASC)
    WHERE deleted = false;
CREATE INDEX job_registry_v2_status_order
    ON job_registry_v2 (status, created DESC NULLS LAST, job_id ASC)
    WHERE deleted = false;
CREATE INDEX job_registry_v2_infra_order
    ON job_registry_v2 (infra_id, created DESC NULLS LAST, job_id ASC)
    WHERE deleted = false;
CREATE INDEX job_registry_v2_application_order
    ON job_registry_v2 (application_id, created DESC NULLS LAST, job_id ASC)
    WHERE deleted = false;
CREATE INDEX job_registry_v2_updated
    ON job_registry_v2 (updated)
    WHERE deleted = false;
