import { useState, useEffect, useCallback } from 'react';
import { ArrowRight, Truck, Package, Calendar, CreditCard, ClipboardList, MapPin } from 'lucide-react';
import { supabase, type Delivery, type Payment, type DispatchOrder, type DeliveryStop } from '../../lib/supabase';
import { fetchStopsForDeliveries } from '../../lib/stops';
import { priorityConfig, statusConfig, timeAgo, formatMoney, formatDate } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import type { ShipperTab } from './shared';
import { AdminPriceEdit } from '../AdminPriceEdit';
import { AdminScopePicker } from '../AdminScopePicker';

const LOAD_TABS = ['all', 'posted', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'] as const;
type LoadTab = typeof LOAD_TABS[number];

export function MyLoads({ onNavigate }: { onNavigate?: (t: ShipperTab) => void }) {
  const { user, isAdmin } = useAuth();
  const [scopeShipperId, setScopeShipperId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Record<string, Payment>>({});
  const [dispatchOrders, setDispatchOrders] = useState<Record<string, DispatchOrder>>({});
  const [stopsMap, setStopsMap] = useState<Record<string, DeliveryStop[]>>({});
  const [loading, setLoading] = useState(true);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [filter, setFilter] = useState<LoadTab>('all');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const shipperFilter = isAdmin ? scopeShipperId : user?.id;
    let query = supabase.from('deliveries').select('*, driver:profiles!deliveries_driver_id_fkey(*)').order('created_at', { ascending: false });
    if (shipperFilter) query = query.eq('shipper_id', shipperFilter);
    const { data } = await query;
    const deliveriesData = (data as Delivery[]) || [];
    setDeliveries(deliveriesData);
    if (deliveriesData.length > 0) {
      const ids = deliveriesData.map((d) => d.id);
      const { data: payData } = await supabase.from('payments').select('*').in('delivery_id', ids);
      const payByDelivery: Record<string, Payment> = {};
      (payData as Payment[] || []).forEach((p) => { payByDelivery[p.delivery_id] = p; });
      setPayments(payByDelivery);
      const { data: doData } = await supabase.from('dispatch_orders').select('*').in('delivery_id', ids);
      const doMap: Record<string, DispatchOrder> = {};
      (doData as DispatchOrder[] || []).forEach((o) => { doMap[o.delivery_id] = o; });
      setDispatchOrders(doMap);
      const sMap = await fetchStopsForDeliveries(ids);
      setStopsMap(sMap);
    } else {
      setPayments({});
      setDispatchOrders({});
      setStopsMap({});
    }
    setLoading(false);
  }, [user?.id, isAdmin, scopeShipperId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    const channel = supabase.channel('myloads-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `shipper_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, load]);

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

  const filtered = filter === 'all' ? deliveries : deliveries.filter((d) => d.status === filter);

  const counts: Record<string, number> = {};
  deliveries.forEach((d) => { counts[d.status] = (counts[d.status] || 0) + 1; });

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}
      {isAdmin && <AdminScopePicker role="shipper" scopeUserId={scopeShipperId} onScopeChange={setScopeShipperId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">My Loads</h1>
      <p className="text-slate-500 mb-6">Track and manage all your deliveries</p>

      <div className="flex gap-1.5 mb-5 overflow-x-auto pb-1">
        {LOAD_TABS.map((t) => (
          <button key={t} onClick={() => setFilter(t)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === t ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {t === 'all' ? 'All' : statusConfig(t).label} {t !== 'all' && counts[t] ? `(${counts[t]})` : t === 'all' ? ` (${deliveries.length})` : ''}
          </button>
        ))}
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Package className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No loads in this category</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((d) => {
            const sc = statusConfig(d.status);
            const pc = priorityConfig(d.priority);
            return (
              <div key={d.id} className="card p-5">
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-900">{d.pickup_name}</span>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold text-slate-900">{d.delivery_name}</span>
                      {d.bol_number && <span className="text-xs font-mono text-slate-400">{d.bol_number}</span>}
                    </div>
                    <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-1 flex-wrap">
                      <span>{d.pickup_city}, {d.pickup_state} → {d.delivery_city}, {d.delivery_state}</span>
                      {stopsMap[d.id] && stopsMap[d.id].filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').length > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-primary-600 font-medium">
                          <MapPin className="w-3 h-3" /> {stopsMap[d.id].filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').length} stop{stopsMap[d.id].filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').length > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 flex-wrap">
                      {d.driver && <span className="flex items-center gap-1"><Truck className="w-3 h-3" /> {d.driver.full_name}</span>}
                      {d.driver?.vehicle_type && <span>{d.driver.vehicle_type}</span>}
                      {d.distance_miles && <span>{d.distance_miles} mi</span>}
                      {d.pickup_datetime && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(d.pickup_datetime)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`badge ${pc.color}`}><span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} /> {pc.label}</span>
                    <span className={`badge ${sc.color}`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} /> {sc.label}</span>
                    <span className="text-sm font-semibold text-slate-700">
                      {isAdmin ? (
                        <AdminPriceEdit
                          value={Number(d.calculated_price || d.max_bid_amount)}
                          table="deliveries"
                          id={d.id}
                          field="calculated_price"
                          onSave={async (num) => {
                            const { error } = await supabase.from('deliveries').update({ calculated_price: num }).eq('id', d.id);
                            if (error) throw error;
                            load();
                          }}
                        />
                      ) : formatMoney(d.calculated_price || d.max_bid_amount)}
                    </span>
                    <span className="text-xs text-slate-400">{timeAgo(d.created_at)}</span>
                    {payments[d.id] && payments[d.id].status === 'pending' && (
                      <button
                        onClick={() => handlePay(payments[d.id].id)}
                        disabled={payingId === payments[d.id].id}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-all active:scale-95 disabled:opacity-50"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        {payingId === payments[d.id].id ? 'Redirecting...' : 'Pay Now'}
                      </button>
                    )}
                    {payments[d.id] && (payments[d.id].status === 'paid' || payments[d.id].status === 'released') && (
                      <span className="badge bg-emerald-100 text-emerald-700">{payments[d.id].status}</span>
                    )}
                    {dispatchOrders[d.id] && onNavigate && (
                      <button
                        onClick={() => onNavigate('dispatch-orders')}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all active:scale-95"
                      >
                        <ClipboardList className="w-3.5 h-3.5" /> View Dispatch Order
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
