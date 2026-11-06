-- Fix the auto_create_payout trigger to RELEASE an existing paid payment
-- instead of creating a new "released" payment record.
-- The correct flow is:
--   1. Bid accepted -> pending payment created (from app code)
--   2. Shipper pays via Stripe -> webhook marks payment "paid"
--   3. Delivery marked delivered -> trigger releases the paid payment to driver

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
  v_payment_id uuid;
  v_payment_status text;
BEGIN
  -- Only fire when status transitions TO 'delivered'
  IF NEW.status = 'delivered' AND (OLD IS NULL OR OLD.status <> 'delivered') THEN
    -- Skip if no driver assigned
    IF NEW.driver_id IS NULL THEN
      RETURN NEW;
    END IF;

    -- Look for an existing payment for this delivery
    SELECT id, status INTO v_payment_id, v_payment_status
    FROM payments WHERE delivery_id = NEW.id LIMIT 1;

    -- Get commission rate from app_settings (default 0.10 = 10%)
    SELECT COALESCE(
      (SELECT value::numeric FROM app_settings WHERE key = 'commission_rate' LIMIT 1),
      0.10
    ) INTO v_commission_rate;

    -- Calculate price (use accepted_bid, fallback to calculated_price, then max_bid_amount)
    v_price := COALESCE(NEW.accepted_bid, NEW.calculated_price, NEW.max_bid_amount, 0);

    -- Calculate amounts
    v_commission_amount := ROUND(v_price * v_commission_rate, 2);
    v_driver_payout := ROUND(v_price - v_commission_amount, 2);

    IF v_payment_id IS NOT NULL THEN
      -- Payment record already exists (created when bid was accepted)
      -- If it's been paid via Stripe, release it to the driver
      IF v_payment_status = 'paid' THEN
        UPDATE payments
        SET status = 'released',
            released_at = now(),
            gross_amount = v_price,
            commission_rate = v_commission_rate,
            commission_amount = v_commission_amount,
            driver_payout = v_driver_payout
        WHERE id = v_payment_id;
      END IF;
      -- If still "pending" (shipper hasn't paid yet), leave it as pending
      -- The payment will be released later once the shipper pays
    ELSE
      -- No payment record exists yet (edge case: delivery created before payment flow)
      -- Create a pending payment so the shipper can pay
      INSERT INTO payments (
        delivery_id, shipper_id, driver_id,
        gross_amount, commission_rate, commission_amount, driver_payout,
        status, created_at
      ) VALUES (
        NEW.id, NEW.shipper_id, NEW.driver_id,
        v_price, v_commission_rate, v_commission_amount, v_driver_payout,
        'pending', now()
      );
    END IF;

    -- Increment driver's total_deliveries
    UPDATE profiles
    SET total_deliveries = COALESCE(total_deliveries, 0) + 1
    WHERE id = NEW.driver_id;
  END IF;

  RETURN NEW;
END;
$$;