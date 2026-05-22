-- ============================================================
-- AL NOOR — Tasks table (checkbox + delete + due date)
-- Supabase Dashboard → SQL Editor → paste & Run (one time)
-- ============================================================

CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  case_id UUID REFERENCES cases(id) ON DELETE SET NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  due_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Agar table pehle se bani thi (purani version), nayi columns add karein:
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_completed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS case_id UUID REFERENCES cases(id) ON DELETE SET NULL;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks_anon_all" ON tasks;

CREATE POLICY "tasks_anon_all"
  ON tasks FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
