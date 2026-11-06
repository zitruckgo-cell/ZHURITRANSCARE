/*
# Shipper Load Board view

1. Purpose
- Expose deliveries with status = 'posted' to all authenticated shippers,
  so they can see a marketplace-style "load board" of available loads.
- The existing deliveries SELECT policy only lets shippers see their own rows.
  This view bypasses that by running with the view owner's privileges
  (security_invoker = false, the default) so RLS on deliveries does not apply
  to the view query.

2. New View
- `public_load_board` — read-only view over `deliveries`
  Columns exposed: id, pickup_city, pickup_state, delivery_city, delivery_state,
    package_type, temperature_control, weight_lbs, distance_miles, priority,
    max_bid_amount, calculated_price, offered_rate, is_urgent, pickup_datetime,
    delivery_deadline, created_at, status
  Filters: status = 'posted'
  Only non-sensitive columns are exposed — no shipper_id, no contact info,
  no full addresses, no document URLs.

3. Security
- The view uses the default security_invoker=false, so it runs as the view
  owner (postgres) and bypasses deliveries RLS. This is intentional: the
  load board is meant to show ALL posted loads to all shippers.
- Only non-sensitive columns are exposed.
- Granted SELECT to authenticated role only.
- Views are read-only by default, so no INSERT/UPDATE/DELETE is possible.

4. Notes
- This is a read-only marketplace view. Shippers cannot modify any data through it.
*/

CREATE OR REPLACE VIEW public_load_board AS
SELECT
  d.id,
  d.pickup_city,
  d.pickup_state,
  d.delivery_city,
  d.delivery_state,
  d.package_type,
  d.temperature_control,
  d.weight_lbs,
  d.distance_miles,
  d.priority,
  d.max_bid_amount,
  d.calculated_price,
  d.offered_rate,
  d.is_urgent,
  d.pickup_datetime,
  d.delivery_deadline,
  d.created_at,
  d.status
FROM deliveries d
WHERE d.status = 'posted';

GRANT SELECT ON public_load_board TO authenticated;
