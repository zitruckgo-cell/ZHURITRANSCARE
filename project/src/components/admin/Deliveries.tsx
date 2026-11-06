import { useState, useEffect, useCallback } from 'react';
import { Package, Search, X, Zap, Edit3, UserCog, Save, Truck, AlertCircle, FileText, FileCheck, ClipboardList, Plus, Camera, PenLine, MapPin, Trash2, RotateCcw } from 'lucide-react';
import { supabase, type Delivery, type Profile, type DispatchOrder, type DeliveryStop } from '../../lib/supabase';
import { priorityConfig, statusConfig, PRIORITY_CONFIG, STATUS_CONFIG, formatMoney, formatDate } from '../../lib/utils';
import { fetchStopsForDeliveries, fetchStopsForDelivery } from '../../lib/stops';

export function AdminDeliveriesPage({ onNavigate }: { onNavigate?: (s: string) => void }) {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [dispatchOrders, setDispatchOrders] = useState<Record<string, DispatchOrder>>({});
  const [stopsMap, setStopsMap] = useState<Record<string, DeliveryStop[]>>({});

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<Delivery | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Delivery>>({});
  const [saving, setSaving] = useState(false);
  const [reassignDriver, setReassignDriver] = useState<string>('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [showStopsMgr, setShowStopsMgr] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const [delRes, driverRes] = await Promise.all([
      supabase.from('deliveries').select('*, shipper:profiles!deliveries_shipper_id_fkey(*), driver:profiles!deliveries_driver_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').contains('roles', ['driver']),
    ]);
    const dels = (delRes.data as Delivery[]) || [];
    setDeliveries(dels);
    setDrivers((driverRes.data as Profile[]) || []);
    if (dels.length > 0) {
      const ids = dels.map((d) => d.id);
      const { data: doData } = await supabase.from('dispatch_orders').select('*').in('delivery_id', ids);
      const doMap: Record<string, DispatchOrder> = {};
      (doData as DispatchOrder[] || []).forEach((o) => { doMap[o.delivery_id] = o; });
      setDispatchOrders(doMap);
      const sMap = await fetchStopsForDeliveries(ids);
      setStopsMap(sMap);
    } else {
      setDispatchOrders({});
      setStopsMap({});
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = deliveries.filter((d) => {
    const q = search.toLowerCase();
    const matchSearch = !search || d.pickup_name.toLowerCase().includes(q) || d.delivery_name.toLowerCase().includes(q) || d.pickup_city.toLowerCase().includes(q) || d.delivery_city.toLowerCase().includes(q) || (d.bol_number?.toLowerCase().includes(q) ?? false) || (d.pod_number?.toLowerCase().includes(q) ?? false);
    const matchStatus = filterStatus === 'all' || d.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const autoAssign = async (delivery: Delivery) => {
    setAssigning(true);
    const availableDrivers = drivers.filter((d) => d.is_active);
    if (availableDrivers.length === 0) { setToast({ type: 'error', msg: 'No available drivers' }); setAssigning(false); return; }

    let nearest = availableDrivers[0];
    if (delivery.pickup_city && nearest.service_area) {
      const inArea = availableDrivers.filter((d) =>
        d.service_area?.toLowerCase().includes(delivery.pickup_city.toLowerCase()) ||
        delivery.pickup_city.toLowerCase().includes(d.service_area?.toLowerCase() || '')
      );
      if (inArea.length > 0) nearest = inArea[0];
    }

    await supabase.from('deliveries').update({
      status: 'assigned', driver_id: nearest.id, assigned_at: new Date().toISOString(), auto_assigned: true,
    }).eq('id', delivery.id);

    // Create or update a pending payment record so the shipper can pay via Stripe
    const price = Number(delivery.calculated_price) || Number(delivery.max_bid_amount) || 0;
    const commissionRate = 0.10;
    const commissionAmount = Math.round(price * commissionRate * 100) / 100;
    const driverPayout = Math.round((price - commissionAmount) * 100) / 100;

    const { data: existingPayment } = await supabase.from('payments')
      .select('id').eq('delivery_id', delivery.id).maybeSingle();
    if (existingPayment) {
      await supabase.from('payments').update({
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: driverPayout,
        driver_id: nearest.id,
      }).eq('id', existingPayment.id);
    } else {
      await supabase.from('payments').insert({
        delivery_id: delivery.id,
        shipper_id: delivery.shipper_id,
        driver_id: nearest.id,
        gross_amount: price, commission_rate: commissionRate,
        commission_amount: commissionAmount, driver_payout: driverPayout,
        status: 'pending',
      });
    }

    await supabase.from('tracking_events').insert({
      delivery_id: delivery.id, status: 'assigned', location: `${delivery.pickup_city}, ${delivery.pickup_state}`,
      notes: `Auto-assigned to ${nearest.full_name}`,
    });

    setAssigning(false);
    setSelected(null);
    setToast({ type: 'success', msg: `Assigned to ${nearest.full_name}` });
    load();
  };

  const reassign = async (delivery: Delivery, newDriverId: string) => {
    if (!newDriverId) return;
    const driver = drivers.find((d) => d.id === newDriverId);
    await supabase.from('deliveries').update({
      driver_id: newDriverId, assigned_at: new Date().toISOString(),
    }).eq('id', delivery.id);

    await supabase.from('tracking_events').insert({
      delivery_id: delivery.id, status: delivery.status, location: `${delivery.pickup_city}, ${delivery.pickup_state}`,
      notes: `Reassigned to ${driver?.full_name || 'new driver'} by admin`,
    });

    setReassignDriver('');
    setToast({ type: 'success', msg: `Reassigned to ${driver?.full_name}` });
    load();
    if (selected) setSelected({ ...selected, driver_id: newDriverId, driver: driver || null });
  };

  const advanceStatus = async (d: Delivery) => {
    const flow: Record<string, Delivery['status']> = { assigned: 'picked_up', picked_up: 'in_transit', in_transit: 'delivered' };
    const next = flow[d.status];
    if (!next) return;
    const updates: Record<string, unknown> = { status: next };
    if (next === 'picked_up') updates.pickup_time = new Date().toISOString();
    if (next === 'delivered') updates.delivered_time = new Date().toISOString();
    await supabase.from('deliveries').update(updates).eq('id', d.id);
    await supabase.from('tracking_events').insert({ delivery_id: d.id, status: next, location: `${d.delivery_city}, ${d.delivery_state}`, notes: `Admin updated to ${next}` });
    setToast({ type: 'success', msg: `Status updated to ${next.replace('_', ' ')}` });
    load();
  };

  const cancelDelivery = async (d: Delivery) => {
    await supabase.from('deliveries').update({ status: 'cancelled' }).eq('id', d.id);
    await supabase.from('tracking_events').insert({ delivery_id: d.id, status: 'cancelled', notes: 'Cancelled by admin' });
    setToast({ type: 'success', msg: 'Delivery cancelled' });
    setSelected(null);
    load();
  };

  const refreshStops = async (deliveryId: string) => {
    const s = await fetchStopsForDelivery(deliveryId);
    setStopsMap((prev) => ({ ...prev, [deliveryId]: s }));
  };

  const addStopToDelivery = async (deliveryId: string, stop: { stop_type: string; name: string; address: string; city: string; state: string; zip: string; contact: string; scheduled_at: string | null; notes: string | null }) => {
    const existing = stopsMap[deliveryId] || [];
    const maxStopNum = existing.reduce((max, s) => Math.max(max, s.stop_number), 0);
    const newStopNum = maxStopNum + 1;
    const { error } = await supabase.from('delivery_stops').insert({
      delivery_id: deliveryId,
      stop_number: newStopNum,
      stop_type: stop.stop_type,
      name: stop.name,
      address: stop.address,
      city: stop.city,
      state: stop.state,
      zip: stop.zip,
      contact: stop.contact,
      scheduled_at: stop.scheduled_at,
      notes: stop.notes,
    });
    if (error) {
      setToast({ type: 'error', msg: error.message });
    } else {
      setToast({ type: 'success', msg: 'Stop added' });
      await refreshStops(deliveryId);
    }
  };

  const deleteStop = async (stopId: string, deliveryId: string) => {
    const { error } = await supabase.from('delivery_stops').delete().eq('id', stopId);
    if (error) {
      setToast({ type: 'error', msg: error.message });
    } else {
      setToast({ type: 'success', msg: 'Stop removed' });
      await refreshStops(deliveryId);
    }
  };

  const updateStopStatus = async (stopId: string, deliveryId: string, status: 'pending' | 'arrived' | 'completed') => {
    const updates: Record<string, string> = { status };
    if (status === 'arrived') updates.arrived_at = new Date().toISOString();
    if (status === 'completed') updates.completed_at = new Date().toISOString();
    const { error } = await supabase.from('delivery_stops').update(updates).eq('id', stopId);
    if (error) {
      setToast({ type: 'error', msg: error.message });
    } else {
      await refreshStops(deliveryId);
    }
  };

  const startEdit = (d: Delivery) => {
    setEditing(true);
    setEditForm({
      pickup_name: d.pickup_name, pickup_address: d.pickup_address, pickup_city: d.pickup_city,
      pickup_state: d.pickup_state, pickup_zip: d.pickup_zip, pickup_contact: d.pickup_contact,
      delivery_name: d.delivery_name, delivery_address: d.delivery_address, delivery_city: d.delivery_city,
      delivery_state: d.delivery_state, delivery_zip: d.delivery_zip, delivery_contact: d.delivery_contact,
      package_type: d.package_type, package_description: d.package_description, priority: d.priority,
      temperature_control: d.temperature_control, weight_lbs: d.weight_lbs, max_bid_amount: d.max_bid_amount,
    });
  };

  const saveEdit = async () => {
    if (!selected) return;
    setSaving(true);
    const { error } = await supabase.from('deliveries').update(editForm).eq('id', selected.id);
    setSaving(false);
    if (error) {
      setToast({ type: 'error', msg: error.message });
    } else {
      setToast({ type: 'success', msg: 'Delivery details updated' });
      setEditing(false);
      load();
      setSelected({ ...selected, ...editForm } as Delivery);
    }
  };

  const createDispatchOrder = async (d: Delivery) => {
    setSaving(true);
    try {
      const { error: rpcError } = await supabase.rpc('create_dispatch_order_manual', { p_delivery_id: d.id });
      if (rpcError) {
        setToast({ type: 'error', msg: rpcError.message });
      } else {
        setToast({ type: 'success', msg: 'Dispatch order created successfully.' });
        load();
      }
    } catch {
      setToast({ type: 'error', msg: 'Failed to create dispatch order.' });
    }
    setSaving(false);
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Deliveries</h1>
      <p className="text-slate-500 mb-6">Manage all delivery requests — override details, reassign drivers, advance status</p>

      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-[slideIn_0.3s_ease-out] ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.type === 'success' ? <Zap className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
          {toast.msg}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-10" placeholder="Search by pickup, drop-off, city..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Package className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No deliveries found</p></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((d) => {
            const statusCfg = statusConfig(d.status);
            const prioCfg = priorityConfig(d.priority);
            return (
              <div key={d.id} className="p-4 hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => { setSelected(d); setEditing(false); setShowStopsMgr(false); }}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-2 h-2 rounded-full ${prioCfg.dot} shrink-0`} />
                    <div className="min-w-0">
                      <div className="font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                      <div className="text-xs text-slate-500">{d.pickup_city}, {d.pickup_state} → {d.delivery_city}, {d.delivery_state}{stopsMap[d.id]?.filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').length ? ` · ${stopsMap[d.id].filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').length} stop${stopsMap[d.id].filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').length > 1 ? 's' : ''}` : ''}</div>
                      <div className="flex items-center gap-3 mt-0.5">
                        {d.bol_number && <span className="text-xs font-mono text-slate-400 flex items-center gap-0.5"><FileText className="w-3 h-3" />{d.bol_number}</span>}
                        {d.pod_number && <span className="text-xs font-mono text-emerald-600 flex items-center gap-0.5"><FileCheck className="w-3 h-3" />{d.pod_number}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge ${prioCfg.color}`}>{prioCfg.label}</span>
                    <span className={`badge ${statusCfg.color}`}>{statusCfg.label}</span>
                    <span className="text-sm font-semibold text-slate-700 hidden sm:inline">{formatMoney(d.calculated_price || d.max_bid_amount)}</span>
                  </div>
                </div>
                {d.driver && <div className="mt-1.5 text-xs text-slate-400 flex items-center gap-1"><Truck className="w-3 h-3" /> {d.driver.full_name}</div>}
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => { setSelected(null); setEditing(false); }}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[85vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-900">{editing ? 'Edit Delivery' : 'Delivery Details'}</h3>
              <div className="flex items-center gap-1">
                {!editing && (
                  <button onClick={() => startEdit(selected)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-primary-600" title="Edit / Override">
                    <Edit3 className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => { setSelected(null); setEditing(false); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
              </div>
            </div>

            {editing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Priority</label>
                    <select className="input" value={editForm.priority} onChange={(e) => setEditForm({ ...editForm, priority: e.target.value as Delivery['priority'] })}>
                      {Object.entries(PRIORITY_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Weight (lbs)</label><input type="number" className="input" value={editForm.weight_lbs ?? ''} onChange={(e) => setEditForm({ ...editForm, weight_lbs: parseFloat(e.target.value) || 0 })} /></div>
                </div>
                <div><label className="label">Max Bid Amount</label><input type="number" step="0.01" className="input" value={editForm.max_bid_amount ?? ''} onChange={(e) => setEditForm({ ...editForm, max_bid_amount: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="label">Temperature Control</label>
                  <select className="input" value={editForm.temperature_control} onChange={(e) => setEditForm({ ...editForm, temperature_control: e.target.value as Delivery['temperature_control'] })}>
                    <option value="none">None</option><option value="ambient">Ambient</option><option value="refrigerated">Refrigerated</option><option value="frozen">Frozen</option>
                  </select>
                </div>
                <hr className="border-slate-100" />
                <div className="text-xs font-semibold text-slate-500 uppercase">Pickup</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Name</label><input className="input" value={editForm.pickup_name ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_name: e.target.value })} /></div>
                  <div><label className="label">Contact</label><input className="input" value={editForm.pickup_contact ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_contact: e.target.value })} /></div>
                </div>
                <div><label className="label">Address</label><input className="input" value={editForm.pickup_address ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_address: e.target.value })} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="label">City</label><input className="input" value={editForm.pickup_city ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_city: e.target.value })} /></div>
                  <div><label className="label">State</label><input className="input" value={editForm.pickup_state ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_state: e.target.value })} /></div>
                  <div><label className="label">ZIP</label><input className="input" value={editForm.pickup_zip ?? ''} onChange={(e) => setEditForm({ ...editForm, pickup_zip: e.target.value })} /></div>
                </div>
                <hr className="border-slate-100" />
                <div className="text-xs font-semibold text-slate-500 uppercase">Drop-off</div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Name</label><input className="input" value={editForm.delivery_name ?? ''} onChange={(e) => setEditForm({ ...editForm, delivery_name: e.target.value })} /></div>
                  <div><label className="label">Contact</label><input className="input" value={editForm.delivery_contact ?? ''} onChange={(e) => setEditForm({ ...editForm, delivery_contact: e.target.value })} /></div>
                </div>
                <div><label className="label">Address</label><input className="input" value={editForm.delivery_address ?? ''} onChange={(e) => setEditForm({ ...editForm, delivery_address: e.target.value })} /></div>
                <div className="grid grid-cols-3 gap-3">
                  <div><label className="label">City</label><input className="input" value={editForm.delivery_city ?? ''} onChange={(e) => setEditForm({ ...editForm, delivery_city: e.target.value })} /></div>
                  <div><label className="label">State</label><input className="input" value={editForm.delivery_state ?? ''} onChange={(e) => setEditForm({ ...editForm, delivery_state: e.target.value })} /></div>
                  <div><label className="label">ZIP</label><input className="input" value={editForm.delivery_zip ?? ''} onChange={(e) => setEditForm({ ...editForm, delivery_zip: e.target.value })} /></div>
                </div>
                <div><label className="label">Package Description</label><textarea className="input min-h-[60px] resize-none" value={editForm.package_description ?? ''} onChange={(e) => setEditForm({ ...editForm, package_description: e.target.value })} /></div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(false)} className="btn-secondary flex-1">Cancel</button>
                  <button onClick={saveEdit} disabled={saving} className="btn-primary flex-1"><Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`badge ${statusConfig(selected.status).color}`}>{statusConfig(selected.status).label}</span>
                  <span className={`badge ${priorityConfig(selected.priority).color}`}>{priorityConfig(selected.priority).label}</span>
                  <span className="text-xs text-slate-400 ml-auto">{formatDate(selected.created_at)}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-xs font-semibold text-slate-400 uppercase mb-0.5">BOL Number</div>
                    <div className="font-mono text-sm text-slate-700 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-slate-400" />{selected.bol_number || 'Not assigned'}</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100">
                    <div className="text-xs font-semibold text-emerald-500 uppercase mb-0.5">POD Number</div>
                    <div className="font-mono text-sm text-emerald-700 flex items-center gap-1.5"><FileCheck className="w-3.5 h-3.5 text-emerald-500" />{selected.pod_number || 'Pending delivery'}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-slate-500">Package:</span> <span className="font-medium capitalize">{selected.package_type.replace('_', ' ')}</span></div>
                  <div><span className="text-slate-500">Temp:</span> <span className="font-medium capitalize">{selected.temperature_control}</span></div>
                  <div><span className="text-slate-500">Weight:</span> <span className="font-medium">{selected.weight_lbs} lbs</span></div>
                  <div><span className="text-slate-500">Price:</span> <span className="font-medium">{formatMoney(selected.calculated_price || selected.max_bid_amount)}</span></div>
                </div>
                <hr className="my-3 border-slate-100" />
                <div className="font-semibold text-slate-900">Pickup</div>
                <div className="text-slate-700">{selected.pickup_name}<br />{selected.pickup_address}, {selected.pickup_city}, {selected.pickup_state} {selected.pickup_zip}<br />{selected.pickup_contact}</div>
                {stopsMap[selected.id]?.filter(s => s.stop_type === 'intermediate' || s.stop_type === 'return').map((s, i) => (
                  <div key={s.id} className="mt-2 p-3 rounded-lg bg-amber-50 border border-amber-100">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-amber-700 flex items-center gap-1">
                        {s.stop_type === 'return' ? <><RotateCcw className="w-3.5 h-3.5 text-amber-500" /> Return Stop {i + 1}</> : <><MapPin className="w-3.5 h-3.5 text-amber-500" /> Stop {i + 1}</>}
                      </div>
                      <button onClick={() => deleteStop(s.id, selected.id)} className="p-1 rounded text-slate-400 hover:bg-red-50 hover:text-red-500 transition-all"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                    <div className="text-slate-700">{s.name}<br />{s.address}, {s.city}, {s.state} {s.zip}<br />{s.contact}</div>
                    {s.notes && <div className="text-xs text-slate-500 mt-1">Notes: {s.notes}</div>}
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : s.status === 'arrived' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'}`}>{s.status}</span>
                      {s.status === 'pending' && <button onClick={() => updateStopStatus(s.id, selected.id, 'arrived')} className="text-xs text-blue-600 font-medium hover:text-blue-700">Mark Arrived</button>}
                      {s.status === 'arrived' && <button onClick={() => updateStopStatus(s.id, selected.id, 'completed')} className="text-xs text-emerald-600 font-medium hover:text-emerald-700">Mark Completed</button>}
                    </div>
                  </div>
                ))}
                <div className="font-semibold text-slate-900 mt-2">Drop-off</div>
                <div className="text-slate-700">{selected.delivery_name}<br />{selected.delivery_address}, {selected.delivery_city}, {selected.delivery_state} {selected.delivery_zip}<br />{selected.delivery_contact}</div>
                {!showStopsMgr ? (
                  <button onClick={() => setShowStopsMgr(true)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-600 hover:text-primary-700">
                    <Plus className="w-3.5 h-3.5" /> Manage Stops
                  </button>
                ) : (
                  <StopsManager deliveryId={selected.id} onAdd={addStopToDelivery} onClose={() => setShowStopsMgr(false)} />
                )}
                {selected.package_description && <><div className="font-semibold text-slate-900 mt-2">Description</div><div className="text-slate-700">{selected.package_description}</div></>}
                {selected.special_requirements && <><div className="font-semibold text-slate-900 mt-2">Special Requirements</div><div className="text-slate-700">{selected.special_requirements}</div></>}
                {selected.shipper_instructions && <><div className="font-semibold text-slate-900 mt-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-blue-500" /> Shipper Instructions</div><div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-slate-700 mt-1">{selected.shipper_instructions}</div></>}
                {selected.driver?.special_instructions && <><div className="font-semibold text-slate-900 mt-2 flex items-center gap-1.5"><ClipboardList className="w-3.5 h-3.5 text-emerald-500" /> Driver Instructions</div><div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-slate-700 mt-1">{selected.driver.special_instructions}</div></>}
                {selected.pod_photo_url && <><div className="font-semibold text-slate-900 mt-2 flex items-center gap-1.5"><Camera className="w-3.5 h-3.5 text-emerald-500" /> Delivery Photo</div><img src={selected.pod_photo_url} alt="Delivery proof" className="w-full rounded-lg border border-slate-200 mt-1" /></>}
                {selected.pod_signature_url && <><div className="font-semibold text-slate-900 mt-2 flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5 text-emerald-500" /> Recipient Signature</div><img src={selected.pod_signature_url} alt="Signature" className="w-full rounded-lg border border-slate-200 bg-white mt-1" /></>}
                {selected.pod_notes && <><div className="font-semibold text-slate-900 mt-2">Delivery Notes</div><div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-slate-700 mt-1">{selected.pod_notes}</div></>}
                {selected.pod_submitted_at && <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-1"><MapPin className="w-3 h-3" /> Submitted {formatDate(selected.pod_submitted_at)}{selected.pod_location ? ` · ${selected.pod_location}` : ''}</div>}
                <hr className="my-3 border-slate-100" />
                {selected.shipper && <div><span className="text-slate-500">Shipper:</span> <span className="font-medium">{selected.shipper.full_name}</span></div>}
                {selected.driver ? (
                  <div className="flex items-center justify-between">
                    <div><span className="text-slate-500">Driver:</span> <span className="font-medium">{selected.driver.full_name}</span></div>
                    <button onClick={() => setReassignDriver('show')} className="text-xs font-semibold text-primary-600 hover:text-primary-700 flex items-center gap-1">
                      <UserCog className="w-3.5 h-3.5" /> Reassign
                    </button>
                  </div>
                ) : (
                  <div><span className="text-slate-500">Driver:</span> <span className="text-slate-400">Not assigned</span></div>
                )}

                {reassignDriver === 'show' && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 animate-fade-in">
                    <label className="label">Select New Driver</label>
                    <select className="input" value={reassignDriver} onChange={(e) => setReassignDriver(e.target.value)} onClick={(e) => e.stopPropagation()}>
                      <option value="show" disabled>Select a driver...</option>
                      {drivers.filter((d) => d.is_active).map((d) => <option key={d.id} value={d.id}>{d.full_name} — {d.service_area || 'No area'}</option>)}
                    </select>
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => setReassignDriver('')} className="text-xs text-slate-500 px-3 py-1.5 rounded-lg hover:bg-slate-100">Cancel</button>
                      <button onClick={() => reassign(selected, reassignDriver)} disabled={reassignDriver === 'show'} className="text-xs font-semibold text-white bg-primary-600 px-3 py-1.5 rounded-lg hover:bg-primary-700 disabled:opacity-50">Confirm Reassign</button>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-3">
                  {selected.status === 'posted' && (
                    <button onClick={() => autoAssign(selected)} disabled={assigning} className="btn-primary text-xs"><Zap className="w-3.5 h-3.5" /> Auto-Assign</button>
                  )}
                  {selected.status === 'assigned' && <button onClick={() => advanceStatus(selected)} className="btn-accent text-xs">Mark Picked Up</button>}
                  {selected.status === 'picked_up' && <button onClick={() => advanceStatus(selected)} className="btn-accent text-xs">Start Transit</button>}
                  {selected.status === 'in_transit' && <button onClick={() => advanceStatus(selected)} className="btn-accent text-xs">Mark Delivered</button>}
                  {dispatchOrders[selected.id] && onNavigate && (
                    <button onClick={() => onNavigate('dispatch-orders')} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-blue-50 text-blue-600 text-xs font-semibold hover:bg-blue-100 transition-all">
                      <ClipboardList className="w-3.5 h-3.5" /> View Dispatch Order
                    </button>
                  )}
                  {!dispatchOrders[selected.id] && selected.driver_id && selected.status !== 'cancelled' && (
                    <button onClick={() => createDispatchOrder(selected)} disabled={saving} className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-all disabled:opacity-50">
                      <Plus className="w-3.5 h-3.5" /> {saving ? 'Creating...' : 'Create Dispatch Order'}
                    </button>
                  )}
                  {selected.status !== 'delivered' && selected.status !== 'cancelled' && (
                    <button onClick={() => cancelDelivery(selected)} className="text-xs font-medium text-red-600 px-3 py-2 rounded-lg border border-red-200 hover:bg-red-50">Cancel Delivery</button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function StopsManager({ deliveryId, onAdd, onClose }: {
  deliveryId: string;
  onAdd: (deliveryId: string, stop: { stop_type: string; name: string; address: string; city: string; state: string; zip: string; contact: string; scheduled_at: string | null; notes: string | null }) => void;
  onClose: () => void;
}) {
  const [stopType, setStopType] = useState<'intermediate' | 'return'>('intermediate');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [contact, setContact] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [notes, setNotes] = useState('');
  const [adding, setAdding] = useState(false);

  const canSubmit = name.trim() && address.trim() && city.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setAdding(true);
    await onAdd(deliveryId, {
      stop_type: stopType,
      name: name.trim(),
      address: address.trim(),
      city: city.trim(),
      state: state.trim().toUpperCase().slice(0, 2),
      zip: zip.trim(),
      contact: contact.trim(),
      scheduled_at: scheduledAt || null,
      notes: notes.trim() || null,
    });
    setName(''); setAddress(''); setCity(''); setState(''); setZip(''); setContact(''); setScheduledAt(''); setNotes('');
    setAdding(false);
  };

  return (
    <div className="mt-2 p-4 rounded-xl bg-slate-50 border border-slate-200 animate-fade-in space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-slate-600 uppercase">Add a Stop</div>
        <button onClick={onClose} className="text-xs text-slate-400 hover:text-slate-600">Close</button>
      </div>
      <div className="flex gap-2">
        <button onClick={() => setStopType('intermediate')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all ${stopType === 'intermediate' ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>Intermediate Stop</button>
        <button onClick={() => setStopType('return')} className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1 ${stopType === 'return' ? 'bg-amber-500 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}><RotateCcw className="w-3 h-3" /> Return Stop</button>
      </div>
      <div><label className="label">Stop Name / Facility</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clinic - Lab Pickup" /></div>
      <div><label className="label">Street Address</label><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="789 Medical Center Dr" /></div>
      <div className="grid grid-cols-3 gap-2">
        <div><label className="label">City</label><input className="input" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Smyrna" /></div>
        <div><label className="label">State</label><input className="input" value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} placeholder="GA" /></div>
        <div><label className="label">ZIP</label><input className="input" value={zip} onChange={(e) => setZip(e.target.value)} placeholder="30080" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="label">Contact Phone</label><input className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="(404) 555-0200" /></div>
        <div><label className="label">Scheduled Time (optional)</label><input type="datetime-local" className="input" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} /></div>
      </div>
      <div><label className="label">Notes (optional)</label><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Pick up lab samples only" /></div>
      <button onClick={submit} disabled={!canSubmit || adding} className="btn-primary w-full text-sm disabled:opacity-50">
        {adding ? 'Adding...' : 'Add Stop'}
      </button>
    </div>
  );
}
