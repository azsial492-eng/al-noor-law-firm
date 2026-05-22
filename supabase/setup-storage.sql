-- Document photos storage (run once in Supabase SQL Editor)

INSERT INTO storage.buckets (id, name, public)
VALUES ('case-documents', 'case-documents', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "case_documents_public_read" ON storage.objects;
CREATE POLICY "case_documents_public_read"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'case-documents');

DROP POLICY IF EXISTS "case_documents_anon_upload" ON storage.objects;
CREATE POLICY "case_documents_anon_upload"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'case-documents');

DROP POLICY IF EXISTS "case_documents_anon_delete" ON storage.objects;
CREATE POLICY "case_documents_anon_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'case-documents');
