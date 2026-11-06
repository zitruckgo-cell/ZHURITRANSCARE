import { useState, useEffect, useCallback } from 'react';
import {
  ArrowRight, Truck, CheckCircle2, Clock, Gavel, AlertCircle,
  Ban, Check, ClipboardList,
} from 'lucide-react';
import { supabase, type Delivery, type Bid, type DispatchOrder } from '../../lib/supabase';
import { priorityConfig, statusConfig, timeAgo, formatMoney, formatDate, driverPayout as calcDriverPayout } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { AdminPriceEdit } from '../AdminPriceEdit';
import { AdminScopePicker } from '../AdminScopePicker';
import type { DriverTab } from './shared';

export function MyLoads({ onNavigate }: { onNavigate?: (t: DriverTab) => void }) {
  const { user, isAdmin } = useAuth();
  const [dispatchOrders, setDispatchOrders] = useState<Record<string, DispatchOrder>>({});
  const [scopeDriverId, setScopeDriverId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [bids, setBids] = useState<Bid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'active' | 'completed' | 'bids'>('active');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const driverFilter = isAdmin ? scopeDriverId : user?.id;
      let delQuery = supabase.from('deliveries').select('*, shipper:profiles!deliveries_shipper_id_fkey(*)').order('created_at', { ascending: false });
      if (driverFilter) delQuery = delQuery.eq('driver_id', driverFilter);
      let bidQuery = supabase.from('bids').select('*, delivery:deliveries(*)').order('created_at', { ascending: false });
      if (driverFilter) bidQuery = bidQuery.eq('driver_id', driverFilter);
      const [delRes, bidRes] = await Promise.all([
        delQuery,
        bidQuery,
      ]);
      const dels = (delRes.data as Delivery[]) || [];
      setDeliveries(dels);
      setBids((bidRes.data as Bid[]) || []);
      if (dels.length > 0) {
        const delIds = dels.map((d) => d.id);
        const { data: doData } = await supabase.from('dispatch_orders').select('*').in('delivery_id', delIds);
        const doMap: Record<string, DispatchOrder> = {};
        (doData as DispatchOrder[] || []).forEach((o) => { doMap[o.delivery_id] = o; });
        setDispatchOrders(doMap);
      } else {
        setDispatchOrders({});
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [user?.id, isAdmin, scopeDriverId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    const channel = supabase.channel('my-bids-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids', filter: `driver_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, load]);

  const acceptCounter = async (b: Bid) => {
    const { error: err1 } = await supabase.from('bids').update({
      counter_status: 'accepted',
      amount: b.counter_amount,
      status: 'pending',
    }).eq('id', b.id);
    if (err1) { setToast({ type: 'error', msg: err1.message }); return; }

    const price = Number(b.counter_amount) || Number(b.amount) || 0;
    const commissionRate = 0.10;
    const commissionAmount = Math.round(price * commissionRate * 100) / 100;
    const payout = Math.round((price - commissionAmount) * 100) / 100;

    await supabase.from('deliveries').update({
      status: 'assigned',
      driver_id: b.driver_id,
      accepted_bid: b.counter_amount,
      assigned_at: new Date().toISOString(),
    }).eq('id', b.delivery_id);

    const { data: existingPayment } = await supabase.from('payments')
      .select('id').eq('delivery_id', b.delivery_id).maybeSingle();
    if (existingPayment) {
      await supabase.from('payments').update({
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: payout,
        driver_id: b.driver_id,
      }).eq('id', existingPayment.id);
    } else {
      await supabase.from('payments').insert({
        delivery_id: b.delivery_id,
        shipper_id: b.delivery?.shipper_id || null,
        driver_id: b.driver_id,
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: payout,
        status: 'pending',
      });
    }

    await supabase.from('tracking_events').insert({
      delivery_id: b.delivery_id,
      status: 'assigned',
      notes: 'Counter offer accepted by driver',
    });

    if (b.delivery?.shipper_id) {
      await supabase.from('notifications').insert({
        recipient_id: b.delivery.shipper_id,
        channel: 'email',
        recipient_contact: '',
        subject: 'Counter Offer Accepted — Payment Required',
        body: `The driver has accepted your counter offer of ${price.toFixed(2)} for ${b.delivery?.pickup_name || 'delivery'} → ${b.delivery?.delivery_name || ''}. Please visit Payments to complete the transaction.`,
        related_type: 'payment',
        related_id: b.delivery_id,
        status: 'sent',
      });
    }

    setToast({ type: 'success', msg: 'Counter offer accepted! Shipper has been notified to send payment.' });
    load();
  };

  const rejectCounter = async (b: Bid) => {
    const { error: err1 } = await supabase.from('bids').update({
      counter_status: 'rejected',
    }).eq('id', b.id);
    if (err1) { setToast({ type: 'error', msg: err1.message }); return; }
    setToast({ type: 'success', msg: 'Counter offer rejected' });
    load();
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;
  if (error) return <div className="card p-12 text-center"><AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" /><p className="text-red-600 font-medium">{error}</p><button onClick={load} className="btn-secondary mt-4">Retry</button></div>;

  const active = deliveries.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status));
  const completed = deliveries.filter((d) => d.status === 'delivered' || d.status === 'cancelled');

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}
      {isAdmin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">My Loads</h1>
      <p className="text-slate-500 mb-6">All your assigned deliveries and bid history</p>

      <div className="flex gap-1.5 mb-4">
        {(['active', 'completed', 'bids'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
            {f === 'bids' ? `My Bids (${bids.length})` : f === 'active' ? `Active (${active.length})` : `Completed (${completed.length})`}
          </button>
        ))}
      </div>

      {filter === 'active' && (
        active.length === 0 ? <div className="card p-12 text-center"><Truck className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No active deliveries</p></div> :
        <div className="space-y-4">
          {active.map((d) => {
            const sc = statusConfig(d.status);
            const pc = priorityConfig(d.priority);
            return (
              <div key={d.id} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${pc.color}`}>{pc.label}</span>
                    <span className={`badge ${sc.color}`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot} animate-pulse`} /> {sc.label}</span>
                  </div>
                  <span className="font-bold text-slate-900">
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
                    ) : formatMoney(calcDriverPayout(d.calculated_price || d.max_bid_amount))}
                  </span>
                </div>
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-primary-600 uppercase">Pickup</div>
                    <div className="font-medium text-slate-900 text-sm">{d.pickup_name}</div>
                    <div className="text-xs text-slate-500">{d.pickup_address}, {d.pickup_city}, {d.pickup_state}</div>
                    <div className="text-xs text-slate-400">{d.pickup_contact}</div>
                  </div>
                  <ArrowRight className="w-5 h-5 text-slate-300 shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-emerald-600 uppercase">Drop-off</div>
                    <div className="font-medium text-slate-900 text-sm">{d.delivery_name}</div>
                    <div className="text-xs text-slate-500">{d.delivery_address}, {d.delivery_city}, {d.delivery_state}</div>
                    <div className="text-xs text-slate-400">{d.delivery_contact}</div>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="text-xs text-slate-500">{d.package_type.replace('_', ' ')} · {d.weight_lbs} lbs · <span className="capitalize">{d.temperature_control}</span></div>
                  {dispatchOrders[d.id] && onNavigate && (
                    <button onClick={() => onNavigate('dispatch-orders')} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all">
                      <ClipboardList className="w-3.5 h-3.5" /> View Dispatch Order
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filter === 'completed' && (
        completed.length === 0 ? <div className="card p-12 text-center"><CheckCircle2 className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No completed deliveries yet</p></div> :
        <div className="card divide-y divide-slate-100">
          {completed.map((d) => {
            const sc = statusConfig(d.status);
            return (
              <div key={d.id} className="p-4 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                  <div className="text-xs text-slate-500">{d.pickup_city} → {d.delivery_city} · {formatDate(d.delivered_time || d.created_at)}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
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
                    ) : formatMoney(calcDriverPayout(d.calculated_price || d.max_bid_amount))}
                  </span>
                  <span className={`badge ${sc.color}`}>{sc.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {filter === 'bids' && (
        bids.length === 0 ? <div className="card p-12 text-center"><Gavel className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No bids placed yet</p></div> :
        <div className="space-y-3">
          {bids.map((b) => {
            const sc = b.status === 'pending' ? { color: 'bg-amber-100 text-amber-700', label: 'Pending' } : b.status === 'accepted' ? { color: 'bg-emerald-100 text-emerald-700', label: 'Accepted' } : { color: 'bg-red-100 text-red-700', label: 'Rejected' };
            return (
              <div key={b.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{b.delivery?.pickup_name} → {b.delivery?.delivery_name}</div>
                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-3">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {b.eta_minutes} min</span>
                      <span className="font-semibold text-slate-700">
                        {isAdmin ? (
                          <AdminPriceEdit
                            value={Number(b.amount)}
                            table="bids"
                            id={b.id}
                            field="amount"
                            onSave={async (num) => {
                              const { error } = await supabase.from('bids').update({ amount: num }).eq('id', b.id);
                              if (error) throw error;
                              load();
                            }}
                          />
                        ) : formatMoney(calcDriverPayout(b.amount))}
                      </span>
                      {b.message && <span className="text-slate-400 truncate">"{b.message}"</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge ${sc.color}`}>{sc.label}</span>
                    <span className="text-xs text-slate-400">{timeAgo(b.created_at)}</span>
                  </div>
                </div>
                {b.counter_status === 'pending' && (
                  <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-100">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <div className="text-xs font-semibold text-blue-700 uppercase">Shipper Counter Offer</div>
                        <div className="text-lg font-bold text-slate-900">{formatMoney(calcDriverPayout(b.counter_amount))} <span className="text-xs font-normal text-slate-500">(after 10% fee)</span></div>
                        {b.counter_message && <div className="text-xs text-slate-600 mt-0.5">"{b.counter_message}"</div>}
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => rejectCounter(b)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-all"><Ban className="w-3.5 h-3.5" /> Reject</button>
                        <button onClick={() => acceptCounter(b)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all"><Check className="w-3.5 h-3.5" /> Accept</button>
                      </div>
                    </div>
                  </div>
                )}
                {b.counter_status === 'accepted' && (
                  <div className="mt-2 text-xs text-emerald-600 font-medium">Counter offer of {formatMoney(calcDriverPayout(b.counter_amount))} accepted (after 10% fee) — waiting for shipper</div>
                )}
                {b.counter_status === 'rejected' && (
                  <div className="mt-2 text-xs text-red-500 font-medium">Counter offer rejected</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
