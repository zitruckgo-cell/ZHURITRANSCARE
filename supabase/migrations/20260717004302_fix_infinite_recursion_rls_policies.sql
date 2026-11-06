-- Fix infinite recursion in admin_users RLS policies.
-- The admin_users SELECT policy referenced itself (EXISTS SELECT FROM admin_users
-- inside a policy ON admin_users), causing infinite recursion.
-- 
-- Fix: The SELECT policy should simply check auth.uid() = id (user can read
-- their own admin row). Admins can read all rows via a separate policy
-- that uses a SECURITY DEFINER function instead of a recursive subquery.

-- Helper function: is the current user a super_admin?
-- Uses SECURITY DEFINER to bypass RLS and avoid recursion.
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid() AND role = 'super_admin' AND is_active = true
  );
$$;

-- Helper function: is the current user any kind of admin?
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE id = auth.uid() AND is_active = true
  );
$$;

-- Drop the recursive policies on admin_users
DROP POLICY IF EXISTS "admin_users_select" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_insert" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_update" ON public.admin_users;
DROP POLICY IF EXISTS "admin_users_delete" ON public.admin_users;

-- Recreate admin_users policies using the helper functions (no recursion)
CREATE POLICY "admin_users_select_own" ON public.admin_users
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "admin_users_select_admin" ON public.admin_users
  FOR SELECT TO authenticated
  USING (public.is_super_admin());

CREATE POLICY "admin_users_insert_super" ON public.admin_users
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_users_update_own" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "admin_users_update_super" ON public.admin_users
  FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "admin_users_delete_super" ON public.admin_users
  FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Fix the profiles SELECT policy that referenced admin_users (causing recursion
-- when combined with the recursive admin_users policy).
-- Replace the EXISTS subquery with the is_admin() helper function.
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.is_admin());
