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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('jobs_kind_v3_check','jobs_kind_v4_check','jobs_kind_v5_check','jobs_kind_v6_check','jobs_kind_v7_check') AND conrelid='jobs'::regclass) THEN
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
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('jobs_kind_v4_check','jobs_kind_v5_check','jobs_kind_v6_check','jobs_kind_v7_check') AND conrelid='jobs'::regclass) THEN
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v3_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_kind_v4_check CHECK (kind IN ('generate','regenerate','voice','render'));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_scene_kind_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_scene_kind_check CHECK ((kind IN ('generate','render')) = (scene_id IS NULL));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_stage_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (stage IN ('storyboard','tts','render','validation'));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('jobs_kind_v5_check','jobs_kind_v6_check','jobs_kind_v7_check') AND conrelid='jobs'::regclass) THEN
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
-- Each older block also skips once a later version exists: later versions drop their constraints, and re-running them
-- would fail on newer rows (or, for v6, delete Agent jobs).
-- v6: one table for every job. Voice and timing as before; the Scene Agent and course export move in from
-- visual_jobs (same ids, so their output directories stay valid). Template-flow jobs, candidates and frozen
-- versions are retired.
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname IN ('jobs_kind_v6_check','jobs_kind_v7_check') AND conrelid='jobs'::regclass) THEN
        DROP TABLE IF EXISTS scene_candidates;
        DROP TABLE IF EXISTS project_versions;
        DELETE FROM job_attempts WHERE job_id IN (SELECT id FROM jobs WHERE kind NOT IN ('voice','timing'));
        DELETE FROM jobs WHERE kind NOT IN ('voice','timing');
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_check;
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v2_check;
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v3_check;
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v4_check;
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v5_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_kind_v6_check CHECK (kind IN ('voice','timing','agent','export'));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_scene_kind_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_scene_kind_check CHECK ((kind='export') = (scene_id IS NULL));
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_stage_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_stage_check CHECK (length(stage) BETWEEN 1 AND 120);
        ALTER TABLE jobs ALTER COLUMN stage SET DEFAULT 'queued';
        IF to_regclass('visual_jobs') IS NOT NULL THEN
            INSERT INTO jobs (id,project_id,scene_id,kind,base_revision,input_hash,input,state,stage,progress,attempts,attempt_id,
                              cancel_requested,error,result,created_at,available_at,started_at,heartbeat_at,ended_at)
            SELECT v.id,v.project_id,v.scene_id,v.kind,
                   CASE WHEN v.kind='export' THEN COALESCE((v.input->>'project_revision')::int,1)
                        ELSE COALESCE((SELECT s.revision FROM scenes s WHERE s.id=v.scene_id),1) END,
                   encode(sha256(convert_to(v.id::text,'UTF8')),'hex'),v.input,v.state,left(v.stage,120),
                   CASE WHEN v.state='succeeded' THEN 100 ELSE 0 END,CASE WHEN v.attempt_id IS NULL THEN 0 ELSE 1 END,v.attempt_id,false,
                   CASE WHEN v.error IS NULL THEN NULL ELSE jsonb_build_object('code','failed','stage',v.stage,'message',v.error,'retryable',false) END,
                   v.result,v.created_at,v.created_at,v.started_at,v.heartbeat_at,v.ended_at
            FROM visual_jobs v WHERE v.kind IN ('agent','export');
            DROP TABLE visual_jobs;
        END IF;
    END IF;
END $$;
-- v7: restyle, an Agent version re-rendered in the course's current theme (render lane, local only, no model call).
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='jobs_kind_v7_check' AND conrelid='jobs'::regclass) THEN
        ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_kind_v6_check;
        ALTER TABLE jobs ADD CONSTRAINT jobs_kind_v7_check CHECK (kind IN ('voice','timing','agent','export','restyle'));
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS jobs_project_idx ON jobs(project_id,created_at DESC,id DESC);

