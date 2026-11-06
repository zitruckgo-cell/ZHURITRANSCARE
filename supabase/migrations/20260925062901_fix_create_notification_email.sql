-- Fix create_notification function: profiles table has no email column.
-- Email lives in auth.users, so join to get it.
CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id uuid,
  p_channel text DEFAULT 'email',
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_contact text;
  v_phone text;
  v_email text;
  v_notif_id uuid;
BEGIN
  SELECT phone INTO v_phone FROM public.profiles WHERE id = p_recipient_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_recipient_id;

  IF p_channel = 'email' THEN
    v_contact := v_email;
  ELSIF p_channel IN ('sms', 'whatsapp') THEN
    v_contact := v_phone;
  ELSE
    v_contact := v_email;
  END IF;

  INSERT INTO public.notifications (
    recipient_id, channel, recipient_contact,
    subject, body, status, related_type, related_id
  ) VALUES (
    p_recipient_id, p_channel, COALESCE(v_contact, ''),
    p_subject, p_body, 'sent', p_related_type, p_related_id
  ) RETURNING id INTO v_notif_id;

  RETURN v_notif_id;
END;
$function$;
