import { useState } from 'react';
import { Package, Truck, Home, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { ShipperPortal } from './ShipperPortal';
import { DriverPortal } from './DriverPortal';

type View = 'home' | 'auth' | 'shipper' | 'driver' | 'admin' | 'dual';

export function DualPortal({ setView }: { setView: (v: View) => void }) {
  const { profile, signOut } = useAuth();
  const [activePortal, setActivePortal] = useState<'shipper' | 'driver'>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('portal') === 'driver') return 'driver';
      return (sessionStorage.getItem('dual-portal-active') as 'shipper' | 'driver') || 'shipper';
    } catch { return 'shipper'; }
  });

  const switchPortal = (p: 'shipper' | 'driver') => {
    setActivePortal(p);
    try { sessionStorage.setItem('dual-portal-active', p); } catch { /* ignore */ }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={32} height={32} className="rounded-full shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-sm">Dual Portal</div>
              <div className="text-xs text-slate-500 truncate">{profile?.full_name}</div>
            </div>
          </div>

          <div className="flex gap-1 p-1 bg-slate-100 rounded-xl shrink-0">
            <button onClick={() => switchPortal('shipper')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activePortal === 'shipper' ? 'bg-white text-primary-700 shadow-sm' : 'text-slate-500'}`}>
              <Package className="w-4 h-4" /> <span className="hidden xs:inline sm:inline">Shipper</span>
            </button>
            <button onClick={() => switchPortal('driver')} className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${activePortal === 'driver' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>
              <Truck className="w-4 h-4" /> <span className="hidden xs:inline sm:inline">Driver</span>
            </button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            <button onClick={() => setView('home')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 px-2 sm:px-3 py-1.5 rounded-lg hover:bg-slate-100 transition-colors"><Home className="w-4 h-4" /> <span className="hidden sm:inline">Home</span></button>
            <button onClick={signOut} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-red-600 font-medium px-2 sm:px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"><LogOut className="w-4 h-4" /> <span className="hidden sm:inline">Sign Out</span></button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {activePortal === 'shipper' ? <ShipperPortal setView={setView} embedded /> : <DriverPortal setView={setView} embedded />}
      </div>
    </div>
  );
}
