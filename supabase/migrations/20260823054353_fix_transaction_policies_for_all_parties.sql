-- Fix RLS policies that block transactions between shippers, drivers, and payments

-- ============================================================================
-- 1. BIDS: policies checked courier_id but the app inserts driver_id
--    The bids table has both courier_id (legacy) and driver_id (current).
--    All new bids are created with driver_id = auth.uid(), courier_id = null.
--    Fix all bid policies to use driver_id.
-- ============================================================================
DROP POLICY IF EXISTS bids_select_own ON public.bids;
DROP POLICY IF EXISTS bids_insert_own ON public.bids;
DROP POLICY IF EXISTS bids_update_own ON public.bids;
DROP POLICY IF EXISTS bids_delete_own ON public.bids;

CREATE POLICY "bids_select_own" ON public.bids FOR SELECT
  TO authenticated USING (
    auth.uid() = driver_id
    OR auth.uid() = courier_id
    OR EXISTS (SELECT 1 FROM deliveries WHERE deliveries.id = bids.delivery_id AND deliveries.shipper_id = auth.uid())
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );
CREATE POLICY "bids_insert_own" ON public.bids FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "bids_update_own" ON public.bids FOR UPDATE
  TO authenticated USING (auth.uid() = driver_id)
  WITH CHECK (auth.uid() = driver_id);
CREATE POLICY "bids_delete_own" ON public.bids FOR DELETE
  TO authenticated USING (
    auth.uid() = driver_id
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- ============================================================================
-- 2. DELIVERIES UPDATE: drivers couldn't accept posted loads
--    When a driver accepts a load, they UPDATE the delivery to set
--    driver_id = auth.uid() and status = 'assigned'. But the UPDATE policy
--    required driver_id = auth.uid() (which is NULL at that point) or
--    shipper_id = auth.uid() (belongs to someone else). The driver was blocked.
--    Fix: allow UPDATE when the row's shipper_id = auth.uid() (shipper editing
--    their own load), OR when driver_id = auth.uid() (driver updating their
--    assigned load), OR when driver_id IS NULL AND the new driver_id being
--    set equals auth.uid() (driver accepting a posted load), OR admin.
-- ============================================================================
DROP POLICY IF EXISTS deliveries_update_own ON public.deliveries;

CREATE POLICY "deliveries_update_own" ON public.deliveries FOR UPDATE
  TO authenticated USING (
    shipper_id = auth.uid()
    OR driver_id = auth.uid()
    OR (driver_id IS NULL AND shipper_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  )
  WITH CHECK (
    shipper_id = auth.uid()
    OR driver_id = auth.uid()
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- ============================================================================
-- 3. TRACKING_EVENTS INSERT: drivers need to insert tracking events when
--    they accept/update a delivery. The current INSERT policy requires
--    the delivery's driver_id or shipper_id to equal auth.uid(), which works
--    after assignment. But we need to also allow it when the driver just
--    accepted (driver_id may not yet be committed in a race). Keep the
--    existing policy which checks via subquery — it should work since the
--    delivery UPDATE commits before the tracking INSERT fires.
--    Actually the existing policy is fine. No change needed.
-- ============================================================================