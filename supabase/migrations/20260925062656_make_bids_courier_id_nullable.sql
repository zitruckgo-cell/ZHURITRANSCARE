-- Make courier_id nullable on bids table — it's a legacy column
-- replaced by driver_id. Code inserts null for courier_id when a driver bids.
ALTER TABLE bids ALTER COLUMN courier_id DROP NOT NULL;
