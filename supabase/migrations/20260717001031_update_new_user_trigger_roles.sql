-- Update trigger to use roles from user metadata if provided

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_roles text[];
BEGIN
  user_roles := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'roles')),
    ARRAY['shipper']::text[]
  );
  INSERT INTO public.profiles (id, full_name, phone, roles)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    user_roles
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
