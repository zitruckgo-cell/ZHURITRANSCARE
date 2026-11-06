/*
# Enhance shipper portal schema

1. New Tables
- `messages` — direct messages between shippers and drivers
  - id, sender_id, recipient_id, delivery_id (nullable), body, created_at
- `documents` — load-related documents (bills of lading, receipts, proof of delivery, invoices, other)
  - id, delivery_id, uploader_id, type, name, file_url, created_at

2. Modified Tables
- `deliveries` — add columns for shipper portal features:
  - `pickup_datetime` (timestamptz, nullable) — requested pickup date/time
  - `delivery_deadline` (timestamptz, nullable) — delivery deadline
  - `offered_rate` (numeric, nullable) — shipper's offered rate (separate from calculated price)
  - `special_requirements` (text, nullable) — special handling instructions
  - `document_urls` (text[], nullable) — array of uploaded document/photo URLs
  - `is_urgent` (boolean, default false) — urgent vs standard flag
- `bids` — add `driver_id` column (uuid, nullable, references profiles) so bids can be linked
  to registered driver profiles in addition to the legacy `courier_id` column.

3. Security
- Enable RLS on `messages` and `documents`.
- Policies: authenticated users can SELECT/INSERT/UPDATE/DELETE their own messages and documents
  (where sender_id/uploader_id = auth.uid() OR recipient_id = auth.uid()).
*/

-- Add columns to deliveries
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS pickup_datetime timestamptz;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS delivery_deadline timestamptz;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS offered_rate numeric;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS special_requirements text;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS document_urls text[];
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS is_urgent boolean NOT NULL DEFAULT false;

-- Add driver_id to bids
ALTER TABLE bids
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  delivery_id uuid REFERENCES deliveries(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own" ON messages;
CREATE POLICY "messages_select_own" ON messages FOR SELECT
  TO authenticated USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "messages_insert_own" ON messages;
CREATE POLICY "messages_insert_own" ON messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_update_own" ON messages;
CREATE POLICY "messages_update_own" ON messages FOR UPDATE
  TO authenticated USING (auth.uid() = sender_id) WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "messages_delete_own" ON messages;
CREATE POLICY "messages_delete_own" ON messages FOR DELETE
  TO authenticated USING (auth.uid() = sender_id);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'other',
  name text NOT NULL,
  file_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "documents_select_own" ON documents;
CREATE POLICY "documents_select_own" ON documents FOR SELECT
  TO authenticated USING (
    auth.uid() = uploader_id
    OR EXISTS (SELECT 1 FROM deliveries WHERE deliveries.id = documents.delivery_id AND deliveries.shipper_id = auth.uid())
    OR EXISTS (SELECT 1 FROM deliveries WHERE deliveries.id = documents.delivery_id AND deliveries.driver_id = auth.uid())
  );

DROP POLICY IF EXISTS "documents_insert_own" ON documents;
CREATE POLICY "documents_insert_own" ON documents FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = uploader_id);

DROP POLICY IF EXISTS "documents_delete_own" ON documents;
CREATE POLICY "documents_delete_own" ON documents FOR DELETE
  TO authenticated USING (auth.uid() = uploader_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_documents_delivery ON documents(delivery_id);
CREATE INDEX IF NOT EXISTS idx_bids_driver ON bids(driver_id);
CREATE INDEX IF NOT EXISTS idx_bids_delivery ON bids(delivery_id);
