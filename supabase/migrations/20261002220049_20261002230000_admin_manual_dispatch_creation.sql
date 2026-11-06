/*
# Admin manual dispatch order creation

1. Purpose
- Allow an admin to manually create a Dispatch Order for a delivery that has a paid payment
  but did not get a dispatch order automatically (e.g. the bid was marked accepted after payment).
- The automatic trigger remains the primary workflow.

2. New function `create_dispatch_order_manual`
- Callable only by active admins.
- Accepts a delivery_id.
- Verifies the delivery has a driver, shipper, and a paid payment.
- Verifies an accepted bid (or counter-accepted) exists for the driver.
- Builds the same order_snapshot as the automatic trigger.
- Inserts the dispatch order (ON CONFLICT does nothing if one already exists by payment_id).
- Returns the created (or existing) dispatch_order row.

3. Security
- Only active admin_users can execute.
- No changes to RLS or existing policies.
*/

CREATE OR REPLACE FUNCTION public.create_dispatch_order_manual(p_delivery_id uuid)
RETURNS dispatch_orders
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_delivery deliveries%ROWTYPE;
  v_payment payments%ROWTYPE;
  v_bid bids%ROWTYPE;
  v_shipper profiles%ROWTYPE;
  v_driver profiles%ROWTYPE;
  v_snapshot jsonb;
  v_result dispatch_orders;
BEGIN
  -- Authorize: must be an active admin
  IF NOT EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true) THEN
    RAISE EXCEPTION 'Not authorized: admin access required';
  END IF;

  SELECT * INTO v_delivery FROM deliveries WHERE id = p_delivery_id;
  IF v_delivery.id IS NULL THEN
    RAISE EXCEPTION 'Delivery not found';
  END IF;

  IF v_delivery.driver_id IS NULL OR v_delivery.shipper_id IS NULL THEN
    RAISE EXCEPTION 'Delivery must have a driver and shipper assigned';
  END IF;

  -- Find a paid payment for this delivery
  SELECT * INTO v_payment FROM payments
  WHERE delivery_id = p_delivery_id AND status = 'paid'
  ORDER BY created_at DESC LIMIT 1;

  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'No paid payment found for this delivery';
  END IF;

  -- Find an accepted bid or counter-accepted bid
  SELECT * INTO v_bid FROM bids
  WHERE delivery_id = p_delivery_id
    AND driver_id = v_delivery.driver_id
    AND (status = 'accepted' OR counter_status = 'accepted')
  ORDER BY created_at DESC LIMIT 1;

  IF v_bid.id IS NULL THEN
    RAISE EXCEPTION 'No accepted bid found for this delivery and driver';
  END IF;

  SELECT * INTO v_shipper FROM profiles WHERE id = v_delivery.shipper_id;
  SELECT * INTO v_driver FROM profiles WHERE id = v_delivery.driver_id;

  SELECT jsonb_build_object(
    'pickup', jsonb_build_object(
      'name', v_delivery.pickup_name,
      'address', v_delivery.pickup_address,
      'city', v_delivery.pickup_city,
      'state', v_delivery.pickup_state,
      'zip', v_delivery.pickup_zip,
      'contact', v_delivery.pickup_contact,
      'scheduled_at', v_delivery.pickup_datetime
    ),
    'delivery', jsonb_build_object(
      'name', v_delivery.delivery_name,
      'address', v_delivery.delivery_address,
      'city', v_delivery.delivery_city,
      'state', v_delivery.delivery_state,
      'zip', v_delivery.delivery_zip,
      'contact', v_delivery.delivery_contact,
      'deadline', v_delivery.delivery_deadline
    ),
    'shipper', jsonb_build_object('id', v_shipper.id, 'name', v_shipper.full_name, 'email', v_shipper.email, 'phone', v_shipper.phone, 'business_name', v_shipper.business_name),
    'driver', jsonb_build_object('id', v_driver.id, 'name', v_driver.full_name, 'email', v_driver.email, 'phone', v_driver.phone, 'vehicle_type', v_driver.vehicle_type, 'vehicle_plate', v_driver.vehicle_plate),
    'cargo', jsonb_build_object('package_type', v_delivery.package_type, 'description', v_delivery.package_description, 'quantity', NULL, 'weight_lbs', v_delivery.weight_lbs, 'temperature_control', v_delivery.temperature_control),
    'money', jsonb_build_object('agreed_driver_payment', v_payment.driver_payout, 'gross_amount', v_payment.gross_amount, 'platform_commission', v_payment.commission_amount, 'commission_rate', v_payment.commission_rate, 'bid_amount', v_bid.amount, 'counter_amount', v_bid.counter_amount),
    'instructions', jsonb_build_object('special_requirements', v_delivery.special_requirements, 'shipper_instructions', v_delivery.shipper_instructions, 'bid_message', v_bid.message, 'counter_message', v_bid.counter_message),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', documents.id, 'type', documents.type, 'name', documents.name, 'file_url', documents.file_url, 'created_at', documents.created_at) ORDER BY documents.created_at) FROM documents WHERE documents.delivery_id = v_delivery.id), '[]'::jsonb),
    'delivery_document_urls', to_jsonb(COALESCE(v_delivery.document_urls, ARRAY[]::text[])),
    'identifiers', jsonb_build_object('bol_number', v_delivery.bol_number, 'pod_number', v_delivery.pod_number)
  ) INTO v_snapshot;

  INSERT INTO dispatch_orders (delivery_id, bid_id, shipper_id, driver_id, payment_id, status, payment_status, order_snapshot)
  VALUES (v_delivery.id, v_bid.id, v_delivery.shipper_id, v_delivery.driver_id, v_payment.id, 'dispatched', v_payment.status, v_snapshot)
  ON CONFLICT (payment_id) DO NOTHING
  RETURNING * INTO v_result;

  IF v_result.id IS NULL THEN
    SELECT * INTO v_result FROM dispatch_orders WHERE payment_id = v_payment.id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.create_dispatch_order_manual(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_dispatch_order_manual(uuid) TO authenticated;
