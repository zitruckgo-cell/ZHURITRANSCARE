/*
# Stripe Connect Integration for Driver Payouts

1. New Columns on `profiles`
   - `stripe_account_id` (text) — Stripe Connect account ID for the driver
   - `stripe_account_status` (text) — Current account status: not_set_up, pending, active, restricted
   - `stripe_onboarding_complete` (boolean) — Whether Stripe onboarding has been completed
   - `stripe_charges_enabled` (boolean) — Whether the account can accept charges
   - `stripe_payouts_enabled` (boolean) — Whether the account can receive payouts
   - `stripe_requirements_status` (text) — Stripe's requirements status: pending, verified, restricted
   - `stripe_payout_schedule` (text) — Payout schedule preference: automatic, manual, instant

2. New Table: `payouts`
   - Records each payout/transfer made to a driver's Stripe Connect account
   - `id` (uuid, primary key)
   - `driver_id` (uuid, references profiles)
   - `payment_id` (uuid, references payments, nullable — for manual payouts)
   - `amount` (numeric, the payout amount)
   - `status` (text: pending, paid, failed, cancelled)
   - `stripe_transfer_id` (text, Stripe transfer ID)
   - `stripe_payout_id` (text, Stripe payout ID, nullable)
   - `type` (text: automatic, manual, instant)
   - `scheduled_at` (timestamptz, when the payout was scheduled)
   - `paid_at` (timestamptz, when the payout was completed)
   - `created_at` (timestamptz)

3. New Table: `stripe_webhook_events`
   - Idempotency table to prevent duplicate webhook processing
   - `id` (text, primary key — the Stripe event ID)
   - `event_type` (text)
   - `processed_at` (timestamptz)
   - `created_at` (timestamptz)

4. Security
   - RLS enabled on `payouts` — drivers can see their own payouts, admins can see all
   - RLS enabled on `stripe_webhook_events` — only service role can write
   - Column privileges on profiles: drivers can read their own Stripe fields but cannot write them directly
     (all Stripe account updates must come through the edge function using the service role key)
*/ 

-- Add Stripe Connect columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_account_id text,
  ADD COLUMN IF NOT EXISTS stripe_account_status text DEFAULT 'not_set_up',
  ADD COLUMN IF NOT EXISTS stripe_onboarding_complete boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_charges_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_payouts_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS stripe_requirements_status text DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS stripe_payout_schedule text DEFAULT 'automatic';

-- Create payouts table
CREATE TABLE IF NOT EXISTS public.payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payment_id uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  amount numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  stripe_transfer_id text,
  stripe_payout_id text,
  type text NOT NULL DEFAULT 'automatic',
  scheduled_at timestamptz DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drivers_select_own_payouts" ON public.payouts;
CREATE POLICY "drivers_select_own_payouts" ON public.payouts
  FOR SELECT TO authenticated USING (auth.uid() = driver_id);

DROP POLICY IF EXISTS "drivers_insert_own_payouts" ON public.payouts;
CREATE POLICY "drivers_insert_own_payouts" ON public.payouts
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = driver_id);

-- Create stripe_webhook_events table for idempotency
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  id text PRIMARY KEY,
  event_type text NOT NULL,
  processed_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;

-- Only service role can access webhook events (no policies = deny all for anon/authenticated)

-- Add index for payout lookups by driver
CREATE INDEX IF NOT EXISTS idx_payouts_driver_id ON public.payouts(driver_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON public.payouts(status);
CREATE INDEX IF NOT EXISTS idx_payouts_payment_id ON public.payouts(payment_id);

-- Revoke direct write access to Stripe Connect fields on profiles
-- Drivers should not be able to set their own stripe_account_id or status
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (
  full_name, phone, business_name, business_address, address, city, state, zip_code,
  vehicle_type, vehicle_plate, service_area, is_online,
  notif_email_enabled, notif_sms_enabled, notif_whatsapp_enabled,
  special_instructions, stripe_payout_schedule
) ON public.profiles TO authenticated;