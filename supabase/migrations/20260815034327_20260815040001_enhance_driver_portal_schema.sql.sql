/*
# Enhance Driver Portal Schema

1. New Tables
- `driver_ratings` — per-delivery ratings left by shippers for drivers
  - id (uuid, PK)
  - delivery_id (uuid, FK to deliveries)
  - driver_id (uuid, FK to profiles)
  - rater_id (uuid, FK to profiles — the shipper who rated)
  - rating (int, 1-5)
  - comment (text, nullable)
  - on_time (boolean, default true)
  - created_at (timestamptz)

2. Modified Tables
- `profiles` — add driver-specific columns:
  - `is_online` (boolean, default false) — driver online/offline toggle
  - `on_time_rate` (numeric, default 100) — percentage of on-time deliveries
  - `cancellation_rate` (numeric, default 0) — percentage of cancelled deliveries
  - `total_ratings` (int, default 0) — total number of ratings received
- `deliveries` — add proof-of-delivery columns:
  - `pod_photo_url` (text, nullable) — delivery photo URL
  - `pod_signature_url` (text, nullable) — recipient signature image URL
  - `pod_notes` (text, nullable) — delivery notes from driver
  - `pod_submitted_at` (timestamptz, nullable) — when proof of delivery was submitted
  - `pod_location` (text, nullable) — GPS location at delivery time

3. Security
- Enable RLS on `driver_ratings`.
- Policies: authenticated users can SELECT all ratings; authenticated users can INSERT ratings where rater_id = auth.uid(); drivers can update their own profile's is_online/on_time_rate/cancellation_rate/total_ratings.
- Update profiles UPDATE policy to allow drivers to toggle is_online.
*/

-- Add driver-specific columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_online boolean NOT NULL DEFAULT false;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS on_time_rate numeric NOT NULL DEFAULT 100;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cancellation_rate numeric NOT NULL DEFAULT 0;
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS total_ratings int NOT NULL DEFAULT 0;

-- Add proof-of-delivery columns to deliveries
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS pod_photo_url text;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS pod_signature_url text;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS pod_notes text;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS pod_submitted_at timestamptz;
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS pod_location text;

-- Create driver_ratings table
CREATE TABLE IF NOT EXISTS driver_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rater_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating int NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment text,
  on_time boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE driver_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ratings_select_all" ON driver_ratings;
CREATE POLICY "ratings_select_all" ON driver_ratings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ratings_insert_own" ON driver_ratings;
CREATE POLICY "ratings_insert_own" ON driver_ratings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = rater_id);

DROP POLICY IF EXISTS "ratings_delete_own" ON driver_ratings;
CREATE POLICY "ratings_delete_own" ON driver_ratings FOR DELETE
  TO authenticated USING (auth.uid() = rater_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_driver_ratings_driver ON driver_ratings(driver_id);
CREATE INDEX IF NOT EXISTS idx_driver_ratings_delivery ON driver_ratings(delivery_id);
