CREATE TABLE IF NOT EXISTS jobs (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    scene_id uuid REFERENCES scenes(id),
    kind text NOT NULL CHECK (kind IN ('generate','regenerate','voice')),
    base_revision integer NOT NULL CHECK (base_revision > 0),
    input_hash text NOT NULL UNIQUE CHECK (length(input_hash) = 64),
    input jsonb NOT NULL,
    state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','running','succeeded','failed','cancelled')),
    stage text NOT NULL DEFAULT 'storyboard' CHECK (stage IN ('storyboard','validation')),
    progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
    attempt_id uuid,
    cancel_requested boolean NOT NULL DEFAULT false,
    error jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    available_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    heartbeat_at timestamptz,
    ended_at timestamptz
);
ALTER TABLE jobs ALTER COLUMN scene_id DROP NOT NULL;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('jobs_kind_v3_check','jobs_kind_v4_check','jobs_kind_v5_check') AND conrelid='jobs'::regclass) THEN
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v2_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_kind_v3_check CHECK (kind IN ('generate','regenerate','voice'));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_scene_kind_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_scene_kind_check CHECK ((kind='generate') = (scene_id IS NULL));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_stage_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (stage IN ('storyboard','tts','validation'));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('jobs_kind_v4_check','jobs_kind_v5_check') AND conrelid='jobs'::regclass) THEN
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v3_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_kind_v4_check CHECK (kind IN ('generate','regenerate','voice','render'));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_scene_kind_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_scene_kind_check CHECK ((kind IN ('generate','render')) = (scene_id IS NULL));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_stage_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (stage IN ('storyboard','tts','render','validation'));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='jobs_kind_v5_check' AND conrelid='jobs'::regclass) THEN
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v4_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_kind_v5_check CHECK (kind IN ('generate','regenerate','voice','timing','render'));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_stage_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (stage IN ('storyboard','tts','timing','render','validation'));
    END IF;
END $$;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100);
CREATE TABLE IF NOT EXISTS job_attempts (
    id uuid PRIMARY KEY,
    job_id uuid NOT NULL REFERENCES jobs(id),
    number integer NOT NULL CHECK (number BETWEEN 1 AND 3),
    state text NOT NULL CHECK (state IN ('running','succeeded','failed','cancelled')),
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    error jsonb,
    UNIQUE(job_id,number)
);
ALTER TABLE job_attempts ADD COLUMN IF NOT EXISTS usage jsonb;
CREATE INDEX IF NOT EXISTS jobs_claim_idx ON jobs(state,available_at,created_at);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS result jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS job_attempt_pair_idx ON job_attempts(job_id,id);
ALTER TABLE scene_candidates ADD COLUMN IF NOT EXISTS source_attempt_id uuid;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='candidate_attempt_fk' AND conrelid='scene_candidates'::regclass) THEN
        ALTER TABLE scene_candidates ADD CONSTRAINT candidate_attempt_fk
            FOREIGN KEY (source_job_id,source_attempt_id) REFERENCES job_attempts(job_id,id);
    END IF;
END $$;

