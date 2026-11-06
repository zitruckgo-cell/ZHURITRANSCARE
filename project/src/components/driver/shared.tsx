import { useState, useEffect } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export type View = 'home' | 'auth' | 'shipper' | 'driver' | 'admin';

export type DriverTab =
  | 'dashboard' | 'find-loads' | 'my-loads' | 'dispatch-orders' | 'active-delivery' | 'live-tracking'
  | 'earnings' | 'payments' | 'documents' | 'messages' | 'ratings'
  | 'notifications' | 'profile' | 'settings';

export function useToast() {
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);
  return { toast, setToast };
}

export function Toast({ toast }: { toast: { type: 'success' | 'error'; msg: string } | null }) {
  if (!toast) return null;
  return (
    <div className={`fixed top-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-2xl text-sm font-medium animate-[slideIn_0.3s_ease-out] ${toast.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
      {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <AlertCircle className="w-4 h-4 text-red-500" />}
      {toast.msg}
    </div>
  );
}
