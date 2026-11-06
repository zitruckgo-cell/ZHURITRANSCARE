-- Add notification preference columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notif_email_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notif_sms_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS notif_whatsapp_enabled boolean DEFAULT false;

-- Helper function to create an in-app notification record
CREATE OR REPLACE FUNCTION public.create_notification(
  p_recipient_id uuid,
  p_channel text DEFAULT 'email',
  p_subject text DEFAULT NULL,
  p_body text DEFAULT NULL,
  p_related_type text DEFAULT NULL,
  p_related_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_contact text;
  v_profile public.profiles;
  v_notif_id uuid;
BEGIN
  SELECT * INTO v_profile FROM public.profiles WHERE id = p_recipient_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Determine contact based on channel
  IF p_channel = 'email' THEN
    v_contact := v_profile.email;
  ELSIF p_channel IN ('sms', 'whatsapp') THEN
    v_contact := v_profile.phone;
  ELSE
    v_contact := v_profile.email;
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
$$;

-- Auto-create notifications when key delivery events happen
-- 1. When a delivery is assigned to a driver → notify the driver
CREATE OR REPLACE FUNCTION public.notify_driver_on_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL AND (OLD.driver_id IS NULL OR OLD.driver_id <> NEW.driver_id) THEN
    PERFORM public.create_notification(
      NEW.driver_id, 'email',
      'New Delivery Assigned',
      'You have been assigned to deliver: ' || NEW.pickup_name || ' → ' || NEW.delivery_name,
      'delivery', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_driver_assignment ON public.deliveries;
CREATE TRIGGER trg_notify_driver_assignment
  AFTER INSERT OR UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.notify_driver_on_assignment();

-- 2. When a delivery status changes → notify the shipper
CREATE OR REPLACE FUNCTION public.notify_shipper_on_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status <> OLD.status THEN
    PERFORM public.create_notification(
      NEW.shipper_id, 'email',
      'Delivery Status Updated',
      'Your delivery ' || NEW.pickup_name || ' → ' || NEW.delivery_name || ' is now: ' || REPLACE(NEW.status, '_', ' '),
      'delivery', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shipper_status ON public.deliveries;
CREATE TRIGGER trg_notify_shipper_status
  AFTER UPDATE ON public.deliveries
  FOR EACH ROW EXECUTE FUNCTION public.notify_shipper_on_status_change();

-- 3. When a bid is placed → notify the shipper
CREATE OR REPLACE FUNCTION public.notify_shipper_on_bid()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shipper_id uuid;
BEGIN
  SELECT shipper_id INTO v_shipper_id FROM public.deliveries WHERE id = NEW.delivery_id;
  IF FOUND THEN
    PERFORM public.create_notification(
      v_shipper_id, 'email',
      'New Bid Received',
      'A driver has placed a bid of $' || NEW.amount || ' on your delivery.',
      'bid', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shipper_bid ON public.bids;
CREATE TRIGGER trg_notify_shipper_bid
  AFTER INSERT ON public.bids
  FOR EACH ROW EXECUTE FUNCTION public.notify_shipper_on_bid();

-- 4. When a payment is created → notify the shipper
CREATE OR REPLACE FUNCTION public.notify_shipper_on_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  PERFORM public.create_notification(
    NEW.shipper_id, 'email',
    'Payment Required',
    'A payment of $' || NEW.gross_amount || ' has been generated for your delivery.',
    'payment', NEW.id
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_shipper_payment ON public.payments;
CREATE TRIGGER trg_notify_shipper_payment
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_shipper_on_payment();

-- 5. When a payment status changes to released → notify the driver
CREATE OR REPLACE FUNCTION public.notify_driver_on_payout()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.status = 'released' AND (OLD.status IS NULL OR OLD.status <> 'released') THEN
    PERFORM public.create_notification(
      NEW.driver_id, 'email',
      'Payment Released',
      'Your payout of $' || NEW.driver_payout || ' has been released.',
      'payment', NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_driver_payout ON public.payments;
CREATE TRIGGER trg_notify_driver_payout
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.notify_driver_on_payout();
