import { useState, useEffect } from 'react';
import { Bell, Mail, Phone, MessageSquare, Settings } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { useToast, Toast } from './shared';

export function SettingsTab() {
  const { user, profile, refreshProfile } = useAuth();
  const [notifSettings, setNotifSettings] = useState({ email: true, sms: false, whatsapp: false });
  const [saving, setSaving] = useState(false);
  const { toast, setToast } = useToast();

  useEffect(() => {
    if (profile) {
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
      notif_email_enabled: notifSettings.email,
      notif_sms_enabled: notifSettings.sms,
      notif_whatsapp_enabled: notifSettings.whatsapp,
    }).eq('id', user?.id);
    if (error) { setToast({ type: 'error', msg: error.message }); setSaving(false); return; }
    await refreshProfile();
    setToast({ type: 'success', msg: 'Notification preferences saved' });
    setSaving(false);
  };

  const toggleItems = [
    { key: 'email' as const, label: 'Email Notifications', desc: 'Receive load alerts and updates via email', icon: Mail },
    { key: 'sms' as const, label: 'SMS Notifications', desc: 'Get text messages for urgent deliveries', icon: Phone },
    { key: 'whatsapp' as const, label: 'WhatsApp Notifications', desc: 'Receive messages via WhatsApp', icon: MessageSquare },
  ];

  return (
    <div>
      <Toast toast={toast} />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Settings</h1>
      <p className="text-slate-500 mb-6">Manage your notification preferences and account settings</p>

      <div className="card p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Bell className="w-4 h-4 text-emerald-600" /> Notification Preferences</h2>
        <div className="space-y-4">
          {toggleItems.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.key} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center"><Icon className="w-4 h-4 text-slate-500" /></div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{item.label}</div>
                    <div className="text-xs text-slate-500">{item.desc}</div>
                  </div>
                </div>
                <button type="button" onClick={() => setNotifSettings({ ...notifSettings, [item.key]: !notifSettings[item.key] })}
                  className={`relative w-11 h-6 rounded-full transition-all ${notifSettings[item.key] ? 'bg-emerald-600' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all ${notifSettings[item.key] ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2"><Settings className="w-4 h-4 text-emerald-600" /> Account Settings</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <div>
              <div className="text-sm font-medium text-slate-900">Auto-Accept Loads</div>
              <div className="text-xs text-slate-500">Automatically accept loads matching your criteria</div>
            </div>
            <button className="relative w-11 h-6 rounded-full bg-slate-300">
              <span className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm" />
            </button>
          </div>
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
            <div>
              <div className="text-sm font-medium text-slate-900">Show Profile to Shippers</div>
              <div className="text-xs text-slate-500">Allow shippers to see your profile when bidding</div>
            </div>
            <button className="relative w-11 h-6 rounded-full bg-emerald-600">
              <span className="absolute top-0.5 left-5 w-5 h-5 rounded-full bg-white shadow-sm" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-accent">{saving ? 'Saving...' : 'Save Settings'}</button>
      </div>
    </div>
  );
}
