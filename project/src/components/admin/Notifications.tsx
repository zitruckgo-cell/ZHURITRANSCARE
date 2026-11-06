import { useState, useEffect, useCallback } from 'react';
import { Bell, Mail, MessageSquare, Phone, Send, Search, X, Users, User } from 'lucide-react';
import { supabase, type Notification, type Profile } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';

const CHANNEL_ICONS: Record<string, typeof Mail> = { email: Mail, sms: Phone, whatsapp: MessageSquare };

export function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterChannel, setFilterChannel] = useState('all');
  const [showCompose, setShowCompose] = useState(false);
  const [compose, setCompose] = useState({
    mode: 'user' as 'user' | 'manual' | 'broadcast',
    channel: 'email',
    userId: '',
    contact: '',
    subject: '',
    body: '',
    targetRole: 'all' as 'all' | 'shipper' | 'driver',
  });
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    const [notifRes, profRes] = await Promise.all([
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('profiles').select('*').order('full_name', { ascending: true }),
    ]);
    setNotifications((notifRes.data as Notification[]) || []);
    setProfiles((profRes.data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sendNotification = async () => {
    setSending(true);
    try {
      if (compose.mode === 'broadcast') {
        const targets = profiles.filter((p) => {
          if (compose.targetRole === 'shipper') return p.roles?.includes('shipper');
          if (compose.targetRole === 'driver') return p.roles?.includes('driver');
          return true;
        });
        let sent = 0;
        for (const p of targets) {
          const contact = compose.channel === 'email' ? p.email : p.phone;
          if (!contact) continue;
          await supabase.from('notifications').insert({
            recipient_id: p.id,
            channel: compose.channel,
            recipient_contact: contact,
            subject: compose.subject || null,
            body: compose.body,
            status: 'sent',
          });
          sent++;
        }
        setToast({ type: 'success', msg: `Broadcast sent to ${sent} ${compose.channel === 'email' ? 'emails' : 'phones'}` });
      } else if (compose.mode === 'user') {
        const profile = profiles.find((p) => p.id === compose.userId);
        if (!profile) { setToast({ type: 'error', msg: 'Please select a user' }); setSending(false); return; }
        const contact = compose.channel === 'email' ? profile.email : profile.phone;
        if (!contact) { setToast({ type: 'error', msg: `This user has no ${compose.channel === 'email' ? 'email' : 'phone'} on file` }); setSending(false); return; }
        const { error } = await supabase.from('notifications').insert({
          recipient_id: profile.id,
          channel: compose.channel,
          recipient_contact: contact,
          subject: compose.subject || null,
          body: compose.body,
          status: 'sent',
        });
        if (error) { setToast({ type: 'error', msg: error.message }); setSending(false); return; }
        setToast({ type: 'success', msg: `Notification sent to ${profile.full_name}` });
      } else {
        if (!compose.contact || !compose.body) { setToast({ type: 'error', msg: 'Contact and message are required' }); setSending(false); return; }
        const { error } = await supabase.from('notifications').insert({
          channel: compose.channel,
          recipient_contact: compose.contact,
          subject: compose.subject || null,
          body: compose.body,
          status: 'sent',
        });
        if (error) { setToast({ type: 'error', msg: error.message }); setSending(false); return; }
        setToast({ type: 'success', msg: 'Notification sent' });
      }
      setCompose({ mode: 'user', channel: 'email', userId: '', contact: '', subject: '', body: '', targetRole: 'all' });
      setShowCompose(false);
      load();
    } catch (err) {
      setToast({ type: 'error', msg: err instanceof Error ? err.message : 'Failed to send' });
    }
    setSending(false);
  };

  const filtered = notifications.filter((n) => {
    const matchSearch = !search || n.recipient_contact.toLowerCase().includes(search.toLowerCase()) || (n.body || '').toLowerCase().includes(search.toLowerCase()) || (n.subject || '').toLowerCase().includes(search.toLowerCase());
    const matchChannel = filterChannel === 'all' || n.channel === filterChannel;
    return matchSearch && matchChannel;
  });

  const stats = {
    total: notifications.length,
    email: notifications.filter((n) => n.channel === 'email').length,
    sms: notifications.filter((n) => n.channel === 'sms').length,
    whatsapp: notifications.filter((n) => n.channel === 'whatsapp').length,
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
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="text-slate-500 mt-1">Send and track notifications across Email, SMS, and WhatsApp</p>
        </div>
        <button onClick={() => setShowCompose(true)} className="btn-primary"><Send className="w-4 h-4" /> New Notification</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Sent', value: stats.total, icon: Bell, color: 'bg-primary-50 text-primary-600' },
          { label: 'Email', value: stats.email, icon: Mail, color: 'bg-blue-50 text-blue-600' },
          { label: 'SMS', value: stats.sms, icon: Phone, color: 'bg-emerald-50 text-emerald-600' },
          { label: 'WhatsApp', value: stats.whatsapp, icon: MessageSquare, color: 'bg-green-50 text-green-600' },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="card p-4">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="text-xl font-bold text-slate-900">{s.value}</div>
              <div className="text-xs text-slate-500 mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setShowCompose(false)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowCompose(false)} className="absolute top-4 right-4 p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Send Notification</h2>
            <p className="text-sm text-slate-500 mb-5">Choose a recipient and channel to send a notification</p>

            <div className="space-y-4">
              {/* Mode selection */}
              <div>
                <label className="label">Recipient Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'user', label: 'Select User', icon: User },
                    { value: 'manual', label: 'Manual', icon: Mail },
                    { value: 'broadcast', label: 'Broadcast', icon: Users },
                  ]).map((m) => {
                    const Icon = m.icon;
                    return (
                      <button key={m.value} type="button" onClick={() => setCompose({ ...compose, mode: m.value as 'user' | 'manual' | 'broadcast' })}
                        className={`flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl border text-xs font-medium transition-all ${compose.mode === m.value ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        <Icon className="w-4 h-4" /> {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Channel selection */}
              <div>
                <label className="label">Channel</label>
                <div className="grid grid-cols-3 gap-2">
                  {['email', 'sms', 'whatsapp'].map((ch) => {
                    const Icon = CHANNEL_ICONS[ch];
                    return (
                      <button key={ch} type="button" onClick={() => setCompose({ ...compose, channel: ch })}
                        className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium capitalize transition-all ${compose.channel === ch ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                        <Icon className="w-4 h-4" /> {ch}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* User selection */}
              {compose.mode === 'user' && (
                <div>
                  <label className="label">Select User</label>
                  <select className="input" value={compose.userId} onChange={(e) => setCompose({ ...compose, userId: e.target.value })}>
                    <option value="">Choose a user...</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.full_name} — {compose.channel === 'email' ? p.email || 'no email' : p.phone || 'no phone'}</option>)}
                  </select>
                </div>
              )}

              {/* Manual contact */}
              {compose.mode === 'manual' && (
                <div>
                  <label className="label">{compose.channel === 'email' ? 'Email Address' : 'Phone Number'}</label>
                  <input className="input" value={compose.contact} onChange={(e) => setCompose({ ...compose, contact: e.target.value })} placeholder={compose.channel === 'email' ? 'user@example.com' : '+1234567890'} />
                </div>
              )}

              {/* Broadcast target */}
              {compose.mode === 'broadcast' && (
                <div>
                  <label className="label">Send To</label>
                  <select className="input" value={compose.targetRole} onChange={(e) => setCompose({ ...compose, targetRole: e.target.value as 'all' | 'shipper' | 'driver' })}>
                    <option value="all">All Users</option>
                    <option value="shipper">All Shippers</option>
                    <option value="driver">All Drivers</option>
                  </select>
                  <p className="text-xs text-slate-400 mt-1">
                    {compose.channel === 'email' ? 'Email' : 'Phone'} will be used for each user based on their profile.
                  </p>
                </div>
              )}

              {/* Subject (email only) */}
              {compose.channel === 'email' && (
                <div><label className="label">Subject</label><input className="input" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} placeholder="Subject line" /></div>
              )}

              {/* Message body */}
              <div><label className="label">Message</label><textarea className="input min-h-[100px] resize-none" value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} placeholder="Type your message..." /></div>

              <button onClick={sendNotification} disabled={sending || !compose.body} className="btn-primary w-full">
                {sending ? 'Sending...' : 'Send Notification'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-10" placeholder="Search by recipient, subject, or message..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)}>
          <option value="all">All Channels</option>
          <option value="email">Email</option>
          <option value="sms">SMS</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No notifications sent yet</p><p className="text-xs text-slate-400 mt-1">Click "New Notification" to send one</p></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((n) => {
            const Icon = CHANNEL_ICONS[n.channel] || Bell;
            return (
              <div key={n.id} className="p-4 flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${n.channel === 'email' ? 'bg-blue-50 text-blue-600' : n.channel === 'sms' ? 'bg-emerald-50 text-emerald-600' : 'bg-green-50 text-green-600'}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-900">{n.subject || '(no subject)'}</span>
                    <span className={`badge ${n.status === 'sent' ? 'bg-emerald-100 text-emerald-700' : n.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{n.status}</span>
                  </div>
                  <div className="text-xs text-slate-500">To: {n.recipient_contact} · {n.channel}</div>
                  <div className="text-xs text-slate-400 mt-1 line-clamp-2">{n.body}</div>
                </div>
                <div className="text-xs text-slate-400 shrink-0">{timeAgo(n.created_at)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
