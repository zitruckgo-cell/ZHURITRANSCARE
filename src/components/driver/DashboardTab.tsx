import { useState, useEffect, useCallback } from 'react';
import { Package, Truck, DollarSign, TrendingUp, Star } from 'lucide-react';
import { supabase, type Delivery, type Payment } from '../../lib/supabase';
import { statusConfig, timeAgo, formatMoney } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { SpecialInstructions } from '../SpecialInstructions';
import { AdminScopePicker } from '../AdminScopePicker';
import type { DriverTab } from './shared';

export function DashboardTab({ onNavigate }: { onNavigate: (t: DriverTab) => void }) {
  const { user, profile, refreshProfile, isAdmin } = useAuth();
  const [scopeDriverId, setScopeDriverId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; subject: string; body: string; created_at: string }[]>([]);
  const [availableCount, setAvailableCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [togglingOnline, setTogglingOnline] = useState(false);

  const load = useCallback(async () => {
    const driverFilter = isAdmin ? scopeDriverId : user?.id;
    let delQuery = supabase.from('deliveries').select('*, shipper:profiles!deliveries_shipper_id_fkey(*)').order('created_at', { ascending: false });
    if (driverFilter) delQuery = delQuery.eq('driver_id', driverFilter);
    let payQuery = supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (driverFilter) payQuery = payQuery.eq('driver_id', driverFilter);
    let notifQuery = supabase.from('notifications').select('id, subject, body, created_at').order('created_at', { ascending: false }).limit(5);
    if (driverFilter) notifQuery = notifQuery.eq('recipient_id', driverFilter);
    const [delRes, payRes, notifRes, availRes] = await Promise.all([
      delQuery,
      payQuery,
      notifQuery,
      supabase.from('deliveries').select('id').eq('status', 'posted'),
    ]);
    setDeliveries((delRes.data as Delivery[]) || []);
    setPayments((payRes.data as Payment[]) || []);
    setNotifications((notifRes.data as { id: string; subject: string; body: string; created_at: string }[]) || []);
    setAvailableCount(availRes.data?.length ?? 0);
    setLoading(false);
  }, [user?.id, isAdmin, scopeDriverId]);

  useEffect(() => { load(); }, [load]);

  const toggleOnline = async () => {
    setTogglingOnline(true);
    const newValue = !profile?.is_online;
    await supabase.from('profiles').update({ is_online: newValue }).eq('id', user?.id);
    await refreshProfile();
    setTogglingOnline(false);
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  const active = deliveries.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status));
  const todayEarnings = payments.filter((p) => {
    const d = new Date(p.created_at);
    const now = new Date();
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).reduce((sum, p) => sum + Number(p.driver_payout), 0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weeklyEarnings = payments.filter((p) => new Date(p.created_at) >= weekAgo).reduce((sum, p) => sum + Number(p.driver_payout), 0);

  const stats = [
    { label: 'Available Loads', value: availableCount, icon: Package, color: 'bg-amber-50 text-amber-600' },
    { label: 'Active Load', value: active.length, icon: Truck, color: 'bg-blue-50 text-blue-600' },
    { label: "Today's Earnings", value: formatMoney(todayEarnings), icon: DollarSign, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Weekly Earnings', value: formatMoney(weeklyEarnings), icon: TrendingUp, color: 'bg-primary-50 text-primary-600' },
  ];

  return (
    <div className="space-y-6">
      {isAdmin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Welcome, {profile?.full_name?.split(' ')[0] || 'Driver'}</h1>
          <p className="text-slate-500 mt-1">Your delivery dashboard at a glance</p>
        </div>
        <button onClick={toggleOnline} disabled={togglingOnline}
          className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border-2 transition-all ${profile?.is_online ? 'bg-emerald-50 border-emerald-300' : 'bg-slate-50 border-slate-200'}`}>
          <span className={`relative flex w-3 h-3`}>
            {profile?.is_online && <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />}
            <span className={`relative inline-flex rounded-full h-3 w-3 ${profile?.is_online ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          </span>
          <span className={`text-sm font-semibold ${profile?.is_online ? 'text-emerald-700' : 'text-slate-500'}`}>
            {togglingOnline ? 'Updating...' : profile?.is_online ? 'Online — Available for Loads' : 'Offline — Not Available'}
          </span>
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <button key={s.label} onClick={() => onNavigate(s.label.includes('Available') ? 'find-loads' : s.label.includes('Active') ? 'active-delivery' : 'earnings')}
              className="card p-4 text-left hover:shadow-md transition-all">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </button>
          );
        })}
      </div>

      <SpecialInstructions accent="emerald" />

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Active Deliveries</h2>
            <button onClick={() => onNavigate('my-loads')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View all</button>
          </div>
          <div className="card divide-y divide-slate-100">
            {active.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No active deliveries</div> :
              active.slice(0, 5).map((d) => {
                const sc = statusConfig(d.status);
                return (
                  <div key={d.id} className="p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                      <div className="text-xs text-slate-500">{d.pickup_city}, {d.pickup_state}</div>
                    </div>
                    <span className={`badge ${sc.color} shrink-0`}>{sc.label}</span>
                  </div>
                );
              })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Recent Notifications</h2>
            <button onClick={() => onNavigate('notifications')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View all</button>
          </div>
          <div className="card divide-y divide-slate-100">
            {notifications.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No notifications</div> :
              notifications.map((n) => (
                <div key={n.id} className="p-4">
                  <div className="text-sm font-medium text-slate-900">{n.subject}</div>
                  <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.body}</div>
                  <div className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</div>
                </div>
              ))}
          </div>
        </div>
      </div>

      <div className="card p-5 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
          <span className="text-2xl font-bold text-slate-900">{Number(profile?.rating ?? 0).toFixed(1)}</span>
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-slate-900">Driver Rating</div>
          <div className="text-xs text-slate-500">{profile?.total_deliveries ?? 0} deliveries · {profile?.total_ratings ?? 0} ratings</div>
        </div>
        <button onClick={() => onNavigate('ratings')} className="text-xs text-emerald-600 hover:text-emerald-700 font-medium">View details</button>
      </div>
    </div>
  );
}
