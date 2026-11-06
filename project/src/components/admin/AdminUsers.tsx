import { useState, useEffect, useCallback } from 'react';
import { UserCog, Search, Shield, Plus, UserPlus, Truck, Package, ShieldCheck, X, MessageSquare, Mail, Phone } from 'lucide-react';
import { supabase, type AdminUser, type Profile } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { SendMessageModal } from '../shared/SendMessageModal';

export function AdminUsersPage() {
  const { user } = useAuth();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<null | 'add' | 'create'>(null);
  const [addForm, setAddForm] = useState({ profileId: '', role: 'admin' });
  const [createForm, setCreateForm] = useState({
    email: '', password: '', full_name: '', phone: '', role: 'admin' as string,
  });
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [messaging, setMessaging] = useState<{ id: string; full_name: string; email: string; phone: string | null } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const [adminRes, profRes] = await Promise.all([
      supabase.from('admin_users').select('*').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    ]);
    setAdmins((adminRes.data as AdminUser[]) || []);
    setProfiles((profRes.data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const addAdmin = async () => {
    if (!addForm.profileId) return;
    setAdding(true);
    const profile = profiles.find((p) => p.id === addForm.profileId);
    if (!profile) { setToast({ type: 'error', msg: 'User not found' }); setAdding(false); return; }

    const email = profile.email || `${profile.full_name.toLowerCase().replace(/\s+/g, '.')}@zhuritranscare.com`;

    const { error } = await supabase.from('admin_users').insert({
      id: profile.id, email, full_name: profile.full_name, role: addForm.role,
    });
    if (error) { setToast({ type: 'error', msg: error.message }); setAdding(false); return; }
    setToast({ type: 'success', msg: `${profile.full_name} added as ${addForm.role}` });
    setAdding(false);
    setAddForm({ profileId: '', role: 'admin' });
    setModal(null);
    load();
  };

  const createAdmin = async () => {
    if (!createForm.email || !createForm.password || !createForm.full_name) {
      setToast({ type: 'error', msg: 'Email, password, and name are required' });
      return;
    }
    if (createForm.password.length < 8) {
      setToast({ type: 'error', msg: 'Password must be at least 8 characters' });
      return;
    }
    setCreating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionData.session?.access_token}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          email: createForm.email,
          password: createForm.password,
          full_name: createForm.full_name,
          phone: createForm.phone,
          role: createForm.role,
        }),
      });
      const result = await resp.json();
      if (!resp.ok || result.error) {
        setToast({ type: 'error', msg: result.error || 'Failed to create admin' });
        setCreating(false);
        return;
      }
      setToast({ type: 'success', msg: `Admin account created for ${createForm.full_name}. They can now sign in with the email and password you set.` });
      setCreateForm({ email: '', password: '', full_name: '', phone: '', role: 'admin' });
      setModal(null);
      load();
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to create admin' });
    }
    setCreating(false);
  };

  const toggleActive = async (admin: AdminUser) => {
    await supabase.from('admin_users').update({ is_active: !admin.is_active }).eq('id', admin.id);
    load();
  };

  const filtered = admins.filter((a) => !search || a.full_name.toLowerCase().includes(search.toLowerCase()) || a.email.toLowerCase().includes(search.toLowerCase()));

  const roleBadge = (role: string) => {
    const map: Record<string, string> = {
      super_admin: 'bg-primary-100 text-primary-700',
      admin: 'bg-blue-100 text-blue-700',
      dispatcher: 'bg-slate-100 text-slate-600',
    };
    return map[role] || 'bg-slate-100 text-slate-600';
  };

  return (
    <div>
      {toast && (
        <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-[slideIn_0.3s_ease-out] ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Users</h1>
          <p className="text-slate-500 mt-1">Manage platform administrators and dispatchers</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModal('add')} className="btn-secondary"><UserPlus className="w-4 h-4" /> Promote User</button>
          <button onClick={() => setModal('create')} className="btn-primary"><ShieldCheck className="w-4 h-4" /> Create Admin</button>
        </div>
      </div>

      {/* Create Admin Modal */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setModal(null)} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center"><ShieldCheck className="w-5 h-5 text-primary-600" /></div>
              <h2 className="text-lg font-bold text-slate-900">Create New Admin</h2>
            </div>
            <p className="text-sm text-slate-500 mb-5">Create a brand-new admin account. The person can sign in immediately with the email and password you set.</p>
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div><label className="label">Full Name</label><input className="input" value={createForm.full_name} onChange={(e) => setCreateForm({ ...createForm, full_name: e.target.value })} placeholder="Jane Smith" /></div>
                <div><label className="label">Phone</label><input className="input" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="(404) 555-0101" /></div>
              </div>
              <div><label className="label">Email Address</label><input type="email" className="input" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} placeholder="admin@zhuritranscare.com" /></div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} placeholder="Minimum 8 characters" />
                <p className="text-xs text-slate-400 mt-1">Choose a temporary password. The new admin can change it after signing in.</p>
              </div>
              <div>
                <label className="label">Admin Role</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'admin', label: 'Admin', desc: 'Full access' },
                    { value: 'dispatcher', label: 'Dispatcher', desc: 'Manage loads' },
                    { value: 'super_admin', label: 'Super Admin', desc: 'Full + users' },
                  ]).map((r) => (
                    <button key={r.value} type="button" onClick={() => setCreateForm({ ...createForm, role: r.value })}
                      className={`px-3 py-2.5 rounded-xl border text-sm font-medium transition-all text-left ${createForm.role === r.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                      <div className="font-semibold">{r.label}</div>
                      <div className="text-xs text-slate-400">{r.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={createAdmin} disabled={creating} className="btn-primary w-full">
                {creating ? 'Creating Admin...' : 'Create Admin Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Promote Existing User Modal */}
      {modal === 'add' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setModal(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setModal(null)} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center"><UserPlus className="w-5 h-5 text-blue-600" /></div>
              <h2 className="text-lg font-bold text-slate-900">Promote Existing User</h2>
            </div>
            <p className="text-sm text-slate-500 mb-5">Grant admin access to someone who already has an account.</p>
            <div className="space-y-4">
              <div>
                <label className="label">Select Registered User</label>
                <select className="input" value={addForm.profileId} onChange={(e) => setAddForm({ ...addForm, profileId: e.target.value })}>
                  <option value="">Select a registered user...</option>
                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {p.email || p.phone || 'no contact'}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Admin Role</label>
                <select className="input" value={addForm.role} onChange={(e) => setAddForm({ ...addForm, role: e.target.value })}>
                  <option value="admin">Admin</option>
                  <option value="dispatcher">Dispatcher</option>
                  <option value="super_admin">Super Admin</option>
                </select>
              </div>
              <button onClick={addAdmin} disabled={adding || !addForm.profileId} className="btn-accent w-full">
                {adding ? 'Promoting...' : 'Promote to Admin'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input className="input pl-10" placeholder="Search admin users..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><UserCog className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No admin users</p></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((a) => (
            <div key={a.id} className="p-4 flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-slate-900 flex items-center justify-center text-white font-bold">{a.full_name.charAt(0)}</div>
                <div>
                  <div className="font-medium text-slate-900">{a.full_name} {a.id === user?.id && <span className="text-xs text-slate-400">(You)</span>}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-2">
                    <span className="flex items-center gap-1"><Mail className="w-3 h-3" /> {a.email}</span>
                    {(() => {
                      const prof = profiles.find((p) => p.id === a.id);
                      const phone = prof?.phone;
                      if (!phone) return null;
                      return (
                        <span className="flex items-center gap-1">
                          <span className="text-slate-300">·</span>
                          <a href={`tel:${phone}`} className="hover:text-primary-600 hover:underline transition-colors flex items-center gap-0.5"><Phone className="w-3 h-3" /> {phone}</a>
                          <a href={`sms:${phone}`} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 font-medium hover:bg-emerald-100 transition-colors">
                            <MessageSquare className="w-2.5 h-2.5" /> Text
                          </a>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${roleBadge(a.role)} capitalize`}>{a.role.replace('_', ' ')}</span>
                <span className={`badge ${a.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{a.is_active ? 'Active' : 'Inactive'}</span>
                {a.id !== user?.id && (
                  <button
                    onClick={() => {
                      const profile = profiles.find((p) => p.id === a.id);
                      setMessaging({
                        id: a.id,
                        full_name: a.full_name,
                        email: a.email,
                        phone: profile?.phone || null,
                      });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-lg hover:bg-emerald-50"
                  >
                    <MessageSquare className="w-3.5 h-3.5" /> Message
                  </button>
                )}
                {a.id !== user?.id && (
                  <button onClick={() => toggleActive(a)} className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1 rounded hover:bg-slate-100">
                    {a.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                )}
              </div>
            </div>
          ))}
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
