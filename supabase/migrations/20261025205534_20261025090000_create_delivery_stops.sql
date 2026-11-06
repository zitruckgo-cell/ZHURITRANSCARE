/*
# Create delivery_stops table for multiple intermediate stops

## Purpose
Allows a delivery to have multiple intermediate stops between the origin pickup
and the final delivery destination. Each stop has its own address, contact,
scheduled time, and status — enabling multi-stop route planning.

## New Table: delivery_stops
- `id` (uuid, PK)
- `delivery_id` (uuid, FK → deliveries, ON DELETE CASCADE)
- `stop_number` (int, NOT NULL) — 1-based order of the stop in the route.
  Stop 1 = origin pickup, last stop = final delivery, intermediate = waypoints.
- `stop_type` (text, NOT NULL, CHECK in 'pickup','intermediate','delivery')
- `name` (text, NOT NULL) — contact name or facility name at this stop
- `address` (text, NOT NULL)
- `city` (text, NOT NULL)
- `state` (text, NOT NULL)
- `zip` (text, NOT NULL)
- `contact` (text, NOT NULL)
- `scheduled_at` (timestamptz, nullable) — planned arrival time
- `status` (text, NOT NULL, default 'pending') — pending/arrived/completed
- `arrived_at` (timestamptz, nullable)
- `completed_at` (timestamptz, nullable)
- `notes` (text, nullable)
- `created_at` (timestamptz, default now())

## Constraints
- UNIQUE (delivery_id, stop_number) — prevents duplicate stop numbers per delivery

## Indexes
- idx_delivery_stops_delivery_id (delivery_id) — fast lookups by delivery
- idx_delivery_stops_delivery_stop (delivery_id, stop_number) — ordered route retrieval

## Security
- RLS enabled on delivery_stops
- Grants: SELECT, INSERT, UPDATE, DELETE to authenticated
- Policies mirror deliveries: shipper_id or driver_id on the parent delivery,
  or admin via admin_users table. SELECT also allows authenticated to read
  any stop (same as deliveries which allows shipper/driver/admin select).
  INSERT/UPDATE/DELETE scoped to the parent delivery's shipper, driver, or admin.
- service_role granted all for edge function access.
*/