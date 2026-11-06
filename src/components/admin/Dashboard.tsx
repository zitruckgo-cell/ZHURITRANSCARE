import { useState, useEffect, useCallback } from 'react';
import {
  Package, Truck, DollarSign, AlertCircle, TrendingUp,
  CheckCircle2, Users, BarChart3, Activity, Bell, LifeBuoy, MapPin,
  Navigation, Radio, ClipboardList, Save, Loader2,
} from 'lucide-react';
import { supabase, type Delivery, type Profile, type Payment, type SupportTicket, type Notification } from '../../lib/supabase';
import { priorityConfig, statusConfig, formatMoney, timeAgo, PRIORITY_CONFIG } from '../../lib/utils';

export function AdminDashboardPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Profile[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [shippers, setShippers] = useState<Profile[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [delRes, driverRes, payRes, shipRes, ticketRes, notifRes] = await Promise.all([
      supabase.from('deliveries').select('*, shipper:profiles!deliveries_shipper_id_fkey(*), driver:profiles!deliveries_driver_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').contains('roles', ['driver']),
      supabase.from('payments').select('*, delivery:deliveries(*), driver:profiles!payments_driver_id_fkey(*)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').contains('roles', ['shipper']),
      supabase.from('support_tickets').select('*, requester:profiles!support_tickets_requester_id_fkey(*)').order('created_at', { ascending: false }).limit(10),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(10),
    ]);
    setDeliveries((delRes.data as Delivery[]) || []);
    setDrivers((driverRes.data as Profile[]) || []);
    setPayments((payRes.data as Payment[]) || []);
    setShippers((shipRes.data as Profile[]) || []);
    setTickets((ticketRes.data as SupportTicket[]) || []);
    setNotifications((notifRes.data as Notification[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading dashboard...</div>;

  const posted = deliveries.filter((d) => d.status === 'posted').length;
  const assigned = deliveries.filter((d) => d.status === 'assigned').length;
  const inTransit = deliveries.filter((d) => d.status === 'picked_up' || d.status === 'in_transit').length;
  const delivered = deliveries.filter((d) => d.status === 'delivered').length;
  const cancelled = deliveries.filter((d) => d.status === 'cancelled').length;
  const availableDrivers = drivers.filter((d) => d.is_active).length;
  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.commission_amount), 0);
  const totalPayouts = payments.reduce((sum, p) => sum + Number(p.driver_payout), 0);
  const totalGross = payments.reduce((sum, p) => sum + Number(p.gross_amount), 0);
  const emergencyCount = deliveries.filter((d) => d.priority === 'critical' || d.priority === 'STAT').length;
  const completionRate = deliveries.length > 0 ? (delivered / deliveries.length) * 100 : 0;

  // Monthly revenue data (last 6 months)
  const monthlyData: Record<string, { revenue: number; deliveries: number }> = {};
  deliveries.forEach((d) => {
    const month = new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (!monthlyData[month]) monthlyData[month] = { revenue: 0, deliveries: 0 };
    monthlyData[month].deliveries++;
    monthlyData[month].revenue += Number(d.calculated_price || d.max_bid_amount || 0);
  });
  const months = Object.entries(monthlyData).slice(-6);
  const maxRevenue = Math.max(...months.map(([, v]) => v.revenue), 1);

  // Priority breakdown
  const priorityBreakdown = (Object.keys(PRIORITY_CONFIG) as Array<keyof typeof PRIORITY_CONFIG>).map((key) => ({
    key,
    count: deliveries.filter((d) => d.priority === key).length,
    ...PRIORITY_CONFIG[key],
  })).filter((p) => p.count > 0);

  // Top drivers by deliveries
  const topDrivers = drivers
    .map((d) => ({ ...d, deliveryCount: deliveries.filter((del) => del.driver_id === d.id && del.status === 'delivered').length }))
    .sort((a, b) => b.deliveryCount - a.deliveryCount)
    .slice(0, 5);

  const stats = [
    { label: 'Total Deliveries', value: deliveries.length, sub: `${delivered} completed`, icon: Package, color: 'primary' },
    { label: 'Available Drivers', value: `${availableDrivers}/${drivers.length}`, sub: `${drivers.length} total`, icon: Truck, color: 'emerald' },
    { label: 'Platform Revenue', value: formatMoney(totalRevenue), sub: '10% commission', icon: DollarSign, color: 'amber' },
    { label: 'Driver Payouts', value: formatMoney(totalPayouts), sub: '90% to drivers', icon: TrendingUp, color: 'emerald' },
    { label: 'Gross Volume', value: formatMoney(totalGross), sub: `${payments.length} payments`, icon: BarChart3, color: 'primary' },
    { label: 'Completion Rate', value: `${completionRate.toFixed(1)}%`, sub: `${cancelled} cancelled`, icon: CheckCircle2, color: 'emerald' },
    { label: 'Active Shippers', value: shippers.length, sub: 'customers', icon: Users, color: 'amber' },
    { label: 'STAT/Critical', value: emergencyCount, sub: 'priority active', icon: AlertCircle, color: 'red' },
  ];

  const colorClasses: Record<string, string> = {
    primary: 'bg-primary-50 text-primary-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-slate-500">Real-time overview of platform operations</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Activity className="w-3.5 h-3.5" /> Auto-refreshes every 30s
        </div>
      </div>

      {emergencyCount > 0 && (
        <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 border border-red-200 mb-6 animate-fade-in">
          <div className="relative"><AlertCircle className="w-5 h-5 text-red-600" /></div>
          <div className="flex-1"><span className="font-semibold text-red-900">{emergencyCount} STAT/critical deliveries active</span></div>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="card p-5">
              <div className={`w-10 h-10 rounded-xl ${colorClasses[stat.color]} flex items-center justify-center mb-3`}><Icon className="w-5 h-5" /></div>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{stat.label}</div>
              <div className="text-[11px] text-slate-400 mt-0.5">{stat.sub}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Delivery Status Breakdown */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Delivery Status</h2>
          <div className="space-y-3">
            {[
              { label: 'Posted', count: posted, color: 'bg-blue-500' },
              { label: 'Assigned', count: assigned, color: 'bg-cyan-500' },
              { label: 'In Transit', count: inTransit, color: 'bg-amber-500' },
              { label: 'Delivered', count: delivered, color: 'bg-emerald-500' },
              { label: 'Cancelled', count: cancelled, color: 'bg-slate-400' },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-3">
                <div className="text-sm text-slate-600 w-20 shrink-0">{s.label}</div>
                <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
                  <div className={`h-full ${s.color} rounded-lg transition-all duration-500 flex items-center justify-end pr-2`} style={{ width: `${deliveries.length > 0 ? (s.count / deliveries.length) * 100 : 0}%` }}>
                    {s.count > 0 && <span className="text-xs text-white font-semibold">{s.count}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue Chart */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-slate-400" /> Revenue (Last 6 Months)</h2>
          {months.length === 0 ? <p className="text-sm text-slate-400">No data yet</p> : (
            <div className="space-y-3">
              {months.map(([month, data]) => (
                <div key={month}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700">{month}</span>
                    <span className="text-sm text-slate-500">{formatMoney(data.revenue)} · {data.deliveries} deliveries</span>
                  </div>
                  <div className="h-7 bg-slate-100 rounded-lg overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-end pr-2 transition-all duration-500" style={{ width: `${(data.revenue / maxRevenue) * 100}%` }}>
                      <span className="text-xs text-white font-semibold">{formatMoney(data.revenue)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Priority Breakdown */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Priority Breakdown</h2>
          {priorityBreakdown.length === 0 ? <p className="text-sm text-slate-400">No deliveries yet</p> : (
            <div className="space-y-2">
              {priorityBreakdown.map((p) => (
                <div key={p.key} className="flex items-center gap-3">
                  <span className={`badge ${p.color} shrink-0`}>{p.label}</span>
                  <div className="flex-1 h-5 bg-slate-100 rounded-lg overflow-hidden">
                    <div className={`h-full ${p.dot} rounded-lg transition-all duration-500`} style={{ width: `${deliveries.length > 0 ? (p.count / deliveries.length) * 100 : 0}%` }} />
                  </div>
                  <span className="text-sm font-semibold text-slate-700 w-8 text-right">{p.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Drivers */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><Truck className="w-5 h-5 text-slate-400" /> Top Drivers</h2>
          {topDrivers.length === 0 || topDrivers.every((d) => d.deliveryCount === 0) ? <p className="text-sm text-slate-400">No completed deliveries yet</p> : (
            <div className="space-y-3">
              {topDrivers.map((d, i) => (
                <div key={d.id} className="flex items-center gap-3">
                  <div className="text-sm font-bold text-slate-400 w-5">{i + 1}</div>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center text-white font-bold text-sm shrink-0">{d.full_name.charAt(0)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{d.full_name}</div>
                    <div className="text-xs text-slate-500">{d.vehicle_type || 'No vehicle'} · {d.service_area || 'No area'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900">{d.deliveryCount}</div>
                    <div className="text-[11px] text-slate-400">deliveries</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Deliveries */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">Recent Deliveries</h2>
          <div className="space-y-3">
            {deliveries.slice(0, 6).map((d) => {
              const statusCfg = statusConfig(d.status);
              const prioCfg = priorityConfig(d.priority);
              return (
                <div key={d.id} className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${prioCfg.dot} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                    <div className="text-xs text-slate-500">{d.delivery_city}, {d.delivery_state} · {timeAgo(d.created_at)}</div>
                  </div>
                  <span className={`badge ${statusCfg.color} shrink-0`}>{statusCfg.label}</span>
                </div>
              );
            })}
            {deliveries.length === 0 && <p className="text-sm text-slate-400">No deliveries yet</p>}
          </div>
        </div>

        {/* Recent Payments */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-slate-400" /> Recent Payouts</h2>
          <div className="space-y-3">
            {payments.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-900 truncate">{p.driver?.full_name || 'Driver'}</div>
                  <div className="text-xs text-slate-500">{p.delivery?.pickup_city} → {p.delivery?.delivery_city} · {timeAgo(p.created_at)}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-emerald-600">{formatMoney(Number(p.driver_payout))}</div>
                  <div className="text-[11px] text-slate-400">Platform: {formatMoney(Number(p.commission_amount))}</div>
                </div>
              </div>
            ))}
            {payments.length === 0 && <p className="text-sm text-slate-400">No payouts yet — payouts auto-generate when deliveries are confirmed</p>}
          </div>
        </div>
      </div>

      {/* Live Operations Map */}
      <div className="card p-6 mb-6 mt-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Radio className="w-5 h-5 text-emerald-500" /> Live Operations
          <span className="ml-auto flex items-center gap-1.5 text-xs font-normal text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {inTransit + assigned} active
          </span>
        </h2>
        {(() => {
          const activeDeliveries = deliveries.filter((d) => ['assigned', 'picked_up', 'in_transit'].includes(d.status));
          if (activeDeliveries.length === 0) return <p className="text-sm text-slate-400">No active deliveries on the road right now</p>;
          return (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {activeDeliveries.slice(0, 6).map((d) => {
                const statusCfg = statusConfig(d.status);
                const prioCfg = priorityConfig(d.priority);
                return (
                  <div key={d.id} className="flex items-start gap-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-lg ${statusCfg.color} flex items-center justify-center shrink-0 mt-0.5`}>
                      {d.status === 'in_transit' ? <Navigation className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-slate-900 truncate">{d.pickup_name} → {d.delivery_name}</div>
                      <div className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3" /> {d.delivery_city}, {d.delivery_state}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1.5">
                        <span className={`badge ${prioCfg.color} text-[10px] py-0.5`}>{prioCfg.label}</span>
                        <span className={`badge ${statusCfg.color} text-[10px] py-0.5`}>{statusCfg.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Open Support Tickets */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <LifeBuoy className="w-5 h-5 text-amber-500" /> Support Tickets
            {tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length > 0 && (
              <span className="ml-auto text-xs font-semibold text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                {tickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length} open
              </span>
            )}
          </h2>
          <div className="space-y-3">
            {tickets.slice(0, 6).map((t) => {
              const priorityColors: Record<string, string> = {
                low: 'bg-slate-100 text-slate-600',
                normal: 'bg-blue-100 text-blue-700',
                high: 'bg-amber-100 text-amber-700',
                urgent: 'bg-red-100 text-red-700',
              };
              const statusColors: Record<string, string> = {
                open: 'text-blue-600',
                in_progress: 'text-amber-600',
                resolved: 'text-emerald-600',
                closed: 'text-slate-400',
              };
              return (
                <div key={t.id} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                    <LifeBuoy className="w-4 h-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{t.subject}</div>
                    <div className="text-xs text-slate-500">{t.requester?.full_name || 'Unknown'} · {timeAgo(t.created_at)}</div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`badge ${priorityColors[t.priority]} text-[10px] py-0.5 capitalize`}>{t.priority}</span>
                    <span className={`text-[11px] font-medium capitalize ${statusColors[t.status]}`}>{t.status.replace('_', ' ')}</span>
                  </div>
                </div>
              );
            })}
            {tickets.length === 0 && <p className="text-sm text-slate-400">No support tickets — all clear!</p>}
          </div>
        </div>

        {/* Recent Notifications */}
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-primary-500" /> Recent Notifications
          </h2>
          <div className="space-y-3">
            {notifications.slice(0, 6).map((n) => {
              const statusColors: Record<string, string> = {
                sent: 'text-emerald-600',
                failed: 'text-red-600',
                pending: 'text-amber-600',
              };
              const channelIcons: Record<string, string> = {
                email: 'bg-blue-50 text-blue-600',
                sms: 'bg-emerald-50 text-emerald-600',
                whatsapp: 'bg-green-50 text-green-600',
              };
              return (
                <div key={n.id} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${channelIcons[n.channel] || 'bg-slate-50 text-slate-600'} flex items-center justify-center shrink-0 mt-0.5`}>
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{n.subject}</div>
                    <div className="text-xs text-slate-500 truncate">{n.recipient_contact} · {timeAgo(n.created_at)}</div>
                  </div>
                  <span className={`text-[11px] font-medium capitalize shrink-0 ${statusColors[n.status] || 'text-slate-400'}`}>{n.status}</span>
                </div>
              );
            })}
            {notifications.length === 0 && <p className="text-sm text-slate-400">No notifications sent yet</p>}
          </div>
        </div>
      </div>
      {/* Admin Special Instructions */}
      <AdminSpecialInstructions />

    </div>
  );
}

function AdminSpecialInstructions() {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'admin_special_instructions')
      .maybeSingle()
      .then(({ data }) => {
        setValue((data as { value?: string } | null)?.value || '');
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const { error: upsertError } = await supabase
      .from('app_settings')
      .upsert({
        key: 'admin_special_instructions',
        value,
        description: 'Special instructions visible to admins',
      }, { onConflict: 'key' });
    setSaving(false);
    if (upsertError) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="card p-5 mt-6">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl bg-primary-50 text-primary-600 flex items-center justify-center">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h2 className="font-semibold text-slate-900">Special Instructions</h2>
          <p className="text-xs text-slate-500">Platform-wide notes for the admin team — operational reminders, escalation procedures, or handling guidelines</p>
        </div>
      </div>
      {loading ? (
        <div className="text-center py-6 text-sm text-slate-400">Loading...</div>
      ) : (
        <>
          <textarea
            className="input min-h-[80px] resize-none"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Call supervisor for any delivery over $500, verify cold chain for all STAT deliveries, escalate all disputes to senior admin..."
          />
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-slate-400">Visible to all admin team members</p>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium transition-all active:scale-95 disabled:opacity-60"
            >
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                : saved ? <><CheckCircle2 className="w-4 h-4" /> Saved!</>
                : <><Save className="w-4 h-4" /> Save</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
