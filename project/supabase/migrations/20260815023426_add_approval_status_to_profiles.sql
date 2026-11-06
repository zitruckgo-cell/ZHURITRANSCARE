/*
# Add approval_status to profiles

1. Changes
- Adds `approval_status` column to `profiles` table.
- Values: 'approved' (default), 'pending', 'rejected'.
- Allows admins to approve, reject, or set users as pending.
2. Security
- No RLS policy changes needed; existing policies cover the new column.
*/

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';

COMMENT ON COLUMN profiles.approval_status IS 'Approval state of the user: approved, pending, or rejected';
