import { useState, useEffect, useCallback } from 'react';
import { Star, CheckCircle2, Truck, X, ThumbsUp } from 'lucide-react';
import { supabase, type DriverRating } from '../../lib/supabase';
import { timeAgo } from '../../lib/utils';
import { useAuth } from '../../lib/auth';

export function RatingsTab() {
  const { user, profile } = useAuth();
  const [ratings, setRatings] = useState<DriverRating[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('driver_ratings')
      .select('*, rater:profiles!driver_ratings_rater_id_fkey(*)')
      .eq('driver_id', user?.id).order('created_at', { ascending: false });
    setRatings((data as DriverRating[]) || []);
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  const avgRating = Number(profile?.rating ?? 0);
  const totalDeliveries = Number(profile?.total_deliveries ?? 0);
  const onTimeRate = Number(profile?.on_time_rate ?? 100);
  const cancellationRate = Number(profile?.cancellation_rate ?? 0);
  const totalRatings = ratings.length;

  const stars = [1, 2, 3, 4, 5];
  const ratingDist = stars.map((s) => ratings.filter((r) => r.rating === s).length);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Driver Ratings</h1>
      <p className="text-slate-500 mb-6">Your performance metrics and customer feedback</p>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center">
              <Star className="w-8 h-8 text-white fill-white" />
            </div>
            <div>
              <div className="text-3xl font-bold text-slate-900">{avgRating.toFixed(1)}</div>
              <div className="text-sm text-slate-500">{totalRatings} total ratings</div>
            </div>
          </div>
          <div className="space-y-2">
            {stars.reverse().map((s) => {
              const count = ratingDist[s - 1];
              const pct = totalRatings > 0 ? (count / totalRatings) * 100 : 0;
              return (
                <div key={s} className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 w-6">{s}★</span>
                  <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-slate-400 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center"><CheckCircle2 className="w-6 h-6 text-emerald-600" /></div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-slate-900">{onTimeRate}%</div>
              <div className="text-xs text-slate-500">On-time Percentage</div>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center"><Truck className="w-6 h-6 text-blue-600" /></div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-slate-900">{totalDeliveries}</div>
              <div className="text-xs text-slate-500">Completed Deliveries</div>
            </div>
          </div>
          <div className="card p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center"><X className="w-6 h-6 text-red-600" /></div>
            <div className="flex-1">
              <div className="text-2xl font-bold text-slate-900">{cancellationRate}%</div>
              <div className="text-xs text-slate-500">Cancellation Rate</div>
            </div>
          </div>
        </div>
      </div>

      <h2 className="font-semibold text-slate-900 mb-3">Customer Reviews</h2>
      {ratings.length === 0 ? <div className="card p-12 text-center"><Star className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No ratings yet</p></div> : (
        <div className="space-y-3">
          {ratings.map((r) => (
            <div key={r.id} className="card p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center text-white font-bold text-xs">{r.rater?.full_name?.charAt(0) || '?'}</div>
                  <div>
                    <div className="text-sm font-medium text-slate-900">{r.rater?.full_name || 'Anonymous'}</div>
                    <div className="text-xs text-slate-400">{timeAgo(r.created_at)}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {stars.map((s) => (
                    <Star key={s} className={`w-3.5 h-3.5 ${s <= r.rating ? 'text-amber-400 fill-amber-400' : 'text-slate-200'}`} />
                  ))}
                  {r.on_time && <span className="badge bg-emerald-100 text-emerald-700 ml-2"><ThumbsUp className="w-3 h-3" /> On time</span>}
                </div>
              </div>
              {r.comment && <p className="text-sm text-slate-600 mt-2">{r.comment}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
