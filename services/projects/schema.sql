CREATE TABLE IF NOT EXISTS projects (
    id uuid PRIMARY KEY,
    title text NOT NULL,
    source_text text NOT NULL DEFAULT '',
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    config jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS scenes (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    scene_key text NOT NULL,
    position integer NOT NULL CHECK (position >= 0),
    revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
    generated_revision integer NOT NULL DEFAULT 1 CHECK (generated_revision >= 0),
    user_revision integer NOT NULL DEFAULT 0 CHECK (user_revision >= 0),
    state text NOT NULL CHECK (state IN ('ready', 'needs_voice', 'needs_timing')),
    scene jsonb NOT NULL,
    UNIQUE(project_id, scene_key),
    UNIQUE(project_id, position) DEFERRABLE INITIALLY DEFERRED
);
ALTER TABLE scenes ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS source_text text NOT NULL DEFAULT '';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS voice jsonb;
ALTER TABLE scenes DROP CONSTRAINT IF EXISTS scenes_state_check;
ALTER TABLE scenes ADD CONSTRAINT scenes_state_check CHECK (state IN ('ready', 'needs_voice', 'needs_timing'));
CREATE TABLE IF NOT EXISTS scene_candidates (
    id uuid PRIMARY KEY,
    scene_id uuid NOT NULL REFERENCES scenes(id),
    base_revision integer NOT NULL CHECK (base_revision > 0),
    draft jsonb NOT NULL,
    source_job_id uuid,
    accepted boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS project_versions (
    id uuid PRIMARY KEY,
    project_id uuid NOT NULL REFERENCES projects(id),
    revision integer NOT NULL CHECK (revision > 0),
    dsl jsonb NOT NULL,
    profile jsonb NOT NULL,
    UNIQUE(project_id, revision)
);
