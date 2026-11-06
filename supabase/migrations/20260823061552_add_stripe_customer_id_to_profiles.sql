ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id text;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS stripe_transfer_id text;