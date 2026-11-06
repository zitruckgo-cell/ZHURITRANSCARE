-- Add counter-bid support: shipper can counter a driver's bid with a different price,
-- and driver can accept or reject the counter.
ALTER TABLE bids ADD COLUMN IF NOT EXISTS counter_amount numeric;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS counter_status text DEFAULT NULL;
ALTER TABLE bids ADD COLUMN IF NOT EXISTS counter_message text DEFAULT NULL;
