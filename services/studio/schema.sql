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
-- 拆解库：对标视频的拆解卡（自带队列状态，由执行器 workflow 队列处理）与爆款公式。
CREATE TABLE IF NOT EXISTS breakdowns (
    id uuid PRIMARY KEY,
    owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
    state text NOT NULL CHECK (state IN ('queued', 'running', 'succeeded', 'failed')),
    source jsonb NOT NULL,
    transcript jsonb NOT NULL DEFAULT '[]'::jsonb,
    frames jsonb NOT NULL DEFAULT '[]'::jsonb,
    card jsonb,
    error text,
    skill jsonb NOT NULL DEFAULT '[]'::jsonb,
    video_path text,
    video_expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    started_at timestamptz,
    finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS breakdowns_owner_idx ON breakdowns(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS breakdowns_queue_idx ON breakdowns(created_at) WHERE state IN ('queued', 'running');
CREATE TABLE IF NOT EXISTS viral_formulas (
    id uuid PRIMARY KEY,
    owner_id uuid REFERENCES users(id) ON DELETE CASCADE,
    breakdown_ids jsonb NOT NULL,
    formula jsonb NOT NULL,
    confirmed boolean NOT NULL DEFAULT false,
    skill jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS viral_formulas_owner_idx ON viral_formulas(owner_id, created_at DESC);
