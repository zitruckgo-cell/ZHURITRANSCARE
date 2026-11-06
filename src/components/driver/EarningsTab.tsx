import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Wallet, Clock, AlertCircle } from 'lucide-react';
import { supabase, type Payment } from '../../lib/supabase';
import { formatMoney, formatDate } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { useToast, Toast } from './shared';
import { AdminScopePicker } from '../AdminScopePicker';

export function EarningsTab() {
  const { user, isAdmin } = useAuth();
  const [scopeDriverId, setScopeDriverId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'released' | 'disputed'>('all');
  const { toast, setToast } = useToast();

  const load = useCallback(async () => {
    setError(null);
    try {
      let query = supabase.from('payments')
        .select('*, delivery:deliveries(*)')
        .order('created_at', { ascending: false });
      const driverFilter = isAdmin ? scopeDriverId : user?.id;
      if (driverFilter) query = query.eq('driver_id', driverFilter);
      const { data, error: err } = await query;
      if (err) throw err;
      setPayments((data as Payment[]) || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load earnings');
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAdmin, scopeDriverId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;
  if (error) return <div className="card p-12 text-center"><AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" /><p className="text-red-600 font-medium">{error}</p><button onClick={load} className="btn-secondary mt-4">Retry</button></div>;

  const filtered = filter === 'all' ? payments : payments.filter((p) => p.status === filter);
  const now = new Date();
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - 7);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const todayEarnings = payments.filter((p) => { const d = new Date(p.created_at); return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear(); }).reduce((s, p) => s + Number(p.driver_payout), 0);
  const weekEarnings = payments.filter((p) => new Date(p.created_at) >= startOfWeek).reduce((s, p) => s + Number(p.driver_payout), 0);
  const monthEarnings = payments.filter((p) => new Date(p.created_at) >= startOfMonth).reduce((s, p) => s + Number(p.driver_payout), 0);
  const pendingEarnings = payments.filter((p) => p.status === 'pending').reduce((s, p) => s + Number(p.driver_payout), 0);
  const totalEarnings = payments.reduce((s, p) => s + Number(p.driver_payout), 0);
  const totalCommission = payments.reduce((s, p) => s + Number(p.commission_amount), 0);

  const cards = [
    { label: "Today", value: todayEarnings, icon: DollarSign, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'This Week', value: weekEarnings, icon: TrendingUp, color: 'bg-primary-50 text-primary-600' },
    { label: 'This Month', value: monthEarnings, icon: Wallet, color: 'bg-blue-50 text-blue-600' },
    { label: 'Pending', value: pendingEarnings, icon: Clock, color: 'bg-amber-50 text-amber-600' },
  ];

  return (
    <div>
      <Toast toast={toast} />
      {isAdmin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Earnings</h1>
      <p className="text-slate-500 mb-6">Track your payouts, commission, and withdrawal history</p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="card p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-slate-900">{formatMoney(c.value)}</div>
              <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
            </div>
          );
        })}
      </div>

      <div className="card p-5 mb-6">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs text-slate-500">Total Load Payments</div>
            <div className="text-lg font-bold text-slate-900 mt-1">{formatMoney(totalEarnings + totalCommission)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Platform Commission</div>
            <div className="text-lg font-bold text-red-600 mt-1">-{formatMoney(totalCommission)}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Net Driver Earnings</div>
            <div className="text-lg font-bold text-emerald-600 mt-1">{formatMoney(totalEarnings)}</div>
          </div>
        </div>
        <button onClick={() => setToast({ type: 'success', msg: 'Withdrawal request submitted!' })} className="btn-accent w-full mt-4">
          <Wallet className="w-4 h-4" /> Withdraw Earnings
        </button>
      </div>

      <div className="flex gap-1.5 mb-4">
        {(['all', 'pending', 'released', 'disputed'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{f}</button>
        ))}
      </div>

      {filtered.length === 0 ? <div className="card p-12 text-center"><DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No payments found</p></div> : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((p) => (
            <div key={p.id} className="p-4">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">
                    {p.delivery?.pickup_city} → {p.delivery?.delivery_city}
                  </div>
                  <div className="text-xs text-slate-400">{formatDate(p.created_at)} · {p.delivery?.package_type.replace('_', ' ')}</div>
                </div>
                <span className={`badge ${p.status === 'released' ? 'bg-emerald-100 text-emerald-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{p.status}</span>
              </div>
              <div className="flex items-center gap-4 text-xs mt-2 pl-1">
                <span className="text-slate-500">Load: <span className="font-medium text-slate-700">{formatMoney(Number(p.gross_amount))}</span></span>
                <span className="text-red-500">Fee: -{formatMoney(Number(p.commission_amount))}</span>
                <span className="text-emerald-600 font-semibold">Net: {formatMoney(Number(p.driver_payout))}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
