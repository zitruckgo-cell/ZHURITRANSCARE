/*
# Add return stop type to delivery_stops

## Purpose
Extends the stop_type CHECK constraint to include 'return', enabling return-trip stops
(e.g. bring something back to the origin or a different location after final delivery).

## Changes
- Drops and recreates the CHECK constraint on delivery_stops.stop_type to allow:
  'pickup', 'intermediate', 'delivery', 'return'
- No data is lost — only the constraint is widened.
*/

ALTER TABLE delivery_stops DROP CONSTRAINT IF EXISTS delivery_stops_stop_type_check;

ALTER TABLE delivery_stops ADD CONSTRAINT delivery_stops_stop_type_check
  CHECK (stop_type IN ('pickup','intermediate','delivery','return'));