/*
# Zhuri Transcare V2 — Part 2: Payments, Notifications, Support, Delivery Updates

## New Tables
1. payments — transaction records with 10% commission / 90% driver split
2. notifications — log of email/SMS/WhatsApp notifications
3. support_tickets — customer support tickets
4. support_messages — messages within support tickets

## Modified Tables
1. deliveries — added shipper_id, driver_id, assigned_at, distance_miles,
   calculated_price, auto_assigned columns
2. RLS policies switched from anon to authenticated on all existing tables

## Security
- payments: shipper/driver see own payments, admins see all
- notifications: users see own, admins see all, anyone can insert
- support_tickets: users CRUD own tickets, admins see all
- support_messages: participants in ticket can read, sender can insert
*/

-- ─── ADD COLUMNS TO DELIVERIES ─────────────────────────────
ALTER TABLE deliveries
  ADD COLUMN IF NOT EXISTS shipper_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS distance_miles numeric,
  ADD COLUMN IF NOT EXISTS calculated_price numeric,
  ADD COLUMN IF NOT EXISTS auto_assigned boolean NOT NULL DEFAULT false;

-- Switch deliveries RLS from anon to authenticated
DROP POLICY IF EXISTS "anon_select_deliveries" ON deliveries;
DROP POLICY IF EXISTS "anon_insert_deliveries" ON deliveries;
DROP POLICY IF EXISTS "anon_update_deliveries" ON deliveries;
DROP POLICY IF EXISTS "anon_delete_deliveries" ON deliveries;

CREATE POLICY "authed_select_deliveries" ON deliveries FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authed_insert_deliveries" ON deliveries FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authed_update_deliveries" ON deliveries FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authed_delete_deliveries" ON deliveries FOR DELETE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- Switch bids RLS from anon to authenticated
DROP POLICY IF EXISTS "anon_select_bids" ON bids;
DROP POLICY IF EXISTS "anon_insert_bids" ON bids;
DROP POLICY IF EXISTS "anon_update_bids" ON bids;
DROP POLICY IF EXISTS "anon_delete_bids" ON bids;

CREATE POLICY "authed_select_bids" ON bids FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authed_insert_bids" ON bids FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authed_update_bids" ON bids FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "authed_delete_bids" ON bids FOR DELETE
  TO authenticated USING (true);

-- Switch tracking_events RLS from anon to authenticated
DROP POLICY IF EXISTS "anon_select_tracking" ON tracking_events;
DROP POLICY IF EXISTS "anon_insert_tracking" ON tracking_events;
DROP POLICY IF EXISTS "anon_update_tracking" ON tracking_events;

CREATE POLICY "authed_select_tracking" ON tracking_events FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authed_insert_tracking" ON tracking_events FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authed_update_tracking" ON tracking_events FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Switch couriers RLS from anon to authenticated
DROP POLICY IF EXISTS "anon_select_couriers" ON couriers;
DROP POLICY IF EXISTS "anon_insert_couriers" ON couriers;
DROP POLICY IF EXISTS "anon_update_couriers" ON couriers;

CREATE POLICY "authed_select_couriers" ON couriers FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authed_insert_couriers" ON couriers FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authed_update_couriers" ON couriers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- Switch pharmacies RLS from anon to authenticated
DROP POLICY IF EXISTS "anon_select_pharmacies" ON pharmacies;
DROP POLICY IF EXISTS "anon_insert_pharmacies" ON pharmacies;
DROP POLICY IF EXISTS "anon_update_pharmacies" ON pharmacies;

CREATE POLICY "authed_select_pharmacies" ON pharmacies FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "authed_insert_pharmacies" ON pharmacies FOR INSERT
  TO authenticated WITH CHECK (true);
CREATE POLICY "authed_update_pharmacies" ON pharmacies FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

-- ─── PAYMENTS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id uuid NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
  shipper_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  gross_amount numeric NOT NULL,
  commission_rate numeric NOT NULL DEFAULT 0.10,
  commission_amount numeric NOT NULL,
  driver_payout numeric NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  stripe_payment_intent_id text,
  stripe_transfer_id text,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_own" ON payments;
CREATE POLICY "payments_select_own" ON payments FOR SELECT
  TO authenticated USING (
    auth.uid() = shipper_id OR
    auth.uid() = driver_id OR
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

DROP POLICY IF EXISTS "payments_insert_own" ON payments;
CREATE POLICY "payments_insert_own" ON payments FOR INSERT
  TO authenticated WITH CHECK (
    auth.uid() = shipper_id OR
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

DROP POLICY IF EXISTS "payments_update_own" ON payments;
CREATE POLICY "payments_update_own" ON payments FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- ─── NOTIFICATIONS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp')),
  recipient_contact text NOT NULL,
  subject text,
  body text NOT NULL,
  related_type text,
  related_id uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
  TO authenticated USING (
    auth.uid() = recipient_id OR
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

DROP POLICY IF EXISTS "notifications_insert_own" ON notifications;
CREATE POLICY "notifications_insert_own" ON notifications FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

-- ─── SUPPORT TICKETS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  description text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tickets_select_own" ON support_tickets;
CREATE POLICY "tickets_select_own" ON support_tickets FOR SELECT
  TO authenticated USING (
    auth.uid() = requester_id OR
    auth.uid() = assigned_to OR
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

DROP POLICY IF EXISTS "tickets_insert_own" ON support_tickets;
CREATE POLICY "tickets_insert_own" ON support_tickets FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "tickets_update_own" ON support_tickets;
CREATE POLICY "tickets_update_own" ON support_tickets FOR UPDATE
  TO authenticated USING (
    auth.uid() = requester_id OR
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())
  );

-- ─── SUPPORT MESSAGES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "messages_select_own" ON support_messages;
CREATE POLICY "messages_select_own" ON support_messages FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM support_tickets WHERE support_tickets.id = support_messages.ticket_id
      AND (support_tickets.requester_id = auth.uid()
           OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())))
  );

DROP POLICY IF EXISTS "messages_insert_own" ON support_messages;
CREATE POLICY "messages_insert_own" ON support_messages FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = sender_id);

-- ─── INDEXES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_deliveries_shipper_id ON deliveries(shipper_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_driver_id ON deliveries(driver_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
CREATE INDEX IF NOT EXISTS idx_payments_delivery_id ON payments(delivery_id);
CREATE INDEX IF NOT EXISTS idx_payments_shipper_id ON payments(shipper_id);
CREATE INDEX IF NOT EXISTS idx_payments_driver_id ON payments(driver_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_requester_id ON support_tickets(requester_id);