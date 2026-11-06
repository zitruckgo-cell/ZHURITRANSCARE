/*
# Stripe Payment Integration — Schema Updates

Adds columns to the payments table to support Stripe Checkout sessions,
payment intents, and refund tracking. Also adds a stripe_customer_id column
to profiles for re-use of Stripe customers across payments.
*/

-- Add Stripe columns to payments table
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS stripe_refund_id text,
  ADD COLUMN IF NOT EXISTS stripe_charge_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Add stripe_customer_id to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Expand payment status to include 'paid' and 'refunded' states
-- (existing statuses: pending, released, disputed)
-- We'll use 'paid' when Stripe payment succeeds, 'refunded' when refunded

-- Index for looking up payments by stripe session/PI
CREATE INDEX IF NOT EXISTS idx_payments_stripe_session ON payments(stripe_checkout_session_id) WHERE stripe_checkout_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_stripe_pi ON payments(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;
