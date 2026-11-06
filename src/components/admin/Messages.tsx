import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Send, Search, Shield } from 'lucide-react';
import { supabase, type Message, type Profile } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';
import { useAuth } from '../../lib/auth';

type Convo = {
  otherUser: Profile;
  lastMsg: Message;
  msgCount: number;
};

export function AdminMessagesPage() {
  const { user } = useAuth();
  const [convos, setConvos] = useState<Convo[]>([]);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConvos = useCallback(async () => {
    const { data: allMsgs } = await supabase.from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*), recipient:profiles!messages_recipient_id_fkey(*)')
      .order('created_at', { ascending: false });
    const msgs = (allMsgs as Message[]) || [];

    const userMap = new Map<string, Profile>();
    const convoMap = new Map<string, { otherUser: Profile; lastMsg: Message; msgCount: number }>();

    msgs.forEach((m) => {
      const otherId = m.sender_id === user?.id ? m.recipient_id : m.sender_id;
      const otherProfile = m.sender_id === user?.id ? m.recipient : m.sender;
      if (!otherProfile) return;
      userMap.set(otherId, otherProfile);
      const existing = convoMap.get(otherId);
      if (!existing) {
        convoMap.set(otherId, { otherUser: otherProfile, lastMsg: m, msgCount: 1 });
      } else {
        existing.msgCount++;
      }
    });

    const sorted = Array.from(convoMap.values()).sort((a, b) =>
      new Date(b.lastMsg.created_at).getTime() - new Date(a.lastMsg.created_at).getTime()
    );
    setConvos(sorted);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { loadConvos(); }, [loadConvos]);

  const loadMessages = useCallback(async (otherId: string) => {
    const me = user?.id;
    if (!me) return;
    const { data } = await supabase.from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*), recipient:profiles!messages_recipient_id_fkey(*)')
      .or(`and(sender_id.eq.${me},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${me})`)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [user?.id]);

  useEffect(() => {
    if (!selected || !user?.id) return;
    loadMessages(selected.id);
    const channel = supabase.channel(`admin-msgs-${selected.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as Message;
        if ((row.sender_id === user.id && row.recipient_id === selected.id) ||
            (row.sender_id === selected.id && row.recipient_id === user.id)) {
          loadMessages(selected.id);
          loadConvos();
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selected, user?.id, loadMessages, loadConvos]);

  const selectConvo = (p: Profile) => {
    setSelected(p);
    loadMessages(p.id);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selected) return;
    const { data } = await supabase.from('messages').insert({
      sender_id: user?.id, recipient_id: selected.id,
      delivery_id: null, body: newMsg.trim(),
    }).select('*, sender:profiles!messages_sender_id_fkey(*), recipient:profiles!messages_recipient_id_fkey(*)').single();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      setNewMsg('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      loadConvos();
    }
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading messages...</div>;

  const filteredConvos = convos.filter((c) =>
    !search || (c.otherUser.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (c.otherUser.business_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Messages</h1>
      <p className="text-slate-500 mb-6">Inter-portal messaging between all drivers and shippers</p>

      {convos.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No conversations yet</p>
          <p className="text-xs text-slate-400 mt-1">Messages between drivers and shippers will appear here</p>
        </div>
      ) : (
        <div className="flex gap-4 h-[600px]">
          <div className="w-72 shrink-0 card flex flex-col">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="input pl-9 text-sm"
                  placeholder="Search users..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {filteredConvos.map((c) => (
                <button key={c.otherUser.id} onClick={() => selectConvo(c.otherUser)} className={`w-full p-4 text-left transition-all ${selected?.id === c.otherUser.id ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white font-bold text-sm shrink-0">{(c.otherUser.full_name || '?').charAt(0)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-slate-900 truncate">{c.otherUser.business_name || c.otherUser.full_name}</div>
                      <div className="text-xs text-slate-400 truncate">{c.lastMsg.body}</div>
                    </div>
                    <div className="text-xs text-slate-400 shrink-0">{timeAgo(c.lastMsg.created_at)}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 card flex flex-col">
            {selected ? (
              <>
                <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-500 to-slate-700 flex items-center justify-center text-white font-bold text-sm">{(selected.full_name || '?').charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-sm">{selected.business_name || selected.full_name}</div>
                    <div className="text-xs text-slate-500 flex items-center gap-1">
                      {selected.roles?.includes('driver') && <span className="text-emerald-600">Driver</span>}
                      {selected.roles?.includes('shipper') && <span className="text-primary-600">Shipper</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 text-xs font-medium">
                    <Shield className="w-3 h-3" /> Admin
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {messages.length === 0 ? <div className="text-center text-sm text-slate-400 py-8">No messages yet. Start the conversation!</div> :
                    messages.map((m) => {
                      const isOwn = m.sender_id === user?.id;
                      return (
                        <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[70%] px-3.5 py-2 rounded-2xl text-sm ${isOwn ? 'bg-primary-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                            {m.body}
                            <div className={`text-xs mt-0.5 ${isOwn ? 'text-primary-200' : 'text-slate-400'}`}>{timeAgo(m.created_at)}</div>
                          </div>
                        </div>
                      );
                    })}
                  <div ref={messagesEndRef} />
                </div>
                <div className="p-3 border-t border-slate-100 flex gap-2">
                  <input className="input flex-1" placeholder="Type a message..." value={newMsg} onChange={(e) => setNewMsg(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendMessage()} />
                  <button onClick={sendMessage} className="btn-primary shrink-0"><Send className="w-4 h-4" /></button>
                </div>
              </>
            ) : <div className="flex-1 flex items-center justify-center text-sm text-slate-400">Select a conversation</div>}
          </div>
        </div>
      )}
    </div>
  );
}
