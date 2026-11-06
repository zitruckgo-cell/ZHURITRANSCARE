-- Fix: create_dispatch_order_after_payment() references shipper_row.email
-- and driver_row.email, but the profiles table has no email column (email
-- lives in auth.users). This caused the AFTER UPDATE trigger to throw an
-- error whenever a payment transitioned to 'paid', rolling back the entire
-- UPDATE and leaving the payment stuck as 'pending' even though Stripe
-- successfully charged the card.

CREATE OR REPLACE FUNCTION public.create_dispatch_order_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  delivery_row deliveries%ROWTYPE;
  accepted_bid bids%ROWTYPE;
  shipper_row profiles%ROWTYPE;
  driver_row profiles%ROWTYPE;
  shipper_email text;
  driver_email text;
  snapshot jsonb;
BEGIN
  IF NEW.status <> 'paid' OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN
    RETURN NEW;
  END IF;

  SELECT * INTO delivery_row FROM deliveries WHERE id = NEW.delivery_id;
  IF delivery_row.id IS NULL OR delivery_row.driver_id IS NULL OR delivery_row.shipper_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO accepted_bid
  FROM bids
  WHERE delivery_id = NEW.delivery_id
    AND driver_id = NEW.driver_id
    AND (status = 'accepted' OR counter_status = 'accepted')
  ORDER BY created_at DESC
  LIMIT 1;

  IF accepted_bid.id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO shipper_row FROM profiles WHERE id = NEW.shipper_id;
  SELECT * INTO driver_row FROM profiles WHERE id = NEW.driver_id;

  -- Fetch emails from auth.users (profiles table has no email column)
  SELECT email INTO shipper_email FROM auth.users WHERE id = NEW.shipper_id;
  SELECT email INTO driver_email FROM auth.users WHERE id = NEW.driver_id;

  SELECT jsonb_build_object(
    'pickup', jsonb_build_object(
      'name', delivery_row.pickup_name,
      'address', delivery_row.pickup_address,
      'city', delivery_row.pickup_city,
      'state', delivery_row.pickup_state,
      'zip', delivery_row.pickup_zip,
      'contact', delivery_row.pickup_contact,
      'scheduled_at', delivery_row.pickup_datetime
    ),
    'delivery', jsonb_build_object(
      'name', delivery_row.delivery_name,
      'address', delivery_row.delivery_address,
      'city', delivery_row.delivery_city,
      'state', delivery_row.delivery_state,
      'zip', delivery_row.delivery_zip,
      'contact', delivery_row.delivery_contact,
      'deadline', delivery_row.delivery_deadline
    ),
    'shipper', jsonb_build_object('id', shipper_row.id, 'name', shipper_row.full_name, 'email', shipper_email, 'phone', shipper_row.phone, 'business_name', shipper_row.business_name),
    'driver', jsonb_build_object('id', driver_row.id, 'name', driver_row.full_name, 'email', driver_email, 'phone', driver_row.phone, 'vehicle_type', driver_row.vehicle_type, 'vehicle_plate', driver_row.vehicle_plate),
    'cargo', jsonb_build_object('package_type', delivery_row.package_type, 'description', delivery_row.package_description, 'quantity', NULL, 'weight_lbs', delivery_row.weight_lbs, 'temperature_control', delivery_row.temperature_control),
    'money', jsonb_build_object('agreed_driver_payment', NEW.driver_payout, 'gross_amount', NEW.gross_amount, 'platform_commission', NEW.commission_amount, 'commission_rate', NEW.commission_rate, 'bid_amount', accepted_bid.amount, 'counter_amount', accepted_bid.counter_amount),
    'instructions', jsonb_build_object('special_requirements', delivery_row.special_requirements, 'shipper_instructions', delivery_row.shipper_instructions, 'bid_message', accepted_bid.message, 'counter_message', accepted_bid.counter_message),
    'documents', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', documents.id, 'type', documents.type, 'name', documents.name, 'file_url', documents.file_url, 'created_at', documents.created_at) ORDER BY documents.created_at) FROM documents WHERE documents.delivery_id = delivery_row.id), '[]'::jsonb),
    'delivery_document_urls', to_jsonb(COALESCE(delivery_row.document_urls, ARRAY[]::text[])),
    'identifiers', jsonb_build_object('bol_number', delivery_row.bol_number, 'pod_number', delivery_row.pod_number)
  ) INTO snapshot;

  INSERT INTO dispatch_orders (delivery_id, bid_id, shipper_id, driver_id, payment_id, status, payment_status, order_snapshot)
  VALUES (delivery_row.id, accepted_bid.id, NEW.shipper_id, NEW.driver_id, NEW.id, 'dispatched', NEW.status, snapshot)
  ON CONFLICT (payment_id) DO NOTHING;

  RETURN NEW;
END;
$function$;
