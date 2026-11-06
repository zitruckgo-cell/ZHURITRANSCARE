import { useState, useEffect, useCallback } from 'react';
import { Navigation, Truck, MapPin, Package, CheckCircle2, Clock, FileText, FileCheck, Phone } from 'lucide-react';
import { supabase, type Delivery, type TrackingEvent } from '../../lib/supabase';
import { statusConfig, priorityConfig, timeAgo, formatDate, formatMoney, driverPayout } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { AdminScopePicker } from '../AdminScopePicker';
import { useToast, Toast } from './shared';

export function LiveTrackingTab() {
  const { user, isAdmin } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [trackingMap, setTrackingMap] = useState<Record<string, TrackingEvent[]>>({});
  const [loading, setLoading] = useState(true);
  const [scopeDriverId, setScopeDriverId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { toast, setToast } = useToast();

  const load = useCallback(async () => {
    const driverFilter = isAdmin ? scopeDriverId : user?.id;
    let query = supabase
      .from('deliveries')
      .select('*, shipper:profiles!deliveries_shipper_id_fkey(*), driver:profiles!deliveries_driver_id_fkey(*)')
      .in('status', ['assigned', 'picked_up', 'in_transit', 'delivered'])
      .order('created_at', { ascending: false });
    if (driverFilter) query = query.eq('driver_id', driverFilter);
    const { data } = await query;
    const dels = (data as Delivery[]) || [];
    setDeliveries(dels);

    if (dels.length > 0 && !selectedId) setSelectedId(dels[0].id);

    const tMap: Record<string, TrackingEvent[]> = {};
    await Promise.all(dels.map(async (d) => {
      const { data: events } = await supabase
        .from('tracking_events')
        .select('*')
        .eq('delivery_id', d.id)
        .order('created_at', { ascending: true });
      tMap[d.id] = (events as TrackingEvent[]) || [];
    }));
    setTrackingMap(tMap);
    setLoading(false);
  }, [user?.id, isAdmin, scopeDriverId, selectedId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading live tracking...</div>;

  const active = deliveries.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status));
  const completed = deliveries.filter((d) => d.status === 'delivered');

  return (
    <div>
      <Toast toast={toast} />
      {isAdmin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Live Tracking</h1>
      <p className="text-slate-500 mb-6">Real-time view of your deliveries from acceptance through completion (auto-refreshes every 15s)</p>

      {deliveries.length === 0 ? (
        <div className="card p-12 text-center">
          <Navigation className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No deliveries to track yet</p>
          <p className="text-xs text-slate-400 mt-1">Active and recently completed deliveries will appear here</p>
        </div>
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <div>
              <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Deliveries ({active.length})
              </h2>
              <div className="space-y-4">
                {active.map((d) => (
                  <TrackingCard
                    key={d.id}
                    delivery={d}
                    events={trackingMap[d.id] || []}
                    isSelected={selectedId === d.id}
                    onSelect={() => setSelectedId(d.id)}
                    onToast={setToast}
                  />
                ))}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Recently Completed ({completed.length})
              </h2>
              <div className="card divide-y divide-slate-100">
                {completed.map((d) => {
                  const sc = statusConfig(d.status);
                  return (
                    <div key={d.id} className="p-4 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                        <div className="text-xs text-slate-500">{d.pickup_city} → {d.delivery_city} · {d.delivered_time ? formatDate(d.delivered_time) : timeAgo(d.created_at)}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-sm font-semibold text-slate-700">{formatMoney(driverPayout(d.calculated_price || d.max_bid_amount))}</span>
                        <span className={`badge ${sc.color}`}>{sc.label}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const STEPS = [
  { key: 'assigned', label: 'Assigned', icon: MapPin },
  { key: 'picked_up', label: 'Picked Up', icon: Package },
  { key: 'in_transit', label: 'In Transit', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
];

function TrackingCard({ delivery: d, events, isSelected, onSelect, onToast }: {
  delivery: Delivery;
  events: TrackingEvent[];
  isSelected: boolean;
  onSelect: () => void;
  onToast: (t: { type: 'success' | 'error'; msg: string }) => void;
}) {
  const sc = statusConfig(d.status);
  const pc = priorityConfig(d.priority);
  const currentStepIdx = STEPS.findIndex((s) => s.key === d.status);

  return (
    <div className={`card p-5 transition-all ${isSelected ? 'ring-2 ring-emerald-300' : 'hover:shadow-md'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className={`badge ${pc.color}`}><span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} /> {pc.label}</span>
          <span className={`badge ${sc.color}`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot} animate-pulse`} /> {sc.label}</span>
          {d.bol_number && <span className="text-xs font-mono text-slate-400 flex items-center gap-0.5"><FileText className="w-3 h-3" />{d.bol_number}</span>}
          {d.pod_number && <span className="text-xs font-mono text-emerald-600 flex items-center gap-0.5"><FileCheck className="w-3 h-3" />{d.pod_number}</span>}
        </div>
        <span className="text-xs text-slate-400">{timeAgo(d.created_at)}</span>
      </div>

      <div className="flex items-center justify-between mb-6 px-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon;
          const isDone = i < currentStepIdx;
          const isCurrent = i === currentStepIdx;
          return (
            <div key={step.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center transition-all ${isDone ? 'bg-emerald-500 text-white' : isCurrent ? 'bg-emerald-100 text-emerald-600 ring-4 ring-emerald-50' : 'bg-slate-100 text-slate-400'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-xs font-medium ${isDone || isCurrent ? 'text-slate-900' : 'text-slate-400'}`}>{step.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`flex-1 h-0.5 mx-2 ${i < currentStepIdx ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              )}
            </div>
          );
        })}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="p-3 rounded-xl bg-primary-50">
          <div className="text-xs font-semibold text-primary-600 uppercase mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Pickup</div>
          <div className="font-medium text-slate-900 text-sm">{d.pickup_name}</div>
          <div className="text-xs text-slate-500">{d.pickup_city}, {d.pickup_state}</div>
        </div>
        <div className="p-3 rounded-xl bg-emerald-50">
          <div className="text-xs font-semibold text-emerald-600 uppercase mb-1 flex items-center gap-1"><Navigation className="w-3 h-3" /> Drop-off</div>
          <div className="font-medium text-slate-900 text-sm">{d.delivery_name}</div>
          <div className="text-xs text-slate-500">{d.delivery_city}, {d.delivery_state}</div>
        </div>
      </div>

      {d.shipper && (
        <div className="flex items-center gap-2 mb-4 p-3 rounded-xl bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-xs">{d.shipper.full_name.charAt(0)}</div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900">{d.shipper.full_name}</div>
            {d.shipper.phone && <div className="text-xs text-slate-500">{d.shipper.phone}</div>}
          </div>
          {d.shipper.phone && (
            <a href={`tel:${d.shipper.phone}`} className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 hover:bg-emerald-200 transition-all">
              <Phone className="w-4 h-4" />
            </a>
          )}
        </div>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Clock className="w-3.5 h-3.5" />
          {d.pickup_datetime ? formatDate(d.pickup_datetime) : 'Flexible pickup'}
        </div>
        <span className="text-sm font-semibold text-slate-700">{formatMoney(driverPayout(d.calculated_price || d.max_bid_amount))}</span>
      </div>

      {events.length > 0 && (
        <button onClick={onSelect} className="mt-3 text-xs text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-1">
          <Navigation className="w-3 h-3" />
          {isSelected ? 'Hide' : 'View'} tracking history ({events.length})
        </button>
      )}

      {isSelected && events.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
          {events.map((evt, i) => (
            <div key={evt.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className={`w-2.5 h-2.5 rounded-full ${i === events.length - 1 ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {i < events.length - 1 && <div className="w-0.5 h-6 bg-slate-200" />}
              </div>
              <div className="pb-2">
                <div className="text-sm font-medium text-slate-900">{evt.status.replace(/_/g, ' ')}</div>
                {evt.location && <div className="text-xs text-slate-500">{evt.location}</div>}
                {evt.notes && <div className="text-xs text-slate-400">{evt.notes}</div>}
                <div className="text-xs text-slate-400">{timeAgo(evt.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
