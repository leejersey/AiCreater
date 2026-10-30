CREATE TABLE IF NOT EXISTS visual_jobs (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    scene_id uuid REFERENCES scenes(id),
    kind text NOT NULL CHECK (kind IN ('generate','repair','preview','export')),
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
    stage text NOT NULL DEFAULT 'queued',
    input jsonb NOT NULL,
    result jsonb,
    error text,
    attempt_id uuid,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    heartbeat_at timestamptz,
    ended_at timestamptz,
    CHECK ((kind='export') = (scene_id IS NULL))
);
CREATE INDEX IF NOT EXISTS visual_jobs_project_idx ON visual_jobs(project_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS visual_jobs_claim_idx ON visual_jobs(state,created_at,id);

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='visual_jobs'::regclass AND conname='visual_jobs_kind_v5_check') THEN
        ALTER TABLE visual_jobs DROP CONSTRAINT IF EXISTS visual_jobs_kind_check;
        ALTER TABLE visual_jobs DROP CONSTRAINT IF EXISTS visual_jobs_kind_v2_check;
        ALTER TABLE visual_jobs DROP CONSTRAINT IF EXISTS visual_jobs_kind_v3_check;
        ALTER TABLE visual_jobs DROP CONSTRAINT IF EXISTS visual_jobs_kind_v4_check;
        ALTER TABLE visual_jobs ADD CONSTRAINT visual_jobs_kind_v5_check CHECK (kind IN ('generate','repair','preview','export','prepare-transfer','preview-transfer','recover-source','propose-layout'));
    END IF;
END $$;
