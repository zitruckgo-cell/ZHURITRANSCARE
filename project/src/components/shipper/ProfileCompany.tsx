import { useState, useEffect } from 'react';
import { Building2, Phone, Bell, Mail, MessageSquare } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';

export function ProfileCompany() {
  const { user, profile } = useAuth();
  const [form, setForm] = useState({
    full_name: '', phone: '', business_name: '', business_address: '',
    city: '', state: '', zip_code: '', address: '',
  });
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [notifSettings, setNotifSettings] = useState({ email: true, sms: false, whatsapp: false });
  const [savingNotif, setSavingNotif] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (profile) {
      setForm({
        full_name: profile.full_name || '', phone: profile.phone || '',
        business_name: profile.business_name || '', business_address: profile.business_address || '',
        city: profile.city || '', state: profile.state || '', zip_code: profile.zip_code || '',
        address: profile.address || '',
      });
      setNotifSettings({
        email: profile.notif_email_enabled ?? true,
        sms: profile.notif_sms_enabled ?? false,
        whatsapp: profile.notif_whatsapp_enabled ?? false,
      });
    }
  }, [profile]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name, phone: form.phone,
      business_name: form.business_name || null, business_address: form.business_address || null,
      city: form.city || null, state: form.state || null, zip_code: form.zip_code || null,
      address: form.address || null,
    }).eq('id', user?.id);
    if (error) { setToast({ type: 'error', msg: error.message }); setSaving(false); return; }
    setToast({ type: 'success', msg: 'Profile updated successfully' });
    setSaving(false);
  };

  const saveNotif = async () => {
    setSavingNotif(true);
    const { error } = await supabase.from('profiles').update({
      notif_email_enabled: notifSettings.email,
      notif_sms_enabled: notifSettings.sms,
      notif_whatsapp_enabled: notifSettings.whatsapp,
    }).eq('id', user?.id);
    if (error) { setToast({ type: 'error', msg: error.message }); setSavingNotif(false); return; }
    setToast({ type: 'success', msg: 'Notification preferences saved' });
    setSavingNotif(false);
  };

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Profile & Company</h1>
      <p className="text-slate-500 mb-6">Manage your company information and settings</p>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Building2 className="w-4 h-4 text-primary-600" /> Company Information</h2>
          <div className="space-y-3">
            <div><label className="label">Contact Name</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label className="label">Business Name</label><input className="input" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Pharmacy / Facility name" /></div>
            <div><label className="label">Business Address</label><input className="input" value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} placeholder="123 Main St" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label">City</label><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
              <div><label className="label">State</label><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
              <div><label className="label">ZIP</label><input className="input" value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} /></div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Phone className="w-4 h-4 text-primary-600" /> Contact & Billing</h2>
            <div className="space-y-3">
              <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(404) 555-0101" /></div>
              <div><label className="label">Email</label><input className="input opacity-60" value={profile?.email || ''} disabled /></div>
              <div><label className="label">Billing Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Same as business address" /></div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Bell className="w-4 h-4 text-primary-600" /> Notification Settings</h2>
            <div className="space-y-3">
              {([
                { key: 'email' as const, label: 'Email Notifications', desc: 'Receive load updates and payment alerts via email', icon: Mail },
                { key: 'sms' as const, label: 'SMS Notifications', desc: 'Get text messages for urgent delivery changes', icon: Phone },
                { key: 'whatsapp' as const, label: 'WhatsApp Notifications', desc: 'Receive messages via WhatsApp', icon: MessageSquare },
              ]).map((n) => {
                const Icon = n.icon;
                return (
                  <div key={n.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center"><Icon className="w-4 h-4 text-slate-500" /></div>
                      <div>
                        <div className="text-sm font-medium text-slate-900">{n.label}</div>
                        <div className="text-xs text-slate-500">{n.desc}</div>
                      </div>
                    </div>
                    <button type="button" onClick={() => setNotifSettings({ ...notifSettings, [n.key]: !notifSettings[n.key] })} className={`relative w-11 h-6 rounded-full transition-all ${notifSettings[n.key] ? 'bg-primary-600' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${notifSettings[n.key] ? 'left-5' : 'left-0.5'}`} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button onClick={saveNotif} disabled={savingNotif} className="btn-primary mt-4 text-sm">{savingNotif ? 'Saving...' : 'Save Notification Preferences'}</button>
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary">{saving ? 'Saving...' : 'Save Changes'}</button>
      </div>
    </div>
  );
}
