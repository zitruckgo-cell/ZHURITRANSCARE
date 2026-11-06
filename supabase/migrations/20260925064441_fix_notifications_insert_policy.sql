-- Fix notifications INSERT policy: allow any authenticated user to insert
-- notifications to other users (e.g. driver notifies shipper of a bid,
-- shipper notifies driver of a counter offer).
DROP POLICY IF EXISTS "notifications_insert_own" ON notifications;
CREATE POLICY "notifications_insert_own" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);
