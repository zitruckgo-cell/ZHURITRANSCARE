import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Check .env file.');
}

export const supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

export type Profile = {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  roles: string[];
  business_name: string | null;
  business_address: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  service_area: string | null;
  is_active: boolean;
  is_online: boolean;
  on_time_rate: number | string;
  cancellation_rate: number | string;
  total_ratings: number | string;
  approval_status: 'approved' | 'pending' | 'rejected';
  rating: number | string;
  total_deliveries: number | string;
  notif_email_enabled: boolean;
  notif_sms_enabled: boolean;
  notif_whatsapp_enabled: boolean;
  special_instructions: string;
  stripe_customer_id: string | null;
  stripe_default_payment_method: string | null;
  stripe_account_id: string | null;
  stripe_account_status: string;
  stripe_onboarding_complete: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_requirements_status: string;
  stripe_payout_schedule: string;
  driver_id_number: string | null;
  latitude: number | null;
  longitude: number | null;
  location_updated_at: string | null;
  created_at: string;
};

export type AdminUser = {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'dispatcher' | 'super_admin';
  is_active: boolean;
  created_at: string;
};

export type Delivery = {
  id: string;
  shipper_id: string;
  driver_id: string | null;
  status: 'posted' | 'assigned' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
  pickup_name: string;
  pickup_address: string;
  pickup_city: string;
  pickup_state: string;
  pickup_zip: string;
  pickup_contact: string;
  delivery_name: string;
  delivery_address: string;
  delivery_city: string;
  delivery_state: string;
  delivery_zip: string;
  delivery_contact: string;
  package_type: string;
  package_description: string | null;
  priority: 'standard' | 'urgent' | 'STAT' | 'critical';
  temperature_control: 'none' | 'ambient' | 'refrigerated' | 'frozen';
  weight_lbs: number | string;
  max_bid_amount: number | string;
  accepted_bid: number | string | null;
  auto_assigned: boolean;
  distance_miles: number | string | null;
  calculated_price: number | string | null;
  assigned_at: string | null;
  pickup_time: string | null;
  delivered_time: string | null;
  created_at: string;
  pickup_datetime: string | null;
  delivery_deadline: string | null;
  offered_rate: number | string | null;
  special_requirements: string | null;
  shipper_instructions: string | null;
  document_urls: string[] | null;
  is_urgent: boolean;
  pod_photo_url: string | null;
  pod_signature_url: string | null;
  pod_notes: string | null;
  pod_submitted_at: string | null;
  pod_location: string | null;
  bol_number: string | null;
  pod_number: string | null;
  shipper?: Profile | null;
  driver?: Profile | null;
};

export type DeliveryStop = {
  id: string;
  delivery_id: string;
  stop_number: number;
  stop_type: 'pickup' | 'intermediate' | 'delivery' | 'return';
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contact: string;
  scheduled_at: string | null;
  status: 'pending' | 'arrived' | 'completed';
  arrived_at: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
};

export type Bid = {
  id: string;
  delivery_id: string;
  courier_id: string | null;
  driver_id: string | null;
  amount: number | string;
  eta_minutes: number;
  message: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  counter_amount: number | string | null;
  counter_status: 'pending' | 'accepted' | 'rejected' | null;
  counter_message: string | null;
  created_at: string;
  driver?: Profile | null;
  delivery?: Delivery | null;
};

export type Message = {
  id: string;
  sender_id: string;
  recipient_id: string;
  delivery_id: string | null;
  body: string;
  created_at: string;
  sender?: Profile | null;
  recipient?: Profile | null;
};

export type Document = {
  id: string;
  delivery_id: string;
  uploader_id: string;
  type: string;
  name: string;
  file_url: string;
  created_at: string;
};

export type TrackingEvent = {
  id: string;
  delivery_id: string;
  status: string;
  location: string | null;
  notes: string | null;
  created_at: string;
};

export type Payment = {
  id: string;
  delivery_id: string;
  shipper_id: string;
  driver_id: string;
  gross_amount: number | string;
  commission_rate: number | string;
  commission_amount: number | string;
  driver_payout: number | string;
  status: 'pending' | 'paid' | 'released' | 'disputed' | 'refunded';
  released_at: string | null;
  paid_at: string | null;
  created_at: string;
  stripe_checkout_session_id: string | null;
  stripe_payment_intent_id: string | null;
  stripe_charge_id: string | null;
  stripe_refund_id: string | null;
  stripe_transfer_id: string | null;
  delivery?: Delivery | null;
  shipper?: Profile | null;
  driver?: Profile | null;
};

export type AppSetting = {
  id: string;
  key: string;
  value: string;
  description: string | null;
};

export type Notification = {
  id: string;
  recipient_id: string | null;
  recipient_contact: string;
  channel: 'email' | 'sms' | 'whatsapp';
  subject: string;
  body: string;
  status: 'sent' | 'failed' | 'pending';
  related_type: string | null;
  related_id: string | null;
  created_at: string;
};

export type SupportTicket = {
  id: string;
  requester_id: string;
  subject: string;
  description: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  resolved_at: string | null;
  created_at: string;
  requester?: Profile | null;
};

export type SupportMessage = {
  id: string;
  ticket_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  sender?: Profile | null;
};

export type DriverRating = {
  id: string;
  delivery_id: string;
  driver_id: string;
  rater_id: string;
  rating: number;
  comment: string | null;
  on_time: boolean;
  created_at: string;
  rater?: Profile | null;
};

export type DispatchOrderSnapshot = {
  pickup: { name: string; address: string; city: string; state: string; zip: string; contact: string; scheduled_at: string | null };
  delivery: { name: string; address: string; city: string; state: string; zip: string; contact: string; deadline: string | null };
  shipper: { id: string; name: string; email: string; phone: string; business_name: string | null };
  driver: { id: string; name: string; email: string; phone: string; vehicle_type: string | null; vehicle_plate: string | null };
  cargo: { package_type: string; description: string | null; quantity: number | null; weight_lbs: number | string | null; temperature_control: string };
  money: { agreed_driver_payment: number | string; gross_amount: number | string; platform_commission: number | string; commission_rate: number | string; bid_amount: number | string; counter_amount: number | string | null };
  instructions: { special_requirements: string | null; shipper_instructions: string | null; bid_message: string | null; counter_message: string | null };
  documents: { id: string; type: string; name: string; file_url: string; created_at: string }[];
  delivery_document_urls: string[];
  identifiers: { bol_number: string | null; pod_number: string | null };
};

export type DispatchLegSnapshot = {
  pickup: { name: string; address: string; city: string; state: string; zip: string; contact: string; scheduled_at: string | null };
  delivery: { name: string; address: string; city: string; state: string; zip: string; contact: string; deadline: string | null };
  cargo: { package_type: string; description: string | null; quantity: number | null; weight_lbs: number | string | null; temperature_control: string };
  instructions: { special_requirements: string | null; shipper_instructions: string | null; bid_message: string | null; counter_message: string | null };
  scheduled_pickup: string | null;
  delivery_deadline: string | null;
};

export type DispatchLegStatus = 'dispatched' | 'accepted' | 'proceeding_to_pickup' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';

export type DispatchLeg = {
  id: string;
  dispatch_order_id: string;
  leg_type: 'outbound' | 'return';
  leg_number: number;
  status: DispatchLegStatus;
  leg_snapshot: DispatchLegSnapshot;
  driver_accepted_at: string | null;
  proceeding_to_pickup_at: string | null;
  picked_up_at: string | null;
  in_transit_at: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type DispatchOrder = {
  id: string;
  dispatch_order_number: string;
  delivery_id: string;
  bid_id: string | null;
  shipper_id: string;
  driver_id: string;
  payment_id: string;
  status: 'dispatched' | 'accepted' | 'proceeding_to_pickup' | 'picked_up' | 'in_transit' | 'delivered' | 'cancelled';
  payment_status: string;
  order_snapshot: DispatchOrderSnapshot;
  is_round_trip: boolean;
  driver_accepted_at: string | null;
  proceeding_to_pickup_at: string | null;
  created_at: string;
  updated_at: string;
  legs?: DispatchLeg[];
};

export type Payout = {
  id: string;
  driver_id: string;
  payment_id: string | null;
  amount: number | string;
  status: 'pending' | 'paid' | 'failed' | 'cancelled';
  stripe_transfer_id: string | null;
  stripe_payout_id: string | null;
  type: 'automatic' | 'manual' | 'instant';
  scheduled_at: string;
  paid_at: string | null;
  created_at: string;
  payment?: Payment | null;
};
