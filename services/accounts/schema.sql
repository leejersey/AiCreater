CREATE TABLE IF NOT EXISTS users (
    id uuid PRIMARY KEY,
    username text NOT NULL UNIQUE,
    password_hash text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_image_settings (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    base_url text NOT NULL,
    encrypted_api_key text NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS user_sessions (
    token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
    user_id uuid NOT NULL REFERENCES users(id),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS user_sessions_expiry_idx ON user_sessions(expires_at);
CREATE TABLE IF NOT EXISTS auth_limits (
    key text PRIMARY KEY,
    attempts integer NOT NULL,
    expires_at timestamptz NOT NULL
);
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_id uuid REFERENCES users(id);
-- Old courses have no reliable modification timestamp; keep NULL rather than invent history.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE projects ALTER COLUMN updated_at SET DEFAULT now();
CREATE OR REPLACE FUNCTION touch_project_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS project_modified ON projects;
CREATE TRIGGER project_modified BEFORE UPDATE OF revision ON projects
FOR EACH ROW WHEN (OLD.revision IS DISTINCT FROM NEW.revision) EXECUTE FUNCTION touch_project_updated_at();
CREATE INDEX IF NOT EXISTS projects_owner_idx ON projects(owner_id);
