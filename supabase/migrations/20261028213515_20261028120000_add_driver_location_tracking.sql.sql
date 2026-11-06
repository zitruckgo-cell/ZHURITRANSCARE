/*
# Add location_updated_at to profiles for GPS tracking freshness

1. Changes
- Adds `location_updated_at` (timestamptz, nullable) to `profiles` so admin/shipper
  tracking pages can show how recent a driver's last GPS ping was.
- `latitude` and `longitude` columns already exist on profiles.

2. Security
- No new RLS policies needed — existing profiles UPDATE policies already cover
  self-updates by authenticated users. Drivers update their own row;
  admins/shippers read via existing SELECT policies.
*/

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS location_updated_at timestamptz;
