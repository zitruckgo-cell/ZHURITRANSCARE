-- When a payment transitions to "paid" (via Stripe webhook),
-- auto-release it if the delivery has already been delivered.
-- This handles the case where delivery completes before the shipper pays.

CREATE OR REPLACE FUNCTION auto_release_on_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_delivery_status text;
BEGIN
  -- Only fire when status transitions TO 'paid'
  IF NEW.status = 'paid' AND (OLD IS NULL OR OLD.status <> 'paid') THEN
    -- Check if the delivery is already delivered
    SELECT status INTO v_delivery_status FROM deliveries WHERE id = NEW.delivery_id;
    IF v_delivery_status = 'delivered' THEN
      UPDATE payments
      SET status = 'released', released_at = now()
      WHERE id = NEW.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payments_release_trigger ON payments;
CREATE TRIGGER payments_release_trigger
  AFTER UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION auto_release_on_paid();