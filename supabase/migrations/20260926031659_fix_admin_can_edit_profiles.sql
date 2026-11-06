/*
# Fix: Admin can edit driver profiles

## Problem
When an admin tried to edit a driver's profile (name, phone, vehicle, approval
status, active toggle, etc.), the database rejected it with
"Permission denied for table profiles".

Two root causes:
1. The UPDATE policy on `profiles` only allows `auth.uid() = id` — there is no
   admin exception, so an admin editing someone else's row is blocked.
2. The column-level UPDATE grant on `profiles` does not include `is_active` or
   `approval_status`, so even with a policy fix, updating those columns would
   still be denied at the column-privilege level.

## Changes

### 1. Column-level grant (additive)
Grant UPDATE on `is_active` and `approval_status` to the `authenticated` role.
These are the two columns the admin Drivers page edits that were missing from
the existing column grant. The existing per-column grants are additive in
PostgreSQL, so this GRANT simply extends the updatable set — it does not
narrow any existing privileges.

### 2. New UPDATE policy for admins
Add `profiles_update_admin` — allows any user who is an admin (via the
existing `is_admin()` SECURITY DEFINER helper) to UPDATE any profile row.
The existing `profiles_update_own` policy is kept unchanged so users can
still edit their own profile.

RLS policies are OR-combined per command, so a row passes UPDATE if EITHER
policy matches — own-row users still self-edit, and admins can edit anyone.

### 3. Idempotency
Both the GRANT and the policy use `IF EXISTS` / drop-first patterns so the
migration is safe to re-run.
*/

-- 1. Add the two missing columns to the updatable set (additive grant)
GRANT UPDATE (is_active, approval_status) ON profiles TO authenticated;

-- 2. Add an admin UPDATE policy (drop-first for idempotency)
DROP POLICY IF EXISTS profiles_update_admin ON profiles;

CREATE POLICY profiles_update_admin
  ON profiles FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());
