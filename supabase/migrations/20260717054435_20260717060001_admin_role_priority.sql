-- Ensure admin users always get 'admin' role in profiles, never shipper/driver
-- Update the handle_new_user trigger to check if user is in admin_users table

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_roles text[];
  is_admin boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE id = NEW.id) INTO is_admin;
  
  IF is_admin THEN
    user_roles := ARRAY['admin']::text[];
  ELSE
    user_roles := COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.raw_user_meta_data->'roles')),
      ARRAY['shipper']::text[]
    );
  END IF;
  
  INSERT INTO public.profiles (id, full_name, phone, roles)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    user_roles
  )
  ON CONFLICT (id) DO UPDATE SET roles = EXCLUDED.roles;
  RETURN NEW;
END;
$$;

-- Fix any existing admin users whose profiles have wrong roles
UPDATE public.profiles p
SET roles = ARRAY['admin']::text[]
WHERE EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = p.id)
  AND NOT (p.roles @> ARRAY['admin']::text[]);
