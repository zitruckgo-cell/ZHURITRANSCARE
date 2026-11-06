import { useState, useEffect } from 'react';
import { Plus, Truck, Gavel, Navigation, DollarSign, FileText, MessageSquare, Building2, LayoutDashboard, LogOut, Home, Menu, X, ClipboardList, LayoutGrid } from 'lucide-react';
import { supabase, type AppSetting, type Profile } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { type View, type ShipperTab } from './shipper/shared';
import { DashboardTab } from './shipper/DashboardTab';
import { PostLoad } from './shipper/PostLoad';
import { MyLoads } from './shipper/MyLoads';
import { BidsTab } from './shipper/BidsTab';
import { LiveTracking } from './shipper/LiveTracking';
import { PaymentsInvoices } from './shipper/PaymentsInvoices';
import { DocumentsTab } from './shipper/DocumentsTab';
import { MessagesTab } from './shipper/MessagesTab';
import { ProfileCompany } from './shipper/ProfileCompany';
import { DispatchOrders } from './DispatchOrders';
import { LoadBoard } from './shipper/LoadBoard';

const TABS: { id: ShipperTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'post', label: 'Post a Load', icon: Plus },
  { id: 'loads', label: 'My Loads', icon: Truck },
  { id: 'load-board', label: 'Load Board', icon: LayoutGrid },
  { id: 'bids', label: 'Bids', icon: Gavel },
  { id: 'dispatch-orders', label: 'Dispatch Orders', icon: ClipboardList },
  { id: 'tracking', label: 'Live Tracking', icon: Navigation },
  { id: 'payments', label: 'Payments', icon: DollarSign },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'messages', label: 'Messages', icon: MessageSquare },
  { id: 'profile', label: 'Profile', icon: Building2 },
];

export function ShipperPortal({ setView, embedded }: { setView: (v: View) => void; embedded?: boolean }) {
  const { profile, signOut, user } = useAuth();
  const [tab, setTab] = useState<ShipperTab>('dashboard');
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [bidCount, setBidCount] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    supabase.from('app_settings').select('*').then(({ data }) => setSettings((data as AppSetting[]) || []));
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    const loadBidCount = async () => {
      const { data: dels } = await supabase.from('deliveries').select('id').eq('shipper_id', user.id);
      const ids = (dels || []).map((d) => d.id);
      if (ids.length === 0) { setBidCount(0); return; }
      const { count } = await supabase.from('bids').select('id', { count: 'exact', head: true })
        .in('delivery_id', ids).eq('status', 'pending');
      setBidCount(count || 0);
    };
    loadBidCount();
    const channel = supabase.channel('shipper-bid-badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids' }, () => loadBidCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  const content = (
    <div>
      <div className={tab === 'dashboard' ? '' : 'hidden'}><DashboardTab onNavigate={setTab} /></div>
      <div className={tab === 'post' ? '' : 'hidden'}><PostLoad settings={settings} onCreated={() => setTab('loads')} /></div>
      <div className={tab === 'loads' ? '' : 'hidden'}><MyLoads onNavigate={setTab} /></div>
      <div className={tab === 'load-board' ? '' : 'hidden'}><LoadBoard /></div>
      <div className={tab === 'bids' ? '' : 'hidden'}><BidsTab onNavigate={setTab} /></div>
      <div className={tab === 'dispatch-orders' ? '' : 'hidden'}><DispatchOrders /></div>
      <div className={tab === 'tracking' ? '' : 'hidden'}><LiveTracking /></div>
      <div className={tab === 'payments' ? '' : 'hidden'}><PaymentsInvoices /></div>
      <div className={tab === 'documents' ? '' : 'hidden'}><DocumentsTab /></div>
      <div className={tab === 'messages' ? '' : 'hidden'}><MessagesTab /></div>
      <div className={tab === 'profile' ? '' : 'hidden'}><ProfileCompany /></div>
    </div>
  );

  if (embedded) {
    return (
      <div className="flex gap-6 relative">
        <ShipperSidebar tab={tab} setTab={setTab} profile={profile} embedded sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} bidCount={bidCount} />
        <div className="flex-1 min-w-0">
          <ShipperMobileBar tab={tab} setSidebarOpen={setSidebarOpen} />
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <ShipperSidebar tab={tab} setTab={setTab} profile={profile} onSignOut={signOut} onHome={() => setView('home')} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} bidCount={bidCount} />
      <div className="flex-1 min-w-0 overflow-y-auto">
        <ShipperMobileBar tab={tab} setSidebarOpen={setSidebarOpen} />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">{content}</div>
      </div>
    </div>
  );
}

function ShipperMobileBar({ tab, setSidebarOpen }: { tab: ShipperTab; setSidebarOpen: (v: boolean) => void }) {
  const activeTab = TABS.find((t) => t.id === tab);
  const Icon = activeTab?.icon ?? LayoutDashboard;
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 lg:hidden">
      <div className="flex items-center justify-between h-14 px-4">
        <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-lg text-slate-600 hover:bg-slate-100">
          <Menu className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary-600" />
          <span className="font-semibold text-slate-900 text-sm">{activeTab?.label}</span>
        </div>
        <div className="w-9" />
      </div>
    </header>
  );
}

function ShipperSidebar({ tab, setTab, profile, onSignOut, onHome, embedded, sidebarOpen, setSidebarOpen, bidCount }: {
  tab: ShipperTab; setTab: (t: ShipperTab) => void; profile: Profile | null;
  onSignOut?: () => void; onHome?: () => void; embedded?: boolean;
  sidebarOpen: boolean; setSidebarOpen: (v: boolean) => void; bidCount?: number;
}) {
  return (
    <>
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'} ${embedded ? 'lg:self-start lg:max-h-[calc(100vh-7rem)] lg:sticky lg:top-20 lg:rounded-xl' : ''}`}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <img src="/zhuri-transcare-logo.svg" alt="Zhuri Transcare" width={36} height={36} className="rounded-full shrink-0" />
            <div>
              <div className="font-bold text-slate-900 text-sm">Shipper Portal</div>
              <div className="text-xs text-slate-500 truncate max-w-[120px]">{profile?.business_name || profile?.full_name}</div>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-3 space-y-0.5">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => { setTab(t.id); setSidebarOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-primary-50 text-primary-700' : 'text-slate-600 hover:bg-slate-50'}`}>
                <Icon className="w-4 h-4 shrink-0" /> {t.label}
                {t.id === 'bids' && bidCount !== undefined && bidCount > 0 && (
                  <span className="ml-auto bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{bidCount}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-slate-100 space-y-0.5">
          {onHome && (
            <button onClick={onHome} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
              <Home className="w-4 h-4 shrink-0" /> Home
            </button>
          )}
          {onSignOut && (
            <button onClick={onSignOut} className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors">
              <LogOut className="w-4 h-4 shrink-0" /> Sign Out
            </button>
          )}
        </div>
      </aside>
    </>
  );
}
