-- Add column to track whether a payment used a destination charge
-- (funds routed directly to driver's connected account) or a standard charge
ALTER TABLE payments ADD COLUMN IF NOT EXISTS stripe_destination_charge boolean DEFAULT false;
