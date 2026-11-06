-- ============================================================
-- Production Readiness: Security fixes for go-live
-- ============================================================

-- 1. Fix mutable search_path on trigger functions
--    These functions had no search_path set, which is a security risk.
--    Set search_path = public on all of them.

ALTER FUNCTION public.notify_driver_on_assignment() SET search_path = public;
ALTER FUNCTION public.notify_driver_on_payout() SET search_path = public;
ALTER FUNCTION public.notify_shipper_on_bid() SET search_path = public;
ALTER FUNCTION public.notify_shipper_on_payment() SET search_path = public;
ALTER FUNCTION public.notify_shipper_on_status_change() SET search_path = public;

-- 2. Tighten notifications INSERT policy
--    The current policy has with_check = true, meaning any authenticated
--    user can insert a notification for ANY recipient. Restrict to:
--    - User inserting for themselves, OR
--    - Admin users inserting for anyone

DROP POLICY IF EXISTS notifications_insert_own ON notifications;

CREATE POLICY notifications_insert_own
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = recipient_id
    OR EXISTS (
      SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()
    )
  );

-- 3. Add a policy for stripe_webhook_events table (RLS enabled, no policies)
--    Only admins can read; webhook edge function uses service role (bypasses RLS)
CREATE POLICY stripe_webhook_events_select_admin
  ON stripe_webhook_events FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY stripe_webhook_events_insert_admin
  ON stripe_webhook_events FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY stripe_webhook_events_update_admin
  ON stripe_webhook_events FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

CREATE POLICY stripe_webhook_events_delete_admin
  ON stripe_webhook_events FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
