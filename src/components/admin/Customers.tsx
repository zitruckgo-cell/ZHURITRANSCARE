import { useState, useEffect, useCallback } from 'react';
import { Users, Search, Package, Building, DollarSign, Plus, X, Edit3, Check, Clock, Ban, MapPin, Eye, Phone, Mail, Home, CreditCard, Calendar, MessageSquare } from 'lucide-react';
import { supabase, type Profile, type Delivery } from '../../lib/supabase';
import { formatMoney, formatDate } from '../../lib/utils';
import { SendMessageModal } from '../shared/SendMessageModal';

type EditForm = {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  business_name: string;
  business_address: string;
  city: string;
  state: string;
  zip_code: string;
  is_active: boolean;
  approval_status: 'approved' | 'pending' | 'rejected';
};

const EMPTY_FORM: EditForm = {
  full_name: '', phone: '', email: '', address: '', business_name: '', business_address: '',
  city: '', state: '', zip_code: '', is_active: true, approval_status: 'approved',
};

const APPROVAL_CONFIG: Record<string, { label: string; color: string; icon: typeof Check }> = {
  approved: { label: 'Approved', color: 'bg-emerald-100 text-emerald-700', icon: Check },
  pending: { label: 'Pending', color: 'bg-amber-100 text-amber-700', icon: Clock },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: Ban },
};

export function AdminCustomersPage() {
  const [shippers, setShippers] = useState<Profile[]>([]);
  const [allDeliveries, setAllDeliveries] = useState<Delivery[]>([]);
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
    const [profRes, delRes] = await Promise.all([
      supabase.from('profiles').select('*').contains('roles', ['shipper']).order('created_at', { ascending: false }),
      supabase.from('deliveries').select('*'),
    ]);
    setShippers((profRes.data as Profile[]) || []);
    setAllDeliveries((delRes.data as Delivery[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (shipper: Profile) => {
    setEditing(shipper);
    setForm({
      full_name: shipper.full_name,
      phone: shipper.phone || '',
      email: shipper.email,
      address: shipper.address || '',
      business_name: shipper.business_name || '',
      business_address: shipper.business_address || '',
      city: shipper.city || '',
      state: shipper.state || '',
      zip_code: shipper.zip_code || '',
      is_active: shipper.is_active,
      approval_status: shipper.approval_status,
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
      business_name: form.business_name || null,
      business_address: form.business_address || null,
      city: form.city || null,
      state: form.state || null,
      zip_code: form.zip_code || null,
      is_active: form.is_active,
      approval_status: form.approval_status,
    }).eq('id', editing.id);
    if (error) { setToast({ type: 'error', msg: error.message }); setSaving(false); return; }
    setToast({ type: 'success', msg: 'Customer updated' });
    setEditing(null);
    setSaving(false);
    load();
  };

  const addShipper = async () => {
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
          role: 'shipper',
          business_name: form.business_name,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) {
        setToast({ type: 'error', msg: result.error || 'Failed to create customer' });
        setSaving(false);
        return;
      }
      setToast({ type: 'success', msg: `Customer account created for ${form.full_name}` });
      setShowAdd(false);
      setForm(EMPTY_FORM);
      load();
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to create customer' });
    }
    setSaving(false);
  };

  const setApproval = async (shipper: Profile, status: 'approved' | 'pending' | 'rejected') => {
    const { error } = await supabase.from('profiles').update({ approval_status: status }).eq('id', shipper.id);
    if (error) { setToast({ type: 'error', msg: error.message }); return; }
    setToast({ type: 'success', msg: `${shipper.full_name} marked as ${status}` });
    load();
    if (editing && editing.id === shipper.id) setEditing({ ...editing, approval_status: status });
  };

  const toggleActive = async (shipper: Profile) => {
    await supabase.from('profiles').update({ is_active: !shipper.is_active }).eq('id', shipper.id);
    load();
    if (editing && editing.id === shipper.id) setEditing({ ...editing, is_active: !shipper.is_active });
  };

  const filtered = shippers.filter((s) => {
    const matchSearch = !search || s.full_name.toLowerCase().includes(search.toLowerCase()) || s.business_name?.toLowerCase().includes(search.toLowerCase()) || s.city?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || s.approval_status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Customers</h1>
          <p className="text-slate-500 mt-1">Manage shippers and pharmacies — add, edit, approve, reject, or set pending</p>
        </div>
        <button onClick={openAdd} className="btn-primary"><Plus className="w-4 h-4" /> Add Customer</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-10" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="approved">Approved</option>
          <option value="pending">Pending</option>
          <option value="rejected">Rejected</option>
        </select>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Users className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No customers found</p></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const shipperDeliveries = allDeliveries.filter((d) => d.shipper_id === s.id);
            const totalSpent = shipperDeliveries.reduce((sum, d) => sum + Number(d.calculated_price || d.max_bid_amount || 0), 0);
            const ApprovalIcon = APPROVAL_CONFIG[s.approval_status]?.icon ?? Check;
            return (
              <div key={s.id} className="card p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-lg">{s.full_name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{s.full_name}</div>
                    <div className="text-xs text-slate-500 truncate">{s.email}</div>
                  </div>
                  <button onClick={() => toggleActive(s)} className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s.is_active ? 'Active' : 'Inactive'}</button>
                </div>
                <div className="space-y-1.5 text-xs text-slate-500">
                  {s.business_name && <div className="flex items-center gap-2"><Building className="w-3.5 h-3.5" /> {s.business_name}</div>}
                  {s.city && <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5" /> {s.city}, {s.state}</div>}
                  <div className="flex items-center gap-2"><Package className="w-3.5 h-3.5" /> {shipperDeliveries.length} deliveries</div>
                  <div className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5" /> {formatMoney(totalSpent)} total</div>
                  <div className="text-slate-400">Joined {formatDate(s.created_at)}</div>
                </div>
                <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
                  <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${(APPROVAL_CONFIG[s.approval_status] ?? APPROVAL_CONFIG.approved).color}`}>
                    <ApprovalIcon className="w-3 h-3" /> {(APPROVAL_CONFIG[s.approval_status] ?? APPROVAL_CONFIG.approved).label}
                  </span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewing(s)} className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-800 px-2 py-1 rounded-lg hover:bg-slate-100">
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    <button onClick={() => setMessaging(s)} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50">
                      <MessageSquare className="w-3.5 h-3.5" /> Message
                    </button>
                    <button onClick={() => openEdit(s)} className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 px-2 py-1 rounded-lg hover:bg-primary-50">
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
              <h3 className="font-bold text-slate-900">Customer Profile</h3>
              <button onClick={() => setViewing(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-2xl">{viewing.full_name.charAt(0)}</div>
                <div>
                  <div className="text-lg font-bold text-slate-900">{viewing.full_name}</div>
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
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Personal Address</div>
                <div className="space-y-1.5 text-sm text-slate-700">
                  <div className="flex items-center gap-2"><Home className="w-4 h-4 text-slate-400" /> {viewing.address || '—'}</div>
                  <div className="pl-6">{[viewing.city, viewing.state, viewing.zip_code].filter(Boolean).join(', ') || '—'}</div>
                </div>
              </div>

              {(viewing.business_name || viewing.business_address) && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Business Info</div>
                  <div className="space-y-1.5 text-sm text-slate-700">
                    {viewing.business_name && <div className="flex items-center gap-2"><Building className="w-4 h-4 text-slate-400" /> {viewing.business_name}</div>}
                    {viewing.business_address && <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" /> {viewing.business_address}</div>}
                  </div>
                </div>
              )}

              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Account Summary</div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-primary-50 border border-primary-100 text-center">
                    <Package className="w-4 h-4 text-primary-500 mx-auto mb-1" />
                    <div className="font-bold text-slate-900">{allDeliveries.filter((d) => d.shipper_id === viewing.id).length}</div>
                    <div className="text-xs text-slate-500">Deliveries</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-100 text-center">
                    <DollarSign className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
                    <div className="font-bold text-slate-900">{formatMoney(allDeliveries.filter((d) => d.shipper_id === viewing.id).reduce((sum, d) => sum + Number(d.calculated_price || d.max_bid_amount || 0), 0))}</div>
                    <div className="text-xs text-slate-500">Total Spent</div>
                  </div>
                </div>
              </div>

              {viewing.stripe_customer_id && (
                <div>
                  <div className="text-xs font-semibold text-slate-400 uppercase mb-2">Stripe</div>
                  <div className="text-sm text-slate-700 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-slate-400" />
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${viewing.stripe_default_payment_method ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {viewing.stripe_default_payment_method ? 'Payment Method on File' : 'No Default Payment Method'}
                    </span>
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
              <h3 className="font-bold text-slate-900">{editing ? 'Edit Customer' : 'Add New Customer'}</h3>
              <button onClick={() => { setShowAdd(false); setEditing(null); }} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Full Name</label><input className="input" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="John Smith" /></div>
                <div><label className="label">Phone</label><input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="(404) 555-0101" /></div>
              </div>
              <div><label className="label">Email</label><input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="customer@example.com" disabled={!!editing} /></div>
              <div><label className="label">Street Address</label><input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="1234 Peachtree St NE" /></div>
              <div><label className="label">Business Name</label><input className="input" value={form.business_name} onChange={(e) => setForm({ ...form, business_name: e.target.value })} placeholder="Pharmacy / Facility name" /></div>
              <div><label className="label">Business Address</label><input className="input" value={form.business_address} onChange={(e) => setForm({ ...form, business_address: e.target.value })} placeholder="123 Main St" /></div>
              <div className="grid sm:grid-cols-3 gap-3">
                <div><label className="label">City</label><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Atlanta" /></div>
                <div><label className="label">State</label><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="GA" /></div>
                <div><label className="label">Zip</label><input className="input" value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} placeholder="30303" /></div>
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
                <button onClick={editing ? saveEdit : addShipper} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editing ? 'Save Changes' : 'Create Customer'}</button>
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
