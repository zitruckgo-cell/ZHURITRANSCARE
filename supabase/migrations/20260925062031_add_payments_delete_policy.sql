-- Add missing DELETE policy on payments table
-- Allows shippers to cancel their own pending payments, and admins to delete any
DROP POLICY IF EXISTS "payments_delete_own" ON payments;
CREATE POLICY "payments_delete_own" ON payments FOR DELETE
  TO authenticated USING (
    auth.uid() = shipper_id OR
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
