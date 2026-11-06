import { useState, useEffect, useCallback } from 'react';
import { DollarSign, Clock, CheckCircle2, CreditCard, Loader2, BadgeCheck, AlertCircle } from 'lucide-react';
import { supabase, type Payment, type Profile } from '../../lib/supabase';
import { formatMoney, formatDate } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { AdminScopePicker } from '../AdminScopePicker';

export function PaymentsInvoices() {
  const { user, isAdmin } = useAuth();
  const [scopeShipperId, setScopeShipperId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'paid' | 'released' | 'disputed' | 'refunded'>('all');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const shipperFilter = isAdmin ? scopeShipperId : user?.id;
    let payQuery = supabase.from('payments').select('*, delivery:deliveries(*)').order('created_at', { ascending: false });
    if (shipperFilter) payQuery = payQuery.eq('shipper_id', shipperFilter);
    let profileQuery = supabase.from('profiles').select('*');
    if (shipperFilter) profileQuery = profileQuery.eq('id', shipperFilter);
    const profileRequest = profileQuery.maybeSingle();
    const [{ data: paymentsData }, { data: profileData }] = await Promise.all([
      payQuery,
      profileRequest,
    ]);
    setPayments((paymentsData as Payment[]) || []);
    setProfile(profileData as Profile | null);
    setLoading(false);
  }, [user?.id, isAdmin, scopeShipperId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id || isAdmin) return;
    const channel = supabase.channel('shipper-payments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payments', filter: `shipper_id=eq.${user.id}` }, () => load())
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payments', filter: `shipper_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, isAdmin, load]);

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
    } else if (paymentStatus === 'setup_success') {
      setToast({ type: 'success', msg: 'Payment method saved successfully!' });
      window.history.replaceState({}, '', window.location.pathname);
      load();
    } else if (paymentStatus === 'setup_cancelled') {
      setToast({ type: 'error', msg: 'Payment method setup was cancelled.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  const callCheckout = async (body: Record<string, unknown>) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch(`${supabaseUrl}/functions/v1/stripe-checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify(body),
    });
    return res;
  };

  const handlePay = async (paymentId: string) => {
    setPayingId(paymentId);
    try {
      const res = await callCheckout({ payment_id: paymentId });
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

  const handleSetupPayment = async () => {
    setSetupLoading(true);
    try {
      const res = await callCheckout({ action: 'setup' });
      const data = await res.json();
      if (!res.ok || data.error) {
        const errMsg = data.details?.message || data.details?.error?.message || data.error || 'Failed to start payment setup';
        setToast({ type: 'error', msg: errMsg });
      } else if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setToast({ type: 'error', msg: 'Network error. Please try again.' });
    }
    setSetupLoading(false);
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  const filtered = filter === 'all' ? payments : payments.filter((p) => p.status === filter);
  const totalSpent = payments.filter((p) => p.status === 'paid' || p.status === 'released').reduce((sum, p) => sum + Number(p.gross_amount), 0);
  const pendingTotal = payments.filter((p) => p.status === 'pending').reduce((sum, p) => sum + Number(p.gross_amount), 0);
  const completedTotal = payments.filter((p) => p.status === 'paid' || p.status === 'released').reduce((sum, p) => sum + Number(p.gross_amount), 0);
  const hasCard = !!(profile?.stripe_default_payment_method || profile?.stripe_customer_id);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      paid: 'bg-blue-100 text-blue-700',
      released: 'bg-emerald-100 text-emerald-700',
      disputed: 'bg-red-100 text-red-700',
      refunded: 'bg-slate-100 text-slate-600',
    };
    return map[status] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}

      <h1 className="text-2xl font-bold text-slate-900 mb-2">Payments & Invoices</h1>
      <p className="text-slate-500 mb-6">Pay for deliveries and manage your payment history</p>

      {isAdmin && <AdminScopePicker role="shipper" scopeUserId={scopeShipperId} onScopeChange={setScopeShipperId} />}

      {/* Payment method setup card */}
      <div className={`rounded-2xl border p-5 mb-6 flex items-center justify-between gap-4 flex-wrap ${hasCard ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${hasCard ? 'bg-emerald-100' : 'bg-amber-100'}`}>
            {hasCard ? <BadgeCheck className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-amber-600" />}
          </div>
          <div>
            <div className={`font-semibold text-sm ${hasCard ? 'text-emerald-900' : 'text-amber-900'}`}>
              {hasCard ? 'Payment method on file' : 'No payment method saved'}
            </div>
            <div className={`text-xs mt-0.5 ${hasCard ? 'text-emerald-700' : 'text-amber-700'}`}>
              {hasCard
                ? 'Your card is saved. You can pay instantly when a delivery is ready.'
                : 'Add a card to pay for deliveries quickly without re-entering details.'}
            </div>
          </div>
        </div>
        <button
          onClick={handleSetupPayment}
          disabled={setupLoading}
          className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm transition-all active:scale-95 disabled:opacity-60 shrink-0 ${hasCard ? 'bg-emerald-700 hover:bg-emerald-800 text-white' : 'bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-600/20'}`}
        >
          {setupLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
          {setupLoading ? 'Redirecting to Stripe...' : hasCard ? 'Update Payment Method' : 'Set Up Payment Method'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-50 flex items-center justify-center"><DollarSign className="w-5 h-5 text-primary-600" /></div>
            <div><div className="text-xl font-bold text-slate-900">{formatMoney(totalSpent)}</div><div className="text-xs text-slate-500">Total Spent</div></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><Clock className="w-5 h-5 text-amber-600" /></div>
            <div><div className="text-xl font-bold text-slate-900">{formatMoney(pendingTotal)}</div><div className="text-xs text-slate-500">Pending Payment</div></div>
          </div>
        </div>
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-600" /></div>
            <div><div className="text-xl font-bold text-slate-900">{formatMoney(completedTotal)}</div><div className="text-xs text-slate-500">Completed</div></div>
          </div>
        </div>
      </div>

      <div className="flex gap-1.5 mb-4 flex-wrap">
        {(['all', 'pending', 'paid', 'released', 'disputed', 'refunded'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-all ${filter === f ? 'bg-primary-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{f}</button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <DollarSign className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No payments found</p>
        </div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((p) => (
            <div key={p.id} className="p-4 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900 truncate">{p.delivery?.pickup_city} → {p.delivery?.delivery_city}</div>
                <div className="text-xs text-slate-400">{formatDate(p.created_at)} · {p.delivery?.package_type.replace('_', ' ')}</div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <div className="text-right">
                  <div className="font-bold text-slate-900">{formatMoney(p.gross_amount)}</div>
                  <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span>
                </div>
                {p.status === 'pending' && (
                  <button
                    onClick={() => handlePay(p.id)}
                    disabled={payingId === p.id}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-semibold text-sm hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-60 shrink-0 shadow-md shadow-emerald-600/20"
                  >
                    {payingId === p.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                    {payingId === p.id ? 'Redirecting...' : 'Pay Now'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
