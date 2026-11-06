import { useState, useEffect, useCallback } from 'react';
import { Shield } from 'lucide-react';
import { supabase, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';

type ScopeProps = {
  role: 'driver' | 'shipper';
  scopeUserId: string | null;
  onScopeChange: (userId: string | null) => void;
};

export function AdminScopePicker({ role, scopeUserId, onScopeChange }: ScopeProps) {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, business_name')
      .contains('roles', [role])
      .order('created_at', { ascending: false });
    setUsers((data as Profile[]) || []);
    setLoading(false);
  }, [role]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-slate-900 text-white">
      <Shield className="w-4 h-4 text-amber-400 shrink-0" />
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-300">Admin View</span>
      <span className="text-slate-500">·</span>
      <span className="text-xs text-slate-400">Showing all {role}s</span>
      <select
        value={scopeUserId || ''}
        onChange={(e) => onScopeChange(e.target.value || null)}
        className="ml-auto bg-slate-800 text-white text-xs rounded-lg px-3 py-1.5 border border-slate-700 focus:ring-2 focus:ring-amber-400 focus:border-amber-400 outline-none max-w-[200px]"
        disabled={loading}
      >
        <option value="">All {role}s</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.business_name || u.full_name}</option>
        ))}
      </select>
    </div>
  );
}
