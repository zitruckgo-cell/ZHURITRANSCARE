import { useState, useEffect } from 'react';
import { User, Truck, MapPin, Star } from 'lucide-react';
import { supabase, type Profile } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useToast, Toast } from './shared';

export function DriverProfile() {
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    full_name: '', phone: '', vehicle_type: '', vehicle_plate: '',
    service_area: '', address: '', city: '', state: '', zip_code: '',
  });
  const [saving, setSaving] = useState(false);
  const { toast, setToast } = useToast();

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '', phone: profile.phone || '',
        vehicle_type: profile.vehicle_type || '', vehicle_plate: profile.vehicle_plate || '',
        service_area: profile.service_area || '', address: profile.address || '',
        city: profile.city || '', state: profile.state || '', zip_code: profile.zip_code || '',
      });
    }
  }, [profile]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name, phone: form.phone,
      vehicle_type: form.vehicle_type || null, vehicle_plate: form.vehicle_plate || null,
      service_area: form.service_area || null,
      city: form.city || null, state: form.state || null, zip_code: form.zip_code || null,
      address: form.address || null,
    }).eq('id', user?.id);
    if (error) { setToast({ type: 'error', msg: error.message }); setSaving(false); return; }
    setToast({ type: 'success', msg: 'Profile updated successfully' });
    setSaving(false);
  };

  return (
    <div>
      <Toast toast={toast} />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Driver Profile</h1>
      <p className="text-slate-500 mb-6">Manage your personal and vehicle information</p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><User className="w-4 h-4 text-emerald-600" /> Personal Information</h2>
          {profile?.driver_id_number && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
              <span className="text-xs font-semibold text-emerald-600 uppercase">Driver ID</span>
              <span className="font-mono font-bold text-emerald-700">{profile.driver_id_number}</span>
            </div>
          )}
          <div className="space-y-3">
            <div><label className="label">Full Name</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(404) 555-0101" /></div>
            <div><label className="label">Email</label><input className="input opacity-60" value={profile?.email || ''} disabled /></div>
            <div><label className="label">Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="123 Main St" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">City</label><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><label className="label">State</label><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div><label className="label">ZIP</label><input className="input" value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} /></div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Truck className="w-4 h-4 text-emerald-600" /> Vehicle & Service</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Vehicle Type</label>
                <select className="input" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
                  <option value="">Select vehicle type</option>
                  <option value="Car">Car</option>
                  <option value="Van">Van</option>
                  <option value="Motorcycle">Motorcycle</option>
                  <option value="Box Truck">Box Truck</option>
                </select>
              </div>
              <div><label className="label">License Plate</label><input className="input" value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} placeholder="ABC-1234" /></div>
              <div><label className="label"><MapPin className="w-3.5 h-3.5 inline mr-1" />Service Area</label><input className="input" value={form.service_area} onChange={(e) => setForm({ ...form, service_area: e.target.value })} placeholder="e.g. Greater Atlanta Metro" /></div>
            </div>
            <div className="mt-4 p-3 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-3">
              <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
              <div>
                <div className="text-sm font-semibold text-slate-900">{Number(profile?.rating ?? 0).toFixed(1)} Rating</div>
                <div className="text-xs text-slate-500">{profile?.total_deliveries ?? 0} total deliveries</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={save} disabled={saving} className="btn-accent">{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </div>
  );
}
