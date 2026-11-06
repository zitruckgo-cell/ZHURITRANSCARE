import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ArrowRight, Check, ClipboardList, Clock3, FileText, MapPin, Package, Phone, Plus, Truck, X } from 'lucide-react';
import { supabase, type DispatchOrder, type DispatchLeg, type DispatchLegSnapshot } from '../lib/supabase';
import { formatMoney } from '../lib/utils';
import { useAuth } from '../lib/auth';
import { AdminScopePicker } from './AdminScopePicker';

type DispatchOrdersProps = {
  admin?: boolean;
};

const legStatusStyles: Record<DispatchLeg['status'], string> = {
  dispatched: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  proceeding_to_pickup: 'bg-amber-100 text-amber-700',
  picked_up: 'bg-orange-100 text-orange-700',
  in_transit: 'bg-cyan-100 text-cyan-700',
  delivered: 'bg-slate-100 text-slate-700',
  cancelled: 'bg-red-100 text-red-700',
};

function displayStatus(status: DispatchLeg['status']): string {
  return status.replace(/_/g, ' ');
}

function displayDate(value: string | null): string {
  if (!value) return 'Not scheduled';
  return new Date(value).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

export function DispatchOrders({ admin = false }: DispatchOrdersProps) {
  const { user, isAdmin } = useAuth();
  const [scopeDriverId, setScopeDriverId] = useState<string | null>(null);
  const [orders, setOrders] = useState<DispatchOrder[]>([]);
  const [selected, setSelected] = useState<DispatchOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    let query = supabase.from('dispatch_orders').select('*').order('created_at', { ascending: false });
    if (admin && scopeDriverId) query = query.eq('driver_id', scopeDriverId);
    const { data, error: queryError } = await query;
    if (queryError) {
      setError('Dispatch orders could not be loaded.');
      setLoading(false);
      return;
    }
    const orderList = (data as DispatchOrder[]) || [];
    if (orderList.length > 0) {
      const orderIds = orderList.map((o) => o.id);
      const { data: legData } = await supabase.from('dispatch_legs').select('*').in('dispatch_order_id', orderIds).order('leg_number', { ascending: true });
      const legsByOrder: Record<string, DispatchLeg[]> = {};
      (legData as DispatchLeg[] || []).forEach((leg) => {
        if (!legsByOrder[leg.dispatch_order_id]) legsByOrder[leg.dispatch_order_id] = [];
        legsByOrder[leg.dispatch_order_id].push(leg);
      });
      orderList.forEach((o) => { o.legs = legsByOrder[o.id] || []; });
    }
    setOrders(orderList);
    setLoading(false);
  }, [admin, scopeDriverId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase.channel(`dispatch-orders-${admin ? 'admin' : user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_orders' }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'dispatch_legs' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [admin, user?.id, load]);

  const advanceLeg = async (leg: DispatchLeg, action: string) => {
    setWorking(leg.id);
    const { error: actionError } = await supabase.rpc('advance_dispatch_leg', { p_leg_id: leg.id, p_action: action });
    if (actionError) {
      setError('This dispatch leg could not be updated.');
    } else {
      setToast('Leg status updated.');
      await load();
    }
    setWorking(null);
  };

  const refreshSelected = useCallback(async () => {
    if (!selected) return;
    const { data } = await supabase.from('dispatch_orders').select('*').eq('id', selected.id).maybeSingle();
    if (data) {
      const { data: legData } = await supabase.from('dispatch_legs').select('*').eq('dispatch_order_id', selected.id).order('leg_number', { ascending: true });
      const updated = data as DispatchOrder;
      updated.legs = (legData as DispatchLeg[]) || [];
      setSelected(updated);
    }
  }, [selected]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading dispatch orders...</div>;

  return (
    <div>
      {isAdmin && admin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
      {toast && <div className="fixed top-6 right-6 z-50 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800 shadow-xl">{toast}</div>}
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dispatch Orders</h1>
          <p className="mt-1 text-slate-500">Paid, approved loads ready for dispatch and pickup.</p>
        </div>
        <div className="hidden rounded-xl bg-blue-50 px-3 py-2 text-right sm:block">
          <div className="text-lg font-bold text-blue-700">{orders.length}</div>
          <div className="text-xs text-blue-600">Orders</div>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="card p-12 text-center">
          <ClipboardList className="mx-auto mb-4 h-12 w-12 text-slate-300" />
          <p className="font-medium text-slate-600">No dispatch orders yet</p>
          <p className="mt-1 text-sm text-slate-400">Orders appear here after an approved bid has been paid successfully.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const snapshot = order.order_snapshot;
            const hasReturn = order.legs?.some((l) => l.leg_type === 'return') || false;
            return (
              <button key={order.id} onClick={() => setSelected(order)} className="card w-full p-5 text-left transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-900">{order.dispatch_order_number}</span>
                      <span className={`badge capitalize ${legStatusStyles[order.status] ?? 'bg-slate-100 text-slate-600'}`}>{displayStatus(order.status)}</span>
                      <span className="badge bg-emerald-50 text-emerald-700">Payment {order.payment_status}</span>
                      {hasReturn && <span className="badge bg-blue-50 text-blue-700">Round Trip</span>}
                    </div>
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      <span>{snapshot.pickup.city}, {snapshot.pickup.state}</span><ArrowRight className="h-4 w-4 text-slate-300" /><span>{snapshot.delivery.city}, {snapshot.delivery.state}</span>
                      {hasReturn && <><ArrowRight className="h-4 w-4 text-slate-300" /><span className="text-blue-600">Return</span></>}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{snapshot.pickup.name} to {snapshot.delivery.name} · Created {displayDate(order.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-3 sm:text-right">
                    <div><div className="font-bold text-slate-900">{formatMoney(snapshot.money.agreed_driver_payment)}</div><div className="text-xs text-slate-500">Driver payment</div></div>
                    <span className="text-sm font-semibold text-blue-600">View</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && <DispatchOrderModal key={selected.id} order={selected} working={working === selected.id} onClose={() => setSelected(null)} onAdvanceLeg={advanceLeg} admin={admin} canAddReturn={Boolean(isAdmin) || selected.shipper_id === (user?.id ?? '')} onChanged={refreshSelected} onToast={setToast} />}
    </div>
  );
}

function DispatchOrderModal({ order, working, onClose, onAdvanceLeg, admin, canAddReturn, onChanged, onToast }: {
  order: DispatchOrder;
  working: boolean;
  onClose: () => void;
  onAdvanceLeg: (leg: DispatchLeg, action: string) => void;
  admin: boolean;
  canAddReturn: boolean;
  onChanged: () => Promise<void>;
  onToast: (msg: string) => void;
}) {
  const [showReturnForm, setShowReturnForm] = useState(false);
  const snapshot = order.order_snapshot;
  const legs = order.legs || [];
  const hasReturn = legs.some((l) => l.leg_type === 'return');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
      <div className="relative card max-h-[90vh] w-full max-w-3xl overflow-y-auto p-6" onClick={(event) => event.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div><div className="font-mono text-sm font-bold text-blue-700">{order.dispatch_order_number}</div><h2 className="mt-1 text-xl font-bold text-slate-900">Dispatch Order{order.is_round_trip || hasReturn ? ' · Round Trip' : ''}</h2></div>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="mb-5 flex flex-wrap items-center gap-2"><span className={`badge capitalize ${legStatusStyles[order.status] ?? 'bg-slate-100 text-slate-600'}`}>{displayStatus(order.status)}</span><span className="badge bg-emerald-50 text-emerald-700">Payment {order.payment_status}</span>{hasReturn && <span className="badge bg-blue-50 text-blue-700">Round Trip</span>}</div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <InfoCard title="People" icon={<Phone className="h-4 w-4 text-slate-500" />}>
            <div className="font-semibold text-slate-800">Shipper: {snapshot.shipper.business_name || snapshot.shipper.name}</div><div className="text-slate-500">{snapshot.shipper.name} · {snapshot.shipper.phone || snapshot.shipper.email}</div>
            <div className="mt-3 font-semibold text-slate-800">Driver: {snapshot.driver.name}</div><div className="text-slate-500">{snapshot.driver.phone || snapshot.driver.email} · {snapshot.driver.vehicle_type || 'Vehicle not listed'}</div>
          </InfoCard>
          <InfoCard title="Cargo and money" icon={<Package className="h-4 w-4 text-slate-500" />}>
            <div className="font-semibold capitalize text-slate-800">{snapshot.cargo.package_type.replace(/_/g, ' ')}</div><div className="text-slate-500">{snapshot.cargo.description || 'No description'} · {snapshot.cargo.weight_lbs || 'Weight not provided'} lbs</div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-sm"><div><span className="text-slate-500">Driver:</span> <b>{formatMoney(snapshot.money.agreed_driver_payment)}</b></div><div><span className="text-slate-500">Commission:</span> <b>{formatMoney(snapshot.money.platform_commission)}</b></div></div>
          </InfoCard>
        </div>

        {(snapshot.instructions.special_requirements || snapshot.instructions.shipper_instructions || snapshot.instructions.bid_message || snapshot.instructions.counter_message) && <InfoCard title="Special instructions" icon={<ClipboardList className="h-4 w-4 text-slate-500" />}><div className="space-y-2 text-sm text-slate-600">{snapshot.instructions.special_requirements && <div>{snapshot.instructions.special_requirements}</div>}{snapshot.instructions.shipper_instructions && <div>{snapshot.instructions.shipper_instructions}</div>}{snapshot.instructions.bid_message && <div>Bid note: {snapshot.instructions.bid_message}</div>}{snapshot.instructions.counter_message && <div>Counter note: {snapshot.instructions.counter_message}</div>}</div></InfoCard>}

        {(snapshot.documents.length > 0 || snapshot.delivery_document_urls.length > 0) && <InfoCard title="Documents and attachments" icon={<FileText className="h-4 w-4 text-slate-500" />}><div className="space-y-2 text-sm">{snapshot.documents.map((document) => <a key={document.id} href={document.file_url} target="_blank" rel="noreferrer" className="block font-medium text-blue-600 hover:underline">{document.name}</a>)}{snapshot.delivery_document_urls.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="block font-medium text-blue-600 hover:underline">Attached load document</a>)}</div></InfoCard>}

        {/* Legs section */}
        <div className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">Trip Legs</h3>
            {canAddReturn && !hasReturn && order.status !== 'cancelled' && !showReturnForm && (
              <button onClick={() => setShowReturnForm(true)} className="inline-flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-600 transition-all hover:bg-blue-100">
                <Plus className="h-3.5 w-3.5" /> Add Return Trip
              </button>
            )}
          </div>

          <div className="space-y-4">
            {legs.map((leg) => (
              <LegCard key={leg.id} leg={leg} working={working} onAdvance={onAdvanceLeg} admin={admin} />
            ))}
          </div>

          {showReturnForm && (
            <ReturnTripForm
              orderId={order.id}
              onCancel={() => setShowReturnForm(false)}
              onSaved={async () => { setShowReturnForm(false); await onChanged(); onToast('Return trip added.'); }}
              onError={(msg) => onToast(msg)}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function LegCard({ leg, working, onAdvance, admin }: { leg: DispatchLeg; working: boolean; onAdvance: (leg: DispatchLeg, action: string) => void; admin: boolean }) {
  const snap = leg.leg_snapshot;
  const legTitle = leg.leg_type === 'outbound' ? 'Outbound Trip' : 'Return Trip';
  const titleColor = leg.leg_type === 'outbound' ? 'text-blue-700' : 'text-emerald-700';

  const actionButtons: { action: string; label: string; icon: typeof Check; show: boolean }[] = [
    { action: 'accept', label: 'Accept', icon: Check, show: leg.status === 'dispatched' },
    { action: 'proceed', label: 'Proceed to Pickup', icon: Truck, show: leg.status === 'accepted' },
    { action: 'pickup', label: 'Picked Up', icon: Package, show: leg.status === 'proceeding_to_pickup' },
    { action: 'transit', label: 'Start Transit', icon: Truck, show: leg.status === 'picked_up' },
    { action: 'deliver', label: 'Mark Delivered', icon: Check, show: leg.status === 'in_transit' },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold ${titleColor}`}>{legTitle}</span>
          <span className={`badge capitalize ${legStatusStyles[leg.status]}`}>{displayStatus(leg.status)}</span>
        </div>
        <span className="text-xs text-slate-400">Leg {leg.leg_number}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg bg-blue-50 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-blue-600"><MapPin className="h-3 w-3" /> Pickup</div>
          <div className="text-sm font-medium text-slate-800">{snap.pickup.name}</div>
          <div className="text-xs text-slate-600">{snap.pickup.address}, {snap.pickup.city}, {snap.pickup.state} {snap.pickup.zip}</div>
          <div className="mt-0.5 text-xs text-slate-500">Contact: {snap.pickup.contact || 'Not provided'}</div>
          <div className="mt-1 text-xs font-medium text-slate-400">Pickup: {displayDate(snap.pickup.scheduled_at)}</div>
        </div>
        <div className="rounded-lg bg-emerald-50 p-3">
          <div className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase text-emerald-600"><MapPin className="h-3 w-3" /> Delivery</div>
          <div className="text-sm font-medium text-slate-800">{snap.delivery.name}</div>
          <div className="text-xs text-slate-600">{snap.delivery.address}, {snap.delivery.city}, {snap.delivery.state} {snap.delivery.zip}</div>
          <div className="mt-0.5 text-xs text-slate-500">Contact: {snap.delivery.contact || 'Not provided'}</div>
          <div className="mt-1 text-xs font-medium text-slate-400">Deadline: {displayDate(snap.delivery.deadline)}</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <span className="px-2 py-0.5 rounded bg-slate-100 capitalize text-slate-600">{snap.cargo.package_type.replace(/_/g, ' ')}</span>
        {snap.cargo.weight_lbs != null && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{snap.cargo.weight_lbs} lbs</span>}
        {snap.cargo.temperature_control && snap.cargo.temperature_control !== 'none' && <span className="px-2 py-0.5 rounded bg-slate-100 capitalize text-slate-600">{snap.cargo.temperature_control}</span>}
        {snap.cargo.description && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{snap.cargo.description}</span>}
        {snap.instructions.special_requirements && <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">{snap.instructions.special_requirements}</span>}
      </div>

      {!admin && (
        <div className="mt-3 flex flex-wrap gap-2">
          {actionButtons.filter((b) => b.show).map((b) => {
            const Icon = b.icon;
            return <button key={b.action} onClick={() => onAdvance(leg, b.action)} disabled={working} className="btn-primary text-xs"><Icon className="h-3.5 w-3.5" /> {working ? 'Updating...' : b.label}</button>;
          })}
          {leg.status === 'delivered' && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600"><Check className="h-3.5 w-3.5" /> Delivered</span>}
        </div>
      )}
      {admin && leg.status === 'delivered' && <div className="mt-2 text-xs font-semibold text-slate-500">Leg completed</div>}
    </div>
  );
}

function ReturnTripForm({ orderId, onCancel, onSaved, onError }: {
  orderId: string;
  onCancel: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    pickupName: '', pickupAddress: '', pickupCity: '', pickupState: '', pickupZip: '', pickupContact: '',
    deliveryName: '', deliveryAddress: '', deliveryCity: '', deliveryState: '', deliveryZip: '', deliveryContact: '',
    scheduledPickup: '', deliveryDeadline: '',
    packageType: 'medication', packageDescription: '', weightLbs: '', temperatureControl: 'none', instructions: '',
  });
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!form.pickupName || !form.deliveryName || !form.pickupAddress || !form.deliveryAddress) {
      onError('Please fill in pickup and delivery details.');
      return;
    }
    setSaving(true);
    const { error: rpcError } = await supabase.rpc('add_return_leg', {
      p_order_id: orderId,
      p_pickup_name: form.pickupName,
      p_pickup_address: form.pickupAddress,
      p_pickup_city: form.pickupCity,
      p_pickup_state: form.pickupState,
      p_pickup_zip: form.pickupZip,
      p_pickup_contact: form.pickupContact,
      p_delivery_name: form.deliveryName,
      p_delivery_address: form.deliveryAddress,
      p_delivery_city: form.deliveryCity,
      p_delivery_state: form.deliveryState,
      p_delivery_zip: form.deliveryZip,
      p_delivery_contact: form.deliveryContact,
      p_scheduled_pickup: form.scheduledPickup || null,
      p_delivery_deadline: form.deliveryDeadline || null,
      p_package_type: form.packageType,
      p_package_description: form.packageDescription || null,
      p_weight_lbs: form.weightLbs ? parseFloat(form.weightLbs) : null,
      p_temperature_control: form.temperatureControl,
      p_instructions: form.instructions || null,
    });
    setSaving(false);
    if (rpcError) {
      onError(rpcError.message.includes('already exists') ? 'A return trip already exists for this order.' : 'Could not add the return trip.');
      return;
    }
    onSaved();
  };

  return (
    <div className="mt-4 rounded-xl border-2 border-blue-200 bg-blue-50/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-blue-700">Add Return Trip</h4>
        <button onClick={onCancel} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase text-slate-500">Return Pickup</div>
        <input className="input" placeholder="Pickup location name" value={form.pickupName} onChange={(e) => setForm({ ...form, pickupName: e.target.value })} />
        <input className="input" placeholder="Pickup address" value={form.pickupAddress} onChange={(e) => setForm({ ...form, pickupAddress: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <input className="input" placeholder="City" value={form.pickupCity} onChange={(e) => setForm({ ...form, pickupCity: e.target.value })} />
          <input className="input" placeholder="State" value={form.pickupState} onChange={(e) => setForm({ ...form, pickupState: e.target.value })} />
          <input className="input" placeholder="ZIP" value={form.pickupZip} onChange={(e) => setForm({ ...form, pickupZip: e.target.value })} />
        </div>
        <input className="input" placeholder="Pickup contact (phone/name)" value={form.pickupContact} onChange={(e) => setForm({ ...form, pickupContact: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Pickup date/time</label><input type="datetime-local" className="input" value={form.scheduledPickup} onChange={(e) => setForm({ ...form, scheduledPickup: e.target.value })} /></div>
          <div><label className="label">Delivery deadline</label><input type="datetime-local" className="input" value={form.deliveryDeadline} onChange={(e) => setForm({ ...form, deliveryDeadline: e.target.value })} /></div>
        </div>

        <div className="text-xs font-semibold uppercase text-slate-500">Return Delivery</div>
        <input className="input" placeholder="Delivery location name" value={form.deliveryName} onChange={(e) => setForm({ ...form, deliveryName: e.target.value })} />
        <input className="input" placeholder="Delivery address" value={form.deliveryAddress} onChange={(e) => setForm({ ...form, deliveryAddress: e.target.value })} />
        <div className="grid grid-cols-3 gap-2">
          <input className="input" placeholder="City" value={form.deliveryCity} onChange={(e) => setForm({ ...form, deliveryCity: e.target.value })} />
          <input className="input" placeholder="State" value={form.deliveryState} onChange={(e) => setForm({ ...form, deliveryState: e.target.value })} />
          <input className="input" placeholder="ZIP" value={form.deliveryZip} onChange={(e) => setForm({ ...form, deliveryZip: e.target.value })} />
        </div>
        <input className="input" placeholder="Delivery contact (phone/name)" value={form.deliveryContact} onChange={(e) => setForm({ ...form, deliveryContact: e.target.value })} />

        <div className="text-xs font-semibold uppercase text-slate-500">Return Load Details</div>
        <div className="grid grid-cols-2 gap-2">
          <select className="input" value={form.packageType} onChange={(e) => setForm({ ...form, packageType: e.target.value })}>
            <option value="medication">Medication</option><option value="specimen">Specimen</option><option value="equipment">Equipment</option><option value="other">Other</option>
          </select>
          <select className="input" value={form.temperatureControl} onChange={(e) => setForm({ ...form, temperatureControl: e.target.value })}>
            <option value="none">No temp control</option><option value="ambient">Ambient</option><option value="refrigerated">Refrigerated</option><option value="frozen">Frozen</option>
          </select>
        </div>
        <input className="input" placeholder="Load description (optional)" value={form.packageDescription} onChange={(e) => setForm({ ...form, packageDescription: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <input type="number" className="input" placeholder="Weight (lbs)" value={form.weightLbs} onChange={(e) => setForm({ ...form, weightLbs: e.target.value })} />
          <input className="input" placeholder="Special instructions (optional)" value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onCancel} className="btn-secondary flex-1">Cancel</button>
          <button onClick={submit} disabled={saving} className="btn-primary flex-1"><Plus className="h-4 w-4" /> {saving ? 'Adding...' : 'Add Return Trip'}</button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">{icon}{title}</div>{children}</div>;
}
