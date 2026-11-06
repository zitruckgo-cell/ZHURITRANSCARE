import { useState, useEffect, useCallback } from 'react';
import { Truck, Navigation, CheckCircle2, Gavel, DollarSign, Bell, CreditCard } from 'lucide-react';
import { supabase, type Delivery, type Payment } from '../../lib/supabase';
import { statusConfig, timeAgo, formatMoney, formatDate } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { SpecialInstructions } from '../SpecialInstructions';
import { AdminScopePicker } from '../AdminScopePicker';
import type { ShipperTab } from './shared';

export function DashboardTab({ onNavigate }: { onNavigate: (t: ShipperTab) => void }) {
  const { user, isAdmin } = useAuth();
  const [scopeShipperId, setScopeShipperId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; subject: string; body: string; created_at: string; status: string }[]>([]);
  const [bidCount, setBidCount] = useState(0);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const shipperFilter = isAdmin ? scopeShipperId : user?.id;
    let delQuery = supabase.from('deliveries').select('*').order('created_at', { ascending: false });
    if (shipperFilter) delQuery = delQuery.eq('shipper_id', shipperFilter);
    let payQuery = supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (shipperFilter) payQuery = payQuery.eq('shipper_id', shipperFilter);
    let notifQuery = supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(5);
    if (shipperFilter) notifQuery = notifQuery.eq('recipient_id', shipperFilter);
    const [delRes, payRes, notifRes] = await Promise.all([
      delQuery,
      payQuery,
      notifQuery,
    ]);
    setDeliveries((delRes.data as Delivery[]) || []);
    setPayments((payRes.data as Payment[]) || []);
    setNotifications((notifRes.data as { id: string; subject: string; body: string; created_at: string; status: string }[]) || []);

    const deliveryIds = ((delRes.data as Delivery[]) || []).map((d) => d.id);
    if (deliveryIds.length > 0) {
      const { count } = await supabase.from('bids').select('id', { count: 'exact', head: true })
        .in('delivery_id', deliveryIds).eq('status', 'pending');
      setBidCount(count || 0);
    }

    setLoading(false);
  }, [user?.id, isAdmin, scopeShipperId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentStatus = params.get('payment');
    if (paymentStatus === 'success') {
      setToast({ type: 'success', msg: 'Payment completed successfully!' });
      window.history.replaceState({}, '', window.location.pathname);
      load();
    } else if (paymentStatus === 'cancelled') {
      setToast({ type: 'error', msg: 'Payment was cancelled. You can try again anytime.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  const handlePay = async (paymentId: string) => {
    setPayingId(paymentId);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ payment_id: paymentId }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const errMsg = data.details?.message || data.details?.error?.message || data.error || 'Failed to start payment';
        setToast({ type: 'error', msg: errMsg });
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setToast({ type: 'error', msg: 'Network error. Please try again.' });
    }
    setPayingId(null);
  };

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    const channel = supabase.channel('dashboard-bids')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `shipper_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, load]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  const activeLoads = deliveries.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status));
  const postedLoads = deliveries.filter((d) => d.status === 'posted');
  const inTransit = deliveries.filter((d) => d.status === 'in_transit');
  const delivered = deliveries.filter((d) => d.status === 'delivered');
  const totalSpent = payments.reduce((sum, p) => sum + Number(p.gross_amount), 0);
  const upcoming = deliveries.filter((d) => ['posted', 'assigned'].includes(d.status) && d.pickup_datetime && new Date(d.pickup_datetime) > new Date()).slice(0, 5);

  const stats = [
    { label: 'Active Loads', value: activeLoads.length, icon: Truck, color: 'bg-blue-50 text-blue-600' },
    { label: 'New Bids', value: bidCount, icon: Gavel, color: 'bg-amber-50 text-amber-600', onClick: bidCount > 0 ? () => onNavigate('bids') : undefined },
    { label: 'Posted Loads', value: postedLoads.length, icon: Gavel, color: 'bg-slate-50 text-slate-600' },
    { label: 'In Transit', value: inTransit.length, icon: Navigation, color: 'bg-indigo-50 text-indigo-600' },
    { label: 'Delivered', value: delivered.length, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Total Spent', value: formatMoney(totalSpent), icon: DollarSign, color: 'bg-primary-50 text-primary-600' },
  ];

  return (
    <div className="space-y-6">
      {isAdmin && <AdminScopePicker role="shipper" scopeUserId={scopeShipperId} onScopeChange={setScopeShipperId} />}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">Overview of your shipping activity</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className={`card p-4 ${s.onClick ? 'cursor-pointer hover:shadow-md transition-all' : ''}`} onClick={s.onClick}>
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
                <Icon className="w-4.5 h-4.5" />
              </div>
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>

      <SpecialInstructions accent="primary" />

      <div className="grid lg:grid-cols-2 gap-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Upcoming Deliveries</h2>
            <button onClick={() => onNavigate('loads')} className="text-xs text-primary-600 hover:text-primary-700 font-medium">View all</button>
          </div>
          <div className="card divide-y divide-slate-100">
            {upcoming.length === 0 ? <div className="p-6 text-center text-sm text-slate-400">No upcoming deliveries</div> :
              upcoming.map((d) => {
                const sc = statusConfig(d.status);
                const payment = payments.find((p) => p.delivery_id === d.id);
                const showPay = payment && payment.status === 'pending';
                return (
                  <div key={d.id} className="p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                      <div className="text-xs text-slate-500">{d.pickup_datetime ? formatDate(d.pickup_datetime) : timeAgo(d.created_at)}</div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {showPay && (
                        <button
                          onClick={() => handlePay(payment!.id)}
                          disabled={payingId === payment!.id}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-all active:scale-95 disabled:opacity-50"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          {payingId === payment!.id ? 'Redirecting...' : 'Pay Now'}
                        </button>
                      )}
                      <span className={`badge ${sc.color}`}>{sc.label}</span>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-slate-900">Notifications</h2>
            <Bell className="w-4 h-4 text-slate-400" />
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
    </div>
  );
}
