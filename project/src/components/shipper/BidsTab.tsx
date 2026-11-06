import { useState, useEffect, useCallback } from 'react';
import { Star, Clock, Gavel, Ban, Check, ArrowLeftRight, DollarSign, CreditCard } from 'lucide-react';
import { supabase, type Delivery, type Bid, type Payment } from '../../lib/supabase';
import { statusConfig, formatMoney } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import type { ShipperTab } from './shared';
import { AdminPriceEdit } from '../AdminPriceEdit';
import { AdminScopePicker } from '../AdminScopePicker';

export function BidsTab({ onNavigate }: { onNavigate?: (t: ShipperTab) => void }) {
  const { user, isAdmin } = useAuth();
  const [scopeShipperId, setScopeShipperId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [bids, setBids] = useState<Record<string, Bid[]>>({});
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [counteringBid, setCounteringBid] = useState<Bid | null>(null);
  const [payments, setPayments] = useState<Record<string, Payment>>({});

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const shipperFilter = isAdmin ? scopeShipperId : user?.id;
    let query = supabase.from('deliveries').select('*').in('status', ['posted', 'assigned']).order('created_at', { ascending: false });
    if (shipperFilter) query = query.eq('shipper_id', shipperFilter);
    const { data: dels } = await query;
    const deliveriesData = (dels as Delivery[]) || [];
    setDeliveries(deliveriesData);
    if (deliveriesData.length > 0) {
      const ids = deliveriesData.map((d) => d.id);
      const { data: bidsData } = await supabase.from('bids').select('*, driver:profiles!bids_driver_id_fkey(*)').in('delivery_id', ids).order('created_at', { ascending: false });
      const bidsByDelivery: Record<string, Bid[]> = {};
      (bidsData as Bid[] || []).forEach((b) => {
        if (!bidsByDelivery[b.delivery_id]) bidsByDelivery[b.delivery_id] = [];
        bidsByDelivery[b.delivery_id].push(b);
      });
      setBids(bidsByDelivery);
    } else {
      setBids({});
    }
    if (deliveriesData.length > 0) {
      const ids = deliveriesData.map((d) => d.id);
      const { data: payData } = await supabase.from('payments').select('*').in('delivery_id', ids);
      const payByDelivery: Record<string, Payment> = {};
      (payData as Payment[] || []).forEach((p) => { payByDelivery[p.delivery_id] = p; });
      setPayments(payByDelivery);
    } else {
      setPayments({});
    }
    setLoading(false);
  }, [user?.id, isAdmin, scopeShipperId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    const channel = supabase.channel('bids-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bids' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, load]);

  const acceptBid = async (bid: Bid) => {
    const { error } = await supabase.from('deliveries').update({
      status: 'assigned', driver_id: bid.driver_id, accepted_bid: bid.amount,
      assigned_at: new Date().toISOString(),
    }).eq('id', bid.delivery_id);
    if (error) { setToast({ type: 'error', msg: error.message }); return; }
    await supabase.from('bids').update({ status: 'accepted' }).eq('id', bid.id);
    await supabase.from('bids').update({ status: 'rejected' }).neq('id', bid.id).eq('delivery_id', bid.delivery_id);

    const { data: delivery } = await supabase.from('deliveries')
      .select('calculated_price, max_bid_amount, shipper_id').eq('id', bid.delivery_id).maybeSingle();
    const price = Number(bid.amount) || Number(delivery?.calculated_price) || Number(delivery?.max_bid_amount) || 0;
    const commissionRate = 0.10;
    const commissionAmount = Math.round(price * commissionRate * 100) / 100;
    const driverPayout = Math.round((price - commissionAmount) * 100) / 100;

    const { data: existingPayment } = await supabase.from('payments')
      .select('id').eq('delivery_id', bid.delivery_id).maybeSingle();
    if (existingPayment) {
      await supabase.from('payments').update({
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: driverPayout,
        driver_id: bid.driver_id,
      }).eq('id', existingPayment.id);
    } else {
      await supabase.from('payments').insert({
        delivery_id: bid.delivery_id,
        shipper_id: delivery?.shipper_id || user?.id,
        driver_id: bid.driver_id,
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: driverPayout,
        status: 'pending',
      });
    }

    await supabase.from('tracking_events').insert({ delivery_id: bid.delivery_id, status: 'assigned', notes: 'Bid accepted by shipper' });
    setToast({ type: 'success', msg: 'Bid accepted! A payment has been created. Click Pay Now to complete the transaction.' });
    load();
  };

  const rejectBid = async (bid: Bid) => {
    const { error } = await supabase.from('bids').update({ status: 'rejected' }).eq('id', bid.id);
    if (error) { setToast({ type: 'error', msg: error.message }); return; }
    setToast({ type: 'success', msg: 'Bid rejected' });
    load();
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}
      {isAdmin && <AdminScopePicker role="shipper" scopeUserId={scopeShipperId} onScopeChange={setScopeShipperId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Bids</h1>
      <p className="text-slate-500 mb-6">Compare and accept bids from drivers</p>

      {deliveries.length === 0 ? <div className="card p-12 text-center"><Gavel className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No loads with bids yet</p></div> : (
        <div className="space-y-6">
          {deliveries.map((d) => {
            const deliveryBids = bids[d.id] || [];
            const sc = statusConfig(d.status);
            return (
              <div key={d.id}>
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold text-slate-900 text-sm">{d.pickup_name} → {d.delivery_name}</span>
                  <span className={`badge ${sc.color}`}>{sc.label}</span>
                  <span className="text-sm text-slate-500">
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
                </div>
                {deliveryBids.length === 0 ? (
                  <div className="card p-6 text-center text-sm text-slate-400">No bids yet</div>
                ) : (
                  <div className="space-y-2">
                    {deliveryBids.map((b) => (
                      <div key={b.id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {b.driver && <span className="font-medium text-slate-900">{b.driver.full_name}</span>}
                            {b.driver && <span className="flex items-center gap-0.5 text-xs"><Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {Number(b.driver.rating).toFixed(1)}</span>}
                            {b.driver?.vehicle_type && <span className="text-xs text-slate-500">{b.driver.vehicle_type}</span>}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> ETA {b.eta_minutes} min</span>
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
                              ) : formatMoney(b.amount)}
                            </span>
                            {b.message && <span className="text-slate-400">"{b.message}"</span>}
                          </div>
                        </div>
                        {b.status === 'pending' ? (
                          <div className="flex gap-2 shrink-0">
                            <button onClick={() => rejectBid(b)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-all"><Ban className="w-3.5 h-3.5" /> Reject</button>
                            <button onClick={() => setCounteringBid(b)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all"><ArrowLeftRight className="w-3.5 h-3.5" /> Counter</button>
                            <button onClick={() => acceptBid(b)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all"><Check className="w-3.5 h-3.5" /> Accept</button>
                          </div>
                        ) : b.counter_status === 'pending' ? (
                          <span className="badge bg-blue-100 text-blue-700 shrink-0">Counter: {formatMoney(b.counter_amount)}</span>
                        ) : b.counter_status === 'accepted' ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="badge bg-emerald-100 text-emerald-700">Counter Accepted</span>
                            {payments[b.delivery_id] && payments[b.delivery_id].status === 'pending' ? (
                              <button onClick={() => onNavigate?.('payments')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-all">
                                <CreditCard className="w-3.5 h-3.5" /> Pay Now
                              </button>
                            ) : payments[b.delivery_id] ? (
                              <span className={`badge ${payments[b.delivery_id].status === 'paid' || payments[b.delivery_id].status === 'released' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{payments[b.delivery_id].status}</span>
                            ) : null}
                          </div>
                        ) : b.counter_status === 'rejected' ? (
                          <span className="badge bg-red-100 text-red-700 shrink-0">Counter Rejected</span>
                        ) : b.status === 'accepted' ? (
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="badge bg-emerald-100 text-emerald-700">Accepted</span>
                            {payments[b.delivery_id] && payments[b.delivery_id].status === 'pending' ? (
                              <button onClick={() => onNavigate?.('payments')} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary-600 text-white text-xs font-semibold hover:bg-primary-700 transition-all">
                                <CreditCard className="w-3.5 h-3.5" /> Pay Now
                              </button>
                            ) : payments[b.delivery_id] ? (
                              <span className={`badge ${payments[b.delivery_id].status === 'paid' || payments[b.delivery_id].status === 'released' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{payments[b.delivery_id].status}</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="badge bg-slate-100 text-slate-500 shrink-0">{b.status}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {counteringBid && <CounterBidModal bid={counteringBid} onClose={() => setCounteringBid(null)} onSubmitted={() => { setCounteringBid(null); setToast({ type: 'success', msg: 'Counter offer sent to driver' }); load(); }} />}
    </div>
  );
}

function CounterBidModal({ bid, onClose, onSubmitted }: { bid: Bid; onClose: () => void; onSubmitted: () => void }) {
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from('bids').update({
      counter_amount: parseFloat(amount) || 0,
      counter_status: 'pending',
      counter_message: message || null,
    }).eq('id', bid.id);
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    if (bid.driver_id) {
      await supabase.from('notifications').insert({
        recipient_id: bid.driver_id,
        channel: 'email',
        recipient_contact: '',
        subject: 'Counter Offer Received',
        body: `The shipper has sent a counter offer of ${(parseFloat(amount) || 0).toFixed(2)} for your bid on ${bid.delivery?.pickup_name || 'a delivery'} → ${bid.delivery?.delivery_name || ''}.`,
        related_type: 'bid',
        related_id: bid.id,
        status: 'sent',
      });
    }
    onSubmitted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative card max-w-md w-full p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><Ban className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Counter Offer</h2>
        <p className="text-sm text-slate-500 mb-4">Driver bid {formatMoney(bid.amount)} · Your counter offer</p>
        <div className="space-y-4">
          <div>
            <label className="label"><DollarSign className="w-3.5 h-3.5 inline mr-1" />Counter Amount</label>
            <input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={formatMoney(bid.amount)} />
          </div>
          <div>
            <label className="label">Message (optional)</label>
            <textarea className="input min-h-[60px] resize-none" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Explain your counter offer..." />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={submit} disabled={submitting || !amount} className="btn-primary w-full">{submitting ? 'Sending...' : 'Send Counter Offer'}</button>
        </div>
      </div>
    </div>
  );
}
