/*
# Zhuri Transcare V2 — Part 1: Admin Users, App Settings, Profiles

Creates admin_users first (needed for profiles RLS), then app_settings, then profiles.
*/

-- ─── ADMIN USERS (must exist before profiles RLS) ──────────
CREATE TABLE IF NOT EXISTS admin_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email text UNIQUE NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_users_select" ON admin_users;
CREATE POLICY "admin_users_select" ON admin_users FOR SELECT
  TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM admin_users au1 WHERE au1.id = auth.uid()));

DROP POLICY IF EXISTS "admin_users_insert" ON admin_users;
CREATE POLICY "admin_users_insert" ON admin_users FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users au1 WHERE au1.id = auth.uid() AND au1.role = 'super_admin'));

DROP POLICY IF EXISTS "admin_users_update" ON admin_users;
CREATE POLICY "admin_users_update" ON admin_users FOR UPDATE
  TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM admin_users au1 WHERE au1.id = auth.uid() AND au1.role = 'super_admin'));

-- ─── APP SETTINGS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text UNIQUE NOT NULL,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "settings_select" ON app_settings;
CREATE POLICY "settings_select" ON app_settings FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "settings_update" ON app_settings;
CREATE POLICY "settings_update" ON app_settings FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "settings_insert" ON app_settings;
CREATE POLICY "settings_insert" ON app_settings FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

INSERT INTO app_settings (key, value, description) VALUES
  ('commission_rate', '0.10', 'Platform commission rate (10%)'),
  ('base_price_per_mile', '2.50', 'Base price per mile for standard deliveries'),
  ('priority_multiplier_urgent', '1.5', 'Price multiplier for urgent priority'),
  ('priority_multiplier_stat', '2.0', 'Price multiplier for STAT priority'),
  ('priority_multiplier_critical', '3.0', 'Price multiplier for critical priority'),
  ('platform_name', 'Zhuri Transcare', 'Platform display name'),
  ('support_email', 'support@zhuritranscare.com', 'Support email address'),
  ('support_phone', '+18005550100', 'Support phone number'),
  ('notification_channels', 'email,sms,whatsapp', 'Enabled notification channels')
ON CONFLICT (key) DO NOTHING;

-- ─── PROFILES ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  business_name text,
  business_address text,
  roles text[] NOT NULL DEFAULT '{shipper}',
  vehicle_type text,
  vehicle_plate text,
  certification text DEFAULT 'HIPAA Certified',
  service_area text,
  latitude numeric,
  longitude numeric,
  is_active boolean NOT NULL DEFAULT true,
  rating numeric NOT NULL DEFAULT 5.0,
  total_deliveries integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.id = auth.uid()));

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- ─── AUTO-CREATE PROFILE ON SIGNUP ─────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', 'New User'), COALESCE(NEW.raw_user_meta_data->>'phone', ''))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE INDEX IF NOT EXISTS idx_profiles_roles ON profiles USING GIN(roles);