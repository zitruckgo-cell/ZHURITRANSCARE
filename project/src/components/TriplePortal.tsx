import { useState } from 'react';
import { Package, Truck, Shield, Home, LogOut } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ShipperPortal } from './ShipperPortal';
import { DriverPortal } from './DriverPortal';
import { AdminLayout } from './AdminLayout';

type View = 'home' | 'auth' | 'shipper' | 'driver' | 'admin' | 'dual' | 'triple';

type Portal = 'shipper' | 'driver' | 'admin';

export function TriplePortal({ setView }: { setView: (v: View) => void }) {
  const { profile, signOut } = useAuth();
  const [activePortal, setActivePortal] = useState<Portal>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('portal') === 'driver') return 'driver';
      return (sessionStorage.getItem('triple-portal-active') as Portal) || 'admin';
    } catch { return 'admin'; }
  });

  const switchPortal = (p: Portal) => {
    setActivePortal(p);
    try { sessionStorage.setItem('triple-portal-active', p); } catch { /* ignore */ }
  };

  // Admin renders full-screen with its own sidebar; no shared header.
  if (activePortal === 'admin') {
    return <AdminLayout setView={(v) => {
      if (v === 'shipper') switchPortal('shipper');
      else if (v === 'driver') switchPortal('driver');
      else setView(v);
    }} />;
  }

  const tabs: { id: Portal; label: string; icon: typeof Package }[] = [
    { id: 'shipper', label: 'Shipper', icon: Package },
    { id: 'driver', label: 'Driver', icon: Truck },
    { id: 'admin', label: 'Admin', icon: Shield },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={32} height={32} className="rounded-full shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-sm">All-Access Portal</div>
              <div className="text-xs text-slate-500 truncate">{profile?.full_name}</div>
            </div>
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
            {tabs.map((t) => {
              const Icon = t.icon;
              const active = activePortal === t.id;
              const colorClass = t.id === 'shipper' ? 'text-primary-700'
                : t.id === 'driver' ? 'text-emerald-700'
                : 'text-amber-700';
              return (
                <button
                  key={t.id}
                  onClick={() => switchPortal(t.id)}
                  className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${active ? `bg-white shadow-sm ${colorClass}` : 'text-slate-500'}`}
                >
                  <Icon className="w-4 h-4" /> <span className="hidden xs:inline sm:inline">{t.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors">
              <Home className="w-4 h-4" /> <span className="hidden sm:inline">Home</span>
            </button>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-red-600 font-medium px-2 sm:px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activePortal === 'shipper' && <ShipperPortal setView={setView} embedded />}
        {activePortal === 'driver' && <DriverPortal setView={setView} embedded />}
      </div>
    </div>
  );
}
