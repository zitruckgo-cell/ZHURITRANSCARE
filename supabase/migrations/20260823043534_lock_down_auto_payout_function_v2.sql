-- Revoke direct execution of the auto_create_payout function from all non-internal roles.
-- It's a SECURITY DEFINER function meant to run from triggers, not from the REST API.
REVOKE EXECUTE ON FUNCTION public.auto_create_payout() FROM PUBLIC, anon, authenticated;