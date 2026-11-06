import { useState, useEffect } from 'react';
import { ClipboardList, Save, CheckCircle2, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';

export function SpecialInstructions({ accent = 'primary' }: { accent?: 'primary' | 'emerald' }) {
  const { user, profile, refreshProfile } = useAuth();
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(profile?.special_instructions || '');
  }, [profile?.special_instructions]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ special_instructions: value })
      .eq('id', user?.id);
    setSaving(false);
    if (error) return;
    setSaved(true);
    refreshProfile();
    setTimeout(() => setSaved(false), 2000);
  };

  const accentClasses = accent === 'emerald'
    ? { icon: 'bg-emerald-50 text-emerald-600', btn: 'bg-emerald-600 hover:bg-emerald-700' }
    : { icon: 'bg-primary-50 text-primary-600', btn: 'bg-primary-600 hover:bg-primary-700' };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accentClasses.icon}`}>
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Special Instructions</h2>
          <p className="text-xs text-slate-500">Add notes about handling, access codes, delivery preferences, or anything drivers/admins should know</p>
        </div>
      </div>
      <textarea
        className="input min-h-[80px] resize-none"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="e.g. Use back entrance, ring doorbell twice, keep medication refrigerated, call 15 min before arrival..."
      />
      <div className="flex items-center justify-between mt-3">
        <p className="text-xs text-slate-400">Visible to admins and connected parties on your deliveries</p>
        <button
          onClick={save}
          disabled={saving}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all active:scale-95 ${accentClasses.btn} disabled:opacity-60`}
        >
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
            : <><Save className="w-4 h-4" /> Save</>}
        </button>
      </div>
    </div>
  );
}
