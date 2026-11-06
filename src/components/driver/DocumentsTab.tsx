import { useState, useEffect, useCallback } from 'react';
import { FileText, Paperclip } from 'lucide-react';
import { supabase, type Document, type Delivery } from '../../lib/supabase';
import { formatDate } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { AdminScopePicker } from '../AdminScopePicker';

const DOC_TYPES = [
  { value: 'bill_of_lading', label: 'Bill of Lading' },
  { value: 'delivery_receipt', label: 'Delivery Receipt' },
  { value: 'proof_of_delivery', label: 'Proof of Delivery' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'other', label: 'Other' },
];

export function DocumentsTab() {
  const { user, isAdmin } = useAuth();
  const [scopeDriverId, setScopeDriverId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    const driverFilter = isAdmin ? scopeDriverId : user?.id;
    let docQuery = supabase.from('documents').select('*').order('created_at', { ascending: false });
    if (driverFilter) docQuery = docQuery.eq('uploader_id', driverFilter);
    let delQuery = supabase.from('deliveries').select('id, pickup_name, delivery_name').order('created_at', { ascending: false });
    if (driverFilter) delQuery = delQuery.eq('driver_id', driverFilter);
    const [docRes, delRes] = await Promise.all([docQuery, delQuery]);
    setDocuments((docRes.data as Document[]) || []);
    setDeliveries((delRes.data as Delivery[]) || []);
  }, [user?.id, isAdmin, scopeDriverId]);

  useEffect(() => { load(); }, [load]);

  const filtered = filter === 'all' ? documents : documents.filter((d) => d.type === filter);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading...</div>;

  return (
    <div>
      {isAdmin && <AdminScopePicker role="driver" scopeUserId={scopeDriverId} onScopeChange={setScopeDriverId} />}
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Documents</h1>
      <p className="text-slate-500 mb-6">Bills of lading, receipts, proof of delivery, and more</p>

      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
        <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === 'all' ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>All</button>
        {DOC_TYPES.map((t) => (
          <button key={t.value} onClick={() => setFilter(t.value)} className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${filter === t.value ? 'bg-emerald-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}>{t.label}</button>
        ))}
      </div>

      {filtered.length === 0 ? <div className="card p-12 text-center"><FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" /><p className="text-slate-500">No documents found</p></div> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((doc) => {
            const del = deliveries.find((d) => d.id === doc.delivery_id);
            const typeCfg = DOC_TYPES.find((t) => t.value === doc.type);
            return (
              <div key={doc.id} className="card p-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-emerald-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-slate-900 truncate">{doc.name}</div>
                    <div className="text-xs text-slate-500">{typeCfg?.label || doc.type}</div>
                    {del && <div className="text-xs text-slate-400 mt-0.5 truncate">{del.pickup_name} → {del.delivery_name}</div>}
                    <div className="text-xs text-slate-400 mt-1">{formatDate(doc.created_at)}</div>
                  </div>
                </div>
                <a href={doc.file_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium">
                  <Paperclip className="w-3.5 h-3.5" /> View
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
