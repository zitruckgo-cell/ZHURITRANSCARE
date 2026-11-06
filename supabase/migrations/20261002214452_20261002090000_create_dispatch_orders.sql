/*
# Create paid-and-approved dispatch orders

1. Purpose
- Create one durable Dispatch Order only after a shipper-approved bid has been paid successfully.
- Keep a complete, auditable snapshot of the load, contacts, agreed money, instructions, and documents at dispatch time.

2. New sequence and table
- `dispatch_order_number_seq` supplies unique human-readable order numbers.
- `dispatch_orders` links the dispatch to its delivery, accepted bid, shipper, driver, and payment.
- `dispatch_orders.dispatch_order_number` stores numbers such as `DO-20261002-000001`.
- `dispatch_orders.status` tracks `dispatched`, `accepted`, `proceeding_to_pickup`, `picked_up`, `in_transit`, `delivered`, or `cancelled`.
- `dispatch_orders.payment_status` mirrors the payment state used when the order was created.
- `dispatch_orders.order_snapshot` stores the complete itinerary and contact/money/document details as a stable JSON snapshot.

3. Automation
- A trigger on `payments` creates the dispatch order when a payment changes to `paid`.
- The trigger requires the delivery to have the paid driver's assigned bid marked `accepted`, or a driver-accepted counter offer.
- A unique payment and delivery link prevents duplicate dispatch orders during webhook retries.

4. Security
- Row-level security is enabled on `dispatch_orders`.
- Authenticated drivers can read only their own dispatch orders.
- Authenticated shippers can read only their own dispatch orders.
- Administrators can read all dispatch orders.
- Clients cannot directly insert, update, or delete dispatch orders.
- Drivers use two server-checked functions to accept a dispatch and proceed to pickup.

5. Important notes
- Submitting a bid alone never creates a dispatch order.
- A pending, failed, refunded, or cancelled payment never creates a dispatch order.
- Existing payment and delivery records are not deleted or changed by this migration.
*/

CREATE SEQUENCE IF NOT EXISTS dispatch_order_number_seq;

CREATE TABLE IF NOT EXISTS dispatch_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_order_number text NOT NULL UNIQUE DEFAULT ('DO-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(nextval('dispatch_order_number_seq')::text, 6, '0')),
  delivery_id uuid NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE RESTRICT,
  bid_id uuid REFERENCES bids(id) ON DELETE SET NULL,
  shipper_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'accepted', 'proceeding_to_pickup', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  payment_status text NOT NULL DEFAULT 'paid',
  order_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  driver_accepted_at timestamptz,
  proceeding_to_pickup_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE dispatch_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_orders_select_participants" ON dispatch_orders;
CREATE POLICY "dispatch_orders_select_participants"
  ON dispatch_orders FOR SELECT
  TO authenticated
  USING (
    auth.uid() = shipper_id
    OR auth.uid() = driver_id
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true)
  );

DROP POLICY IF EXISTS "dispatch_orders_insert_denied" ON dispatch_orders;
CREATE POLICY "dispatch_orders_insert_denied"
  ON dispatch_orders FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "dispatch_orders_update_admin" ON dispatch_orders;
CREATE POLICY "dispatch_orders_update_admin"
  ON dispatch_orders FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true));

DROP POLICY IF EXISTS "dispatch_orders_delete_admin" ON dispatch_orders;
CREATE POLICY "dispatch_orders_delete_admin"
  ON dispatch_orders FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true));

CREATE INDEX IF NOT EXISTS idx_dispatch_orders_driver ON dispatch_orders(driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_shipper ON dispatch_orders(shipper_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatch_orders_status ON dispatch_orders(status);

CREATE OR REPLACE FUNCTION public.refresh_dispatch_order_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_orders_updated_at ON dispatch_orders;
CREATE TRIGGER dispatch_orders_updated_at
  BEFORE UPDATE ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION public.refresh_dispatch_order_timestamp();

CREATE OR REPLACE FUNCTION public.create_dispatch_order_after_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  delivery_row deliveries%ROWTYPE;
  accepted_bid bids%ROWTYPE;
  shipper_row profiles%ROWTYPE;
  driver_row profiles%ROWTYPE;
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
    'shipper', jsonb_build_object('id', shipper_row.id, 'name', shipper_row.full_name, 'email', shipper_row.email, 'phone', shipper_row.phone, 'business_name', shipper_row.business_name),
    'driver', jsonb_build_object('id', driver_row.id, 'name', driver_row.full_name, 'email', driver_row.email, 'phone', driver_row.phone, 'vehicle_type', driver_row.vehicle_type, 'vehicle_plate', driver_row.vehicle_plate),
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
$$;

DROP TRIGGER IF EXISTS payments_create_dispatch_order ON payments;
CREATE TRIGGER payments_create_dispatch_order
  AFTER INSERT OR UPDATE OF status ON payments
  FOR EACH ROW EXECUTE FUNCTION public.create_dispatch_order_after_payment();

CREATE OR REPLACE FUNCTION public.accept_dispatch_order(p_order_id uuid)
RETURNS dispatch_orders
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result dispatch_orders;
BEGIN
  UPDATE dispatch_orders
  SET status = 'accepted', driver_accepted_at = now()
  WHERE id = p_order_id
    AND driver_id = auth.uid()
    AND status = 'dispatched'
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch order is not available for acceptance';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.proceed_to_pickup(p_order_id uuid)
RETURNS dispatch_orders
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result dispatch_orders;
BEGIN
  UPDATE dispatch_orders
  SET status = 'proceeding_to_pickup', proceeding_to_pickup_at = now()
  WHERE id = p_order_id
    AND driver_id = auth.uid()
    AND status = 'accepted'
  RETURNING * INTO result;

  IF result.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch order must be accepted before proceeding to pickup';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_dispatch_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_dispatch_order(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.proceed_to_pickup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.proceed_to_pickup(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.create_dispatch_order_after_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_dispatch_order_timestamp() FROM PUBLIC, anon, authenticated;
