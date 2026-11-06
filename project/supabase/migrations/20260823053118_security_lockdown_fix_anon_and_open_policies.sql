-- Security lockdown: revoke anon access and fix overly permissive RLS policies

-- ============================================================================
-- 1. Revoke ALL privileges from the anon role on every table
--    The anon role should never touch any table in this app (sign-in required).
-- ============================================================================
REVOKE ALL ON TABLE public.admin_users FROM anon;
REVOKE ALL ON TABLE public.app_settings FROM anon;
REVOKE ALL ON TABLE public.bids FROM anon;
REVOKE ALL ON TABLE public.couriers FROM anon;
REVOKE ALL ON TABLE public.deliveries FROM anon;
REVOKE ALL ON TABLE public.documents FROM anon;
REVOKE ALL ON TABLE public.driver_ratings FROM anon;
REVOKE ALL ON TABLE public.messages FROM anon;
REVOKE ALL ON TABLE public.notifications FROM anon;
REVOKE ALL ON TABLE public.payments FROM anon;
REVOKE ALL ON TABLE public.pharmacies FROM anon;
REVOKE ALL ON TABLE public.profiles FROM anon;
REVOKE ALL ON TABLE public.stripe_customers FROM anon;
REVOKE ALL ON TABLE public.stripe_orders FROM anon;
REVOKE ALL ON TABLE public.stripe_subscriptions FROM anon;
REVOKE ALL ON TABLE public.support_messages FROM anon;
REVOKE ALL ON TABLE public.support_tickets FROM anon;
REVOKE ALL ON TABLE public.tracking_events FROM anon;

-- Also revoke anon access to views
REVOKE ALL ON TABLE public.stripe_user_orders FROM anon;

-- ============================================================================
-- 2. Lock down SECURITY DEFINER functions callable by anon/authenticated
--    is_admin and is_super_admin are used in RLS policies but should not be
--    directly callable as RPC endpoints.
-- ============================================================================
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- 3. Fix COURIERS table: wide-open policies → ownership + admin access
--    Couriers are legacy seed data not used by the app directly (profiles is used),
--    but keep RLS locked down anyway.
-- ============================================================================
DROP POLICY IF EXISTS anon_delete_couriers ON public.couriers;
DROP POLICY IF EXISTS authed_insert_couriers ON public.couriers;
DROP POLICY IF EXISTS authed_select_couriers ON public.couriers;
DROP POLICY IF EXISTS authed_update_couriers ON public.couriers;

CREATE POLICY "couriers_select_admin" ON public.couriers FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
CREATE POLICY "couriers_insert_admin" ON public.couriers FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
CREATE POLICY "couriers_update_admin" ON public.couriers FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
CREATE POLICY "couriers_delete_admin" ON public.couriers FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- ============================================================================
-- 4. Fix PHARMACIES table: wide-open policies → admin-only access
-- ============================================================================
DROP POLICY IF EXISTS anon_delete_pharmacies ON public.pharmacies;
DROP POLICY IF EXISTS authed_insert_pharmacies ON public.pharmacies;
DROP POLICY IF EXISTS authed_select_pharmacies ON public.pharmacies;
DROP POLICY IF EXISTS authed_update_pharmacies ON public.pharmacies;

CREATE POLICY "pharmacies_select_admin" ON public.pharmacies FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
CREATE POLICY "pharmacies_insert_admin" ON public.pharmacies FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
CREATE POLICY "pharmacies_update_admin" ON public.pharmacies FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));
CREATE POLICY "pharmacies_delete_admin" ON public.pharmacies FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- ============================================================================
-- 5. Fix BIDS table: wide-open policies → ownership + admin access
--    Bids should be visible to the shipper who owns the delivery, the driver
--    who placed the bid, and admins.
-- ============================================================================
DROP POLICY IF EXISTS authed_delete_bids ON public.bids;
DROP POLICY IF EXISTS authed_insert_bids ON public.bids;
DROP POLICY IF EXISTS authed_select_bids ON public.bids;
DROP POLICY IF EXISTS authed_update_bids ON public.bids;

CREATE POLICY "bids_select_own" ON public.bids FOR SELECT
  TO authenticated USING (
    auth.uid() = courier_id
    OR EXISTS (SELECT 1 FROM deliveries WHERE deliveries.id = bids.delivery_id AND deliveries.shipper_id = auth.uid())
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
CREATE POLICY "bids_insert_own" ON public.bids FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = courier_id);
CREATE POLICY "bids_update_own" ON public.bids FOR UPDATE
  TO authenticated USING (auth.uid() = courier_id)
  WITH CHECK (auth.uid() = courier_id);
CREATE POLICY "bids_delete_own" ON public.bids FOR DELETE
  TO authenticated USING (
    auth.uid() = courier_id
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- ============================================================================
-- 6. Fix TRACKING_EVENTS table: wide-open policies → delivery participants + admin
-- ============================================================================
DROP POLICY IF EXISTS anon_delete_tracking ON public.tracking_events;
DROP POLICY IF EXISTS authed_insert_tracking ON public.tracking_events;
DROP POLICY IF EXISTS authed_select_tracking ON public.tracking_events;
DROP POLICY IF EXISTS authed_update_tracking ON public.tracking_events;

CREATE POLICY "tracking_select_own" ON public.tracking_events FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM deliveries
     WHERE deliveries.id = tracking_events.delivery_id
       AND (deliveries.shipper_id = auth.uid() OR deliveries.driver_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
CREATE POLICY "tracking_insert_own" ON public.tracking_events FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM deliveries
     WHERE deliveries.id = tracking_events.delivery_id
       AND (deliveries.shipper_id = auth.uid() OR deliveries.driver_id = auth.uid()))
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
CREATE POLICY "tracking_update_own" ON public.tracking_events FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
CREATE POLICY "tracking_delete_admin" ON public.tracking_events FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- ============================================================================
-- 7. Fix DELIVERIES table: UPDATE policy was using=true, check=true
--    Shipper can update own deliveries, driver can update assigned deliveries,
--    admin can update all. SELECT should be scoped to participants + admin.
-- ============================================================================
DROP POLICY IF EXISTS authed_insert_deliveries ON public.deliveries;
DROP POLICY IF EXISTS authed_select_deliveries ON public.deliveries;
DROP POLICY IF EXISTS authed_update_deliveries ON public.deliveries;

CREATE POLICY "deliveries_select_own" ON public.deliveries FOR SELECT
  TO authenticated USING (
    shipper_id = auth.uid()
    OR driver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
CREATE POLICY "deliveries_insert_own" ON public.deliveries FOR INSERT
  TO authenticated WITH CHECK (
    shipper_id = auth.uid()
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
CREATE POLICY "deliveries_update_own" ON public.deliveries FOR UPDATE
  TO authenticated USING (
    shipper_id = auth.uid()
    OR driver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  )
  WITH CHECK (
    shipper_id = auth.uid()
    OR driver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- ============================================================================
-- 8. Fix NOTIFICATIONS: INSERT had check=true (anyone can write to anyone)
-- ============================================================================
DROP POLICY IF EXISTS notifications_insert_own ON public.notifications;

CREATE POLICY "notifications_insert_own" ON public.notifications FOR INSERT
  TO authenticated WITH CHECK (
    recipient_id = auth.uid()
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- ============================================================================
-- 9. Fix DRIVER_RATINGS: SELECT was using=true (all ratings visible to all)
--    Keep select open since ratings are public reputation data, but lock
--    the INSERT to only the rater and UPDATE/DELETE to admin only.
--    Actually ratings being public is a design choice for a marketplace —
--    keep SELECT open to authenticated users.
-- ============================================================================
-- No change needed: ratings_select_all is intentional for marketplace visibility.

-- ============================================================================
-- 10. Ensure app_settings SELECT stays open to all authenticated users
--     (they need pricing config), but INSERT/UPDATE/DELETE stay admin-only.
--     The current policies are correct — settings_select using=true is fine
--     since these are public configuration values (pricing rates, support contacts).
-- ============================================================================