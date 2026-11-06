import { useState, useEffect, useCallback } from 'react';
import { LifeBuoy, Search, X, Send, Phone, Mail } from 'lucide-react';
import { supabase, type SupportTicket, type SupportMessage } from '../../lib/supabase';
import { formatDate, timeAgo } from '../../lib/utils';
import { useAuth } from '../../lib/auth';

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  low: { label: 'Low', color: 'bg-slate-100 text-slate-600' },
  normal: { label: 'Normal', color: 'bg-blue-100 text-blue-700' },
  high: { label: 'High', color: 'bg-amber-100 text-amber-700' },
  urgent: { label: 'Urgent', color: 'bg-red-100 text-red-700' },
};

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: 'bg-blue-100 text-blue-700' },
  in_progress: { label: 'In Progress', color: 'bg-amber-100 text-amber-700' },
  resolved: { label: 'Resolved', color: 'bg-emerald-100 text-emerald-700' },
  closed: { label: 'Closed', color: 'bg-slate-100 text-slate-500' },
};

const FALLBACK = { label: 'Unknown', color: 'bg-slate-100 text-slate-600' };

export function AdminSupportPage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('support_tickets').select('*, requester:profiles!support_tickets_requester_id_fkey(*)').order('created_at', { ascending: false });
    setTickets((data as SupportTicket[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMessages = async (ticket: SupportTicket) => {
    setSelected(ticket);
    const { data } = await supabase.from('support_messages').select('*, sender:profiles!support_messages_sender_id_fkey(*)').eq('ticket_id', ticket.id).order('created_at', { ascending: true });
    setMessages((data as SupportMessage[]) || []);
  };

  const sendMessage = async () => {
    if (!selected || !newMessage || !user) return;
    setSending(true);
    await supabase.from('support_messages').insert({ ticket_id: selected.id, sender_id: user.id, body: newMessage });
    await supabase.from('support_tickets').update({ status: 'in_progress' }).eq('id', selected.id);
    setNewMessage('');
    setSending(false);
    loadMessages(selected);
    load();
  };

  const updateTicketStatus = async (ticket: SupportTicket, status: SupportTicket['status']) => {
    const updates: Record<string, unknown> = { status };
    if (status === 'resolved' || status === 'closed') updates.resolved_at = new Date().toISOString();
    await supabase.from('support_tickets').update(updates).eq('id', ticket.id);
    load();
    if (selected) loadMessages({ ...selected, status });
  };

  const filtered = tickets.filter((t) => {
    const matchSearch = !search || t.subject.toLowerCase().includes(search.toLowerCase()) || (t as { requester?: { full_name?: string } }).requester?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || t.status === filterStatus;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Support</h1>
          <p className="text-slate-500">Manage support tickets and customer inquiries</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <a href="mailto:zhuritranscare@gmail.com" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 transition-all active:scale-95">
            <Mail className="w-4 h-4" />
            Email
          </a>
          <a href="tel:+19784170522" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary-50 text-primary-700 font-semibold text-sm hover:bg-primary-100 transition-all active:scale-95">
            <Phone className="w-4 h-4" />
            +1 (978) 417-0522
          </a>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-10" placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {loading ? <div className="text-center py-20 text-slate-400">Loading...</div> : filtered.length === 0 ? (
        <div className="card p-12 text-center"><LifeBuoy className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No support tickets</p></div>
      ) : (
        <div className="card divide-y divide-slate-100">
          {filtered.map((t) => {
            const requester = (t as { requester?: { full_name?: string } }).requester;
            return (
              <div key={t.id} className="p-4 hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => loadMessages(t)}>
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-slate-900 truncate">{t.subject}</div>
                    <div className="text-xs text-slate-500">{requester?.full_name} · {formatDate(t.created_at)}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`badge ${(PRIORITY_CONFIG[t.priority] ?? FALLBACK).color}`}>{(PRIORITY_CONFIG[t.priority] ?? FALLBACK).label}</span>
                    <span className={`badge ${(STATUS_CONFIG[t.status] ?? FALLBACK).color}`}>{(STATUS_CONFIG[t.status] ?? FALLBACK).label}</span>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-1 truncate">{t.description}</p>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSelected(null)}>
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" />
          <div className="relative card max-w-lg w-full max-h-[85vh] flex flex-col animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 truncate">{selected.subject}</h3>
                <div className="text-xs text-slate-500">{(selected as { requester?: { full_name?: string } }).requester?.full_name} · {formatDate(selected.created_at)}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-4 border-b border-slate-100">
              <p className="text-sm text-slate-600">{selected.description}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((m) => {
                const sender = (m as { sender?: { full_name?: string } }).sender;
                return (
                  <div key={m.id} className={`flex ${m.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] p-3 rounded-xl ${m.sender_id === user?.id ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                      <div className="text-xs opacity-75 mb-1">{sender?.full_name}</div>
                      <div className="text-sm">{m.body}</div>
                      <div className="text-xs opacity-50 mt-1">{timeAgo(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && <p className="text-sm text-slate-400 text-center py-4">No messages yet</p>}
            </div>

            <div className="p-4 border-t border-slate-100">
              <div className="flex gap-2 mb-3">
                {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
                  <button key={s} onClick={() => updateTicketStatus(selected, s as SupportTicket['status'])} className={`text-xs font-medium px-2.5 py-1.5 rounded-lg capitalize transition-all ${selected.status === s ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {s.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <input className="input flex-1" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a reply..." onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                <button onClick={sendMessage} disabled={sending || !newMessage} className="btn-primary"><Send className="w-4 h-4" /></button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
