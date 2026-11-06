import { useState, useEffect, useCallback } from 'react';
import { Navigation, FileText, FileCheck, MapPin, Truck, Users } from 'lucide-react';
import { supabase, type Delivery, type Profile } from '../../lib/supabase';
import { priorityConfig, statusConfig, timeAgo, formatMoney } from '../../lib/utils';
import { DriverLocationMap } from '../shared/DriverLocationMap';

export function AdminLiveTrackingPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [onlineDrivers, setOnlineDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Profile | null>(null);

  const load = useCallback(async () => {
    const [delRes, driverRes] = await Promise.all([
      supabase.from('deliveries').select('*, shipper:profiles!deliveries_shipper_id_fkey(*), driver:profiles!deliveries_driver_id_fkey(*)').in('status', ['assigned', 'picked_up', 'in_transit']).order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').contains('roles', ['driver']).eq('is_online', true).order('location_updated_at', { ascending: false }),
    ]);
    setDeliveries((delRes.data as Delivery[]) || []);
    setOnlineDrivers((driverRes.data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    const channel = supabase
      .channel('admin-driver-locations')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const updated = payload.new as Profile;
          if (!updated.roles?.includes('driver')) return;
          setOnlineDrivers((prev) => {
            if (!updated.is_online) return prev.filter((d) => d.id !== updated.id);
            const exists = prev.find((d) => d.id === updated.id);
            if (exists) return prev.map((d) => (d.id === updated.id ? updated : d));
            return [...prev, updated];
          });
          if (selectedDriver?.id === updated.id) setSelectedDriver(updated);
        },
      )
      .subscribe();
    return () => { clearInterval(interval); supabase.removeChannel(channel); };
  }, [load, selectedDriver]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading live tracking...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Live Tracking</h1>
      <p className="text-slate-500 mb-6">Real-time view of active deliveries and online drivers (auto-refreshes every 30s)</p>

      {onlineDrivers.length > 0 && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              Online Drivers ({onlineDrivers.length})
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {onlineDrivers.map((driver) => (
              <button
                key={driver.id}
                onClick={() => setSelectedDriver(driver)}
                className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${selectedDriver?.id === driver.id ? 'border-emerald-400 bg-emerald-50 ring-2 ring-emerald-100' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
              >
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">{driver.full_name.charAt(0)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{driver.full_name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Truck className="w-3 h-3" /> {driver.vehicle_type || 'N/A'}
                    {driver.latitude != null && <span className="text-emerald-600 font-medium flex items-center gap-0.5"><MapPin className="w-3 h-3" /> {driver.location_updated_at ? timeAgo(driver.location_updated_at) : 'live'}</span>}
                  </div>
                </div>
              </button>
            ))}
          </div>
          {selectedDriver && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-slate-900">{selectedDriver.full_name}'s Live Location</div>
                <button onClick={() => setSelectedDriver(null)} className="text-xs text-slate-400 hover:text-slate-600 font-medium">Close</button>
              </div>
              <DriverLocationMap driver={selectedDriver} />
            </div>
          )}
        </div>
      )}

      {onlineDrivers.length === 0 && deliveries.length === 0 && (
        <div className="card p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No active deliveries or online drivers to track</p>
          <p className="text-xs text-slate-400 mt-1">Drivers will appear here when they log in and share their location</p>
        </div>
      )}

      {deliveries.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          {deliveries.map((d) => {
            const statusCfg = statusConfig(d.status);
            const prioCfg = priorityConfig(d.priority);
            return (
              <div key={d.id} className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${prioCfg.color}`}><span className={`w-1.5 h-1.5 rounded-full ${prioCfg.dot}`} /> {prioCfg.label}</span>
                    <span className={`badge ${statusCfg.color}`}><span className={`w-1.5 h-1.5 rounded-full ${statusCfg.dot} animate-pulse`} /> {statusCfg.label}</span>
                  </div>
                  <span className="text-xs text-slate-400">{timeAgo(d.created_at)}</span>
                </div>

                <div className="flex items-center gap-2 mb-3">
                  {d.bol_number && <span className="text-xs font-mono text-slate-400 flex items-center gap-0.5"><FileText className="w-3 h-3" />{d.bol_number}</span>}
                  {d.pod_number && <span className="text-xs font-mono text-emerald-600 flex items-center gap-0.5"><FileCheck className="w-3 h-3" />{d.pod_number}</span>}
                </div>

                <div className="flex gap-3 mb-4">
                  <div className="flex flex-col items-center pt-1">
                    <div className="w-3 h-3 rounded-full bg-primary-500 ring-4 ring-primary-100" />
                    <div className="w-0.5 flex-1 bg-slate-200 my-1 min-h-[20px]" />
                    <div className={`w-3 h-3 rounded-full ${d.status === 'delivered' ? 'bg-emerald-500 ring-4 ring-emerald-100' : 'bg-slate-300 ring-4 ring-slate-100'}`} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <div className="text-xs font-semibold text-primary-600 uppercase">Pickup</div>
                      <div className="font-medium text-slate-900 text-sm">{d.pickup_name}</div>
                      <div className="text-xs text-slate-500">{d.pickup_city}, {d.pickup_state}</div>
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-emerald-600 uppercase">Drop-off</div>
                      <div className="font-medium text-slate-900 text-sm">{d.delivery_name}</div>
                      <div className="text-xs text-slate-500">{d.delivery_city}, {d.delivery_state}</div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    {d.driver && (
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">{d.driver.full_name.charAt(0)}</div>
                        <div className="text-xs">
                          <div className="font-medium text-slate-900">{d.driver.full_name}</div>
                          <div className="text-slate-400 flex items-center gap-1">
                            <Truck className="w-3 h-3" /> {d.driver.vehicle_type}
                            {d.driver.is_online && <span className="inline-flex items-center gap-0.5 text-emerald-600 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Online</span>}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {d.driver && (
                      <button
                        onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded-lg hover:bg-primary-50"
                      >
                        <MapPin className="w-3.5 h-3.5" /> {expandedId === d.id ? 'Hide' : 'Track'}
                      </button>
                    )}
                    <span className="text-sm font-semibold text-slate-700">{formatMoney(d.calculated_price || d.max_bid_amount)}</span>
                  </div>
                </div>

                {expandedId === d.id && d.driver && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <DriverLocationMap driver={d.driver as Profile} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
