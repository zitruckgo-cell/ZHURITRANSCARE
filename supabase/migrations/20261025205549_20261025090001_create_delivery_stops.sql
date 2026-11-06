/*
# Create delivery_stops table for multiple intermediate stops

## Purpose
Allows a delivery to have multiple intermediate stops between the origin pickup
and the final delivery destination. Each stop has its own address, contact,
scheduled time, and status — enabling multi-stop route planning.

## New Table: delivery_stops
- `id` (uuid, PK)
- `delivery_id` (uuid, FK → deliveries, ON DELETE CASCADE)
- `stop_number` (int, NOT NULL) — 1-based order. Stop 1 = pickup, last = delivery, middle = waypoints.
- `stop_type` (text, NOT NULL, CHECK in 'pickup','intermediate','delivery')
- `name`, `address`, `city`, `state`, `zip`, `contact` (text, NOT NULL)
- `scheduled_at` (timestamptz, nullable)
- `status` (text, NOT NULL, default 'pending')
- `arrived_at`, `completed_at` (timestamptz, nullable)
- `notes` (text, nullable)
- `created_at` (timestamptz, default now())

## Security
- RLS enabled, grants to authenticated + service_role
- Policies: shipper/driver/admin of the parent delivery can CRUD
*/

CREATE TABLE IF NOT EXISTS delivery_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  stop_number int NOT NULL,
  stop_type text NOT NULL CHECK (stop_type IN ('pickup','intermediate','delivery')),
  name text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip text NOT NULL,
  contact text NOT NULL,
  scheduled_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  arrived_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (delivery_id, stop_number)
);

CREATE INDEX IF NOT EXISTS idx_delivery_stops_delivery_id ON delivery_stops(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_stops_delivery_stop ON delivery_stops(delivery_id, stop_number);

ALTER TABLE delivery_stops ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_stops TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON delivery_stops TO service_role;

DROP POLICY IF EXISTS "stops_select_own" ON delivery_stops;
CREATE POLICY "stops_select_own" ON delivery_stops FOR SELECT
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM deliveries d
      WHERE d.id = delivery_stops.delivery_id
      AND (
        d.shipper_id = auth.uid()
        OR d.driver_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users a WHERE a.id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "stops_insert_own" ON delivery_stops;
CREATE POLICY "stops_insert_own" ON delivery_stops FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM deliveries d
      WHERE d.id = delivery_stops.delivery_id
      AND (
        d.shipper_id = auth.uid()
        OR d.driver_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users a WHERE a.id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "stops_update_own" ON delivery_stops;
CREATE POLICY "stops_update_own" ON delivery_stops FOR UPDATE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM deliveries d
      WHERE d.id = delivery_stops.delivery_id
      AND (
        d.shipper_id = auth.uid()
        OR d.driver_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users a WHERE a.id = auth.uid())
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM deliveries d
      WHERE d.id = delivery_stops.delivery_id
      AND (
        d.shipper_id = auth.uid()
        OR d.driver_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users a WHERE a.id = auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "stops_delete_own" ON delivery_stops;
CREATE POLICY "stops_delete_own" ON delivery_stops FOR DELETE
  TO authenticated USING (
    EXISTS (
      SELECT 1 FROM deliveries d
      WHERE d.id = delivery_stops.delivery_id
      AND (
        d.shipper_id = auth.uid()
        OR d.driver_id = auth.uid()
        OR EXISTS (SELECT 1 FROM admin_users a WHERE a.id = auth.uid())
      )
    )
  );