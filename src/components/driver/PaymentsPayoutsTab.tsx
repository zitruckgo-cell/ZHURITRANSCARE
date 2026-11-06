import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  AlertCircle, CheckCircle2, Clock, CreditCard, ShieldCheck, Wallet,
  TrendingUp, DollarSign, ArrowDownRight, Zap, RefreshCw, ExternalLink,
  Loader2,
} from 'lucide-react';
import { supabase, type Payment, type Payout } from '../../lib/supabase';
import { formatMoney, formatDate } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { useToast, Toast } from './shared';

type StripeAccountStatus = {
  stripe_account_id: string | null;
  stripe_account_status: string;
  stripe_onboarding_complete: boolean;
  stripe_charges_enabled: boolean;
  stripe_payouts_enabled: boolean;
  stripe_requirements_status: string;
  stripe_payout_schedule?: string;
  requirements_currently_due?: string[];
  requirements_eventually_due?: string[];
  disabled_reason?: string | null;
  connect_not_enabled?: boolean;
};

type EarningsData = {
  available_earnings: number;
  pending_earnings: number;
  total_earnings: number;
  completed_trips: number;
  recent_payments: Payment[];
  payout_history: Payout[];
};

export function PaymentsPayoutsTab() {
  const { user, profile } = useAuth();
  const [accountStatus, setAccountStatus] = useState<StripeAccountStatus | null>(null);
  const [earnings, setEarnings] = useState<EarningsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stripeUrl, setStripeUrl] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const { toast, setToast } = useToast();
  const loadingRef = useRef(false);

  const apiUrl = useMemo(() => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-connect`, []);
  const headers = useMemo(() => ({
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }), []);

  const invokeStripeConnect = useCallback(async (body: { action: string; payout_type?: 'manual' | 'instant' }) => {
    const authRes = await supabase.auth.getSession();
    const accessToken = authRes.data.session?.access_token;
    if (!accessToken) throw new Error('Not authenticated');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    let res: Response;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        headers: { ...headers, Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      if (fetchErr instanceof DOMException && fetchErr.name === 'AbortError') {
        throw new Error('The request timed out after 30 seconds. The payment service may be slow or unavailable. Please try again.');
      }
      throw new Error('Could not reach the payment service. Please check your connection and try again.');
    }
    clearTimeout(timeout);
    const text = await res.text().catch(() => '');
    let data: Record<string, unknown> = {};
    try { data = JSON.parse(text) as Record<string, unknown>; } catch { if (text) throw new Error(text.slice(0, 300)); }
    if (!res.ok) {
      const errMsg = (data.error as string) || (data.detail as string) || (data.stripe_error as string) || `HTTP ${res.status}: ${text.slice(0, 200)}`;
      throw new Error(errMsg);
    }
    return data;
  }, [apiUrl, headers]);

  const stripeAccountId = profile?.stripe_account_id ?? null;

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setError(null);
    try {
      if (!user?.id) throw new Error('Not authenticated');

      const profileStatus: StripeAccountStatus = {
        stripe_account_id: profile?.stripe_account_id ?? null,
        stripe_account_status: profile?.stripe_account_status ?? 'not_set_up',
        stripe_onboarding_complete: profile?.stripe_onboarding_complete ?? false,
        stripe_charges_enabled: profile?.stripe_charges_enabled ?? false,
        stripe_payouts_enabled: profile?.stripe_payouts_enabled ?? false,
        stripe_requirements_status: profile?.stripe_requirements_status ?? 'pending',
        stripe_payout_schedule: profile?.stripe_payout_schedule,
      };

      if (!profileStatus.stripe_account_id) {
        setAccountStatus(profileStatus);
        setEarnings(null);
        return;
      }

      const statusData = await invokeStripeConnect({ action: 'status' });
      setAccountStatus(statusData as unknown as StripeAccountStatus);

      if (statusData.stripe_account_status === 'active') {
        try {
          const earningsData = await invokeStripeConnect({ action: 'earnings' });
          setEarnings(earningsData as unknown as EarningsData);
        } catch (earningsError) {
          console.warn('Earnings load failed (non-blocking):', earningsError);
          setEarnings(null);
        }
      } else {
        setEarnings(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load payment data');
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, stripeAccountId, invokeStripeConnect]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const stripeReturn = params.get('stripe');
    if (stripeReturn === 'return') {
      setToast({ type: 'success', msg: 'Welcome back! Verifying your payment account status...' });
      window.history.replaceState({}, '', window.location.pathname);
      load();
    } else if (stripeReturn === 'refresh') {
      setToast({ type: 'error', msg: 'Your payment setup was interrupted. Click "Resume Payment Setup" to continue.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [load]);

  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibilityChange = () => {
      if (document.hidden) {
        hiddenAt = Date.now();
      } else if (hiddenAt !== null && Date.now() - hiddenAt > 1000) {
        hiddenAt = null;
        load();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel('driver-payments-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments', filter: `driver_id=eq.${user.id}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, load]);

  const openLoadingPopup = () => {
    const html = '<html><head><title>Opening Stripe...</title><style>*{margin:0;padding:0;box-sizing:border-box}body{display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui,-apple-system,sans-serif;color:#64748b;background:#f8fafc}.wrap{text-align:center}.spinner{width:40px;height:40px;border:3px solid #e2e8f0;border-top-color:#6366f1;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px}@keyframes spin{to{transform:rotate(360deg)}}</style></head><body><div class="wrap"><div class="spinner"></div><p>Connecting to Stripe, please wait...</p></div></body></html>';
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);
    const popup = window.open(blobUrl, '_blank');
    if (popup) setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
    return popup;
  };

  const startOnboarding = async () => {
    setActionLoading(true);
    setActionError(null);
    const popup = openLoadingPopup();
    try {
      const data = await invokeStripeConnect({ action: 'create_account' });
      const url = data.url as string | undefined;
      if (url) {
        if (popup) {
          popup.location.href = url;
          setToast({ type: 'success', msg: 'Stripe payment setup opened in a new tab. Complete the form there, then come back here.' });
        } else {
          setStripeUrl(url);
        }
      } else {
        if (popup) popup.close();
        throw new Error('No onboarding URL returned');
      }
    } catch (e) {
      if (popup) popup.close();
      const msg = e instanceof Error ? e.message : 'The payment setup service could not be reached. Please refresh and try again.';
      setActionError(msg);
      setToast({ type: 'error', msg });
    } finally {
      setActionLoading(false);
    }
  };

  const openLoginLink = async () => {
    setActionLoading(true);
    setActionError(null);
    const popup = openLoadingPopup();
    try {
      const data = await invokeStripeConnect({ action: 'login_link' });
      const url = data.url as string | undefined;
      if (url) {
        if (popup) {
          popup.location.href = url;
          setToast({ type: 'success', msg: 'Stripe dashboard opened in a new tab.' });
        } else {
          setStripeUrl(url);
        }
      }
    } catch (e) {
      if (popup) popup.close();
      const msg = e instanceof Error ? e.message : 'Failed to open Stripe dashboard';
      setActionError(msg);
      setToast({ type: 'error', msg });
    } finally {
      setActionLoading(false);
    }
  };

  const requestPayout = async (payoutType: 'manual' | 'instant') => {
    setActionLoading(true);
    try {
      const data = await invokeStripeConnect({ action: 'request_payout', payout_type: payoutType });
      setToast({ type: 'success', msg: `Payout of ${formatMoney(data.amount as number)} ${payoutType === 'instant' ? '(instant)' : 'requested'} successfully` });
      await load();
    } catch (e) {
      setToast({ type: 'error', msg: e instanceof Error ? e.message : 'Failed to request payout' });
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return (
    <div>
      <Toast toast={toast} />
      <div className="text-center py-20 text-slate-400">Loading payment data...</div>
    </div>
  );
  if (error) return (
    <div>
      <Toast toast={toast} />
      <div className="card p-12 text-center">
        <AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" />
        <p className="text-red-600 font-medium">{error}</p>
        <button onClick={load} className="btn-secondary mt-4">Retry</button>
      </div>
    </div>
  );

  const status = accountStatus;
  const isNotSetUp = !status?.stripe_account_id;
  const isPending = status?.stripe_account_status === 'pending';
  const isActive = status?.stripe_account_status === 'active';
  const isRestricted = status?.stripe_account_status === 'restricted';
  const needsAction = status?.stripe_requirements_status === 'restricted' || (status?.requirements_currently_due?.length ?? 0) > 0;
  const connectNotEnabled = status?.connect_not_enabled === true;

  const statusConfigMap = {
    not_set_up: { label: 'Not Set Up', color: 'bg-slate-100 text-slate-600', icon: AlertCircle },
    pending: { label: 'Verification Required', color: 'bg-amber-100 text-amber-700', icon: Clock },
    active: { label: 'Active', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle2 },
    restricted: { label: 'Restricted', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  };
  const currentStatus = isNotSetUp ? statusConfigMap.not_set_up : statusConfigMap[status?.stripe_account_status as keyof typeof statusConfigMap] || statusConfigMap.not_set_up;
  const StatusIcon = currentStatus.icon;

  return (
    <div>
      <Toast toast={toast} />
      {stripeUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
              <ExternalLink className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Open Stripe Payment Setup</h3>
            <p className="text-sm text-slate-500 mb-6">A new tab couldn't open automatically. Click the button below to continue to Stripe's secure payment setup page.</p>
            <div className="flex gap-3 justify-center">
              <a href={stripeUrl} target="_blank" rel="noopener noreferrer" className="btn-accent inline-flex items-center gap-2">
                <ExternalLink className="w-4 h-4" /> Open Stripe
              </a>
              <button onClick={() => setStripeUrl(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Payments & Payouts</h1>
      <p className="text-slate-500 mb-6">Manage your Stripe Connect account, earnings, and payouts</p>

      {actionError && (
        <div className="card p-4 mb-6 bg-red-50 border border-red-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-semibold text-red-900 text-sm">Payment Setup Error</div>
              <p className="text-xs text-red-700 mt-1">{actionError}</p>
            </div>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 text-sm">Dismiss</button>
          </div>
        </div>
      )}

      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${currentStatus.color}`}>
              <StatusIcon className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm text-slate-500">Payment Account Status</div>
              <div className="text-lg font-bold text-slate-900">{currentStatus.label}</div>
              {status?.stripe_account_id && (
                <div className="text-xs text-slate-400 mt-0.5 font-mono">
                  {status.stripe_account_id.slice(0, 14)}...
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {isNotSetUp && (
              <button onClick={startOnboarding} disabled={actionLoading}
                className="btn-accent inline-flex items-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
                Set Up Payments
              </button>
            )}
            {!isNotSetUp && !isActive && (
              <button onClick={startOnboarding} disabled={actionLoading}
                className="btn-accent inline-flex items-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                {isRestricted ? 'Resolve Issues' : 'Resume Payment Setup'}
              </button>
            )}
            {isActive && (
              <button onClick={openLoginLink} disabled={actionLoading}
                className="btn-secondary inline-flex items-center gap-2">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
                Update Payment Info
              </button>
            )}
          </div>
        </div>

        {status?.stripe_account_id && (
          <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100">
            <div className={`px-2.5 py-1 rounded-lg text-xs font-medium ${status.stripe_charges_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
              Charges: {status.stripe_charges_enabled ? 'Enabled' : 'Disabled'}
            </div>
            <div className={`px-2.5 py-1 rounded-lg text-xs font-medium ${status.stripe_payouts_enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
              Payouts: {status.stripe_payouts_enabled ? 'Enabled' : 'Disabled'}
            </div>
            <div className={`px-2.5 py-1 rounded-lg text-xs font-medium ${status.stripe_onboarding_complete ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
              Onboarding: {status.stripe_onboarding_complete ? 'Complete' : 'Incomplete'}
            </div>
          </div>
        )}

        {needsAction && (status?.requirements_currently_due?.length ?? 0) > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <div className="font-semibold mb-1">Action Required</div>
            <div className="text-xs">Stripe needs additional information to activate your account. Click "Resume Payment Setup" to provide the required details.</div>
            {status?.disabled_reason && <div className="text-xs mt-1 font-mono text-amber-600">Reason: {status.disabled_reason}</div>}
          </div>
        )}
      </div>

      {connectNotEnabled && (
        <div className="card p-5 mb-6 bg-amber-50 border border-amber-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900 text-sm">Payment Setup Pending</div>
              <p className="text-xs text-amber-800 mt-1">
                Driver payouts are temporarily unavailable while we finalize our Stripe Connect platform configuration.
                Your earnings are still being tracked and will be available for withdrawal once payouts are activated.
                Please contact support if you have questions.
              </p>
            </div>
          </div>
        </div>
      )}

      {isActive && earnings && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {[
              { label: 'Available', value: earnings.available_earnings, icon: Wallet, color: 'bg-emerald-50 text-emerald-600' },
              { label: 'Pending', value: earnings.pending_earnings, icon: Clock, color: 'bg-amber-50 text-amber-600' },
              { label: 'Total Earned', value: earnings.total_earnings, icon: TrendingUp, color: 'bg-blue-50 text-blue-600' },
              { label: 'Completed Trips', value: earnings.completed_trips, icon: CheckCircle2, color: 'bg-primary-50 text-primary-600', isCount: true },
            ].map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} className="card p-4">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${c.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-xl font-bold text-slate-900">{c.isCount ? c.value : formatMoney(c.value)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{c.label}</div>
                </div>
              );
            })}
          </div>

          <div className="card p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-900">Withdraw Earnings</h3>
                <p className="text-xs text-slate-500 mt-0.5">Available balance: <span className="font-semibold text-emerald-600">{formatMoney(earnings.available_earnings)}</span></p>
              </div>
              <button onClick={load} className="text-slate-400 hover:text-slate-600">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            <div className="flex gap-2">
              <button onClick={() => requestPayout('manual')} disabled={actionLoading || earnings.available_earnings <= 0}
                className="btn-secondary flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownRight className="w-4 h-4" />}
                Standard Payout
              </button>
              <button onClick={() => requestPayout('instant')} disabled={actionLoading || earnings.available_earnings <= 0}
                className="btn-accent flex-1 inline-flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                Instant Payout
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">Instant payouts may incur a small fee from Stripe and require an eligible debit card on file.</p>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-slate-900 mb-3">Payout History</h3>
            {(!earnings.payout_history || earnings.payout_history.length === 0) ? (
              <div className="card p-8 text-center">
                <Wallet className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No payouts yet</p>
                <p className="text-xs text-slate-400 mt-1">Your payout history will appear here once you withdraw earnings</p>
              </div>
            ) : (
              <div className="card divide-y divide-slate-100">
                {earnings.payout_history.map((payout) => (
                  <div key={payout.id} className="p-4 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900">
                        {formatMoney(Number(payout.amount))}
                        <span className="ml-2 text-xs text-slate-400 capitalize">({payout.type})</span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {payout.paid_at ? `Paid ${formatDate(payout.paid_at)}` : `Scheduled ${formatDate(payout.scheduled_at)}`}
                      </div>
                    </div>
                    <span className={`badge shrink-0 ${payout.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : payout.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                      {payout.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3 className="font-semibold text-slate-900 mb-3">Recent Trip Payments</h3>
            {(!earnings.recent_payments || earnings.recent_payments.length === 0) ? (
              <div className="card p-8 text-center">
                <DollarSign className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500">No payments yet</p>
              </div>
            ) : (
              <div className="card divide-y divide-slate-100">
                {earnings.recent_payments.map((p) => (
                  <div key={p.id} className="p-4">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {p.delivery?.pickup_city || 'N/A'} → {p.delivery?.delivery_city || 'N/A'}
                        </div>
                        <div className="text-xs text-slate-400">{formatDate(p.created_at)}</div>
                      </div>
                      <span className={`badge shrink-0 ${p.status === 'released' ? 'bg-emerald-100 text-emerald-700' : p.status === 'paid' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                        {p.status}
                      </span>
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
        </>
      )}

      {isNotSetUp && (
        <div className="card p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-8 h-8 text-emerald-600" />
          </div>
          <h3 className="text-lg font-bold text-slate-900 mb-2">Set Up Your Payment Account</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-6">
            Connect a Stripe account to receive payouts for completed deliveries. Stripe handles all banking and identity verification securely — we never see or store your bank details.
          </p>
          <button onClick={startOnboarding} disabled={actionLoading}
            className="btn-accent inline-flex items-center gap-2 mx-auto">
            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            Set Up Payments
          </button>
          <div className="flex items-center justify-center gap-4 mt-6 text-xs text-slate-400">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> Bank-level security</span>
            <span className="flex items-center gap-1"><CreditCard className="w-3.5 h-3.5" /> Powered by Stripe</span>
          </div>
        </div>
      )}
    </div>
  );
}
