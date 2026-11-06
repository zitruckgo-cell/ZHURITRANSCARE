ALTER TABLE public.deliveries
  ADD COLUMN IF NOT EXISTS shipper_instructions text;