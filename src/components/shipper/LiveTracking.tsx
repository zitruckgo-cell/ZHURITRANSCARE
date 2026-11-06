import { useState, useEffect, useCallback } from 'react';
import { Navigation, Truck, X, Camera, PenLine, MapPin } from 'lucide-react';
import { supabase, type Delivery, type TrackingEvent, type Profile } from '../../lib/supabase';
import { statusConfig, timeAgo, formatDate } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { AdminScopePicker } from '../AdminScopePicker';
import { DriverLocationMap } from '../shared/DriverLocationMap';

export function LiveTracking() {
  const { user, isAdmin } = useAuth();
  const [scopeShipperId, setScopeShipperId] = useState<string | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [tracking, setTracking] = useState<TrackingEvent[]>([]);

  const load = useCallback(async () => {
    const shipperFilter = isAdmin ? scopeShipperId : user?.id;
    let query = supabase.from('deliveries').select('*, driver:profiles!deliveries_driver_id_fkey(*)').in('status', ['assigned', 'picked_up', 'in_transit', 'delivered']).order('created_at', { ascending: false });
    if (shipperFilter) query = query.eq('shipper_id', shipperFilter);
    const { data } = await query;
    setDeliveries((data as Delivery[]) || []);
  }, [user?.id, isAdmin, scopeShipperId]);

  useEffect(() => { load(); }, [load]);

  const loadDetail = async (d: Delivery) => {
    setSelected(d);
    const { data } = await supabase.from('tracking_events').select('*').eq('delivery_id', d.id).order('created_at', { ascending: false });
    setTracking((data as TrackingEvent[]) || []);
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  return (
    <div>
      {isAdmin && <AdminScopePicker role="shipper" scopeUserId={scopeShipperId} onScopeChange={setScopeShipperId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Live Tracking</h1>
      <p className="text-slate-500 mb-6">Track your deliveries in real time</p>

      {deliveries.length === 0 ? <div className="card p-12 text-center"><Navigation className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No active deliveries to track</p></div> : (
        <div className="space-y-3">
          {deliveries.map((d) => {
            const sc = statusConfig(d.status);
            return (
              <button key={d.id} onClick={() => loadDetail(d)} className="card p-4 text-left hover:shadow-md transition-all w-full">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                    <div className="text-xs text-slate-500">{d.pickup_city} → {d.delivery_city}</div>
                    {d.driver && <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-1"><Truck className="w-3 h-3" /> {d.driver.full_name}</div>}
                  </div>
                  <span className={`badge ${sc.color} shrink-0`}><span className={`w-1.5 h-1.5 rounded-full ${sc.dot} animate-pulse`} /> {sc.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setSelected(null)} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            <h3 className="text-lg font-bold text-slate-900 mb-4">Tracking Details</h3>
            <div className="space-y-2 mb-4">
              {selected.bol_number && <div className="text-sm"><span className="text-slate-500">BOL #:</span> <span className="font-mono font-medium text-slate-700">{selected.bol_number}</span></div>}
              {selected.pod_number && <div className="text-sm"><span className="text-slate-500">POD #:</span> <span className="font-mono font-medium text-emerald-600">{selected.pod_number}</span></div>}
              {selected.pod_photo_url && <div className="mt-3"><div className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1"><Camera className="w-3 h-3" /> Delivery Photo</div><img src={selected.pod_photo_url} alt="Delivery proof" className="w-full rounded-lg border border-slate-200" /></div>}
              {selected.pod_signature_url && <div className="mt-2"><div className="text-xs font-semibold text-slate-500 uppercase mb-1 flex items-center gap-1"><PenLine className="w-3 h-3" /> Recipient Signature</div><img src={selected.pod_signature_url} alt="Signature" className="w-full rounded-lg border border-slate-200 bg-white" /></div>}
              {selected.pod_notes && <div className="mt-2"><div className="text-xs font-semibold text-slate-500 uppercase mb-1">Delivery Notes</div><div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-sm text-slate-700">{selected.pod_notes}</div></div>}
              {selected.pod_submitted_at && <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-2"><MapPin className="w-3 h-3" /> Submitted {formatDate(selected.pod_submitted_at)}{selected.pod_location ? ` · ${selected.pod_location}` : ''}</div>}
              <div className="text-sm"><span className="text-slate-500">From:</span> <span className="font-medium">{selected.pickup_name}</span></div>
              <div className="text-sm"><span className="text-slate-500">To:</span> <span className="font-medium">{selected.delivery_name}</span></div>
              <div className="text-sm"><span className="text-slate-500">Status:</span> <span className="font-medium capitalize">{selected.status.replace('_', ' ')}</span></div>
              {selected.driver && (
                <div className="text-sm">
                  <span className="text-slate-500">Driver:</span> <span className="font-medium">{selected.driver.full_name}</span>
                  {selected.driver.phone && <span className="text-slate-400 ml-2">{selected.driver.phone}</span>}
                </div>
              )}
            </div>

            {selected.driver && ['assigned', 'picked_up', 'in_transit'].includes(selected.status) && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1">
                  <Navigation className="w-3 h-3" /> Driver Live Location
                </div>
                <DriverLocationMap driver={selected.driver as Profile} />
              </div>
            )}

            {tracking.length > 0 ? (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Tracking History</h4>
                <div className="space-y-3">
                  {tracking.map((evt, i) => (
                    <div key={evt.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={`w-2.5 h-2.5 rounded-full ${i === 0 ? 'bg-primary-500' : 'bg-slate-300'}`} />
                        {i < tracking.length - 1 && <div className="w-0.5 h-6 bg-slate-200" />}
                      </div>
                      <div className="pb-2">
                        <div className="text-sm font-medium text-slate-900 capitalize">{evt.status.replace('_', ' ')}</div>
                        {evt.location && <div className="text-xs text-slate-500">{evt.location}</div>}
                        {evt.notes && <div className="text-xs text-slate-400">{evt.notes}</div>}
                        <div className="text-xs text-slate-400">{timeAgo(evt.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : <p className="text-sm text-slate-400">No tracking events yet</p>}
          </div>
        </div>
      )}
    </div>
  );
}
