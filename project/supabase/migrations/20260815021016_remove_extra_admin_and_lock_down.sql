-- Remove Nico (manmukama1@yahoo.com) as admin so only
-- zhuritranscare@gmail.com remains. Also strip 'admin' from
-- his profile roles so the router doesn't send him to the
-- admin panel.

-- Remove the admin_users row for the non-primary admin.
DELETE FROM public.admin_users
WHERE email = 'manmukama1@yahoo.com';

-- Strip 'admin' from his profile roles, keep shipper/driver.
UPDATE public.profiles
SET roles = ARRAY(
  SELECT r FROM unnest(roles) AS r WHERE r NOT IN ('admin')
)
WHERE id = '8baeef89-eb9f-4e59-b385-0009db9e66d5'
  AND roles @> ARRAY['admin']::text[];

-- Revoke anon access to admin_users — only authenticated users
-- should ever touch this table, and even then only via RLS.
REVOKE ALL ON public.admin_users FROM anon;

-- Re-grant only what authenticated needs (RLS still applies).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;
