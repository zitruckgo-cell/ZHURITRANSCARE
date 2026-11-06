import { useState, useEffect, useCallback } from 'react';
import { Search, Package, MapPin, ArrowRight, Calendar, Snowflake, Weight, DollarSign, Zap, Clock, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { priorityConfig, formatMoney, formatDate } from '../../lib/utils';

type LoadBoardItem = {
  id: string;
  pickup_city: string;
  pickup_state: string;
  delivery_city: string;
  delivery_state: string;
  package_type: string;
  temperature_control: string;
  weight_lbs: number | string;
  distance_miles: number | string | null;
  priority: string;
  max_bid_amount: number | string;
  calculated_price: number | string | null;
  offered_rate: number | string | null;
  is_urgent: boolean;
  pickup_datetime: string | null;
  delivery_deadline: string | null;
  created_at: string;
  status: string;
};

type SortKey = 'newest' | 'pickup' | 'rate' | 'distance';

export function LoadBoard() {
  const [loads, setLoads] = useState<LoadBoardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterTemp, setFilterTemp] = useState('all');

  const load = useCallback(async () => {
    setError(null);
    const { data, error: queryError } = await supabase
      .from('public_load_board')
      .select('*')
      .order('created_at', { ascending: false });

    if (queryError) {
      setError(queryError.message);
    } else {
      setLoads((data as LoadBoardItem[]) || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel('load-board-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'deliveries' }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [load]);

  const filtered = loads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch = !search ||
      l.pickup_city.toLowerCase().includes(q) ||
      l.delivery_city.toLowerCase().includes(q) ||
      l.pickup_state.toLowerCase().includes(q) ||
      l.delivery_state.toLowerCase().includes(q) ||
      l.package_type.toLowerCase().includes(q);
    const matchPriority = filterPriority === 'all' || l.priority === filterPriority;
    const matchTemp = filterTemp === 'all' || l.temperature_control === filterTemp;
    return matchSearch && matchPriority && matchTemp;
  });

  const sorted = [...filtered].sort((a, b) => {
    switch (sortKey) {
      case 'pickup': {
        const aTime = a.pickup_datetime ? new Date(a.pickup_datetime).getTime() : Infinity;
        const bTime = b.pickup_datetime ? new Date(b.pickup_datetime).getTime() : Infinity;
        return aTime - bTime;
      }
      case 'rate': {
        const aRate = Number(a.offered_rate || a.max_bid_amount || 0);
        const bRate = Number(b.offered_rate || b.max_bid_amount || 0);
        return bRate - aRate;
      }
      case 'distance': {
        const aDist = Number(a.distance_miles || 0);
        const bDist = Number(b.distance_miles || 0);
        return aDist - bDist;
      }
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-primary-500 animate-spin" />
        <span className="ml-2 text-slate-400">Loading load board...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card p-12 text-center">
        <p className="text-red-600 font-medium mb-2">Could not load the board</p>
        <p className="text-sm text-slate-500 mb-4">{error}</p>
        <button onClick={() => { setLoading(true); load(); }} className="btn-secondary">Retry</button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Load Board</h1>
        <p className="text-slate-500 mt-1">Browse all posted loads available in the marketplace</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input className="input pl-10" placeholder="Search by city, state, or load type..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input w-auto" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
          <option value="all">All Priorities</option>
          <option value="standard">Standard</option>
          <option value="urgent">Urgent</option>
          <option value="STAT">STAT</option>
          <option value="critical">Critical</option>
        </select>
        <select className="input w-auto" value={filterTemp} onChange={(e) => setFilterTemp(e.target.value)}>
          <option value="all">All Temps</option>
          <option value="none">No Temp Control</option>
          <option value="ambient">Ambient</option>
          <option value="refrigerated">Refrigerated</option>
          <option value="frozen">Frozen</option>
        </select>
        <select className="input w-auto" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
          <option value="newest">Newest First</option>
          <option value="pickup">Pickup Time</option>
          <option value="rate">Highest Rate</option>
          <option value="distance">Shortest Distance</option>
        </select>
      </div>

      <div className="mb-4 text-sm text-slate-500">
        {sorted.length} {sorted.length === 1 ? 'load' : 'loads'} available
      </div>

      {sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">No loads match your filters</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((load) => {
            const pc = priorityConfig(load.priority);
            const rate = Number(load.offered_rate || load.max_bid_amount || 0);
            const hasTemp = load.temperature_control && load.temperature_control !== 'none';
            return (
              <div key={load.id} className="card p-5 flex flex-col gap-3 hover:shadow-md transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`badge ${pc.color}`}>{pc.label}</span>
                    {load.is_urgent && <span className="badge bg-red-50 text-red-600 flex items-center gap-1"><Zap className="w-3 h-3" /> Urgent</span>}
                    {hasTemp && <span className="badge bg-sky-50 text-sky-600 flex items-center gap-1"><Snowflake className="w-3 h-3" /> {load.temperature_control}</span>}
                  </div>
                  <span className="text-lg font-bold text-primary-700">{formatMoney(rate)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-xs font-semibold text-primary-600 uppercase"><MapPin className="w-3 h-3" /> From</div>
                    <div className="font-medium text-slate-800 truncate">{load.pickup_city}, {load.pickup_state}</div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 text-xs font-semibold text-emerald-600 uppercase"><MapPin className="w-3 h-3" /> To</div>
                    <div className="font-medium text-slate-800 truncate">{load.delivery_city}, {load.delivery_state}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                  <span className="capitalize px-2 py-0.5 rounded bg-slate-100 text-slate-600">{load.package_type.replace('_', ' ')}</span>
                  {load.weight_lbs != null && <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 text-slate-600"><Weight className="w-3 h-3" /> {load.weight_lbs} lbs</span>}
                  {load.distance_miles != null && <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600">{load.distance_miles} mi</span>}
                </div>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                  {load.pickup_datetime ? (
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {formatDate(load.pickup_datetime)}</span>
                  ) : (
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {formatDate(load.created_at)}</span>
                  )}
                  {load.offered_rate && Number(load.offered_rate) > 0 && (
                    <span className="flex items-center gap-1 text-primary-600"><DollarSign className="w-3 h-3" /> Offered</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
