import { useState, useEffect, useCallback, useRef } from 'react';
import { MessageSquare, Phone, Send, Search } from 'lucide-react';
import { supabase, type Message, type Profile } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { AdminScopePicker } from '../AdminScopePicker';

export function MessagesTab() {
  const { user, isAdmin } = useAuth();
  const [scopeShipperId, setScopeShipperId] = useState<string | null>(null);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMsg, setNewMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadDrivers = useCallback(async () => {
    const shipperFilter = isAdmin ? scopeShipperId : user?.id;
    if (shipperFilter) {
      const { data: dels } = await supabase
        .from('deliveries')
        .select('driver_id')
        .eq('shipper_id', shipperFilter)
        .not('driver_id', 'is', null);
      const driverIds = [...new Set((dels || []).map((d) => d.driver_id))];
      if (driverIds.length > 0) {
        const { data: driverProfiles } = await supabase
          .from('profiles')
          .select('*')
          .in('id', driverIds)
          .order('full_name', { ascending: true });
        setDrivers((driverProfiles as Profile[]) || []);
      } else {
        setDrivers([]);
      }
    } else {
      const { data: allDrivers } = await supabase
        .from('profiles')
        .select('*')
        .contains('roles', ['driver'])
        .order('full_name', { ascending: true });
      setDrivers((allDrivers as Profile[]) || []);
    }
    setLoading(false);
  }, [user?.id, isAdmin, scopeShipperId]);

  useEffect(() => { loadDrivers(); }, [loadDrivers]);

  const loadMessages = useCallback(async (driverId: string) => {
    const me = user?.id;
    if (!me) return;
    const { data } = await supabase.from('messages')
      .select('*, sender:profiles!messages_sender_id_fkey(*), recipient:profiles!messages_recipient_id_fkey(*)')
      .or(`and(sender_id.eq.${me},recipient_id.eq.${driverId}),and(sender_id.eq.${driverId},recipient_id.eq.${me})`)
      .order('created_at', { ascending: true });
    setMessages((data as Message[]) || []);
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
  }, [user?.id]);

  useEffect(() => {
    if (!selectedDriver || !user?.id) return;
    loadMessages(selectedDriver.id);
    const channel = supabase.channel(`shipper-msgs-${selectedDriver.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        const row = payload.new as Message;
        if ((row.sender_id === user.id && row.recipient_id === selectedDriver.id) ||
            (row.sender_id === selectedDriver.id && row.recipient_id === user.id)) {
          loadMessages(selectedDriver.id);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [selectedDriver, user?.id, loadMessages]);

  const selectDriver = (driver: Profile) => {
    setSelectedDriver(driver);
    loadMessages(driver.id);
  };

  const sendMessage = async () => {
    if (!newMsg.trim() || !selectedDriver) return;
    const { data } = await supabase.from('messages').insert({
      sender_id: user?.id, recipient_id: selectedDriver.id,
      delivery_id: null, body: newMsg.trim(),
    }).select('*, sender:profiles!messages_sender_id_fkey(*), recipient:profiles!messages_recipient_id_fkey(*)').single();
    if (data) {
      setMessages((prev) => [...prev, data as Message]);
      setNewMsg('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  const filteredDrivers = drivers.filter((d) =>
    !search || (d.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.business_name || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      {isAdmin && <AdminScopePicker role="shipper" scopeUserId={scopeShipperId} onScopeChange={setScopeShipperId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Messages</h1>
      <p className="text-slate-500 mb-6">Direct communication with drivers</p>

      {drivers.length === 0 ? (
        <div className="card p-12 text-center">
          <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No conversations yet</p>
          <p className="text-xs text-slate-400 mt-1">Messages appear once a driver is assigned to your load</p>
        </div>
      ) : (
        <div className="flex gap-4 h-[600px]">
          <div className="w-72 shrink-0 card flex flex-col">
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  className="input pl-9 text-sm"
                  placeholder="Search drivers..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
              {filteredDrivers.map((d) => (
                <button key={d.id} onClick={() => selectDriver(d)} className={`w-full p-4 text-left transition-all ${selectedDriver?.id === d.id ? 'bg-primary-50' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">{(d.full_name || '?').charAt(0)}</div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.full_name}</div>
                      {d.vehicle_type && <div className="text-xs text-slate-400 truncate">{d.vehicle_type}</div>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 card flex flex-col">
            {selectedDriver ? (
              <>
                <div className="p-4 border-b border-slate-100 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm">{(selectedDriver.full_name || '?').charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-900 text-sm">{selectedDriver.full_name}</div>
                    {selectedDriver.phone && <div className="text-xs text-slate-500 flex items-center gap-1"><Phone className="w-3 h-3" /> {selectedDriver.phone}</div>}
                  </div>
                  {selectedDriver.phone && (
                    <div className="flex items-center gap-1.5">
                      <a href={`sms:${selectedDriver.phone}`} className="w-8 h-8 rounded-lg bg-primary-100 flex items-center justify-center text-primary-600 hover:bg-primary-200 transition-all" title="Send SMS">
                        <MessageSquare className="w-4 h-4" />
                      </a>
                      <a href={`tel:${selectedDriver.phone}`} className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 hover:bg-emerald-200 transition-all" title="Call">
                        <Phone className="w-4 h-4" />
                      </a>
                    </div>
                  )}
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
