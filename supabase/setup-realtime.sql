-- Live sync across multiple devices (Supabase Realtime)
-- Supabase Dashboard → SQL Editor → Run once

ALTER PUBLICATION supabase_realtime ADD TABLE clients;
ALTER PUBLICATION supabase_realtime ADD TABLE cases;
ALTER PUBLICATION supabase_realtime ADD TABLE hearings;
ALTER PUBLICATION supabase_realtime ADD TABLE tasks;

-- Run only if documents table exists:
-- ALTER PUBLICATION supabase_realtime ADD TABLE documents;
