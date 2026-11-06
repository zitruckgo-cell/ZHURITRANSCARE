import { useState, useEffect, useCallback } from 'react';
import { DollarSign, TrendingUp, Search, FileText, FileCheck, CreditCard, RotateCcw, X, Pencil, Save, AlertCircle, RefreshCw } from 'lucide-react';
import { supabase, type Payment } from '../../lib/supabase';
import { formatMoney, formatDate } from '../../lib/utils';

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-blue-100 text-blue-700',
  released: 'bg-emerald-100 text-emerald-700',
  disputed: 'bg-red-100 text-red-700',
  refunded: 'bg-slate-200 text-slate-600',
};

const STATUS_OPTIONS: Payment['status'][] = ['pending', 'paid', 'released', 'disputed', 'refunded'];

type DetailMode = 'view' | 'edit';

export function AdminPaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundConfirm, setRefundConfirm] = useState<Payment | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [selected, setSelected] = useState<Payment | null>(null);
  const [detailMode, setDetailMode] = useState<DetailMode>('view');
  const [editForm, setEditForm] = useState<{ gross_amount: number; commission_rate: number; status: Payment['status'] }>({ gross_amount: 0, commission_rate: 0.1, status: 'pending' });
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('payments').select('*, delivery:deliveries(*), shipper:profiles!payments_shipper_id_fkey(*), driver:profiles!payments_driver_id_fkey(*)').order('created_at', { ascending: false });
    setPayments((data as Payment[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRefund = async (payment: Payment) => {
    setRefunding(payment.id);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/stripe-refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ payment_id: payment.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setToast({ type: 'error', msg: data.error || 'Failed to process refund' });
      } else {
        const msg = data.transfer_reversed
          ? `Refund processed. Shipper refunded ${formatMoney(Number(payment.gross_amount))} and driver transfer of ${formatMoney(Number(payment.driver_payout))} reversed.`
          : data.reversal_error
            ? `Refund processed but driver transfer reversal failed: ${data.reversal_error}`
            : 'Refund processed successfully';
        setToast({ type: data.reversal_error ? 'error' : 'success', msg });
        load();
      }
    } catch {
      setToast({ type: 'error', msg: 'Network error. Please try again.' });
    }
    setRefunding(null);
    setRefundConfirm(null);
  };

  const handleManualRefund = async (payment: Payment) => {
    setRefunding(payment.id);
    try {
      const { error } = await supabase
        .from('payments')
        .update({ status: 'refunded' })
        .eq('id', payment.id);
      if (error) {
        setToast({ type: 'error', msg: error.message });
      } else {
        setToast({ type: 'success', msg: 'Payment marked as refunded' });
        load();
      }
    } catch {
      setToast({ type: 'error', msg: 'Failed to update payment status' });
    }
    setRefunding(null);
    setRefundConfirm(null);
  };

  const openDetail = (payment: Payment) => {
    setSelected(payment);
    setDetailMode('view');
  };

  const startEdit = (payment: Payment) => {
    setEditForm({
      gross_amount: Number(payment.gross_amount),
      commission_rate: Number(payment.commission_rate),
      status: payment.status,
    });
    setDetailMode('edit');
  };

  const saveEdit = async () => {
    if (!selected) return;
    const gross = Number(editForm.gross_amount);
    const rate = Number(editForm.commission_rate);
    if (isNaN(gross) || gross < 0) { setToast({ type: 'error', msg: 'Invalid gross amount' }); return; }
    if (isNaN(rate) || rate < 0 || rate > 1) { setToast({ type: 'error', msg: 'Commission rate must be between 0 and 1' }); return; }

    const commission = Math.round(gross * rate * 100) / 100;
    const payout = Math.round((gross - commission) * 100) / 100;

    setSaving(true);
    const { error } = await supabase.from('payments').update({
      gross_amount: gross,
      commission_rate: rate,
      commission_amount: commission,
      driver_payout: payout,
      status: editForm.status,
      stripe_checkout_session_id: null,
    }).eq('id', selected.id);
    setSaving(false);

    if (error) {
      setToast({ type: 'error', msg: error.message });
    } else {
      setToast({ type: 'success', msg: 'Payment updated successfully' });
      load();
      setDetailMode('view');
      setSelected({ ...selected, gross_amount: gross, commission_rate: rate, commission_amount: commission, driver_payout: payout, status: editForm.status });
    }
  };

  const totalRevenue = payments.filter((p) => p.status === 'paid' || p.status === 'released').reduce((sum, p) => sum + Number(p.commission_amount), 0);
  const totalPayouts = payments.filter((p) => p.status === 'released').reduce((sum, p) => sum + Number(p.driver_payout), 0);
  const totalGross = payments.filter((p) => p.status === 'paid' || p.status === 'released').reduce((sum, p) => sum + Number(p.gross_amount), 0);
  const pendingCount = payments.filter((p) => p.status === 'pending').length;
  const refundedTotal = payments.filter((p) => p.status === 'refunded').reduce((sum, p) => sum + Number(p.gross_amount), 0);

  const filtered = payments.filter((p) => {
    const q = search.toLowerCase();
    return !search || p.delivery?.pickup_city?.toLowerCase().includes(q) || p.shipper?.full_name?.toLowerCase().includes(q) || (p.delivery?.bol_number?.toLowerCase().includes(q) ?? false) || (p.delivery?.pod_number?.toLowerCase().includes(q) ?? false) || p.status.toLowerCase().includes(q);
  });

  const canStripeRefund = (p: Payment) => (p.status === 'paid' || p.status === 'released') && (p.stripe_charge_id || p.stripe_payment_intent_id);
  const canManualRefund = (p: Payment) => (p.status === 'paid' || p.status === 'released') && !p.stripe_charge_id && !p.stripe_payment_intent_id;
  const canSyncFromStripe = (p: Payment) => p.status === 'pending' && !!p.stripe_checkout_session_id;

  const handleSyncFromStripe = async (payment: Payment) => {
    setSyncing(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${supabaseUrl}/functions/v1/sync-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ payment_id: payment.id }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setToast({ type: 'error', msg: data.error || 'Failed to sync payment from Stripe' });
      } else {
        setToast({ type: 'success', msg: 'Payment synced from Stripe successfully' });
        load();
        setSelected(null);
      }
    } catch {
      setToast({ type: 'error', msg: 'Network error. Please try again.' });
    }
    setSyncing(false);
  };

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <DollarSign className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.msg}
        </div>
      )}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Payments</h1>
      <p className="text-slate-500 mb-6">View, edit, and refund payment transactions</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary-600" /></div>
            <div><div className="text-2xl font-bold text-slate-900">{formatMoney(totalGross)}</div><div className="text-xs text-slate-500">Total Gross</div></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><TrendingUp className="w-5 h-5 text-emerald-600" /></div>
            <div><div className="text-2xl font-bold text-slate-900">{formatMoney(totalRevenue)}</div><div className="text-xs text-slate-500">Platform Revenue</div></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><DollarSign className="w-5 h-5 text-amber-600" /></div>
            <div><div className="text-2xl font-bold text-slate-900">{formatMoney(totalPayouts)}</div><div className="text-xs text-slate-500">Driver Payouts</div></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center"><CreditCard className="w-5 h-5 text-blue-600" /></div>
            <div><div className="text-2xl font-bold text-slate-900">{pendingCount}</div><div className="text-xs text-slate-500">Pending</div></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center"><RotateCcw className="w-5 h-5 text-slate-500" /></div>
            <div><div className="text-2xl font-bold text-slate-900">{formatMoney(refundedTotal)}</div><div className="text-xs text-slate-500">Refunded</div></div>
          </div>
        </div>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input pl-10" placeholder="Search by shipper, city, BOL, POD, or status..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No payments yet</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <div key={p.id} className="card p-5 hover:shadow-md transition-all cursor-pointer" onClick={() => openDetail(p)}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-slate-900">{p.delivery?.pickup_city} → {p.delivery?.delivery_city}</span>
                    <span className={`badge ${STATUS_BADGE[p.status] || 'bg-slate-100 text-slate-600'}`}>{p.status}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {p.delivery?.bol_number && <span className="text-xs font-mono text-slate-400 flex items-center gap-0.5"><FileText className="w-3 h-3" />{p.delivery.bol_number}</span>}
                    {p.delivery?.pod_number && <span className="text-xs font-mono text-emerald-600 flex items-center gap-0.5"><FileCheck className="w-3 h-3" />{p.delivery.pod_number}</span>}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">
                    Shipper: {p.shipper?.full_name} · Driver: {p.driver?.full_name}
                  </div>
                  <div className="text-xs text-slate-400">{formatDate(p.created_at)}</div>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <div className="font-bold text-slate-900">{formatMoney(Number(p.gross_amount))}</div>
                    <div className="text-xs text-emerald-600">Driver: {formatMoney(Number(p.driver_payout))}</div>
                    <div className="text-xs text-primary-600">Platform: {formatMoney(Number(p.commission_amount))}</div>
                  </div>
                  <div className="flex flex-col gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {(canStripeRefund(p) || canManualRefund(p)) && (
                      <button
                        onClick={() => setRefundConfirm(p)}
                        disabled={refunding === p.id}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-all"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {refunding === p.id ? 'Processing...' : canManualRefund(p) ? 'Mark Refunded' : 'Refund'}
                      </button>
                    )}
                    <button
                      onClick={() => openDetail(p)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-all"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Details
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Refund Confirmation Modal */}
      {refundConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setRefundConfirm(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-md w-full p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setRefundConfirm(null)} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
              <RotateCcw className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">{canManualRefund(refundConfirm) ? 'Mark as Refunded' : 'Process Refund'}</h3>
            <p className="text-sm text-slate-600 mb-4">
              {canManualRefund(refundConfirm) ? (
                <>This payment has no Stripe charge, so it will be marked as refunded manually. The amount is <span className="font-bold text-slate-900">{formatMoney(Number(refundConfirm.gross_amount))}</span> for {refundConfirm.shipper?.full_name}.</>
              ) : (
                <>You are about to refund <span className="font-bold text-slate-900">{formatMoney(Number(refundConfirm.gross_amount))}</span> to {refundConfirm.shipper?.full_name} for the delivery from {refundConfirm.delivery?.pickup_city} to {refundConfirm.delivery?.delivery_city}.</>
              )}
            </p>
            {refundConfirm.status === 'released' && !canManualRefund(refundConfirm) && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 mb-4">
                <div className="text-xs font-semibold text-amber-800 mb-1">Driver Funds Will Be Reversed</div>
                <p className="text-xs text-amber-700">This payment has been released to the driver ({refundConfirm.driver?.full_name}). The refund will also reverse the driver's transfer of <span className="font-semibold">{formatMoney(Number(refundConfirm.driver_payout))}</span> from their Stripe Connect account. If the driver has already withdrawn the funds, Stripe will attempt to recover the balance from future payouts.</p>
              </div>
            )}
            <p className="text-xs text-slate-400 mb-6">This action cannot be undone. The payment status will be updated to "refunded".</p>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setRefundConfirm(null)} className="btn-secondary">Cancel</button>
              <button
                onClick={() => canManualRefund(refundConfirm) ? handleManualRefund(refundConfirm) : handleRefund(refundConfirm)}
                disabled={refunding === refundConfirm.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-all disabled:opacity-50"
              >
                <RotateCcw className="w-4 h-4" />
                {refunding === refundConfirm.id ? 'Processing...' : canManualRefund(refundConfirm) ? 'Confirm' : 'Confirm Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment Detail / Edit Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => { setSelected(null); setDetailMode('view'); }}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">{detailMode === 'edit' ? 'Edit Payment' : 'Payment Details'}</h3>
              <div className="flex items-center gap-1">
                {detailMode === 'view' && (
                  <button onClick={() => startEdit(selected)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary-600" title="Edit payment">
                    <Pencil className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => { setSelected(null); setDetailMode('view'); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {detailMode === 'view' ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`badge ${STATUS_BADGE[selected.status] || 'bg-slate-100 text-slate-600'}`}>{selected.status}</span>
                  <span className="text-xs text-slate-400 ml-auto">{formatDate(selected.created_at)}</span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-1">Gross</div>
                    <div className="font-bold text-slate-900">{formatMoney(Number(selected.gross_amount))}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-primary-50 border border-primary-100">
                    <div className="text-xs font-semibold text-primary-400 uppercase mb-1">Commission</div>
                    <div className="font-bold text-primary-700">{formatMoney(Number(selected.commission_amount))}</div>
                    <div className="text-xs text-primary-500">{(Number(selected.commission_rate) * 100).toFixed(1)}%</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100">
                    <div className="text-xs font-semibold text-emerald-500 uppercase mb-1">Driver Payout</div>
                    <div className="font-bold text-emerald-700">{formatMoney(Number(selected.driver_payout))}</div>
                  </div>
                </div>

                <hr className="border-slate-100" />

                <div><span className="text-slate-500">Shipper:</span> <span className="font-medium">{selected.shipper?.full_name}</span></div>
                <div><span className="text-slate-500">Driver:</span> <span className="font-medium">{selected.driver?.full_name}</span></div>
                <div><span className="text-slate-500">Delivery:</span> <span className="font-medium">{selected.delivery?.pickup_city} → {selected.delivery?.delivery_city}</span></div>
                {selected.delivery?.bol_number && <div><span className="text-slate-500">BOL:</span> <span className="font-mono text-sm">{selected.delivery.bol_number}</span></div>}

                <hr className="border-slate-100" />

                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Stripe Details</div>
                  {selected.stripe_payment_intent_id && <div className="text-xs text-slate-600 flex items-center gap-1.5"><CreditCard className="w-3 h-3" /> PI: <span className="font-mono">{selected.stripe_payment_intent_id.slice(0, 25)}...</span></div>}
                  {selected.stripe_charge_id && <div className="text-xs text-slate-600 flex items-center gap-1.5"><CreditCard className="w-3 h-3" /> Charge: <span className="font-mono">{selected.stripe_charge_id.slice(0, 25)}...</span></div>}
                  {selected.stripe_refund_id && <div className="text-xs text-slate-600 flex items-center gap-1.5"><RotateCcw className="w-3 h-3" /> Refund: <span className="font-mono">{selected.stripe_refund_id.slice(0, 25)}...</span></div>}
                  {selected.stripe_transfer_id && <div className="text-xs text-slate-600 flex items-center gap-1.5"><CreditCard className="w-3 h-3" /> Transfer: <span className="font-mono">{selected.stripe_transfer_id.slice(0, 25)}...</span></div>}
                  {!selected.stripe_payment_intent_id && !selected.stripe_charge_id && !selected.stripe_refund_id && !selected.stripe_transfer_id && (
                    <div className="text-xs text-slate-400">No Stripe transaction records</div>
                  )}
                </div>

                {selected.paid_at && <div className="text-xs text-slate-400">Paid at: {formatDate(selected.paid_at)}</div>}
                {selected.released_at && <div className="text-xs text-slate-400">Released at: {formatDate(selected.released_at)}</div>}

                <hr className="border-slate-100" />

                <div className="flex flex-wrap gap-2 pt-1">
                  {canSyncFromStripe(selected) && (
                    <button
                      onClick={() => handleSyncFromStripe(selected)}
                      disabled={syncing}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} />
                      {syncing ? 'Syncing...' : 'Sync from Stripe'}
                    </button>
                  )}
                  {(canStripeRefund(selected) || canManualRefund(selected)) && (
                    <button
                      onClick={() => setRefundConfirm(selected)}
                      disabled={refunding === selected.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-all"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      {refunding === selected.id ? 'Processing...' : canManualRefund(selected) ? 'Mark Refunded' : 'Refund'}
                    </button>
                  )}
                  <button onClick={() => startEdit(selected)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary-50 text-primary-600 text-xs font-semibold hover:bg-primary-100 transition-all">
                    <Pencil className="w-3.5 h-3.5" /> Edit Payment
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="label">Gross Amount ($)</label>
                  <input type="number" min="0" step="0.01" className="input" value={editForm.gross_amount} onChange={(e) => setEditForm({ ...editForm, gross_amount: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="label">Commission Rate (0.10 = 10%)</label>
                  <input type="number" min="0" max="1" step="0.01" className="input" value={editForm.commission_rate} onChange={(e) => setEditForm({ ...editForm, commission_rate: parseFloat(e.target.value) || 0 })} />
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm space-y-1">
                  <div className="flex justify-between"><span className="text-slate-500">Commission Amount:</span> <span className="font-semibold text-primary-700">{formatMoney(Math.round(editForm.gross_amount * editForm.commission_rate * 100) / 100)}</span></div>
                  <div className="flex justify-between"><span className="text-slate-500">Driver Payout:</span> <span className="font-semibold text-emerald-700">{formatMoney(Math.round((editForm.gross_amount - editForm.gross_amount * editForm.commission_rate) * 100) / 100)}</span></div>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value as Payment['status'] })}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setDetailMode('view')} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={saveEdit} disabled={saving} className="btn-primary flex-1"><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
