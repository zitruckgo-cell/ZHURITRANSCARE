-- Fix: restore EXECUTE on is_admin/is_super_admin for authenticated role.
-- These are SECURITY DEFINER functions used inside RLS policy predicates.
-- Revoking EXECUTE broke every query on tables whose policies call them
-- (profiles, admin_users, app_settings, deliveries, etc.) with
-- "permission denied for function is_admin/is_super_admin".
--
-- They are safe to grant EXECUTE to authenticated because:
--   - They are read-only (STABLE, SELECT EXISTS)
--   - They only return a boolean (no data leakage)
--   - They use auth.uid() so the result is specific to the caller
-- We keep EXECUTE revoked for anon (unauthenticated users should not
-- be able to probe who is an admin).

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;