-- Create the documents storage bucket for POD photos, signatures, and other delivery docs
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files to documents bucket
CREATE POLICY "documents_upload_own"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'documents');

-- Allow authenticated users to read files from documents bucket
CREATE POLICY "documents_read_all"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'documents');

-- Allow users to update their own uploads
CREATE POLICY "documents_update_own"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'documents' AND owner = auth.uid());

-- Allow users to delete their own uploads
CREATE POLICY "documents_delete_own"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'documents' AND owner = auth.uid());