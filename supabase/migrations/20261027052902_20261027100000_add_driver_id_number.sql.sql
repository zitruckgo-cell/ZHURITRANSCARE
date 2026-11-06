/*
# Add Driver ID Number to Profiles

1. New Columns
- `profiles.driver_id_number` (text, nullable) — a human-readable sequential
  identifier assigned to drivers only (e.g. "DR-001", "DR-002"). Non-driver
  profiles will have NULL.

2. Auto-assignment
- A trigger fires BEFORE INSERT or UPDATE on profiles when the 'driver' role
  is present and driver_id_number is still NULL. It assigns the next available
  number by finding the max existing number and incrementing.
- Existing drivers are backfilled with a CTE.

3. Security
- No new policies needed — profiles RLS already covers SELECT/UPDATE.
- driver_id_number is read-only for drivers (set only by the trigger/admin).
*/

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS driver_id_number text;

-- Backfill existing drivers with sequential IDs
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.profiles
  WHERE 'driver' = ANY(roles)
)
UPDATE public.profiles p
SET driver_id_number = 'DR-' || LPAD(ranked.rn::text, 3, '0')
FROM ranked
WHERE p.id = ranked.id
  AND p.driver_id_number IS NULL;

-- Function to auto-assign driver ID on insert/update
CREATE OR REPLACE FUNCTION public.assign_driver_id_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_max int;
  v_new_id text;
BEGIN
  IF 'driver' = ANY(NEW.roles) AND NEW.driver_id_number IS NULL THEN
    SELECT COALESCE(MAX(
      NULLIF(regexp_replace(driver_id_number, '[^0-9]', '', 'g'), '')::int
    ), 0) INTO v_max
    FROM public.profiles
    WHERE driver_id_number IS NOT NULL;

    v_new_id := 'DR-' || LPAD((v_max + 1)::text, 3, '0');

    NEW.driver_id_number := v_new_id;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_assign_driver_id_number ON public.profiles;
CREATE TRIGGER trg_assign_driver_id_number
  BEFORE INSERT OR UPDATE OF roles ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_driver_id_number();
