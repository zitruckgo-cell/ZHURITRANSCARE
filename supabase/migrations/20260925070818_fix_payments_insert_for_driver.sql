-- Fix payments INSERT policy: allow drivers to insert payments too
-- (needed when driver accepts a counter offer and triggers assignment + payment)
DROP POLICY IF EXISTS "payments_insert_own" ON payments;
CREATE POLICY "payments_insert_own" ON payments FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = shipper_id
    OR auth.uid() = driver_id
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
