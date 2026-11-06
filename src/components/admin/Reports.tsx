import { useState, useEffect, useCallback } from 'react';
import { BarChart3, TrendingUp, DollarSign, Package, Truck, Users } from 'lucide-react';
import { supabase, type Delivery, type Payment, type Profile } from '../../lib/supabase';
import { formatMoney } from '../../lib/utils';

export function AdminReportsPage() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [delRes, payRes, profRes] = await Promise.all([
      supabase.from('deliveries').select('*'),
      supabase.from('payments').select('*'),
      supabase.from('profiles').select('*'),
    ]);
    setDeliveries((delRes.data as Delivery[]) || []);
    setPayments((payRes.data as Payment[]) || []);
    setProfiles((profRes.data as Profile[]) || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading reports...</div>;

  const totalRevenue = payments.reduce((sum, p) => sum + Number(p.commission_amount), 0);
  const totalGross = payments.reduce((sum, p) => sum + Number(p.gross_amount), 0);
  const deliveredCount = deliveries.filter((d) => d.status === 'delivered').length;
  const completionRate = deliveries.length > 0 ? (deliveredCount / deliveries.length) * 100 : 0;
  const avgDeliveryValue = payments.length > 0 ? totalGross / payments.length : 0;
  const driverCount = profiles.filter((p) => p.roles?.includes('driver')).length;
  const shipperCount = profiles.filter((p) => p.roles?.includes('shipper')).length;

  const monthlyData: Record<string, { revenue: number; deliveries: number }> = {};
  deliveries.forEach((d) => {
    const month = new Date(d.created_at).toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    if (!monthlyData[month]) monthlyData[month] = { revenue: 0, deliveries: 0 };
    monthlyData[month].deliveries++;
    monthlyData[month].revenue += Number(d.calculated_price || d.max_bid_amount || 0);
  });

  const months = Object.entries(monthlyData).slice(-6);
  const maxRevenue = Math.max(...months.map(([, v]) => v.revenue), 1);

  const stats = [
    { label: 'Total Revenue', value: formatMoney(totalRevenue), icon: DollarSign, color: 'primary' },
    { label: 'Total Deliveries', value: deliveries.length, icon: Package, color: 'emerald' },
    { label: 'Completion Rate', value: `${Number(completionRate).toFixed(1)}%`, icon: TrendingUp, color: 'amber' },
    { label: 'Avg Delivery Value', value: formatMoney(avgDeliveryValue), icon: DollarSign, color: 'primary' },
    { label: 'Active Drivers', value: driverCount, icon: Truck, color: 'emerald' },
    { label: 'Active Shippers', value: shipperCount, icon: Users, color: 'amber' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Reports</h1>
      <p className="text-slate-500 mb-6">Platform analytics and performance metrics</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          const colorClasses: Record<string, string> = { primary: 'bg-primary-50 text-primary-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600' };
          return (
            <div key={stat.label} className="card p-5">
              <div className={`w-10 h-10 rounded-xl ${colorClasses[stat.color]} flex items-center justify-center mb-3`}><Icon className="w-5 h-5" /></div>
              <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-xs text-slate-500 font-medium mt-0.5">{stat.label}</div>
            </div>
          );
        })}
      </div>

      <div className="card p-6 mb-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4 flex items-center gap-2"><BarChart3 className="w-5 h-5 text-slate-400" /> Revenue & Deliveries (Last 6 Months)</h2>
        {months.length === 0 ? <p className="text-sm text-slate-400">No data yet</p> : (
          <div className="space-y-4">
            {months.map(([month, data]) => (
              <div key={month}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">{month}</span>
                  <span className="text-sm text-slate-500">{formatMoney(data.revenue)} · {data.deliveries} deliveries</span>
                </div>
                <div className="h-8 bg-slate-100 rounded-lg overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-primary-500 to-primary-600 rounded-lg flex items-center justify-end pr-2 transition-all duration-500" style={{ width: `${(data.revenue / maxRevenue) * 100}%` }}>
                    <span className="text-xs text-white font-semibold">{formatMoney(data.revenue)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Delivery Status Breakdown</h2>
        <div className="space-y-2">
          {['posted', 'assigned', 'picked_up', 'in_transit', 'delivered', 'cancelled'].map((status) => {
            const count = deliveries.filter((d) => d.status === status).length;
            const pct = deliveries.length > 0 ? (count / deliveries.length) * 100 : 0;
            return (
              <div key={status} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-24 capitalize">{status.replace('_', ' ')}</span>
                <div className="flex-1 h-6 bg-slate-100 rounded-lg overflow-hidden">
                  <div className="h-full bg-primary-500 rounded-lg transition-all duration-500" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-sm font-semibold text-slate-700 w-8 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
