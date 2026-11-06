import { useState, useEffect, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';
import { useAuth } from '../../lib/auth';

export function NotificationsTab() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<{ id: string; subject: string; body: string; created_at: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('notifications')
      .select('id, subject, body, created_at, status')
      .eq('recipient_id', user?.id).order('created_at', { ascending: false });
    setNotifications((data as { id: string; subject: string; body: string; created_at: string; status: string }[]) || []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Notifications</h1>
      <p className="text-slate-500 mb-6">Stay updated on loads, bids, payments, and messages</p>

      {notifications.length === 0 ? <div className="card p-12 text-center"><Bell className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No notifications</p></div> : (
        <div className="card divide-y divide-slate-100">
          {notifications.map((n) => (
            <div key={n.id} className="p-4 flex items-start gap-3">
              <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${n.status === 'sent' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'}`}>
                <Bell className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-slate-900">{n.subject}</div>
                <div className="text-xs text-slate-500 mt-0.5">{n.body}</div>
                <div className="text-xs text-slate-400 mt-1">{timeAgo(n.created_at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
