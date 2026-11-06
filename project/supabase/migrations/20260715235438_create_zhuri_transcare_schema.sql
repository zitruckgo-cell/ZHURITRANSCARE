/*
# Zhuri Transcare - Initial Schema

## Overview
Creates the database schema for Zhuri Transcare, a dispatch marketplace platform
for urgent medical deliveries in the USA. The platform connects pharmacies, labs,
and medical facilities with certified medical couriers for time-critical deliveries
such as medications, lab specimens, medical equipment, and organs.

## New Tables

1. `couriers` - Medical courier profiles registered on the platform
   - id (uuid, PK)
   - name (text) - courier's full name
   - email (text, unique) - contact email
   - phone (text) - contact phone
   - vehicle_type (text) - car, van, motorcycle, etc.
   - certification (text) - HIPAA, medical courier cert, etc.
   - rating (numeric) - average rating from completed deliveries
   - total_deliveries (int) - count of completed deliveries
   - status (text) - available, busy, offline
   - service_area (text) - geographic service area
   - created_at (timestptz)

2. `pharmacies` - Medical facilities that request deliveries
   - id (uuid, PK)
   - name (text) - facility name
   - email (text) - contact email
   - phone (text) - contact phone
   - address (text) - street address
   - city (text)
   - state (text) - US state abbreviation
   - zip_code (text)
   - facility_type (text) - pharmacy, hospital, lab, clinic
   - created_at (timestptz)

3. `deliveries` - Delivery requests posted to the marketplace
   - id (uuid, PK)
   - pickup_name (text) - pickup facility name
   - pickup_address (text)
   - pickup_city (text)
   - pickup_state (text)
   - pickup_zip (text)
   - pickup_contact (text)
   - delivery_name (text) - recipient name/facility
   - delivery_address (text)
   - delivery_city (text)
   - delivery_state (text)
   - delivery_zip (text)
   - delivery_contact (text)
   - package_type (text) - medication, lab_specimen, equipment, organ, documents
   - package_description (text) - additional details
   - priority (text) - routine, urgent, critical, emergency
   - temperature_control (text) - none, refrigerated, frozen, ambient
   - weight_lbs (numeric) - package weight
   - max_bid_amount (numeric) - facility's max budget for delivery
   - status (text) - posted, assigned, picked_up, in_transit, delivered, cancelled
   - courier_id (uuid, FK to couriers) - assigned courier
   - accepted_bid (numeric) - the winning bid amount
   - pickup_time (timestamptz) - when courier picked up
   - delivered_time (timestamptz) - when delivered
   - created_at (timestamptz)

4. `bids` - Bids placed by couriers on posted deliveries
   - id (uuid, PK)
   - delivery_id (uuid, FK to deliveries)
   - courier_id (uuid, FK to couriers)
   - amount (numeric) - bid amount in USD
   - eta_minutes (int) - estimated time to pickup
   - message (text) - optional message from courier
   - status (text) - pending, accepted, rejected
   - created_at (timestamptz)

5. `tracking_events` - Status updates during delivery lifecycle
   - id (uuid, PK)
   - delivery_id (uuid, FK to deliveries)
   - status (text) - event status
   - location (text) - current location description
   - notes (text) - additional notes
   - created_at (timestamptz)

## Security
- All tables have RLS enabled.
- All policies use TO anon, authenticated (no-auth marketplace app).
- All CRUD operations are open to anon + authenticated since this is a public marketplace demo.
*/

-- Couriers table
CREATE TABLE IF NOT EXISTS couriers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text UNIQUE NOT NULL,
  phone text NOT NULL,
  vehicle_type text NOT NULL DEFAULT 'car',
  certification text NOT NULL DEFAULT 'HIPAA Certified',
  rating numeric DEFAULT 5.0,
  total_deliveries int DEFAULT 0,
  status text NOT NULL DEFAULT 'available',
  service_area text NOT NULL DEFAULT 'Nationwide',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE couriers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_couriers" ON couriers;
CREATE POLICY "anon_select_couriers" ON couriers FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_couriers" ON couriers;
CREATE POLICY "anon_insert_couriers" ON couriers FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_couriers" ON couriers;
CREATE POLICY "anon_update_couriers" ON couriers FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_couriers" ON couriers;
CREATE POLICY "anon_delete_couriers" ON couriers FOR DELETE
  TO anon, authenticated USING (true);

-- Pharmacies table
CREATE TABLE IF NOT EXISTS pharmacies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  address text NOT NULL,
  city text NOT NULL,
  state text NOT NULL,
  zip_code text NOT NULL,
  facility_type text NOT NULL DEFAULT 'pharmacy',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pharmacies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_pharmacies" ON pharmacies;
CREATE POLICY "anon_select_pharmacies" ON pharmacies FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_pharmacies" ON pharmacies;
CREATE POLICY "anon_insert_pharmacies" ON pharmacies FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_pharmacies" ON pharmacies;
CREATE POLICY "anon_update_pharmacies" ON pharmacies FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_pharmacies" ON pharmacies;
CREATE POLICY "anon_delete_pharmacies" ON pharmacies FOR DELETE
  TO anon, authenticated USING (true);

-- Deliveries table
CREATE TABLE IF NOT EXISTS deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pickup_name text NOT NULL,
  pickup_address text NOT NULL,
  pickup_city text NOT NULL,
  pickup_state text NOT NULL,
  pickup_zip text NOT NULL,
  pickup_contact text NOT NULL,
  delivery_name text NOT NULL,
  delivery_address text NOT NULL,
  delivery_city text NOT NULL,
  delivery_state text NOT NULL,
  delivery_zip text NOT NULL,
  delivery_contact text NOT NULL,
  package_type text NOT NULL DEFAULT 'medication',
  package_description text,
  priority text NOT NULL DEFAULT 'routine',
  temperature_control text NOT NULL DEFAULT 'none',
  weight_lbs numeric DEFAULT 1.0,
  max_bid_amount numeric NOT NULL DEFAULT 50.00,
  status text NOT NULL DEFAULT 'posted',
  courier_id uuid REFERENCES couriers(id) ON DELETE SET NULL,
  accepted_bid numeric,
  pickup_time timestamptz,
  delivered_time timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_deliveries" ON deliveries;
CREATE POLICY "anon_select_deliveries" ON deliveries FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_deliveries" ON deliveries;
CREATE POLICY "anon_insert_deliveries" ON deliveries FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_deliveries" ON deliveries;
CREATE POLICY "anon_update_deliveries" ON deliveries FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_deliveries" ON deliveries;
CREATE POLICY "anon_delete_deliveries" ON deliveries FOR DELETE
  TO anon, authenticated USING (true);

-- Bids table
CREATE TABLE IF NOT EXISTS bids (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  courier_id uuid NOT NULL REFERENCES couriers(id) ON DELETE CASCADE,
  amount numeric NOT NULL,
  eta_minutes int NOT NULL DEFAULT 30,
  message text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bids ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_bids" ON bids;
CREATE POLICY "anon_select_bids" ON bids FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_bids" ON bids;
CREATE POLICY "anon_insert_bids" ON bids FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_bids" ON bids;
CREATE POLICY "anon_update_bids" ON bids FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_bids" ON bids;
CREATE POLICY "anon_delete_bids" ON bids FOR DELETE
  TO anon, authenticated USING (true);

-- Tracking events table
CREATE TABLE IF NOT EXISTS tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  status text NOT NULL,
  location text,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE tracking_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tracking" ON tracking_events;
CREATE POLICY "anon_select_tracking" ON tracking_events FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_tracking" ON tracking_events;
CREATE POLICY "anon_insert_tracking" ON tracking_events FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_tracking" ON tracking_events;
CREATE POLICY "anon_update_tracking" ON tracking_events FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_tracking" ON tracking_events;
CREATE POLICY "anon_delete_tracking" ON tracking_events FOR DELETE
  TO anon, authenticated USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_deliveries_courier_id ON deliveries(courier_id);
CREATE INDEX IF NOT EXISTS idx_bids_delivery_id ON bids(delivery_id);
CREATE INDEX IF NOT EXISTS idx_bids_courier_id ON bids(courier_id);
CREATE INDEX IF NOT EXISTS idx_tracking_delivery_id ON tracking_events(delivery_id);
CREATE INDEX IF NOT EXISTS idx_couriers_status ON couriers(status);
