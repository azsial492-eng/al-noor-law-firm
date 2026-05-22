-- ============================================================
-- AL NOOR — Live Sync + Push Notifications (run once)
-- Supabase Dashboard → SQL Editor
-- ============================================================

-- 1) Realtime (5–6 devices sync instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE cases;
ALTER PUBLICATION supabase_realtime ADD TABLE hearings;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- 2) Push subscriptions (each phone/laptop/browser)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notification_log (
  sent_date DATE PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_anon_all" ON push_subscriptions;
CREATE POLICY "push_subscriptions_anon_all"
  ON push_subscriptions FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "notification_log_anon_all" ON notification_log;
CREATE POLICY "notification_log_anon_all"
  ON notification_log FOR ALL TO anon, authenticated
  USING (true) WITH CHECK (true);
