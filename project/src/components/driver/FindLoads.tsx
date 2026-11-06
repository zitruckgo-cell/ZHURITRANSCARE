import { useState, useEffect, useCallback } from 'react';
import {
  Search, ArrowUpDown, Package, Clock, Building2, Zap, X, Gavel,
  AlertCircle, DollarSign, MapPin, RotateCcw,
} from 'lucide-react';
import {
  supabase, type Delivery, type DeliveryStop,
} from '../../lib/supabase';
import {
  priorityConfig, timeAgo, formatMoney, formatDate, driverPayout,
} from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { useToast, Toast } from './shared';
import { AdminPriceEdit } from '../AdminPriceEdit';
import { fetchStopsForDeliveries } from '../../lib/stops';

type SortKey = 'newest' | 'pay_high' | 'distance_short' | 'pickup_soon';

const SORT_LABELS: Record<SortKey, string> = {
  newest: 'Newest',
  pay_high: 'Highest Pay',
  distance_short: 'Shortest Distance',
  pickup_soon: 'Soonest Pickup',
};

const PRIORITY_FILTERS = [
  { value: 'all', label: 'All Priorities' },
  { value: 'STAT', label: 'STAT' },
  { value: 'urgent', label: 'Urgent' },
  { value: 'standard', label: 'Standard' },
  { value: 'routine', label: 'Routine' },
] as const;

const TEMP_FILTERS = [
  { value: 'all', label: 'All Temps' },
  { value: 'ambient', label: 'Ambient' },
  { value: 'refrigerated', label: 'Refrigerated' },
  { value: 'frozen', label: 'Frozen' },
  { value: 'none', label: 'No Temp' },
] as const;

export function FindLoads() {
  const { user, isAdmin } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [stopsMap, setStopsMap] = useState<Record<string, DeliveryStop[]>>({});
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  const { toast, setToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [bidModal, setBidModal] = useState<Delivery | null>(null);
  const [detailModal, setDetailModal] = useState<Delivery | null>(null);

  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [tempFilter, setTempFilter] = useState<string>('all');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');

  const load = useCallback(async () => {
    setError(null);
    try {
      const { data, error: err } = await supabase.from('deliveries')
        .select('*, shipper:profiles!deliveries_shipper_id_fkey(*)')
        .eq('status', 'posted').order('created_at', { ascending: false });
      if (err) throw err;
      setDeliveries((data as Delivery[]) || []);
      const ids = ((data as Delivery[]) || []).map(d => d.id);
      if (ids.length > 0) {
        const sMap = await fetchStopsForDeliveries(ids);
        setStopsMap(sMap);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deliveries');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const accept = async (d: Delivery) => {
    setAccepting(d.id);
    const { error } = await supabase.from('deliveries').update({
      status: 'assigned', driver_id: user?.id, assigned_at: new Date().toISOString(),
    }).eq('id', d.id);
    if (error) { setToast({ type: 'error', msg: error.message }); setAccepting(null); return; }

    const price = Number(d.offered_rate) || Number(d.calculated_price) || Number(d.max_bid_amount) || 0;
    const commissionRate = 0.10;
    const commissionAmount = Math.round(price * commissionRate * 100) / 100;
    const driverPayout = Math.round((price - commissionAmount) * 100) / 100;

    const { data: existingPayment } = await supabase.from('payments')
      .select('id').eq('delivery_id', d.id).maybeSingle();
    if (existingPayment) {
      await supabase.from('payments').update({
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: driverPayout,
        driver_id: user?.id,
      }).eq('id', existingPayment.id);
    } else {
      await supabase.from('payments').insert({
        delivery_id: d.id,
        shipper_id: d.shipper_id,
        driver_id: user?.id,
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: driverPayout,
        status: 'pending',
      });
    }

    await supabase.from('tracking_events').insert({
      delivery_id: d.id, status: 'assigned', location: `${d.pickup_city}, ${d.pickup_state}`,
      notes: 'Accepted by driver',
    });
    setToast({ type: 'success', msg: 'Load accepted! Check Active Delivery.' });
    setAccepting(null);
    load();
  };

  const filtered = deliveries.filter((d) => {
    if (priorityFilter !== 'all' && d.priority !== priorityFilter) return false;
    if (tempFilter !== 'all' && d.temperature_control !== tempFilter) return false;
    if (urgentOnly && !d.is_urgent) return false;
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      const fields = [
        d.pickup_name, d.pickup_city, d.pickup_state,
        d.delivery_name, d.delivery_city, d.delivery_state,
        d.package_type, d.special_requirements,
        d.shipper?.full_name, d.shipper?.business_name,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!fields.includes(q)) return false;
    }
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sort === 'pay_high') {
      const aPay = Number(a.offered_rate || a.calculated_price || a.max_bid_amount);
      const bPay = Number(b.offered_rate || b.calculated_price || b.max_bid_amount);
      return bPay - aPay;
    }
    if (sort === 'distance_short') {
      return Number(a.distance_miles ?? 9999) - Number(b.distance_miles ?? 9999);
    }
    if (sort === 'pickup_soon') {
      const aT = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : Infinity;
      const bT = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : Infinity;
      return aT - bT;
    }
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const hasFilters = search.trim() || priorityFilter !== 'all' || tempFilter !== 'all' || urgentOnly;
  const clearFilters = () => { setSearch(''); setPriorityFilter('all'); setTempFilter('all'); setUrgentOnly(false); };

  return (
    <div>
      <Toast toast={toast} />
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Find Loads</h1>
      <p className="text-slate-500 mb-6">Browse available deliveries and submit bids or accept offered rates</p>

      {loading ? <div className="text-center py-20 text-slate-400">Loading available loads...</div> : error ? (
        <div className="card p-12 text-center"><AlertCircle className="w-12 h-12 text-red-300 mx-auto mb-4" /><p className="text-red-600 font-medium">{error}</p><button onClick={load} className="btn-secondary mt-4">Retry</button></div>
      ) : deliveries.length === 0 ? (
        <div className="card p-12 text-center"><Package className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No available loads right now</p><p className="text-xs text-slate-400 mt-1">Check back soon for new requests</p></div>
      ) : (
        <>
          <div className="card p-4 mb-4 space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by city, shipper, package type..."
                  className="input pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="input py-2 pr-8 cursor-pointer"
                >
                  {Object.entries(SORT_LABELS).map(([k, label]) => (
                    <option key={k} value={k}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5">
                {PRIORITY_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setPriorityFilter(f.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${priorityFilter === f.value ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="w-px h-5 bg-slate-200 mx-1" />
              <div className="flex flex-wrap gap-1.5">
                {TEMP_FILTERS.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setTempFilter(f.value)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${tempFilter === f.value ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <span className="w-px h-5 bg-slate-200 mx-1" />
              <button
                onClick={() => setUrgentOnly(!urgentOnly)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${urgentOnly ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                <Zap className="w-3 h-3" /> Urgent Only
              </button>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-all ml-auto"
                >
                  <X className="w-3 h-3" /> Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">
              <span className="font-semibold text-slate-900">{sorted.length}</span> {sorted.length === 1 ? 'load' : 'loads'} available
              {hasFilters && <span className="text-slate-400"> · {deliveries.length} total</span>}
            </p>
          </div>

          {sorted.length === 0 ? (
            <div className="card p-12 text-center">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500">No loads match your filters</p>
              <button onClick={clearFilters} className="btn-secondary mt-4">Clear All Filters</button>
            </div>
          ) : (
            <div className="grid md:grid-cols-2 gap-4">
              {sorted.map((d) => {
                const prioCfg = priorityConfig(d.priority);
                const offer = d.offered_rate || d.calculated_price || d.max_bid_amount;
                const deadline = d.delivery_deadline ? new Date(d.delivery_deadline) : null;
                const isDeadlineNear = deadline && (deadline.getTime() - Date.now()) < 6 * 3600000;
                return (
                  <div key={d.id} className="card p-5 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className={`badge ${prioCfg.color}`}><span className={`w-1.5 h-1.5 rounded-full ${prioCfg.dot}`} /> {prioCfg.label}</span>
                        {d.is_urgent && <span className="badge bg-red-100 text-red-700">URGENT</span>}
                      </div>
                      <span className="text-xs text-slate-400">{timeAgo(d.created_at)}</span>
                    </div>
                    {d.shipper?.business_name && (
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-3">
                        <Building2 className="w-3 h-3" />
                        <span className="font-medium text-slate-600">{d.shipper.business_name}</span>
                      </div>
                    )}
                    <div className="flex gap-3 mb-4">
                      <div className="flex flex-col items-center pt-1">
                        <div className="w-3 h-3 rounded-full bg-primary-500 ring-4 ring-primary-100" />
                        <div className="w-0.5 flex-1 bg-slate-200 my-1 min-h-[20px]" />
                        <div className="w-3 h-3 rounded-full bg-emerald-500 ring-4 ring-emerald-100" />
                      </div>
                      <div className="flex-1 space-y-3">
                        <div>
                          <div className="text-xs font-semibold text-primary-600 uppercase">Pickup</div>
                          <div className="font-medium text-slate-900 text-sm">{d.pickup_name}</div>
                          <div className="text-xs text-slate-500">{d.pickup_city}, {d.pickup_state}</div>
                        </div>
                        {stopsMap[d.id]?.filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').map((s, i) => (
                          <div key={s.id}>
                            <div className="text-xs font-semibold text-amber-600 uppercase flex items-center gap-1">{s.stop_type === 'return' ? <><RotateCcw className="w-3 h-3" /> Return</> : <><MapPin className="w-3 h-3" /> Stop {i + 1}</>}</div>
                            <div className="font-medium text-slate-900 text-sm">{s.name}</div>
                            <div className="text-xs text-slate-500">{s.city}, {s.state}</div>
                          </div>
                        ))}
                        <div>
                          <div className="text-xs font-semibold text-emerald-600 uppercase">Drop-off</div>
                          <div className="font-medium text-slate-900 text-sm">{d.delivery_name}</div>
                          <div className="text-xs text-slate-500">{d.delivery_city}, {d.delivery_state}</div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-3 text-xs text-slate-500">
                        <span className="flex items-center gap-1"><Package className="w-3 h-3" />{d.weight_lbs} lbs</span>
                        {d.distance_miles && <span>{d.distance_miles} mi</span>}
                        <span className="capitalize">{d.temperature_control}</span>
                        {d.pickup_datetime && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(d.pickup_datetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>}
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-slate-900">
                          {isAdmin ? (
                            <AdminPriceEdit
                              value={Number(offer)}
                              table="deliveries"
                              id={d.id}
                              field="offered_rate"
                              onSave={async (num) => {
                                const { error } = await supabase.from('deliveries').update({ offered_rate: num }).eq('id', d.id);
                                if (error) throw error;
                                load();
                              }}
                            />
                          ) : formatMoney(driverPayout(offer))}
                        </div>
                        {!isAdmin && (
                          <div className="text-[10px] text-slate-400 mt-0.5">after 10% platform fee</div>
                        )}
                        <div className="flex gap-1.5 mt-1">
                          <button onClick={() => setDetailModal(d)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 text-slate-600 text-xs font-semibold hover:bg-slate-200 transition-all active:scale-95">
                            Details
                          </button>
                          <button onClick={() => setBidModal(d)} className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-all active:scale-95">
                            <Gavel className="w-3 h-3" /> Bid
                          </button>
                          <button onClick={() => accept(d)} disabled={accepting === d.id} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50">
                            {accepting === d.id ? '...' : 'Accept'}
                          </button>
                        </div>
                      </div>
                    </div>
                    {deadline && (
                      <div className={`mt-3 flex items-center gap-1.5 text-xs ${isDeadlineNear ? 'text-red-600 font-semibold' : 'text-slate-500'}`}>
                        <Clock className={`w-3 h-3 ${isDeadlineNear ? 'text-red-500' : ''}`} />
                        Deadline: {deadline.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                        {isDeadlineNear && <span className="badge bg-red-100 text-red-700 ml-1">DUE SOON</span>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {bidModal && <BidModal delivery={bidModal} stops={stopsMap[bidModal.id]} onClose={() => setBidModal(null)} onSubmitted={() => { setBidModal(null); setToast({ type: 'success', msg: 'Bid placed successfully!' }); }} />}
      {detailModal && <LoadDetailModal delivery={detailModal} stops={stopsMap[detailModal.id]} onClose={() => setDetailModal(null)} />}
    </div>
  );
}

function LoadDetailModal({ delivery, stops, onClose }: { delivery: Delivery; stops?: DeliveryStop[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative card max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Load Details</h2>
        <p className="text-sm text-slate-500 mb-4">{delivery.pickup_name} → {delivery.delivery_name}</p>
        <div className="space-y-3">
          <div className="p-3 rounded-xl bg-primary-50">
            <div className="text-xs font-semibold text-primary-600 uppercase mb-1">Pickup</div>
            <div className="text-sm font-medium text-slate-900">{delivery.pickup_name}</div>
            <div className="text-xs text-slate-600">{delivery.pickup_address}, {delivery.pickup_city}, {delivery.pickup_state} {delivery.pickup_zip}</div>
            <div className="text-xs text-slate-500 mt-1">Contact: {delivery.pickup_contact}</div>
            {delivery.pickup_datetime && <div className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(delivery.pickup_datetime)}</div>}
          </div>
          {stops?.filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').map((s, i) => (
            <div key={s.id} className="p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div className="text-xs font-semibold text-amber-600 uppercase mb-1 flex items-center gap-1">{s.stop_type === 'return' ? <><RotateCcw className="w-3 h-3" /> Return Stop</> : <><MapPin className="w-3 h-3" /> Intermediate Stop {i + 1}</>}</div>
              <div className="text-sm font-medium text-slate-900">{s.name}</div>
              <div className="text-xs text-slate-600">{s.address}, {s.city}, {s.state} {s.zip}</div>
              <div className="text-xs text-slate-500 mt-1">Contact: {s.contact}</div>
              {s.scheduled_at && <div className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(s.scheduled_at)}</div>}
              {s.notes && <div className="text-xs text-slate-500 mt-1">Notes: {s.notes}</div>}
            </div>
          ))}
          <div className="p-3 rounded-xl bg-emerald-50">
            <div className="text-xs font-semibold text-emerald-600 uppercase mb-1">Drop-off</div>
            <div className="text-sm font-medium text-slate-900">{delivery.delivery_name}</div>
            <div className="text-xs text-slate-600">{delivery.delivery_address}, {delivery.delivery_city}, {delivery.delivery_state} {delivery.delivery_zip}</div>
            <div className="text-xs text-slate-500 mt-1">Contact: {delivery.delivery_contact}</div>
            {delivery.delivery_deadline && <div className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Deadline: {formatDate(delivery.delivery_deadline)}</div>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-50">
              <div className="text-xs text-slate-500">Package Type</div>
              <div className="text-sm font-medium text-slate-900 capitalize">{delivery.package_type.replace('_', ' ')}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <div className="text-xs text-slate-500">Weight</div>
              <div className="text-sm font-medium text-slate-900">{delivery.weight_lbs} lbs</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <div className="text-xs text-slate-500">Temperature</div>
              <div className="text-sm font-medium text-slate-900 capitalize">{delivery.temperature_control}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50">
              <div className="text-xs text-slate-500">Distance</div>
              <div className="text-sm font-medium text-slate-900">{delivery.distance_miles ? `${delivery.distance_miles} mi` : '—'}</div>
            </div>
          </div>
          {delivery.special_requirements && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
              <div className="text-xs font-semibold text-amber-700 uppercase mb-1">Special Requirements</div>
              <div className="text-sm text-slate-700">{delivery.special_requirements}</div>
            </div>
          )}
          {delivery.shipper_instructions && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-100">
              <div className="text-xs font-semibold text-blue-700 uppercase mb-1">Shipper Instructions</div>
              <div className="text-sm text-slate-700">{delivery.shipper_instructions}</div>
            </div>
          )}
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-700">Your Payout (90%)</span>
            <span className="text-lg font-bold text-emerald-600">{formatMoney(driverPayout(delivery.offered_rate || delivery.calculated_price || delivery.max_bid_amount))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function BidModal({ delivery, stops, onClose, onSubmitted }: { delivery: Delivery; stops?: DeliveryStop[]; onClose: () => void; onSubmitted: () => void }) {
  const { user } = useAuth();
  const [amount, setAmount] = useState('');
  const [eta, setEta] = useState('30');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from('bids').insert({
      delivery_id: delivery.id,
      driver_id: user?.id,
      courier_id: null,
      amount: parseFloat(amount) || 0,
      eta_minutes: parseInt(eta) || 30,
      message: message || null,
      status: 'pending',
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    await supabase.from('notifications').insert({
      recipient_id: delivery.shipper_id,
      channel: 'email',
      recipient_contact: '',
      subject: 'New Bid Received',
      body: `A driver has placed a bid of ${(parseFloat(amount) || 0).toFixed(2)} on your delivery ${delivery.pickup_name} → ${delivery.delivery_name}.`,
      related_type: 'bid',
      related_id: delivery.id,
      status: 'sent',
    });
    onSubmitted();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative card max-w-md w-full p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        <h2 className="text-lg font-bold text-slate-900 mb-1">Place a Bid</h2>
        <p className="text-sm text-slate-500 mb-4">{delivery.pickup_name} → {delivery.delivery_name}</p>
        <div className="space-y-4">
          <div>
            <label className="label"><DollarSign className="w-3.5 h-3.5 inline mr-1" />Your Bid Amount</label>
            <input type="number" min="0" step="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={formatMoney(driverPayout(delivery.offered_rate || delivery.calculated_price || delivery.max_bid_amount))} />
            <p className="text-xs text-slate-400 mt-1">Suggested payout: {formatMoney(driverPayout(delivery.offered_rate || delivery.calculated_price || delivery.max_bid_amount))} (after 10% fee)</p>
          </div>
          <div>
            <label className="label"><Clock className="w-3.5 h-3.5 inline mr-1" />ETA (minutes)</label>
            <input type="number" min="1" className="input" value={eta} onChange={(e) => setEta(e.target.value)} />
          </div>
          <div>
            <label className="label">Message (optional)</label>
            <textarea className="input min-h-[60px] resize-none" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Any notes for the shipper..." />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button onClick={submit} disabled={submitting || !amount} className="btn-accent w-full">{submitting ? 'Placing Bid...' : 'Place Bid'}</button>
        </div>
      </div>
    </div>
  );
}
