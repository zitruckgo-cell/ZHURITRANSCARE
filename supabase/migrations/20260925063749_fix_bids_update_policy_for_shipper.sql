-- Fix bids UPDATE policy: shippers must be able to update bids on their own deliveries
-- (accept, reject, send counter offers). Previously only the driver could update.
DROP POLICY IF EXISTS "bids_update_own" ON bids;
CREATE POLICY "bids_update_own" ON bids FOR UPDATE
  TO authenticated USING (
    auth.uid() = driver_id
    OR EXISTS (
      SELECT 1 FROM deliveries
      WHERE deliveries.id = bids.delivery_id
      AND deliveries.shipper_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  ) WITH CHECK (
    auth.uid() = driver_id
    OR EXISTS (
      SELECT 1 FROM deliveries
      WHERE deliveries.id = bids.delivery_id
      AND deliveries.shipper_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
