-- 选题台：创作者档案（手填的领域关键词、是否每天自动出选题）与每日选题。
CREATE TABLE IF NOT EXISTS creator_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    keywords jsonb NOT NULL DEFAULT '[]'::jsonb,
    daily_auto boolean NOT NULL DEFAULT false,
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS topic_feeds (
    id uuid PRIMARY KEY,
    owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
    day date NOT NULL,
    trigger text NOT NULL CHECK (trigger IN ('manual', 'daily')),
    keywords jsonb NOT NULL,
    cards jsonb NOT NULL,
    findings jsonb NOT NULL DEFAULT '[]'::jsonb,
    evidence jsonb NOT NULL,
    skill jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS topic_feeds_owner_day_idx ON topic_feeds(owner_id, day DESC, created_at DESC);
