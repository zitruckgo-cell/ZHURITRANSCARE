import { useState, useRef, useEffect } from 'react';
import { Pencil, Check, X } from 'lucide-react';
import { formatMoney } from '../lib/utils';

type Props = {
  value: number | null | undefined;
  onSave: (newAmount: number) => Promise<void>;
  table: 'bids' | 'deliveries';
  id: string;
  field: string;
};

export function AdminPriceEdit({ value, onSave, table, id, field }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const startEdit = () => {
    setDraft(String(value ?? ''));
    setError(null);
    setEditing(true);
  };

  const cancel = () => { setEditing(false); setError(null); };

  const save = async () => {
    const num = parseFloat(draft);
    if (isNaN(num) || num < 0) { setError('Enter a valid amount'); return; }
    setSaving(true);
    setError(null);
    try {
      await onSave(num);
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <div className="inline-flex items-center gap-1">
        <span className="text-xs text-slate-400">$</span>
        <input
          ref={inputRef}
          type="number"
          min="0"
          step="0.01"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel(); }}
          className="w-20 px-2 py-1 text-sm border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none"
          disabled={saving}
        />
        <button onClick={save} disabled={saving} className="p-1 rounded-lg text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50" title="Save">
          <Check className="w-4 h-4" />
        </button>
        <button onClick={cancel} disabled={saving} className="p-1 rounded-lg text-red-500 hover:bg-red-50 transition-colors" title="Cancel">
          <X className="w-4 h-4" />
        </button>
        {error && <span className="text-xs text-red-500 ml-1">{error}</span>}
      </div>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 group">
      <span className="font-semibold text-slate-700">{formatMoney(value)}</span>
      <button
        onClick={startEdit}
        className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-amber-500 hover:bg-amber-50 transition-all"
        title="Edit price (admin)"
      >
        <Pencil className="w-3 h-3" />
      </button>
    </span>
  );
}
