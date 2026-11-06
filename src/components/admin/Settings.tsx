import { useState, useEffect, useCallback } from 'react';
import { Save, Shield } from 'lucide-react';
import { supabase, type AppSetting } from '../../lib/supabase';
import { DisclaimerModal } from '../Disclaimer';

export function AdminSettingsPage() {
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [showDisclaimer, setShowDisclaimer] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('app_settings').select('*').order('key', { ascending: true });
    setSettings((data as AppSetting[]) || []);
    setEditedValues({});
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSave = async () => {
    setSaving(true);
    for (const [key, value] of Object.entries(editedValues)) {
      await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    load();
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading settings...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
          <p className="text-slate-500 mt-1">Configure platform-wide settings</p>
        </div>
        <button onClick={handleSave} disabled={saving || Object.keys(editedValues).length === 0} className="btn-primary">
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Changes'} <Save className="w-4 h-4" />
        </button>
      </div>

      <div className="card divide-y divide-slate-100">
        {settings.map((s) => (
          <div key={s.id} className="p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">{s.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}</div>
                {s.description && <div className="text-xs text-slate-500 mt-0.5">{s.description}</div>}
              </div>
              <input
                className="input w-48 text-right"
                value={editedValues[s.key] ?? s.value}
                onChange={(e) => setEditedValues({ ...editedValues, [s.key]: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="card p-6 mt-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center"><Shield className="w-5 h-5 text-primary-600" /></div>
            <div>
              <div className="text-sm font-semibold text-slate-900">Disclaimer of Usage</div>
              <div className="text-xs text-slate-500">Applies to all users and employees of ZITRUCKGO</div>
            </div>
          </div>
          <button onClick={() => setShowDisclaimer(true)} className="btn-secondary text-sm">View Disclaimer</button>
        </div>
      </div>

      <DisclaimerModal open={showDisclaimer} onClose={() => setShowDisclaimer(false)} />
    </div>
  );
}
