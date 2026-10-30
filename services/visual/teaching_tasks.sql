CREATE TABLE IF NOT EXISTS teaching_task_roots (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    scene_id uuid NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
    base_revision integer NOT NULL CHECK (base_revision > 0),
    idempotency_key uuid NOT NULL,
    snapshot json NOT NULL,
    snapshot_sha256 text NOT NULL CHECK (snapshot_sha256 ~ '^[a-f0-9]{64}$'),
    max_requests integer NOT NULL CHECK (max_requests = 2),
    state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','cancelled')),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE(project_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS teaching_model_calls (
    id uuid PRIMARY KEY,
    root_id uuid NOT NULL REFERENCES teaching_task_roots(id) ON DELETE CASCADE,
    stage text NOT NULL CHECK (stage IN ('plan','revision')),
    request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
    dispatch_token uuid NOT NULL,
    state text NOT NULL DEFAULT 'dispatched' CHECK (state IN ('dispatched','succeeded','failed','unknown','cancelled')),
    output_sha256 text CHECK (output_sha256 ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    UNIQUE(root_id,stage),
    CHECK ((state='succeeded') = (output_sha256 IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS teaching_task_cache (
    root_id uuid NOT NULL REFERENCES teaching_task_roots(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('response-plan','response-revision','plan','diagnostic','audio','captions','artifact')),
    binding_sha256 text NOT NULL CHECK (binding_sha256 ~ '^[a-f0-9]{64}$'),
    payload json NOT NULL,
    payload_sha256 text NOT NULL CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY(root_id,kind,binding_sha256)
);
CREATE TABLE IF NOT EXISTS teaching_render_jobs (
    id uuid PRIMARY KEY,
    root_id uuid NOT NULL REFERENCES teaching_task_roots(id) ON DELETE CASCADE,
    artifact_binding text NOT NULL CHECK (artifact_binding ~ '^[a-f0-9]{64}$'),
    artifact_sha256 text NOT NULL CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','interrupted','cancelled')),
    token uuid,
    deadline timestamptz,
    error_code text,
    receipt json,
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    CHECK ((state='succeeded') = (receipt IS NOT NULL))
);
ALTER TABLE teaching_render_jobs DROP CONSTRAINT IF EXISTS teaching_render_jobs_root_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS teaching_render_root_binding ON teaching_render_jobs(root_id,artifact_binding);
CREATE TABLE IF NOT EXISTS teaching_render_repairs (
    id uuid PRIMARY KEY,
    root_id uuid NOT NULL UNIQUE REFERENCES teaching_task_roots(id) ON DELETE CASCADE,
    from_render_id uuid NOT NULL REFERENCES teaching_render_jobs(id) ON DELETE CASCADE,
    request json NOT NULL,
    request_sha256 text NOT NULL CHECK (request_sha256 ~ '^[a-f0-9]{64}$'),
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','interrupted','cancelled')),
    token uuid,
    deadline timestamptz,
    result json,
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS teaching_planning_jobs (
    id uuid PRIMARY KEY,
    root_id uuid NOT NULL UNIQUE REFERENCES teaching_task_roots(id) ON DELETE CASCADE,
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','interrupted','cancelled')),
    token uuid,
    deadline timestamptz,
    result json,
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz
);
CREATE TABLE IF NOT EXISTS teaching_media_jobs (
    id uuid PRIMARY KEY,
    root_id uuid NOT NULL REFERENCES teaching_task_roots(id) ON DELETE CASCADE,
    source_binding text NOT NULL CHECK (source_binding ~ '^[a-f0-9]{64}$'),
    source_artifact_sha256 text NOT NULL CHECK (source_artifact_sha256 ~ '^[a-f0-9]{64}$'),
    timeline json NOT NULL,
    timeline_sha256 text NOT NULL CHECK (timeline_sha256 ~ '^[a-f0-9]{64}$'),
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','interrupted','cancelled')),
    token uuid,
    deadline timestamptz,
    error_code text,
    result json,
    result_sha256 text CHECK (result_sha256 ~ '^[a-f0-9]{64}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    UNIQUE(root_id,source_artifact_sha256,timeline_sha256),
    CHECK ((state='succeeded') = (result IS NOT NULL)),
    CHECK ((state='succeeded') = (result_sha256 IS NOT NULL))
);
ALTER TABLE teaching_media_jobs ADD COLUMN IF NOT EXISTS render_admission text NOT NULL DEFAULT 'pending';
ALTER TABLE teaching_media_jobs ADD COLUMN IF NOT EXISTS render_error text;
ALTER TABLE teaching_render_jobs ADD COLUMN IF NOT EXISTS media_job_id uuid REFERENCES teaching_media_jobs(id);
ALTER TABLE teaching_render_jobs ADD COLUMN IF NOT EXISTS audiovisual json;
