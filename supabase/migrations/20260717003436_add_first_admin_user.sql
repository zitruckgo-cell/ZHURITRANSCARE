-- Insert the first admin user (zhuritranscare@gmail.com)
-- User ID: 183c5857-3e4f-4bed-bdb1-97ef1f16ec4f
INSERT INTO public.admin_users (id, full_name, email, role, is_active)
VALUES ('183c5857-3e4f-4bed-bdb1-97ef1f16ec4f', 'Mukama Mbogo', 'zhuritranscare@gmail.com', 'super_admin', true)
ON CONFLICT (id) DO NOTHING;
