/*
# Add Round Trip / multi-leg support to Dispatch Orders

1. Purpose
- Allow a Dispatch Order to be marked as a round trip.
- Let the shipper or admin add a return leg with its own pickup, destination, date/time, and load details.
- Show both the outbound and return legs under the same Dispatch Order, each with its own status.

2. Changes to `dispatch_orders`
- New column `is_round_trip` (boolean, default false).

3. New table `dispatch_legs`
- Stores individual trip legs (outbound and return) for a dispatch order.
- `dispatch_order_id` links back to the parent dispatch order.
- `leg_type` is either `outbound` or `return`.
- `leg_number` is 1 for outbound, 2 for return (used for ordering).
- `status` mirrors the same lifecycle as the dispatch order.
- `leg_snapshot` stores the complete itinerary as JSONB.
- Unique constraint prevents duplicate legs of the same type per dispatch order.

4. Automation
- When a dispatch order is inserted, an outbound leg is automatically created from the order snapshot.

5. New server functions
- `add_return_leg` — callable by the shipper or admin; inserts a return leg.
- `advance_dispatch_leg` — callable by the driver; moves a leg through its lifecycle and updates the parent order status.

6. Security
- RLS enabled on `dispatch_legs`.
- Drivers, shippers, and admins can read legs on their respective orders.
- Direct INSERT/UPDATE by clients is denied.
- Functions check authorization internally.
*/

ALTER TABLE dispatch_orders
  ADD COLUMN IF NOT EXISTS is_round_trip boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS dispatch_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_order_id uuid NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
  leg_type text NOT NULL CHECK (leg_type IN ('outbound', 'return')),
  leg_number int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'dispatched' CHECK (status IN ('dispatched', 'accepted', 'proceeding_to_pickup', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  leg_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  driver_accepted_at timestamptz,
  proceeding_to_pickup_at timestamptz,
  picked_up_at timestamptz,
  in_transit_at timestamptz,
  delivered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispatch_order_id, leg_type)
);

ALTER TABLE dispatch_legs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispatch_legs_select_participants" ON dispatch_legs;
CREATE POLICY "dispatch_legs_select_participants"
  ON dispatch_legs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM dispatch_orders
      WHERE dispatch_orders.id = dispatch_legs.dispatch_order_id
        AND (
          dispatch_orders.shipper_id = auth.uid()
          OR dispatch_orders.driver_id = auth.uid()
          OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true)
        )
    )
  );

DROP POLICY IF EXISTS "dispatch_legs_insert_denied" ON dispatch_legs;
CREATE POLICY "dispatch_legs_insert_denied"
  ON dispatch_legs FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "dispatch_legs_update_denied" ON dispatch_legs;
CREATE POLICY "dispatch_legs_update_denied"
  ON dispatch_legs FOR UPDATE
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "dispatch_legs_delete_admin" ON dispatch_legs;
CREATE POLICY "dispatch_legs_delete_admin"
  ON dispatch_legs FOR DELETE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true));

CREATE INDEX IF NOT EXISTS idx_dispatch_legs_order ON dispatch_legs(dispatch_order_id, leg_number);
CREATE INDEX IF NOT EXISTS idx_dispatch_legs_status ON dispatch_legs(status);

GRANT SELECT ON dispatch_legs TO authenticated;

CREATE OR REPLACE FUNCTION public.refresh_dispatch_leg_timestamp()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_legs_updated_at ON dispatch_legs;
CREATE TRIGGER dispatch_legs_updated_at
  BEFORE UPDATE ON dispatch_legs
  FOR EACH ROW EXECUTE FUNCTION public.refresh_dispatch_leg_timestamp();

REVOKE ALL ON FUNCTION public.refresh_dispatch_leg_timestamp() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_outbound_leg_on_dispatch_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  leg_snap jsonb;
BEGIN
  leg_snap := jsonb_build_object(
    'pickup', NEW.order_snapshot->'pickup',
    'delivery', NEW.order_snapshot->'delivery',
    'cargo', NEW.order_snapshot->'cargo',
    'instructions', NEW.order_snapshot->'instructions',
    'scheduled_pickup', NEW.order_snapshot->'pickup'->'scheduled_at',
    'delivery_deadline', NEW.order_snapshot->'delivery'->'deadline'
  );

  INSERT INTO dispatch_legs (dispatch_order_id, leg_type, leg_number, status, leg_snapshot)
  VALUES (NEW.id, 'outbound', 1, 'dispatched', leg_snap)
  ON CONFLICT (dispatch_order_id, leg_type) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS dispatch_orders_create_outbound_leg ON dispatch_orders;
CREATE TRIGGER dispatch_orders_create_outbound_leg
  AFTER INSERT ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION public.create_outbound_leg_on_dispatch_insert();

REVOKE ALL ON FUNCTION public.create_outbound_leg_on_dispatch_insert() FROM PUBLIC, anon, authenticated;

-- Backfill outbound legs for existing dispatch orders
INSERT INTO dispatch_legs (dispatch_order_id, leg_type, leg_number, status, leg_snapshot)
SELECT dord.id, 'outbound', 1, dord.status,
  jsonb_build_object(
    'pickup', dord.order_snapshot->'pickup',
    'delivery', dord.order_snapshot->'delivery',
    'cargo', dord.order_snapshot->'cargo',
    'instructions', dord.order_snapshot->'instructions',
    'scheduled_pickup', dord.order_snapshot->'pickup'->'scheduled_at',
    'delivery_deadline', dord.order_snapshot->'delivery'->'deadline'
  )
FROM dispatch_orders dord
WHERE NOT EXISTS (
  SELECT 1 FROM dispatch_legs dl WHERE dl.dispatch_order_id = dord.id AND dl.leg_type = 'outbound'
);

CREATE OR REPLACE FUNCTION public.add_return_leg(
  p_order_id uuid,
  p_pickup_name text,
  p_pickup_address text,
  p_pickup_city text,
  p_pickup_state text,
  p_pickup_zip text,
  p_pickup_contact text,
  p_delivery_name text,
  p_delivery_address text,
  p_delivery_city text,
  p_delivery_state text,
  p_delivery_zip text,
  p_delivery_contact text,
  p_scheduled_pickup timestamptz,
  p_delivery_deadline timestamptz,
  p_package_type text DEFAULT 'medication',
  p_package_description text DEFAULT NULL,
  p_weight_lbs numeric DEFAULT NULL,
  p_temperature_control text DEFAULT 'none',
  p_instructions text DEFAULT NULL
)
RETURNS dispatch_legs
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_order dispatch_orders%ROWTYPE;
  v_leg_snap jsonb;
  v_result dispatch_legs;
BEGIN
  SELECT * INTO v_order FROM dispatch_orders WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch order not found';
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_order.shipper_id <> auth.uid()
     AND NOT EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid() AND admin_users.is_active = true)
  THEN
    RAISE EXCEPTION 'Not authorized to add a return leg';
  END IF;

  IF v_order.status = 'cancelled' THEN
    RAISE EXCEPTION 'Cannot add a return leg to a cancelled dispatch order';
  END IF;

  IF EXISTS (SELECT 1 FROM dispatch_legs WHERE dispatch_order_id = p_order_id AND leg_type = 'return') THEN
    RAISE EXCEPTION 'A return leg already exists for this dispatch order';
  END IF;

  v_leg_snap := jsonb_build_object(
    'pickup', jsonb_build_object(
      'name', p_pickup_name,
      'address', p_pickup_address,
      'city', p_pickup_city,
      'state', p_pickup_state,
      'zip', p_pickup_zip,
      'contact', p_pickup_contact,
      'scheduled_at', p_scheduled_pickup
    ),
    'delivery', jsonb_build_object(
      'name', p_delivery_name,
      'address', p_delivery_address,
      'city', p_delivery_city,
      'state', p_delivery_state,
      'zip', p_delivery_zip,
      'contact', p_delivery_contact,
      'deadline', p_delivery_deadline
    ),
    'cargo', jsonb_build_object(
      'package_type', p_package_type,
      'description', p_package_description,
      'quantity', NULL,
      'weight_lbs', p_weight_lbs,
      'temperature_control', p_temperature_control
    ),
    'instructions', jsonb_build_object(
      'special_requirements', p_instructions,
      'shipper_instructions', NULL,
      'bid_message', NULL,
      'counter_message', NULL
    ),
    'scheduled_pickup', p_scheduled_pickup,
    'delivery_deadline', p_delivery_deadline
  );

  UPDATE dispatch_orders SET is_round_trip = true WHERE id = p_order_id;

  INSERT INTO dispatch_legs (dispatch_order_id, leg_type, leg_number, status, leg_snapshot)
  VALUES (p_order_id, 'return', 2, 'dispatched', v_leg_snap)
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.add_return_leg FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_return_leg TO authenticated;

CREATE OR REPLACE FUNCTION public.advance_dispatch_leg(
  p_leg_id uuid,
  p_action text
)
RETURNS dispatch_legs
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_leg dispatch_legs%ROWTYPE;
  v_order dispatch_orders%ROWTYPE;
  v_next_status text;
  v_now timestamptz;
BEGIN
  SELECT * INTO v_leg FROM dispatch_legs WHERE id = p_leg_id;

  IF v_leg.id IS NULL THEN
    RAISE EXCEPTION 'Dispatch leg not found';
  END IF;

  SELECT * INTO v_order FROM dispatch_orders WHERE id = v_leg.dispatch_order_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Parent dispatch order not found';
  END IF;

  IF v_order.driver_id <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to advance this leg';
  END IF;

  v_next_status := CASE p_action
    WHEN 'accept' THEN 'accepted'
    WHEN 'proceed' THEN 'proceeding_to_pickup'
    WHEN 'pickup' THEN 'picked_up'
    WHEN 'transit' THEN 'in_transit'
    WHEN 'deliver' THEN 'delivered'
    ELSE NULL
  END;

  IF v_next_status IS NULL THEN
    RAISE EXCEPTION 'Invalid action';
  END IF;

  IF p_action = 'accept' AND v_leg.status <> 'dispatched' THEN
    RAISE EXCEPTION 'Leg must be dispatched to accept';
  ELSIF p_action = 'proceed' AND v_leg.status <> 'accepted' THEN
    RAISE EXCEPTION 'Leg must be accepted before proceeding to pickup';
  ELSIF p_action = 'pickup' AND v_leg.status <> 'proceeding_to_pickup' THEN
    RAISE EXCEPTION 'Leg must be proceeding to pickup before picking up';
  ELSIF p_action = 'transit' AND v_leg.status <> 'picked_up' THEN
    RAISE EXCEPTION 'Leg must be picked up before starting transit';
  ELSIF p_action = 'deliver' AND v_leg.status <> 'in_transit' THEN
    RAISE EXCEPTION 'Leg must be in transit before delivering';
  END IF;

  v_now := now();

  UPDATE dispatch_legs
  SET status = v_next_status,
      driver_accepted_at = CASE WHEN p_action = 'accept' THEN v_now ELSE driver_accepted_at END,
      proceeding_to_pickup_at = CASE WHEN p_action = 'proceed' THEN v_now ELSE proceeding_to_pickup_at END,
      picked_up_at = CASE WHEN p_action = 'pickup' THEN v_now ELSE picked_up_at END,
      in_transit_at = CASE WHEN p_action = 'transit' THEN v_now ELSE in_transit_at END,
      delivered_at = CASE WHEN p_action = 'deliver' THEN v_now ELSE delivered_at END
  WHERE id = p_leg_id
  RETURNING * INTO v_leg;

  UPDATE dispatch_orders
  SET status = (
    SELECT COALESCE(
      (SELECT status FROM dispatch_legs WHERE dispatch_order_id = v_order.id AND leg_type = 'return' AND status NOT IN ('delivered', 'cancelled') ORDER BY leg_number DESC LIMIT 1),
      (SELECT status FROM dispatch_legs WHERE dispatch_order_id = v_order.id AND leg_type = 'outbound' AND status NOT IN ('delivered', 'cancelled') ORDER BY leg_number DESC LIMIT 1),
      (SELECT status FROM dispatch_legs WHERE dispatch_order_id = v_order.id ORDER BY leg_number DESC LIMIT 1)
    )
  )
  WHERE id = v_order.id;

  RETURN v_leg;
END;
$$;

REVOKE ALL ON FUNCTION public.advance_dispatch_leg FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_dispatch_leg TO authenticated;
