/*
# Auto-Payout on Delivery Confirmation & Demo Data Cleanup

## Overview
This migration implements automatic payout calculation and distribution when a delivery
is confirmed as delivered. It also cleans up all fake/demo data to prepare the app for live use.

## Changes

### 1. Auto-Payout Trigger Function
- Creates `auto_create_payout()` function that fires AFTER a delivery status changes to 'delivered'
- Calculates 10% commission (platform) and 90% driver payout from the delivery price
- Reads commission_rate from app_settings (defaults to 0.10 if not found)
- Inserts a payment record with status 'released' and released_at timestamp
- Prevents duplicate payments (checks if one already exists for the delivery)
- Updates the driver's total_deliveries count

### 2. Trigger
- Creates `deliveries_payout_trigger` on the deliveries table
- Fires AFTER UPDATE when status transitions to 'delivered'

### 3. Demo Data Cleanup
- Deletes all 5 demo deliveries created on 2026-07-15 (these have null shipper_id and null price)
- Deletes the test "Browser Test" profile
- Resets the real driver's total_deliveries to 0

### 4. Priority Constraint Fix
- Updates any 'routine' priority deliveries to 'standard' (routine is not a valid priority)

## Security
- No RLS changes — trigger runs with definer privileges (SECURITY DEFINER)
- Function is owned by postgres role
*/

-- ============================================================
-- 1. Auto-Payout Trigger Function
-- ============================================================

CREATE OR REPLACE FUNCTION auto_create_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_commission_rate numeric;
  v_price numeric;
  v_commission_amount numeric;
  v_driver_payout numeric;
  v_existing_payment uuid;
BEGIN
  -- Only fire when status transitions TO 'delivered'
  IF NEW.status = 'delivered' AND (OLD IS NULL OR OLD.status <> 'delivered') THEN
    -- Skip if no driver assigned
    IF NEW.driver_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Skip if payment already exists for this delivery
    SELECT id INTO v_existing_payment FROM payments WHERE delivery_id = NEW.id LIMIT 1;
    IF v_existing_payment IS NOT NULL THEN
      RETURN NEW;
    END IF;

    -- Get commission rate from app_settings (default 0.10 = 10%)
    SELECT COALESCE(
      (SELECT value::numeric FROM app_settings WHERE key = 'commission_rate' LIMIT 1),
      0.10
    ) INTO v_commission_rate;

    -- Calculate price (use calculated_price, fallback to max_bid_amount)
    v_price := COALESCE(NEW.calculated_price, NEW.max_bid_amount, 0);

    -- Calculate amounts
    v_commission_amount := ROUND(v_price * v_commission_rate, 2);
    v_driver_payout := ROUND(v_price - v_commission_amount, 2);

    -- Create the payment record
    INSERT INTO payments (
      delivery_id, shipper_id, driver_id,
      gross_amount, commission_rate, commission_amount, driver_payout,
      status, released_at, created_at
    ) VALUES (
      NEW.id, NEW.shipper_id, NEW.driver_id,
      v_price, v_commission_rate, v_commission_amount, v_driver_payout,
      'released', now(), now()
    );

    -- Increment driver's total_deliveries
    UPDATE profiles
    SET total_deliveries = COALESCE(total_deliveries, 0) + 1
    WHERE id = NEW.driver_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ============================================================
-- 2. Trigger on deliveries table
-- ============================================================

DROP TRIGGER IF EXISTS deliveries_payout_trigger ON deliveries;
CREATE TRIGGER deliveries_payout_trigger
  AFTER UPDATE ON deliveries
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_payout();

-- ============================================================
-- 3. Clean up demo data
-- ============================================================

-- Delete demo deliveries (created on 2026-07-15 with null shipper_id)
DELETE FROM tracking_events WHERE delivery_id IN (
  SELECT id FROM deliveries WHERE shipper_id IS NULL
);
DELETE FROM payments WHERE delivery_id IN (
  SELECT id FROM deliveries WHERE shipper_id IS NULL
);
DELETE FROM deliveries WHERE shipper_id IS NULL;

-- Delete the test "Browser Test" profile
DELETE FROM admin_users WHERE id IN (
  SELECT id FROM profiles WHERE full_name = 'Browser Test'
);
DELETE FROM profiles WHERE full_name = 'Browser Test';

-- Reset driver total_deliveries since we cleaned demo data
UPDATE profiles SET total_deliveries = 0 WHERE roles::text LIKE '%driver%';

-- ============================================================
-- 4. Fix priority values
-- ============================================================

-- Update any 'routine' priority to 'standard'
UPDATE deliveries SET priority = 'standard' WHERE priority = 'routine';
