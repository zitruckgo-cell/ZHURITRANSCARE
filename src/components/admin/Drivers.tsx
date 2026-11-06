import { useState, useEffect, useCallback } from 'react';
import { Truck, Search, Star, MapPin, Plus, X, Edit3, Check, Clock, Ban, Eye, Phone, Mail, Home, Car, CreditCard, Calendar, User, MessageSquare } from 'lucide-react';
import { supabase, type Profile } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { SendMessageModal } from '../shared/SendMessageModal';

type EditForm = {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  vehicle_type: string;
  vehicle_plate: string;
  service_area: string;
  city: string;
  state: string;
  zip_code: string;
  is_active: boolean;
  approval_status: 'approved' | 'pending' | 'rejected';
};

const EMPTY_FORM: EditForm = {
  full_name: '', phone: '', email: '', address: '', vehicle_type: 'Car', vehicle_plate: '',
  service_area: '', city: '', state: '', zip_code: '', is_active: true, approval_status: 'approved',
};

const APPROVAL_CONFIG: Record<string, { label: string; color: string; icon: typeof Check }> = {
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: Check },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: Ban },
};

export function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [viewing, setViewing] = useState<Profile | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [messaging, setMessaging] = useState<Profile | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').contains('roles', ['driver']).order('created_at', { ascending: false });
    setDrivers((data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (driver: Profile) => {
    setEditing(driver);
    setForm({
      full_name: driver.full_name,
      phone: driver.phone || '',
      email: driver.email,
      address: driver.address || '',
      vehicle_type: driver.vehicle_type || 'Car',
      vehicle_plate: driver.vehicle_plate || '',
      service_area: driver.service_area || '',
      city: driver.city || '',
      state: driver.state || '',
      zip_code: driver.zip_code || '',
      is_active: driver.is_active,
      approval_status: driver.approval_status,
    });
  };

  const openAdd = () => {
    setShowAdd(true);
    setForm(EMPTY_FORM);
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({
      full_name: form.full_name,
      phone: form.phone,
      address: form.address || null,
      vehicle_type: form.vehicle_type,
      vehicle_plate: form.vehicle_plate,
      service_area: form.service_area,
      city: form.city,
      state: form.state,
      zip_code: form.zip_code,
      is_active: form.is_active,
      approval_status: form.approval_status,
    }).eq('id', editing.id);
    if (error) { setToast({ type: 'error', msg: error.message }); setSaving(false); return; }
    setToast({ type: 'success', msg: 'Driver updated' });
    setEditing(null);
    setSaving(false);
    load();
  };

  const addDriver = async () => {
    if (!form.full_name || !form.email) {
      setToast({ type: 'error', msg: 'Name and email are required' });
      return;
    }
    setSaving(true);
    const { data: sessionData } = await supabase.auth.getSession();
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: form.email,
          password: 'TempPass123!',
          full_name: form.full_name,
          phone: form.phone,
          role: 'driver',
          service_area: form.service_area,
          vehicle_type: form.vehicle_type,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) {
        setToast({ type: 'error', msg: result.error || 'Failed to create driver' });
        setSaving(false);
        return;
      }
      setToast({ type: 'success', msg: `Driver account created for ${form.full_name}` });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to create driver' });
    }
    setSaving(false);
  };

  const setApproval = async (driver: Profile, status: 'approved' | 'pending' | 'rejected') => {
    const { error } = await supabase.from('profiles').update({ approval_status: status }).eq('id', driver.id);
    if (error) { setToast({ type: 'error', msg: error.message }); return; }
    setToast({ type: 'success', msg: `${driver.full_name} marked as ${status}` });
    load();
    if (editing && editing.id === driver.id) setEditing({ ...editing, approval_status: status });
  };

  const toggleActive = async (driver: Profile) => {
    await supabase.from('profiles').update({ is_active: !driver.is_active }).eq('id', driver.id);
    load();
    if (editing && editing.id === driver.id) setEditing({ ...editing, is_active: !driver.is_active });
  };

  const filtered = drivers.filter((d) => {
    const matchSearch = !search || d.full_name.toLowerCase().includes(search.toLowerCase()) || d.service_area?.toLowerCase().includes(search.toLowerCase()) || d.vehicle_type?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || d.approval_status === filterStatus;
    return matchSearch && matchStatus;
  });

  const inputCls = "input";

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Drivers</h1>
          <p className="text-slate-500 mt-1">Manage certified medical couriers — add, edit, approve, reject, or set pending</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4" /> Add Driver</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-10" placeholder="Search drivers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Truck className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No drivers found</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((d) => {
            const ApprovalIcon = APPROVAL_CONFIG[d.approval_status]?.icon ?? Check;
            return (
              <div key={d.id} className="card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-lg">{d.full_name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{d.full_name}</div>
                    {d.driver_id_number && <div className="text-xs font-mono text-emerald-600 font-semibold">{d.driver_id_number}</div>}
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-400 fill-amber-400" /> {Number(d.rating).toFixed(1)} · {d.total_deliveries} deliveries
                    </div>
                  </div>
                  <button onClick={() => toggleActive(d)} className={`px-2.5 py-1 rounded-full text-xs font-semibold ${d.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{d.is_active ? 'Active' : 'Inactive'}</button>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  <div className="flex items-center gap-2"><Truck className="w-3.5 h-3.5" /> {d.vehicle_type || 'No vehicle'}</div>
                  {d.vehicle_plate && <div className="flex items-center gap-2"><span className="font-mono">{d.vehicle_plate}</span></div>}
                  {d.service_area && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {d.service_area}</div>}
                  <div className="text-slate-400">Joined {formatDate(d.created_at)}</div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${(APPROVAL_CONFIG[d.approval_status] ?? APPROVAL_CONFIG.approved).color}`}>
                    <ApprovalIcon className="w-3 h-3" /> {(APPROVAL_CONFIG[d.approval_status] ?? APPROVAL_CONFIG.approved).label}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewing(d)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    <button onClick={() => setMessaging(d)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50">
                      <MessageSquare className="w-3.5 h-3.5" /> Message
                    </button>
                    <button onClick={() => openEdit(d)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded-lg hover:bg-primary-50">
                      <Edit3 className="w-3.5 h-3.5" /> Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setViewing(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[85vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900">Driver Profile</h3>
              <button onClick={() => setViewing(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-2xl">{viewing.full_name.charAt(0)}</div>
                <div>
                  <div className="text-lg font-bold text-slate-900">{viewing.full_name}</div>
                  {viewing.driver_id_number && <div className="text-xs font-mono text-emerald-600 font-semibold">{viewing.driver_id_number}</div>}
                  <div className="flex items-center gap-2 mt-1">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(APPROVAL_CONFIG[viewing.approval_status] ?? APPROVAL_CONFIG.approved).color}`}>
                      {(APPROVAL_CONFIG[viewing.approval_status] ?? APPROVAL_CONFIG.approved).label}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${viewing.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{viewing.is_active ? 'Active' : 'Inactive'}</span>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Contact</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex items-center gap-2 text-slate-700"><Mail className="w-4 h-4 text-slate-400" /> {viewing.email}</div>
                  <div className="flex items-center gap-2 text-slate-700">
                    <Phone className="w-4 h-4 text-slate-400" />
                    {viewing.phone ? (
                      <div className="flex items-center gap-2">
                        <a href={`tel:${viewing.phone}`} className="hover:text-primary-600 hover:underline transition-colors">{viewing.phone}</a>
                        <a href={`sms:${viewing.phone}`} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 text-xs font-medium hover:bg-emerald-100 transition-colors">
                          <MessageSquare className="w-3 h-3" /> Text
                        </a>
                      </div>
                    ) : '—'}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Address</div>
                <div className="space-y-1.5 text-sm text-slate-700">
                  <div className="flex items-center gap-2"><Home className="w-4 h-4 text-slate-400" /> {viewing.address || '—'}</div>
                  <div className="pl-6">{[viewing.city, viewing.state, viewing.zip_code].filter(Boolean).join(', ') || '—'}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Driver Details</div>
                <div className="space-y-1.5 text-sm text-slate-700">
                  <div className="flex items-center gap-2"><Truck className="w-4 h-4 text-slate-400" /> Vehicle: {viewing.vehicle_type || '—'}</div>
                  <div className="flex items-center gap-2"><Car className="w-4 h-4 text-slate-400" /> Plate: <span className="font-mono">{viewing.vehicle_plate || '—'}</span></div>
                  <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> Service Area: {viewing.service_area || '—'}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Performance</div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-100 text-center">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400 mx-auto mb-1" />
                    <div className="font-bold text-slate-900">{Number(viewing.rating).toFixed(1)}</div>
                    <div className="text-xs text-slate-500">Rating</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
                    <Truck className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                    <div className="font-bold text-slate-900">{viewing.total_deliveries}</div>
                    <div className="text-xs text-slate-500">Deliveries</div>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-50 border border-blue-100 text-center">
                    <Check className="w-4 h-4 text-blue-500 mx-auto mb-1" />
                    <div className="font-bold text-slate-900">{Number(viewing.on_time_rate).toFixed(0)}%</div>
                    <div className="text-xs text-slate-500">On Time</div>
                  </div>
                </div>
              </div>

              {viewing.stripe_account_id && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Stripe Connect</div>
                  <div className="space-y-1.5 text-sm text-slate-700">
                    <div className="flex items-center gap-2"><CreditCard className="w-4 h-4 text-slate-400" /> Status: <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${viewing.stripe_account_status === 'active' ? 'bg-emerald-100 text-emerald-700' : viewing.stripe_account_status === 'restricted' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{viewing.stripe_account_status}</span></div>
                    <div className="text-xs text-slate-500">Charges: {viewing.stripe_charges_enabled ? 'Enabled' : 'Disabled'} · Payouts: {viewing.stripe_payouts_enabled ? 'Enabled' : 'Disabled'}</div>
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-slate-400 pt-2 border-t border-slate-100">
                <Calendar className="w-3.5 h-3.5" /> Joined {formatDate(viewing.created_at)}
              </div>

              <button onClick={() => { setViewing(null); openEdit(viewing); }} className="btn-primary w-full inline-flex items-center justify-center gap-2">
                <Edit3 className="w-4 h-4" /> Edit Profile
              </button>
              <button onClick={() => setMessaging(viewing)} className="btn-secondary w-full inline-flex items-center justify-center gap-2">
                <MessageSquare className="w-4 h-4" /> Send Message
              </button>
            </div>
          </div>
        </div>
      )}

      {(showAdd || editing) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => { setShowAdd(false); setEditing(null); }}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[85vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 sticky top-0 bg-white">
              <h3 className="font-bold text-slate-900">{editing ? 'Edit Driver' : 'Add New Driver'}</h3>
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-3">
              {editing && editing.driver_id_number && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2">
                  <span className="text-xs font-semibold text-emerald-600 uppercase">Driver ID</span>
                  <span className="font-mono font-bold text-emerald-700">{editing.driver_id_number}</span>
                </div>
              )}
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Full Name</label><input className={inputCls} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Smith" /></div>
                <div><label className="label">Phone</label><input className={inputCls} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(404) 555-0101" /></div>
              </div>
              <div><label className="label">Email</label><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="driver@example.com" disabled={!!editing} /></div>
              <div><label className="label">Street Address</label><input className={inputCls} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value } as EditForm)} placeholder="1234 Peachtree St NE" /></div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Vehicle Type</label>
                  <select className={inputCls} value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })}>
                    <option>Car</option><option>Van</option><option>Motorcycle</option><option>Box Truck</option>
                  </select>
                </div>
                <div><label className="label">Vehicle Plate</label><input className={inputCls} value={form.vehicle_plate} onChange={(e) => setForm({ ...form, vehicle_plate: e.target.value })} placeholder="ABC-1234" /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Service Area</label><input className={inputCls} value={form.service_area} onChange={(e) => setForm({ ...form, service_area: e.target.value })} placeholder="Atlanta, GA" /></div>
                <div><label className="label">City</label><input className={inputCls} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Atlanta" /></div>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">State</label><input className={inputCls} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="GA" /></div>
                <div><label className="label">Zip Code</label><input className={inputCls} value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} placeholder="30303" /></div>
              </div>

              {editing && (
                <>
                  <div>
                    <label className="label">Approval Status</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['approved', 'pending', 'rejected'] as const).map((s) => {
                        const cfg = APPROVAL_CONFIG[s];
                        const Icon = cfg.icon;
                        return (
                          <button key={s} type="button" onClick={() => setForm({ ...form, approval_status: s })} className={`flex items-center justify-center gap-1.5 px-2 py-2.5 rounded-xl border text-xs font-medium transition-all ${form.approval_status === s ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600'}`}>
                            <Icon className="w-3.5 h-3.5" /> {cfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <label className="label">Account Active</label>
                    <button type="button" onClick={() => setForm({ ...form, is_active: !form.is_active })} className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${form.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {form.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </div>
                </>
              )}

              <div className="flex gap-2 pt-2">
                <button onClick={() => { setShowAdd(false); setEditing(null); }} className="btn-secondary flex-1">Cancel</button>
                <button onClick={editing ? saveEdit : addDriver} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Driver'}</button>
              </div>

              {editing && (
                <div className="pt-3 border-t border-slate-100">
                  <label className="label">Quick Approval Actions</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button onClick={() => setApproval(editing, 'approved')} className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-medium hover:bg-emerald-100"><Check className="w-3.5 h-3.5" /> Approve</button>
                    <button onClick={() => setApproval(editing, 'pending')} className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-amber-50 text-amber-700 text-xs font-medium hover:bg-amber-100"><Clock className="w-3.5 h-3.5" /> Pending</button>
                    <button onClick={() => setApproval(editing, 'rejected')} className="inline-flex items-center justify-center gap-1 px-2 py-2 rounded-lg bg-red-50 text-red-700 text-xs font-medium hover:bg-red-100"><Ban className="w-3.5 h-3.5" /> Reject</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {messaging && (
        <SendMessageModal
          recipient={messaging}
          onClose={() => setMessaging(null)}
          onSent={() => setToast({ type: 'success', msg: `Message sent to ${messaging.full_name}` })}
        />
      )}
    </div>
  );
}
