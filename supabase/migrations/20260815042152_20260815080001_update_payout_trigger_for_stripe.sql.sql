/*
# Update Auto-Payout Trigger for Stripe Integration

Changes the auto_create_payout trigger to create payments with status 'pending'
instead of 'released', so shippers pay via Stripe Checkout before the payment
is released to the driver.
*/

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

    -- Create the payment record as 'pending' — shipper pays via Stripe
    INSERT INTO payments (
      delivery_id, shipper_id, driver_id,
      gross_amount, commission_rate, commission_amount, driver_payout,
      status, created_at
    ) VALUES (
      NEW.id, NEW.shipper_id, NEW.driver_id,
      v_price, v_commission_rate, v_commission_amount, v_driver_payout,
      'pending', now()
    );

    -- Increment driver's total_deliveries
    UPDATE profiles
    SET total_deliveries = COALESCE(total_deliveries, 0) + 1
    WHERE id = NEW.driver_id;
  END IF;

  RETURN NEW;
END;
$$;
